const pool = require("../database/db");
const { asegurarTablaAuditoria } = require("../helpers/auditoria.helper");

async function listarAuditoria(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id, fecha_desde, fecha_hasta } = req.query;

    if (!empresa_id || !fecha_desde || !fecha_hasta) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, fecha_desde y fecha_hasta",
      });
    }

    await asegurarTablaAuditoria(client);

    const resultado = await client.query(
      `
      SELECT
        a.id::text AS id,
        a.empresa_id,
        a.usuario_id,
        a.usuario_email,
        a.modulo,
        a.accion,
        a.detalle,
        a.tabla_afectada,
        a.registro_id,
        a.datos,
        a.creado_en
      FROM auditoria_movimientos a
      WHERE a.empresa_id = $1
        AND (
          a.creado_en::date BETWEEN $2::date AND $3::date
          OR (
            a.tabla_afectada = 'comprobantes'
            AND a.accion = 'Eliminar asiento'
            AND (a.datos->>'fecha') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            AND (a.datos->>'fecha')::date BETWEEN $2::date AND $3::date
          )
        )

      UNION ALL

      SELECT
        CONCAT('comp-anulado-', c.id) AS id,
        c.empresa_id,
        NULL::integer AS usuario_id,
        ''::text AS usuario_email,
        'Comprobantes'::text AS modulo,
        'Eliminar asiento'::text AS accion,
        CONCAT('Comprobante ', c.tipo, ' N° ', c.numero, ' anulado') AS detalle,
        'comprobantes'::text AS tabla_afectada,
        c.id AS registro_id,
        '{}'::jsonb AS datos,
        c.fecha::timestamp AS creado_en
      FROM comprobantes c
      WHERE c.empresa_id = $1
        AND c.estado = 'anulado'
        AND c.fecha BETWEEN $2::date AND $3::date
        AND NOT EXISTS (
          SELECT 1
          FROM auditoria_movimientos ax
          WHERE ax.empresa_id = c.empresa_id
            AND ax.tabla_afectada = 'comprobantes'
            AND ax.registro_id = c.id
            AND ax.accion = 'Eliminar asiento'
        )

      ORDER BY creado_en DESC, id DESC
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    return res.json({
      total: resultado.rows.length,
      movimientos: resultado.rows,
    });
  } catch (error) {
    console.error("Error al listar auditoria:", error);

    return res.status(500).json({
      error: "Error interno al listar auditoria",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  listarAuditoria,
};
