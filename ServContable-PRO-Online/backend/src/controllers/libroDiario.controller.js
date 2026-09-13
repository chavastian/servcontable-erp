const pool = require("../database/db");

async function obtenerLibroDiario(req, res) {
  try {
    const { empresa_id, fecha_desde, fecha_hasta } = req.query;

    if (!empresa_id || !fecha_desde || !fecha_hasta) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, fecha_desde y fecha_hasta",
      });
    }

    const resultado = await pool.query(
      `
      SELECT
        c.id AS comprobante_id,
        c.periodo,
        c.fecha,
        c.tipo,
        c.numero,
        c.glosa AS glosa_comprobante,
        cd.id AS detalle_id,
        cd.glosa AS glosa_detalle,
        cd.debe,
        cd.haber,
        pc.id AS cuenta_id,
        pc.codigo AS codigo_cuenta,
        pc.nombre AS nombre_cuenta,
        pc.tipo AS tipo_cuenta,
        pc.naturaleza
      FROM comprobantes c
      INNER JOIN comprobante_detalle cd
        ON cd.comprobante_id = c.id
      INNER JOIN plan_cuentas pc
        ON pc.id = cd.cuenta_id
      WHERE c.empresa_id = $1
        AND c.estado = 'vigente'
        AND c.fecha BETWEEN $2 AND $3
      ORDER BY c.fecha ASC, c.tipo ASC, c.numero ASC, cd.id ASC
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const movimientos = resultado.rows;

    const totales = movimientos.reduce(
      (acc, mov) => {
        acc.debe += Number(mov.debe || 0);
        acc.haber += Number(mov.haber || 0);
        return acc;
      },
      {
        debe: 0,
        haber: 0,
      }
    );

    return res.json({
      total: movimientos.length,
      movimientos,
      totales,
      filtros: {
        fecha_desde,
        fecha_hasta,
      },
    });
  } catch (error) {
    console.error("Error al obtener libro diario:", error);

    return res.status(500).json({
      error: "Error interno al obtener libro diario",
    });
  }
}

module.exports = {
  obtenerLibroDiario,
};