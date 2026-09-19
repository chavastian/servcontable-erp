/**
 * Renta líquida imponible y registros empresariales (módulo 9).
 *
 * Cómo funciona esto, y por qué está armado así:
 *
 * La RLI parte del resultado según balance y le agrega o le resta partidas.
 * De todas esas partidas, el sistema puede calcular exactamente tres, porque
 * las produjo él:
 *
 * - **DDAN**: la diferencia entre la depreciación acelerada y la normal del
 *   año (bloque 7). La acelerada rebaja la RLI y la normal no, así que la
 *   diferencia se deduce; y esa misma diferencia forma el registro DDAN, que
 *   después se devuelve cuando el bien termina de depreciarse.
 * - **Corrección monetaria**: el resultado por corrección del año (bloque 11).
 * - **Gastos rechazados** de las cuentas que alguien marcó como tales.
 *
 * Todo lo demás es criterio y entra como línea manual. El sistema no las
 * inventa: presenta las que conoce, deja agregar las que falten, y suma.
 *
 * REQUIERE VALIDACIÓN TRIBUTARIA de extremo a extremo. En particular:
 * - El régimen (14 A, 14 D N°3 pro pyme general, 14 D N°8 transparente) cambia
 *   la determinación y los registros. El sistema lo pregunta, no lo deduce.
 * - Los saldos iniciales de RAI, DDAN, REX y SAC vienen del año anterior, que
 *   el sistema no tiene si es el primer año que se usa.
 * - El artículo 14 letra D N°8 es transparente: la empresa no tributa y la
 *   renta se atribuye a los dueños. Ahí la RLI se determina, pero el impuesto
 *   de primera categoría no aplica.
 */

const { categoriaResultadoPorTipo } = require("./tipoCuenta.helper");

function numero(valor) {
  return Number(valor || 0);
}

function redondear(valor) {
  return Math.round(numero(valor));
}

const REGIMENES = {
  "14A": {
    nombre: "Artículo 14 letra A (semi integrado)",
    tasa_primera_categoria: 27,
    lleva_registros: true,
    transparente: false,
  },
  "14D3": {
    nombre: "Artículo 14 letra D N°3 (Pro Pyme General)",
    tasa_primera_categoria: 25,
    lleva_registros: true,
    transparente: false,
  },
  "14D8": {
    nombre: "Artículo 14 letra D N°8 (Pro Pyme Transparente)",
    tasa_primera_categoria: 0,
    lleva_registros: false,
    transparente: true,
  },
  renta_presunta: {
    nombre: "Renta presunta",
    tasa_primera_categoria: null,
    lleva_registros: false,
    transparente: false,
  },
  otro: {
    nombre: "Otro régimen",
    tasa_primera_categoria: null,
    lleva_registros: false,
    transparente: false,
  },
};

/**
 * Resultado según balance del año: ingresos menos costos y gastos.
 */
