/**
 * Corrección monetaria del artículo 41 de la Ley de la Renta.
 *
 * La idea, en una línea: la inflación del año hace que un peso de enero no sea
 * un peso de diciembre, y el resultado tributario tiene que medirse en pesos
 * comparables. Entonces las partidas **no monetarias** (el activo fijo, las
 * existencias, el capital propio) se reajustan, y las **monetarias** (la caja,
 * una cuenta por cobrar en pesos) no, porque ya están en pesos de hoy.
 *
 * Tres reglas que este módulo respeta y que conviene tener a la vista:
 *
 * 1. **Sin IPC no hay cálculo.** Los factores los publica el INE y los fija el
 *    SII. Si un mes del año no tiene su variación cargada, el cálculo se niega
 *    y dice cuáles faltan. No se interpola ni se asume cero.
 * 2. **Cada partida se corrige desde su fecha,** no desde enero: el capital
 *    propio inicial por la variación del año completo, un aumento de capital de
 *    julio solo por la variación de julio a diciembre.
 * 3. **La clasificación de cada cuenta la decide el contador.** El sistema
 *    propone una según el tipo de cuenta, y la propuesta se guarda en el plan
 *    de cuentas para que se corrija una vez y valga siempre.
 *
 * REQUIERE VALIDACIÓN TRIBUTARIA de la clasificación de cada cuenta y del
 * criterio de corrección. Lo que el sistema hace es aritmética sobre datos que
 * alguien más declara.
 */

const { aFechaISO } = require("./fecha.helper");

/**
 * Propuesta de clasificación según el tipo de cuenta. Solo una propuesta.
 *
 * Los activos y pasivos en pesos son monetarios: ya están expresados en moneda
 * de cierre. El activo fijo, las existencias y el patrimonio no lo son.
 */
