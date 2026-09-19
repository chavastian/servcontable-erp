/**
 * Cierre y apertura de ejercicio con asientos.
 *
 * Cerrar un año contable es más que un estado. Las cuentas de resultado se
 * saldan contra el resultado del ejercicio, y el año siguiente parte con los
 * saldos de balance. Hasta ahora nada de eso ocurría: el balance del segundo
 * año de un cliente arrancaba sin Caja, sin Clientes y sin Capital, y las
 * cuentas de resultado seguían acumulando de un año a otro.
 *
 * Los dos asientos se generan aquí, con fecha 31-12 el de cierre y 01-01 el
 * de apertura, y quedan enlazados al ejercicio para poder anularlos si se
 * reabre.
 */

const { columnaBalancePorTipo } = require("./tipoCuenta.helper");
const {
  obtenerSiguienteNumeroComprobante,
  insertarDetallesComprobante,
} = require("./comprobante.helper");

function error(mensaje, statusCode) {
  return Object.assign(new Error(mensaje), { statusCode });
}

/**
 * Saldos por cuenta del año: débitos menos créditos de los asientos vigentes
 * con fecha dentro del ejercicio.
 */
async function saldosDelAnio(client, empresaId, anio) {
  const { rows } = await client.query(
    `
    SELECT pc.id, pc.codigo, pc.nombre, pc.tipo,
           COALESCE(SUM(cd.debe), 0) AS debitos,
           COALESCE(SUM(cd.haber), 0) AS creditos
    FROM plan_cuentas pc
    JOIN comprobante_detalle cd ON cd.cuenta_id = pc.id
    JOIN comprobantes c ON c.id = cd.comprobante_id
    WHERE pc.empresa_id = $1
      AND c.empresa_id = $1
      AND c.estado = 'vigente'
      AND c.fecha BETWEEN $2 AND $3
    GROUP BY pc.id, pc.codigo, pc.nombre, pc.tipo
    HAVING ROUND(COALESCE(SUM(cd.debe), 0)) <> ROUND(COALESCE(SUM(cd.haber), 0))
    ORDER BY pc.codigo
    `,
    [empresaId, `${anio}-01-01`, `${anio}-12-31`]
  );

  return rows.map((f) => ({
    ...f,
    saldo: Math.round(Number(f.debitos) - Number(f.creditos)),
    columna: columnaBalancePorTipo(f.tipo),
  }));
}

async function crearComprobante(client, { empresaId, periodo, fecha, tipo, glosa, lineas }) {
  const totalDebe = lineas.reduce((s, l) => s + Number(l.debe || 0), 0);
  const totalHaber = lineas.reduce((s, l) => s + Number(l.haber || 0), 0);

  if (Math.round(totalDebe) !== Math.round(totalHaber)) {
    throw error(`El asiento de ${tipo.toLowerCase()} no cuadra: ${totalDebe} contra ${totalHaber}`, 500);
  }

  const numero = await obtenerSiguienteNumeroComprobante(client, empresaId, tipo);

  const { rows } = await client.query(
    `INSERT INTO comprobantes
       (empresa_id, periodo, fecha, tipo, numero, glosa, total_debe, total_haber, estado)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'vigente')
     RETURNING *`,
    [empresaId, periodo, fecha, tipo, numero, glosa, totalDebe, totalHaber]
  );

  await insertarDetallesComprobante(client, rows[0].id, lineas);

  return rows[0];
}

/**
 * Genera el asiento de cierre de resultados y el de apertura del año
 * siguiente. Devuelve ambos comprobantes y el resultado del ejercicio.
 */
