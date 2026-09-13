const pool = require("../database/db");

function numero(valor) {
  return Number(valor || 0);
}

async function obtenerLibroMayor(req, res) {
  try {
    const { empresa_id, fecha_desde, fecha_hasta, cuenta_id } = req.query;

    if (!empresa_id || !fecha_desde || !fecha_hasta) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, fecha_desde y fecha_hasta",
      });
    }

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
    let posicion = 4;

    if (cuenta_id && cuenta_id !== "undefined" && cuenta_id !== "null") {
      query += ` AND cd.cuenta_id = $${posicion}`;
      valores.push(cuenta_id);
      posicion++;
    }

    query += `
      ORDER BY
        pc.codigo ASC,
        c.fecha ASC,
        c.numero ASC,
        cd.id ASC
    `;

    const resultado = await pool.query(query, valores);

    let saldoAcumulado = 0;

    const movimientos = resultado.rows.map((item) => {
      const debe = numero(item.debe);
      const haber = numero(item.haber);

      saldoAcumulado += debe - haber;

      return {
        ...item,
        debe,
        haber,
        saldo_acumulado: saldoAcumulado,
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

    return res.json({
      fecha_desde,
      fecha_hasta,
      cuenta_id: cuenta_id || "",
      movimientos,
      totales,
    });
  } catch (error) {
    console.error("Error al obtener libro mayor:", error);

    return res.status(500).json({
      error: error.message || "Error interno al obtener libro mayor",
    });
  }
}

module.exports = {
  obtenerLibroMayor,
};