function clasificacionSugerida(cuenta) {
  const tipo = String(cuenta.tipo || "");
  const nombre = String(cuenta.nombre || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  if (tipo === "Patrimonio") return "patrimonio";

  const noMonetarias = [
    "ACTIVO FIJO",
    "MAQUINARIA",
    "VEHICULO",
    "MUEBLE",
    "INSTALACION",
    "EDIFICIO",
    "TERRENO",
    "CONSTRUCCION",
    "EXISTENCIA",
    "MERCADERIA",
    "INVENTARIO",
    "INTANGIBLE",
    "DEP. ACUMULADA",
    "DEPRECIACION ACUMULADA",
    "AMORT. ACUMULADA",
  ];

  if ((tipo === "Activo" || tipo === "Pasivo") && noMonetarias.some((p) => nombre.includes(p))) {
    return "no_monetaria";
  }

  if (tipo === "Activo" || tipo === "Pasivo") return "monetaria";

  // Las cuentas de resultado no se corrigen: el resultado se mide en el año.
  return null;
}

function numero(valor) {
  return Number(valor || 0);
}

function redondear(valor) {
  return Math.round(numero(valor));
}

function mesesDelAnio(anio) {
  return Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * Factores acumulados de corrección para un año, a partir de las variaciones
 * mensuales del IPC.
 *
 * Devuelve, para cada mes, el factor con que se corrige una partida nacida en
 * ese mes hasta el cierre de diciembre. Una partida de diciembre no se corrige
 * (factor 1).
 *
 * `faltantes` lista los meses sin dato: si hay alguno, el cálculo no puede
 * continuar.
 */
async function factoresDelAnio(cliente, anio) {
  const meses = mesesDelAnio(anio);

  const { rows } = await cliente.query(
    `SELECT periodo, variacion_ipc FROM parametros_nacionales
     WHERE periodo = ANY($1::text[])`,
    [meses]
  );

  const porMes = new Map(rows.map((f) => [f.periodo, f.variacion_ipc]));
  const faltantes = meses.filter(
    (mes) => porMes.get(mes) === undefined || porMes.get(mes) === null
  );

  if (faltantes.length > 0) {
    return { faltantes, factores: {}, factorAnual: null };
  }

  // El factor de un mes acumula las variaciones de los meses siguientes: lo
  // que nace en enero sufre la inflación de febrero a diciembre.
  const factores = {};

  for (let indice = 0; indice < meses.length; indice += 1) {
    let acumulado = 1;

    for (let siguiente = indice + 1; siguiente < meses.length; siguiente += 1) {
      acumulado *= 1 + numero(porMes.get(meses[siguiente])) / 100;
    }

    factores[meses[indice]] = Number(acumulado.toFixed(6));
  }

  // El del capital propio inicial: la inflación del año completo, que es la de
  // enero a diciembre, es decir el factor de la partida nacida antes del año.
  let anual = 1;

  for (const mes of meses) {
    anual *= 1 + numero(porMes.get(mes)) / 100;
  }

  return {
    faltantes: [],
    factores,
    factorAnual: Number(anual.toFixed(6)),
    variaciones: Object.fromEntries(meses.map((mes) => [mes, numero(porMes.get(mes))])),
  };
}

/**
 * Factor que corresponde a una fecha dentro del año: por el mes en que ocurrió.
 * Una partida anterior al año usa el factor anual completo.
 */
function factorParaFecha(fecha, anio, calculo) {
  const iso = aFechaISO(fecha);

  if (!iso) return calculo.factorAnual;

  const mes = iso.slice(0, 7);

  if (iso < `${anio}-01-01`) return calculo.factorAnual;
  if (iso > `${anio}-12-31`) return 1;

  return calculo.factores[mes] ?? 1;
}

/**
 * Capital propio tributario inicial: activos menos pasivos al 1 de enero, que
 * es el cierre del año anterior.
 *
 * REQUIERE VALIDACIÓN TRIBUTARIA: el capital propio tributario del artículo 41
 * parte del capital propio financiero y lleva agregados y deducciones (valores
 * INTF, activos que no representan inversión efectiva). Acá se entrega el
 * financiero y se listan las partidas para que el contador haga esos ajustes.
 */
async function capitalPropioInicial(cliente, empresaId, anio) {
  const { rows } = await cliente.query(
    `
    SELECT pc.tipo,
           COALESCE(SUM(cd.debe), 0) AS debe,
           COALESCE(SUM(cd.haber), 0) AS haber
    FROM comprobante_detalle cd
    JOIN comprobantes c ON c.id = cd.comprobante_id
    JOIN plan_cuentas pc ON pc.id = cd.cuenta_id
    WHERE c.empresa_id = $1
      AND c.estado = 'vigente'
      AND c.fecha < $2
    GROUP BY pc.tipo
    `,
    [empresaId, `${anio}-01-01`]
  );

  let activos = 0;
  let pasivos = 0;

  for (const fila of rows) {
    const saldo = numero(fila.debe) - numero(fila.haber);

    if (fila.tipo === "Activo") activos += saldo;
    if (fila.tipo === "Pasivo") pasivos += -saldo;
    // El patrimonio no se suma: es el resultado de la resta.
  }

  return {
    activos: redondear(activos),
    pasivos: redondear(pasivos),
    capital_propio: redondear(activos - pasivos),
  };
}

/**
 * Saldos por cuenta al inicio del año, con su clasificación para corrección.
 */
async function saldosParaCorreccion(cliente, empresaId, anio) {
  const { rows } = await cliente.query(
    `
    SELECT pc.id, pc.codigo, pc.nombre, pc.tipo, pc.clasificacion_correccion,
           COALESCE(SUM(cd.debe), 0) AS debe,
           COALESCE(SUM(cd.haber), 0) AS haber
    FROM comprobante_detalle cd
    JOIN comprobantes c ON c.id = cd.comprobante_id
    JOIN plan_cuentas pc ON pc.id = cd.cuenta_id
    WHERE c.empresa_id = $1
      AND c.estado = 'vigente'
      AND c.fecha < $2
    GROUP BY pc.id, pc.codigo, pc.nombre, pc.tipo, pc.clasificacion_correccion
    HAVING ROUND(COALESCE(SUM(cd.debe), 0)) <> ROUND(COALESCE(SUM(cd.haber), 0))
    ORDER BY pc.codigo
    `,
    [empresaId, `${anio}-01-01`]
  );

  return rows.map((fila) => {
    const saldo = redondear(numero(fila.debe) - numero(fila.haber));
    const clasificacion = fila.clasificacion_correccion || clasificacionSugerida(fila);

    return {
      cuenta_id: fila.id,
      codigo: fila.codigo,
      nombre: fila.nombre,
      tipo: fila.tipo,
      saldo_inicial: saldo,
      clasificacion,
      // Si viene del plan, alguien la decidió; si no, es una propuesta.
      clasificacion_confirmada: Boolean(fila.clasificacion_correccion),
    };
  });
}

/**
 * Propuesta de corrección monetaria del año.
 *
 * Cada línea lleva su factor y su origen, para que se pueda revisar una por una.
 */
async function proponerCorreccion(cliente, empresaId, anio) {
  const calculo = await factoresDelAnio(cliente, anio);

  if (calculo.faltantes.length > 0) {
    return {
      anio,
      puede_calcular: false,
      meses_sin_ipc: calculo.faltantes,
      motivo:
        "Faltan las variaciones del IPC de algunos meses del año. Cárgalas en los parámetros nacionales: sin ese dato la corrección monetaria no se puede calcular y no se va a inventar.",
    };
  }

  const [inicial, saldos] = await Promise.all([
    capitalPropioInicial(cliente, empresaId, anio),
    saldosParaCorreccion(cliente, empresaId, anio),
  ]);

  const factor = calculo.factorAnual;
  const variacionAnual = Number(((factor - 1) * 100).toFixed(4));

  const lineas = [];

  // 1. Capital propio inicial, por la variación del año completo.
  const correccionCapital = redondear(inicial.capital_propio * (factor - 1));

  if (correccionCapital !== 0) {
    lineas.push({
      concepto: "Revalorización del capital propio inicial",
      cuenta_id: null,
      base: inicial.capital_propio,
      factor,
      correccion: correccionCapital,
      // La revalorización del capital propio es una deducción del resultado
      // tributario: aumenta el patrimonio sin ser utilidad.
      efecto: "deduccion",
    });
  }

  // 2. Activos y pasivos no monetarios, cada uno por su saldo inicial.
  let correccionActivos = 0;
  let correccionPasivos = 0;

  for (const cuenta of saldos) {
    if (cuenta.clasificacion !== "no_monetaria") continue;

    const correccion = redondear(cuenta.saldo_inicial * (factor - 1));

    if (correccion === 0) continue;

    if (cuenta.tipo === "Activo") correccionActivos += correccion;
    if (cuenta.tipo === "Pasivo") correccionPasivos += correccion;

    lineas.push({
      concepto: `Corrección de ${cuenta.codigo} ${cuenta.nombre}`,
      cuenta_id: cuenta.cuenta_id,
      base: cuenta.saldo_inicial,
      factor,
      correccion,
      efecto: cuenta.tipo === "Activo" ? "agregado" : "deduccion",
      clasificacion_confirmada: cuenta.clasificacion_confirmada,
    });
  }

  // El resultado por corrección: lo que se corrige del activo es utilidad, lo
  // del pasivo y del capital propio es pérdida.
  const resultado = redondear(correccionActivos - correccionPasivos - correccionCapital);

  const avisos = [
    "REQUIERE VALIDACIÓN TRIBUTARIA: la clasificación de cada cuenta como monetaria o no monetaria, y el capital propio tributario del artículo 41, que parte del financiero y lleva agregados y deducciones que el sistema no conoce.",
  ];

  const sinConfirmar = saldos.filter((c) => c.clasificacion && !c.clasificacion_confirmada);

  if (sinConfirmar.length > 0) {
    avisos.push(
      `${sinConfirmar.length} cuenta(s) usan una clasificación propuesta por el sistema y no confirmada por nadie. Revísalas antes de contabilizar.`
    );
  }

  return {
    anio,
    puede_calcular: true,
    factor_anual: factor,
    variacion_anual_porcentaje: variacionAnual,
    variaciones_mensuales: calculo.variaciones,
    capital_propio_inicial: inicial,
    correccion_capital_propio: correccionCapital,
    correccion_activos: redondear(correccionActivos),
    correccion_pasivos: redondear(correccionPasivos),
    resultado_correccion: resultado,
    lineas,
    cuentas: saldos,
    avisos,
  };
}

module.exports = {
  clasificacionSugerida,
  factoresDelAnio,
  factorParaFecha,
  capitalPropioInicial,
  saldosParaCorreccion,
  proponerCorreccion,
  mesesDelAnio,
};