async function resultadoDelBalance(cliente, empresaId, anio) {
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
      AND c.fecha BETWEEN $2 AND $3
      -- Los asientos de cierre y apertura no son del resultado del año.
      AND c.tipo NOT IN ('Cierre', 'Apertura')
    GROUP BY pc.tipo
    `,
    [empresaId, `${anio}-01-01`, `${anio}-12-31`]
  );

  let ingresos = 0;
  let costos = 0;
  let gastos = 0;

  for (const fila of rows) {
    const categoria = categoriaResultadoPorTipo(fila.tipo);
    const debe = numero(fila.debe);
    const haber = numero(fila.haber);

    if (categoria === "ingreso") ingresos += haber - debe;
    if (categoria === "costo") costos += debe - haber;
    if (categoria === "gasto") gastos += debe - haber;
  }

  return {
    ingresos: redondear(ingresos),
    costos: redondear(costos),
    gastos: redondear(gastos),
    resultado: redondear(ingresos - costos - gastos),
  };
}

/**
 * DDAN del año: la diferencia entre la depreciación acelerada y la normal.
 *
 * Sale de la tabla `depreciaciones`, que guarda las dos desde el bloque 7. Es
 * dato, no estimación.
 */
async function diferenciaDepreciacion(cliente, empresaId, anio) {
  const { rows } = await cliente.query(
    `SELECT COALESCE(SUM(depreciacion_mes), 0) AS normal,
            COALESCE(SUM(depreciacion_mes_acelerada), 0) AS acelerada,
            COUNT(*)::int AS registros
     FROM depreciaciones
     WHERE empresa_id = $1
       AND estado = 'vigente'
       AND periodo BETWEEN $2 AND $3`,
    [empresaId, `${anio}-01`, `${anio}-12`]
  );

  const normal = redondear(rows[0].normal);
  const acelerada = redondear(rows[0].acelerada);

  return {
    normal,
    acelerada,
    // Positiva cuando la acelerada es mayor: se deduce de la RLI y alimenta el
    // registro DDAN.
    diferencia: acelerada - normal,
    registros: rows[0].registros,
  };
}

/**
 * Resultado por corrección monetaria del año, si ya se calculó.
 */
async function resultadoCorreccion(cliente, empresaId, anio) {
  const { rows } = await cliente.query(
    `SELECT resultado_correccion, correccion_capital_propio, factor_anual, comprobante_id
     FROM correcciones_monetarias
     WHERE empresa_id = $1 AND anio = $2 AND estado = 'vigente'
     LIMIT 1`,
    [empresaId, anio]
  );

  if (rows.length === 0) return null;

  return {
    resultado: redondear(rows[0].resultado_correccion),
    revalorizacion_capital: redondear(rows[0].correccion_capital_propio),
    factor: Number(rows[0].factor_anual),
    // Importante para no contar dos veces: si la correccion se contabilizo, su
    // efecto ya esta dentro del resultado segun balance.
    contabilizada: rows[0].comprobante_id !== null,
    comprobante_id: rows[0].comprobante_id,
  };
}

/**
 * Gastos del año en cuentas marcadas como gasto rechazado.
 */
async function gastosRechazados(cliente, empresaId, anio) {
  const { rows } = await cliente.query(
    `
    SELECT pc.id, pc.codigo, pc.nombre,
           COALESCE(SUM(cd.debe), 0) - COALESCE(SUM(cd.haber), 0) AS monto
    FROM comprobante_detalle cd
    JOIN comprobantes c ON c.id = cd.comprobante_id
    JOIN plan_cuentas pc ON pc.id = cd.cuenta_id
    WHERE c.empresa_id = $1
      AND c.estado = 'vigente'
      AND c.fecha BETWEEN $2 AND $3
      AND pc.gasto_rechazado = true
    GROUP BY pc.id, pc.codigo, pc.nombre
    HAVING COALESCE(SUM(cd.debe), 0) - COALESCE(SUM(cd.haber), 0) <> 0
    ORDER BY pc.codigo
    `,
    [empresaId, `${anio}-01-01`, `${anio}-12-31`]
  );

  return rows.map((fila) => ({
    cuenta_id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    monto: redondear(fila.monto),
  }));
}

/**
 * Propuesta de renta líquida imponible: lo que el sistema sabe, con su origen
 * marcado, más las líneas que una persona haya agregado antes.
 */
async function proponerRli(cliente, empresaId, anio, lineasManuales = []) {
  const empresaResult = await cliente.query(
    `SELECT regimen_lir, regimen_tributario, razon_social FROM empresas WHERE id = $1`,
    [empresaId]
  );

  const empresa = empresaResult.rows[0] || {};
  const regimen = empresa.regimen_lir || null;
  const definicionRegimen = regimen ? REGIMENES[regimen] : null;

  const [balance, depreciacion, correccion, rechazados] = await Promise.all([
    resultadoDelBalance(cliente, empresaId, anio),
    diferenciaDepreciacion(cliente, empresaId, anio),
    resultadoCorreccion(cliente, empresaId, anio),
    gastosRechazados(cliente, empresaId, anio),
  ]);

  const lineas = [];
  const avisos = [];

  if (!regimen) {
    avisos.push(
      "La empresa no tiene régimen tributario definido (14 A, 14 D N°3 o 14 D N°8). La determinación y los registros dependen de él: hay que indicarlo antes de cerrar la renta."
    );
  }

  // 1. Gastos rechazados: agregan a la RLI.
  for (const rechazado of rechazados) {
    lineas.push({
      concepto: `Gasto rechazado: ${rechazado.codigo} ${rechazado.nombre}`,
      tipo: "agregado",
      monto: Math.abs(rechazado.monto),
      origen: "sistema",
      referencia: `cuenta ${rechazado.cuenta_id}`,
    });
  }

  if (rechazados.length === 0) {
    avisos.push(
      "No hay cuentas marcadas como gasto rechazado. Si la empresa tiene gastos rechazados, márcalos en el plan de cuentas o agrégalos como línea: el sistema no los adivina."
    );
  }

  // 2. Diferencia de depreciación acelerada: deduce, y forma el DDAN.
  if (depreciacion.diferencia !== 0) {
    lineas.push({
      concepto: "Diferencia entre depreciación acelerada y normal (artículo 31 N°5)",
      tipo: depreciacion.diferencia > 0 ? "deduccion" : "agregado",
      monto: Math.abs(depreciacion.diferencia),
      origen: "sistema",
      referencia: "depreciaciones del año",
    });
  }

  // 3. Corrección monetaria. Acá hay una trampa que cuesta caro: si la
  // corrección ya se contabilizó (bloque 11 la asienta al 31 de diciembre), su
  // resultado YA está dentro del resultado según balance. Agregarla otra vez
  // como partida la cuenta dos veces y deja la RLI mal por el doble del efecto.
  // Solo entra como partida cuando existe calculada pero sin asiento, que es el
  // caso de quien lleva el balance bajo IFRS y la corrección solo para el SII.
  if (correccion) {
    if (correccion.contabilizada) {
      avisos.push(
        `La corrección monetaria de ${anio} está contabilizada (factor ${correccion.factor}), así que su efecto de ${correccion.resultado} ya está dentro del resultado según balance. No se agrega como partida para no contarla dos veces.`
      );
    } else if (correccion.resultado !== 0) {
      lineas.push({
        concepto: "Resultado por corrección monetaria (artículo 41)",
        tipo: correccion.resultado > 0 ? "agregado" : "deduccion",
        monto: Math.abs(correccion.resultado),
        origen: "sistema",
        referencia: `factor ${correccion.factor}`,
      });
    }
  } else {
    avisos.push(
      `No hay corrección monetaria calculada para ${anio}. Sin ella la renta líquida imponible está incompleta.`
    );
  }

  // 4. Lo que una persona agregó.
  for (const manual of lineasManuales) {
    const monto = redondear(manual.monto);

    if (monto === 0) continue;

    lineas.push({
      concepto: String(manual.concepto || "Partida sin descripción").slice(0, 300),
      tipo: manual.tipo === "deduccion" ? "deduccion" : "agregado",
      monto: Math.abs(monto),
      origen: "manual",
      referencia: String(manual.referencia || "").slice(0, 200),
    });
  }

  const agregados = lineas
    .filter((l) => l.tipo === "agregado")
    .reduce((suma, l) => suma + l.monto, 0);
  const deducciones = lineas
    .filter((l) => l.tipo === "deduccion")
    .reduce((suma, l) => suma + l.monto, 0);

  const rli = redondear(balance.resultado + agregados - deducciones);

  const impuesto =
    definicionRegimen && definicionRegimen.tasa_primera_categoria !== null && rli > 0
      ? redondear(rli * (definicionRegimen.tasa_primera_categoria / 100))
      : null;

  if (definicionRegimen?.transparente) {
    avisos.push(
      "En el régimen del artículo 14 letra D N°8 la empresa es transparente: no paga impuesto de primera categoría y la renta se atribuye a los dueños. La RLI se determina igual, para atribuirla."
    );
  }

  avisos.push(
    "REQUIERE VALIDACIÓN TRIBUTARIA: la renta líquida imponible, cada agregado y cada deducción, y el impuesto resultante. El sistema calcula solo lo que puede derivar de sus propios datos; el resto son las líneas que tú agregaste."
  );

  return {
    anio,
    empresa: { razon_social: empresa.razon_social, regimen, regimen_texto: empresa.regimen_tributario },
    regimen: definicionRegimen ? { codigo: regimen, ...definicionRegimen } : null,
    balance,
    depreciacion,
    correccion_monetaria: correccion,
    lineas,
    total_agregados: redondear(agregados),
    total_deducciones: redondear(deducciones),
    renta_liquida_imponible: rli,
    impuesto_primera_categoria: impuesto,
    avisos,
  };
}

/**
 * Registros empresariales del artículo 14.
 *
 * El sistema conoce con exactitud el movimiento del DDAN del año. Los demás
 * dependen de saldos que vienen del año anterior y de decisiones (retiros,
 * créditos): se llevan con los saldos iniciales que el contador declara.
 */
function construirRegistros({ rli, depreciacion, correccion, saldosIniciales = {}, regimen }) {
  const inicial = (clave) => redondear(saldosIniciales[clave]);

  const ddanMovimiento = depreciacion.diferencia > 0 ? depreciacion.diferencia : 0;
  const ddanReverso = depreciacion.diferencia < 0 ? Math.abs(depreciacion.diferencia) : 0;

  return {
    // Rentas afectas a impuestos finales.
    RAI: {
      nombre: "Rentas afectas a impuestos finales",
      saldo_inicial: inicial("RAI"),
      // El RAI se determina por comparación del capital propio tributario con
      // el capital aportado y los registros: depende del CPT final.
      movimiento: null,
      saldo_final: null,
      requiere: "Se determina comparando el capital propio tributario del cierre con el capital aportado reajustado y los saldos de REX y DDAN. REQUIERE VALIDACIÓN TRIBUTARIA.",
    },
    // Diferencia entre depreciación acelerada y normal.
    DDAN: {
      nombre: "Diferencia entre depreciación acelerada y normal",
      saldo_inicial: inicial("DDAN"),
      movimiento: ddanMovimiento - ddanReverso,
      saldo_final: inicial("DDAN") + ddanMovimiento - ddanReverso,
      // Este es el único que el sistema puede llevar solo.
      origen: "sistema",
      detalle: {
        depreciacion_normal: depreciacion.normal,
        depreciacion_acelerada: depreciacion.acelerada,
      },
    },
    REX: {
      nombre: "Rentas exentas e ingresos no constitutivos de renta",
      saldo_inicial: inicial("REX"),
      movimiento: null,
      saldo_final: null,
      requiere: "Las rentas exentas e ingresos no renta del año se ingresan como partidas: el sistema no las distingue de un ingreso afecto. REQUIERE VALIDACIÓN TRIBUTARIA.",
    },
    SAC: {
      nombre: "Saldo acumulado de créditos",
      saldo_inicial: inicial("SAC"),
      movimiento: null,
      saldo_final: null,
      requiere: "El crédito por impuesto de primera categoría del año y su imputación dependen del régimen y de los retiros. REQUIERE VALIDACIÓN TRIBUTARIA.",
    },
    aviso: regimen && !REGIMENES[regimen]?.lleva_registros
      ? "Este régimen no lleva los registros del artículo 14."
      : "Solo el DDAN se lleva automáticamente, porque sale de las depreciaciones que el sistema calculó. Los otros tres necesitan los saldos del año anterior y decisiones que no están en el sistema.",
  };
}

module.exports = {
  REGIMENES,
  resultadoDelBalance,
  diferenciaDepreciacion,
  resultadoCorreccion,
  gastosRechazados,
  proponerRli,
  construirRegistros,
};
