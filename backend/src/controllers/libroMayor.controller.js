const pool = require("../database/db");

function numero(valor) {
  return Number(valor || 0);
}

/**
 * Libro mayor con saldo inicial por cuenta.
 *
 * El saldo acumulado corría de una cuenta a la siguiente sin reiniciarse, y
 * no existía saldo inicial: una cuenta con movimientos de enero consultada
 * en marzo partía de cero. Ahora cada cuenta parte del saldo acumulado
 * anterior a `fecha_desde` y el acumulado se reinicia por cuenta.
 */
async function obtenerLibroMayor(req, res) {
  try {
    const { empresa_id, fecha_desde, fecha_hasta, cuenta_id } = req.query;

    if (!empresa_id || !fecha_desde || !fecha_hasta) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, fecha_desde y fecha_hasta",
      });
    }

    const filtraCuenta = cuenta_id && cuenta_id !== "undefined" && cuenta_id !== "null";

    let query = `
      SELECT
        cd.id AS detalle_id,
        cd.comprobante_id,
        c.fecha,
        c.periodo,
        c.tipo,
        c.numero,
        c.glosa AS glosa_comprobante,
        cd.glosa AS glosa_detalle,
        cd.debe,
        cd.haber,

        pc.id AS cuenta_id,
        pc.codigo AS cuenta_codigo,
        pc.nombre AS cuenta_nombre,
        pc.tipo AS cuenta_tipo,
        pc.clasificacion AS cuenta_clasificacion,
        pc.naturaleza AS cuenta_naturaleza

      FROM comprobante_detalle cd
      INNER JOIN comprobantes c
        ON c.id = cd.comprobante_id
      INNER JOIN plan_cuentas pc
        ON pc.id = cd.cuenta_id
      WHERE c.empresa_id = $1
        AND c.fecha BETWEEN $2 AND $3
        AND c.estado = 'vigente'
    `;

    const valores = [empresa_id, fecha_desde, fecha_hasta];

    if (filtraCuenta) {
      query += ` AND cd.cuenta_id = $4`;
      valores.push(cuenta_id);
    }

    query += `
      ORDER BY
        pc.codigo ASC,
        c.fecha ASC,
        c.numero ASC,
        cd.id ASC
    `;

    let inicialQuery = `
      SELECT pc.id AS cuenta_id, pc.codigo AS cuenta_codigo, pc.nombre AS cuenta_nombre,
             pc.tipo AS cuenta_tipo,
             COALESCE(SUM(cd.debe), 0) AS debe, COALESCE(SUM(cd.haber), 0) AS haber
      FROM comprobante_detalle cd
      INNER JOIN comprobantes c ON c.id = cd.comprobante_id
      INNER JOIN plan_cuentas pc ON pc.id = cd.cuenta_id
      WHERE c.empresa_id = $1
        AND c.fecha < $2
        AND c.estado = 'vigente'
    `;
    const valoresInicial = [empresa_id, fecha_desde];

    if (filtraCuenta) {
      inicialQuery += ` AND cd.cuenta_id = $3`;
      valoresInicial.push(cuenta_id);
    }

    inicialQuery += ` GROUP BY pc.id, pc.codigo, pc.nombre, pc.tipo`;

    const [resultado, inicial] = await Promise.all([
      pool.query(query, valores),
      pool.query(inicialQuery, valoresInicial),
    ]);

    const saldosIniciales = {};

    for (const fila of inicial.rows) {
      saldosIniciales[fila.cuenta_id] = {
        cuenta_id: fila.cuenta_id,
        cuenta_codigo: fila.cuenta_codigo,
        cuenta_nombre: fila.cuenta_nombre,
        cuenta_tipo: fila.cuenta_tipo,
        debe: numero(fila.debe),
        haber: numero(fila.haber),
        saldo: numero(fila.debe) - numero(fila.haber),
      };
    }

    const acumuladoPorCuenta = {};

    const movimientos = resultado.rows.map((item) => {
      const debe = numero(item.debe);
      const haber = numero(item.haber);

      if (acumuladoPorCuenta[item.cuenta_id] === undefined) {
        acumuladoPorCuenta[item.cuenta_id] = saldosIniciales[item.cuenta_id]?.saldo || 0;
      }

      acumuladoPorCuenta[item.cuenta_id] += debe - haber;

      return {
        ...item,
        debe,
        haber,
        saldo_inicial: saldosIniciales[item.cuenta_id]?.saldo || 0,
        saldo_acumulado: acumuladoPorCuenta[item.cuenta_id],
      };
    });

    const totales = movimientos.reduce(
      (acc, item) => {
        acc.total_debe += numero(item.debe);
        acc.total_haber += numero(item.haber);
        return acc;
      },
      {
        total_debe: 0,
        total_haber: 0,
      }
    );

    totales.saldo = totales.total_debe - totales.total_haber;
    totales.saldo_inicial = Object.values(saldosIniciales).reduce((s, c) => s + c.saldo, 0);
    totales.saldo_final = totales.saldo_inicial + totales.saldo;

    return res.json({
      fecha_desde,
      fecha_hasta,
      cuenta_id: cuenta_id || "",
      // Saldos anteriores a fecha_desde, también de cuentas sin movimiento
      // en el rango: el mayor de marzo debe mostrar Caja aunque marzo no
      // la haya tocado.
      saldos_iniciales: Object.values(saldosIniciales).sort((a, b) =>
        String(a.cuenta_codigo).localeCompare(String(b.cuenta_codigo))
      ),
      movimientos,
      totales,
    });
  } catch (error) {
    console.error("Error al obtener libro mayor:", error);

    return res.status(error.statusCode || 500).json({
      // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
      // columnas y restricciones. Los errores de validacion propios
      // si conservan su mensaje y su codigo.
      error: error.statusCode ? error.message : "Error interno al obtener libro mayor",
    });
  }
}

module.exports = {
  obtenerLibroMayor,
};
