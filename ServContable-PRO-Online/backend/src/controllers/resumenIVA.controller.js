const pool = require("../database/db");

async function obtenerResumenIVA(req, res) {
  try {
    const { empresa_id, periodo } = req.query;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    if (!periodo) {
      return res.status(400).json({
        error: "Debe indicar período",
      });
    }

    const ventasResult = await pool.query(
      `SELECT
         COALESCE(SUM(neto), 0) AS ventas_neto,
         COALESCE(SUM(exento), 0) AS ventas_exento,
         COALESCE(SUM(iva), 0) AS iva_debito,
         COALESCE(SUM(total), 0) AS ventas_total
       FROM ventas
       WHERE empresa_id = $1
         AND periodo = $2
         AND estado = 'vigente'`,
      [empresa_id, periodo]
    );

    const comprasResult = await pool.query(
      `SELECT
         COALESCE(SUM(neto), 0) AS compras_neto,
         COALESCE(SUM(exento), 0) AS compras_exento,
         COALESCE(SUM(iva_credito), 0) AS iva_credito,
         COALESCE(SUM(iva_no_recuperable), 0) AS iva_no_recuperable,
         COALESCE(SUM(total), 0) AS compras_total
       FROM compras
       WHERE empresa_id = $1
         AND periodo = $2
         AND estado = 'vigente'`,
      [empresa_id, periodo]
    );

    const ventas = ventasResult.rows[0];
    const compras = comprasResult.rows[0];

    const ventasNeto = Number(ventas.ventas_neto || 0);
    const ventasExento = Number(ventas.ventas_exento || 0);
    const ivaDebito = Number(ventas.iva_debito || 0);
    const ventasTotal = Number(ventas.ventas_total || 0);

    const comprasNeto = Number(compras.compras_neto || 0);
    const comprasExento = Number(compras.compras_exento || 0);
    const ivaCredito = Number(compras.iva_credito || 0);
    const ivaNoRecuperable = Number(compras.iva_no_recuperable || 0);
    const comprasTotal = Number(compras.compras_total || 0);

    const ivaDeterminado = ivaDebito - ivaCredito;

    const ivaPagar = ivaDeterminado > 0 ? ivaDeterminado : 0;
    const remanente = ivaDeterminado < 0 ? Math.abs(ivaDeterminado) : 0;

    return res.json({
      empresa_id: Number(empresa_id),
      periodo,
      ventas: {
        neto: ventasNeto,
        exento: ventasExento,
        iva_debito: ivaDebito,
        total: ventasTotal,
      },
      compras: {
        neto: comprasNeto,
        exento: comprasExento,
        iva_credito: ivaCredito,
        iva_no_recuperable: ivaNoRecuperable,
        total: comprasTotal,
      },
      resumen: {
        iva_debito: ivaDebito,
        iva_credito: ivaCredito,
        iva_no_recuperable: ivaNoRecuperable,
        iva_determinado: ivaDeterminado,
        iva_pagar: ivaPagar,
        remanente,
      },
    });
  } catch (error) {
    console.error("Error al obtener resumen IVA:", error);

    return res.status(500).json({
      error: "Error interno al obtener resumen IVA",
    });
  }
}

module.exports = {
  obtenerResumenIVA,
};