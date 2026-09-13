const pool = require("../database/db");

async function obtenerCuentasPorCobrar(req, res) {
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
        v.id AS documento_id,
        'Venta' AS tipo_documento,
        v.fecha,
        v.periodo,
        v.tipo_documento AS documento_origen,
        v.folio,
        v.rut_cliente AS rut_tercero,
        v.razon_social_cliente AS nombre_tercero,
        v.total AS total_documento,
        COALESCE(SUM(pc.monto), 0) AS total_pagado,
        v.total - COALESCE(SUM(pc.monto), 0) AS saldo_pendiente,
        v.comprobante_id
      FROM ventas v
      LEFT JOIN pagos_cobros pc
        ON pc.empresa_id = v.empresa_id
       AND pc.tipo_documento = 'Venta'
       AND pc.documento_id = v.id
       AND pc.estado = 'vigente'
      WHERE v.empresa_id = $1
        AND v.estado = 'vigente'
        AND v.fecha BETWEEN $2 AND $3
      GROUP BY
        v.id,
        v.fecha,
        v.periodo,
        v.tipo_documento,
        v.folio,
        v.rut_cliente,
        v.razon_social_cliente,
        v.total,
        v.comprobante_id
      HAVING v.total - COALESCE(SUM(pc.monto), 0) > 0
      ORDER BY v.fecha ASC, v.folio ASC
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const documentos = resultado.rows;

    const totales = documentos.reduce(
      (acc, item) => {
        acc.total_documentos += Number(item.total_documento || 0);
        acc.total_pagado += Number(item.total_pagado || 0);
        acc.saldo_pendiente += Number(item.saldo_pendiente || 0);
        return acc;
      },
      {
        total_documentos: 0,
        total_pagado: 0,
        saldo_pendiente: 0,
      }
    );

    return res.json({
      total: documentos.length,
      documentos,
      totales,
      filtros: {
        fecha_desde,
        fecha_hasta,
      },
    });
  } catch (error) {
    console.error("Error al obtener cuentas por cobrar:", error);

    return res.status(500).json({
      error: "Error interno al obtener cuentas por cobrar",
    });
  }
}

async function obtenerCuentasPorPagar(req, res) {
  try {
    const { empresa_id, fecha_desde, fecha_hasta } = req.query;

    if (!empresa_id || !fecha_desde || !fecha_hasta) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, fecha_desde y fecha_hasta",
      });
    }

    const comprasResult = await pool.query(
      `
      SELECT
        c.id AS documento_id,
        'Compra' AS tipo_documento,
        c.fecha,
        c.periodo,
        c.tipo_documento AS documento_origen,
        c.folio,
        c.rut_proveedor AS rut_tercero,
        c.razon_social_proveedor AS nombre_tercero,
        c.total AS total_documento,
        COALESCE(SUM(pc.monto), 0) AS total_pagado,
        c.total - COALESCE(SUM(pc.monto), 0) AS saldo_pendiente,
        c.comprobante_id
      FROM compras c
      LEFT JOIN pagos_cobros pc
        ON pc.empresa_id = c.empresa_id
       AND pc.tipo_documento = 'Compra'
       AND pc.documento_id = c.id
       AND pc.estado = 'vigente'
      WHERE c.empresa_id = $1
        AND c.estado = 'vigente'
        AND c.fecha BETWEEN $2 AND $3
      GROUP BY
        c.id,
        c.fecha,
        c.periodo,
        c.tipo_documento,
        c.folio,
        c.rut_proveedor,
        c.razon_social_proveedor,
        c.total,
        c.comprobante_id
      HAVING c.total - COALESCE(SUM(pc.monto), 0) > 0
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const honorariosResult = await pool.query(
      `
      SELECT
        h.id AS documento_id,
        'Honorario' AS tipo_documento,
        h.fecha_emision AS fecha,
        h.periodo,
        h.tipo_documento AS documento_origen,
        h.folio,
        h.rut_prestador AS rut_tercero,
        h.nombre_prestador AS nombre_tercero,
        h.liquido AS total_documento,
        COALESCE(SUM(pc.monto), 0) AS total_pagado,
        h.liquido - COALESCE(SUM(pc.monto), 0) AS saldo_pendiente,
        h.comprobante_id
      FROM honorarios h
      LEFT JOIN pagos_cobros pc
        ON pc.empresa_id = h.empresa_id
       AND pc.tipo_documento = 'Honorario'
       AND pc.documento_id = h.id
       AND pc.estado = 'vigente'
      WHERE h.empresa_id = $1
        AND h.estado = 'vigente'
        AND h.fecha_emision BETWEEN $2 AND $3
      GROUP BY
        h.id,
        h.fecha_emision,
        h.periodo,
        h.tipo_documento,
        h.folio,
        h.rut_prestador,
        h.nombre_prestador,
        h.liquido,
        h.comprobante_id
      HAVING h.liquido - COALESCE(SUM(pc.monto), 0) > 0
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const documentos = [
      ...comprasResult.rows,
      ...honorariosResult.rows,
    ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    const totales = documentos.reduce(
      (acc, item) => {
        acc.total_documentos += Number(item.total_documento || 0);
        acc.total_pagado += Number(item.total_pagado || 0);
        acc.saldo_pendiente += Number(item.saldo_pendiente || 0);

        if (item.tipo_documento === "Compra") {
          acc.saldo_compras += Number(item.saldo_pendiente || 0);
        }

        if (item.tipo_documento === "Honorario") {
          acc.saldo_honorarios += Number(item.saldo_pendiente || 0);
        }

        return acc;
      },
      {
        total_documentos: 0,
        total_pagado: 0,
        saldo_pendiente: 0,
        saldo_compras: 0,
        saldo_honorarios: 0,
      }
    );

    return res.json({
      total: documentos.length,
      documentos,
      totales,
      filtros: {
        fecha_desde,
        fecha_hasta,
      },
    });
  } catch (error) {
    console.error("Error al obtener cuentas por pagar:", error);

    return res.status(500).json({
      error: "Error interno al obtener cuentas por pagar",
    });
  }
}

module.exports = {
  obtenerCuentasPorCobrar,
  obtenerCuentasPorPagar,
};