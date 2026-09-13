const pool = require("../database/db");

function calcularResumenPorTipo(registros, campos) {
  const resumen = {};

  for (const item of registros) {
    const tipoDoc = item.sii_tipo_doc || item.tipo_documento || "Sin tipo";

    if (!resumen[tipoDoc]) {
      resumen[tipoDoc] = {
        tipo_doc: tipoDoc,
        cantidad: 0,
        exento: 0,
        neto: 0,
        iva: 0,
        iva_no_recuperable: 0,
        total: 0,
      };
    }

    resumen[tipoDoc].cantidad += 1;
    resumen[tipoDoc].exento += Number(item[campos.exento] || 0);
    resumen[tipoDoc].neto += Number(item[campos.neto] || 0);
    resumen[tipoDoc].iva += Number(item[campos.iva] || 0);
    resumen[tipoDoc].iva_no_recuperable += Number(
      item[campos.iva_no_recuperable] || 0
    );
    resumen[tipoDoc].total += Number(item[campos.total] || 0);
  }

  return Object.values(resumen);
}

async function obtenerLibroVentas(req, res) {
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
        id,
        empresa_id,
        periodo,
        fecha,
        tipo_documento,
        sii_tipo_doc,
        folio,
        rut_cliente,
        razon_social_cliente,
        exento,
        neto,
        iva,
        total,
        comprobante_id
      FROM ventas
      WHERE empresa_id = $1
        AND estado = 'vigente'
        AND fecha BETWEEN $2 AND $3
      ORDER BY fecha ASC, folio ASC, id ASC
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const ventas = resultado.rows;

    const totales = ventas.reduce(
      (acc, item) => {
        acc.exento += Number(item.exento || 0);
        acc.neto += Number(item.neto || 0);
        acc.iva += Number(item.iva || 0);
        acc.total += Number(item.total || 0);
        return acc;
      },
      {
        exento: 0,
        neto: 0,
        iva: 0,
        total: 0,
      }
    );

    const resumen_tipo_documento = calcularResumenPorTipo(ventas, {
      exento: "exento",
      neto: "neto",
      iva: "iva",
      iva_no_recuperable: "iva_no_recuperable",
      total: "total",
    });

    return res.json({
      total: ventas.length,
      ventas,
      totales,
      resumen_tipo_documento,
      filtros: {
        fecha_desde,
        fecha_hasta,
      },
    });
  } catch (error) {
    console.error("Error al obtener libro de ventas:", error);

    return res.status(500).json({
      error: "Error interno al obtener libro de ventas",
    });
  }
}

async function obtenerLibroCompras(req, res) {
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
        id,
        empresa_id,
        periodo,
        fecha,
        tipo_documento,
        sii_tipo_doc,
        folio,
        rut_proveedor,
        razon_social_proveedor,
        exento,
        neto,
        iva_credito,
        iva_no_recuperable,
        total,
        comprobante_id
      FROM compras
      WHERE empresa_id = $1
        AND estado = 'vigente'
        AND fecha BETWEEN $2 AND $3
      ORDER BY fecha ASC, folio ASC, id ASC
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const compras = resultado.rows;

    const totales = compras.reduce(
      (acc, item) => {
        acc.exento += Number(item.exento || 0);
        acc.neto += Number(item.neto || 0);
        acc.iva_credito += Number(item.iva_credito || 0);
        acc.iva_no_recuperable += Number(item.iva_no_recuperable || 0);
        acc.total += Number(item.total || 0);
        return acc;
      },
      {
        exento: 0,
        neto: 0,
        iva_credito: 0,
        iva_no_recuperable: 0,
        total: 0,
      }
    );

    const resumen_tipo_documento = calcularResumenPorTipo(compras, {
      exento: "exento",
      neto: "neto",
      iva: "iva_credito",
      iva_no_recuperable: "iva_no_recuperable",
      total: "total",
    });

    return res.json({
      total: compras.length,
      compras,
      totales,
      resumen_tipo_documento,
      filtros: {
        fecha_desde,
        fecha_hasta,
      },
    });
  } catch (error) {
    console.error("Error al obtener libro de compras:", error);

    return res.status(500).json({
      error: "Error interno al obtener libro de compras",
    });
  }
}

module.exports = {
  obtenerLibroVentas,
  obtenerLibroCompras,
};