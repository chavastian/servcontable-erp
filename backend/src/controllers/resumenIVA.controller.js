const pool = require("../database/db");
const {
  sumaConSigno,
  sumaNotasCredito,
} = require("../helpers/documentoTributario.helper");

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

    // REQUIERE VALIDACIÓN CONTABLE/TRIBUTARIA: las notas de crédito restan.
    // Antes se sumaba todo en positivo, de modo que una nota de crédito
    // aumentaba el débito fiscal en lugar de rebajarlo.
    const ventasResult = await pool.query(
      `SELECT
         ${sumaConSigno("neto")} AS ventas_neto,
         ${sumaConSigno("exento")} AS ventas_exento,
         ${sumaConSigno("iva")} AS iva_debito,
         ${sumaConSigno("total")} AS ventas_total,
         ${sumaNotasCredito("neto")} AS notas_credito_neto,
         ${sumaNotasCredito("iva")} AS notas_credito_iva,
         ${sumaNotasCredito("total")} AS notas_credito_total
       FROM ventas
       WHERE empresa_id = $1
         AND periodo = $2
         AND estado = 'vigente'`,
      [empresa_id, periodo]
    );

    const comprasResult = await pool.query(
      `SELECT
         ${sumaConSigno("neto")} AS compras_neto,
         ${sumaConSigno("exento")} AS compras_exento,
         ${sumaConSigno("iva_credito")} AS iva_credito,
         ${sumaConSigno("iva_no_recuperable")} AS iva_no_recuperable,
         ${sumaConSigno("total")} AS compras_total,
         ${sumaNotasCredito("neto")} AS notas_credito_neto,
         ${sumaNotasCredito("iva_credito")} AS notas_credito_iva,
         ${sumaNotasCredito("total")} AS notas_credito_total
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
        // Informado aparte para que se pueda revisar el efecto de las rebajas.
        notas_credito: {
          neto: Number(ventas.notas_credito_neto || 0),
          iva: Number(ventas.notas_credito_iva || 0),
          total: Number(ventas.notas_credito_total || 0),
        },
      },
      compras: {
        neto: comprasNeto,
        exento: comprasExento,
        iva_credito: ivaCredito,
        iva_no_recuperable: ivaNoRecuperable,
        total: comprasTotal,
        notas_credito: {
          neto: Number(compras.notas_credito_neto || 0),
          iva: Number(compras.notas_credito_iva || 0),
          total: Number(compras.notas_credito_total || 0),
        },
      },
      resumen: {
        iva_debito: ivaDebito,
        iva_credito: ivaCredito,
        iva_no_recuperable: ivaNoRecuperable,
        iva_determinado: ivaDeterminado,
        iva_pagar: ivaPagar,
        remanente,
        // Las notas de crédito ya vienen restadas en las cifras de arriba.
        // REQUIERE VALIDACIÓN CONTABLE/TRIBUTARIA.
        notas_credito_aplicadas: true,
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