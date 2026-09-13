const pool = require("../database/db");

async function obtenerResumenF29(req, res) {
  try {
    const { empresa_id, periodo, tasa_ppm } = req.query;

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

    const tasaPPM = Number(tasa_ppm || 0);

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

    const honorariosResult = await pool.query(
      `SELECT
         COALESCE(SUM(bruto), 0) AS honorarios_bruto,
         COALESCE(SUM(retencion), 0) AS honorarios_retencion,
         COALESCE(SUM(liquido), 0) AS honorarios_liquido
       FROM honorarios
       WHERE empresa_id = $1
         AND estado = 'vigente'
         AND (
           periodo = $2
           OR TO_CHAR(fecha_emision::date, 'YYYY-MM') = $2
         )`,
      [empresa_id, periodo]
    );

    const ventas = ventasResult.rows[0];
    const compras = comprasResult.rows[0];
    const honorarios = honorariosResult.rows[0];

    const ventasNeto = Number(ventas.ventas_neto || 0);
    const ventasExento = Number(ventas.ventas_exento || 0);
    const ivaDebito = Number(ventas.iva_debito || 0);
    const ventasTotal = Number(ventas.ventas_total || 0);

    const comprasNeto = Number(compras.compras_neto || 0);
    const comprasExento = Number(compras.compras_exento || 0);
    const ivaCredito = Number(compras.iva_credito || 0);
    const ivaNoRecuperable = Number(compras.iva_no_recuperable || 0);
    const comprasTotal = Number(compras.compras_total || 0);
    const honorariosBruto = Number(honorarios.honorarios_bruto || 0);
    const honorariosRetencion = Number(honorarios.honorarios_retencion || 0);
    const honorariosLiquido = Number(honorarios.honorarios_liquido || 0);

    const ivaDeterminado = ivaDebito - ivaCredito;
    const ivaPagar = ivaDeterminado > 0 ? ivaDeterminado : 0;
    const remanente = ivaDeterminado < 0 ? Math.abs(ivaDeterminado) : 0;

    const ppm = Math.round(ventasNeto * (tasaPPM / 100));

    const totalF29Estimado = ivaPagar + ppm + honorariosRetencion;

    return res.json({
      empresa_id: Number(empresa_id),
      periodo,
      tasa_ppm: tasaPPM,
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
      iva: {
        iva_debito: ivaDebito,
        iva_credito: ivaCredito,
        iva_determinado: ivaDeterminado,
        iva_pagar: ivaPagar,
        remanente,
      },
      ppm: {
        base_ppm: ventasNeto,
        tasa_ppm: tasaPPM,
        monto_ppm: ppm,
      },
      honorarios: {
        bruto: honorariosBruto,
        retencion: honorariosRetencion,
        liquido: honorariosLiquido,
      },
      total_f29_estimado: totalF29Estimado,
    });
  } catch (error) {
    console.error("Error al obtener resumen F29:", error);

    return res.status(500).json({
      error: "Error interno al obtener resumen F29",
    });
  }
}

module.exports = {
  obtenerResumenF29,
};