async function generarAsientosDeCierre(client, empresaId, anio, usuarioId) {
  const config = await client.query(
    `SELECT cuenta_resultado_ejercicio_id FROM configuracion_contable WHERE empresa_id = $1`,
    [empresaId]
  );
  const cuentaResultado = Number(config.rows[0]?.cuenta_resultado_ejercicio_id || 0);

  if (!cuentaResultado) {
    throw error(
      "Falta configurar la cuenta de Resultado del Ejercicio en Configuración Contable antes de cerrar el año.",
      400
    );
  }

  const saldos = await saldosDelAnio(client, empresaId, anio);
  const resultado = saldos.filter((s) => s.columna === "ganancia" || s.columna === "perdida");
  const balance = saldos.filter((s) => s.columna === "activo" || s.columna === "pasivo");
  const sinClasificar = saldos.filter((s) => !s.columna);

  if (sinClasificar.length > 0) {
    throw error(
      `Hay cuentas con saldo cuyo tipo no permite clasificarlas: ${sinClasificar
        .map((s) => s.codigo)
        .join(", ")}. Corrige su tipo antes de cerrar.`,
      400
    );
  }

  // Cierre: cada cuenta de resultado se salda con la contrapartida en
  // resultado del ejercicio. Una pérdida con saldo deudor se abona; una
  // ganancia con saldo acreedor se debita.
  const lineasCierre = [];
  let resultadoEjercicio = 0;

  for (const cuenta of resultado) {
    if (cuenta.saldo === 0) continue;

    lineasCierre.push({
      cuenta_id: cuenta.id,
      glosa: `Cierre ${anio} ${cuenta.codigo} ${cuenta.nombre}`,
      debe: cuenta.saldo < 0 ? Math.abs(cuenta.saldo) : 0,
      haber: cuenta.saldo > 0 ? cuenta.saldo : 0,
    });
    // Saldo acreedor (ganancia) suma al resultado; deudor (pérdida) resta.
    resultadoEjercicio += -cuenta.saldo;
  }

  if (lineasCierre.length > 0) {
    lineasCierre.push({
      cuenta_id: cuentaResultado,
      glosa: `Resultado del ejercicio ${anio}`,
      debe: resultadoEjercicio < 0 ? Math.abs(resultadoEjercicio) : 0,
      haber: resultadoEjercicio > 0 ? resultadoEjercicio : 0,
    });
  }

  const cierre =
    lineasCierre.length > 0
      ? await crearComprobante(client, {
          empresaId,
          periodo: `${anio}-12`,
          fecha: `${anio}-12-31`,
          tipo: "Cierre",
          glosa: `Cierre de resultados ejercicio ${anio}`,
          lineas: lineasCierre,
        })
      : null;

  // Apertura: los saldos de balance del año, más el resultado del ejercicio
  // ya llevado a su cuenta, con fecha 01-01 del año siguiente.
  const lineasApertura = balance
    .filter((s) => s.saldo !== 0)
    .map((cuenta) => ({
      cuenta_id: cuenta.id,
      glosa: `Apertura ${anio + 1} ${cuenta.codigo} ${cuenta.nombre}`,
      debe: cuenta.saldo > 0 ? cuenta.saldo : 0,
      haber: cuenta.saldo < 0 ? Math.abs(cuenta.saldo) : 0,
    }));

  // La cuenta de resultado del ejercicio puede tener saldo previo del año y
  // recibe el del cierre. Se consolida en una sola línea.
  const saldoPrevioResultado = balance.find((s) => s.id === cuentaResultado)?.saldo || 0;
  const saldoResultadoTotal = saldoPrevioResultado - resultadoEjercicio;
  const indice = lineasApertura.findIndex((l) => l.cuenta_id === cuentaResultado);

  if (indice >= 0) lineasApertura.splice(indice, 1);

  if (saldoResultadoTotal !== 0) {
    lineasApertura.push({
      cuenta_id: cuentaResultado,
      glosa: `Apertura ${anio + 1} resultado del ejercicio ${anio}`,
      debe: saldoResultadoTotal > 0 ? saldoResultadoTotal : 0,
      haber: saldoResultadoTotal < 0 ? Math.abs(saldoResultadoTotal) : 0,
    });
  }

  const apertura =
    lineasApertura.length > 0
      ? await crearComprobante(client, {
          empresaId,
          periodo: `${anio + 1}-01`,
          fecha: `${anio + 1}-01-01`,
          tipo: "Apertura",
          glosa: `Apertura ejercicio ${anio + 1}`,
          lineas: lineasApertura,
        })
      : null;

  return { cierre, apertura, resultadoEjercicio, usuarioId };
}

async function asegurarEjercicioSiguiente(client, empresaId, anio) {
  await client.query(
    `INSERT INTO ejercicios_contables (empresa_id, anio, estado, fecha_inicio, fecha_termino)
     VALUES ($1, $2, 'abierto', $3, $4)
     ON CONFLICT (empresa_id, anio) DO NOTHING`,
    [empresaId, anio + 1, `${anio + 1}-01-01`, `${anio + 1}-12-31`]
  );
}

async function anularAsientosDeCierre(client, empresaId, ejercicio, usuarioId, motivo) {
  for (const columna of ["comprobante_cierre_id", "comprobante_apertura_id"]) {
    const id = ejercicio[columna];

    if (!id) continue;

    await client.query(
      `UPDATE comprobantes
       SET estado = 'anulado', anulado_en = NOW(), anulado_por = $3, motivo_anulacion = $4
       WHERE id = $1 AND empresa_id = $2 AND estado = 'vigente'`,
      [id, empresaId, usuarioId, `Reapertura del ejercicio ${ejercicio.anio}: ${motivo}`]
    );
  }
}

module.exports = {
  saldosDelAnio,
  generarAsientosDeCierre,
  asegurarEjercicioSiguiente,
  anularAsientosDeCierre,
};
