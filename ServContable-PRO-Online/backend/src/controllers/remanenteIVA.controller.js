const pool = require("../database/db");

async function obtenerControlRemanenteIVA(req, res) {
  try {
    const { empresa_id, periodo } = req.query;

    if (!empresa_id || !periodo) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y período",
      });
    }

    const ventasResult = await pool.query(
      `SELECT COALESCE(SUM(iva), 0) AS iva_debito
       FROM ventas
       WHERE empresa_id = $1
         AND periodo = $2
         AND estado = 'vigente'`,
      [empresa_id, periodo]
    );

    const comprasResult = await pool.query(
      `SELECT COALESCE(SUM(iva_credito), 0) AS iva_credito
       FROM compras
       WHERE empresa_id = $1
         AND periodo = $2
         AND estado = 'vigente'`,
      [empresa_id, periodo]
    );

    const registroResult = await pool.query(
      `SELECT *
       FROM remanente_iva
       WHERE empresa_id = $1
         AND periodo = $2`,
      [empresa_id, periodo]
    );

    const ivaDebito = Number(ventasResult.rows[0].iva_debito || 0);
    const ivaCredito = Number(comprasResult.rows[0].iva_credito || 0);

    let remanenteAnterior = 0;
    let observacion = "";

    if (registroResult.rows.length > 0) {
      remanenteAnterior = Number(registroResult.rows[0].remanente_anterior || 0);
      observacion = registroResult.rows[0].observacion || "";
    }

    const ivaDisponible = ivaCredito + remanenteAnterior;
    const ivaDeterminado = ivaDebito - ivaDisponible;
    const ivaPagar = ivaDeterminado > 0 ? ivaDeterminado : 0;
    const remanenteSiguiente = ivaDeterminado < 0 ? Math.abs(ivaDeterminado) : 0;

    return res.json({
      empresa_id: Number(empresa_id),
      periodo,
      remanente_anterior: remanenteAnterior,
      iva_debito: ivaDebito,
      iva_credito: ivaCredito,
      iva_disponible: ivaDisponible,
      iva_determinado: ivaDeterminado,
      iva_pagar: ivaPagar,
      remanente_siguiente: remanenteSiguiente,
      observacion,
    });
  } catch (error) {
    console.error("Error al obtener control remanente IVA:", error);

    return res.status(500).json({
      error: "Error interno al obtener control remanente IVA",
    });
  }
}

async function guardarControlRemanenteIVA(req, res) {
  try {
    const { empresa_id, periodo, remanente_anterior, observacion } = req.body;

    if (!empresa_id || !periodo) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y período",
      });
    }

    const ventasResult = await pool.query(
      `SELECT COALESCE(SUM(iva), 0) AS iva_debito
       FROM ventas
       WHERE empresa_id = $1
         AND periodo = $2
         AND estado = 'vigente'`,
      [empresa_id, periodo]
    );

    const comprasResult = await pool.query(
      `SELECT COALESCE(SUM(iva_credito), 0) AS iva_credito
       FROM compras
       WHERE empresa_id = $1
         AND periodo = $2
         AND estado = 'vigente'`,
      [empresa_id, periodo]
    );

    const ivaDebito = Number(ventasResult.rows[0].iva_debito || 0);
    const ivaCredito = Number(comprasResult.rows[0].iva_credito || 0);
    const remAnterior = Number(remanente_anterior || 0);

    const ivaDisponible = ivaCredito + remAnterior;
    const ivaDeterminado = ivaDebito - ivaDisponible;
    const ivaPagar = ivaDeterminado > 0 ? ivaDeterminado : 0;
    const remanenteSiguiente = ivaDeterminado < 0 ? Math.abs(ivaDeterminado) : 0;

    const resultado = await pool.query(
      `INSERT INTO remanente_iva
       (empresa_id, periodo, remanente_anterior, iva_debito, iva_credito,
        iva_disponible, iva_determinado, iva_pagar, remanente_siguiente,
        observacion, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
       ON CONFLICT (empresa_id, periodo)
       DO UPDATE SET
         remanente_anterior = EXCLUDED.remanente_anterior,
         iva_debito = EXCLUDED.iva_debito,
         iva_credito = EXCLUDED.iva_credito,
         iva_disponible = EXCLUDED.iva_disponible,
         iva_determinado = EXCLUDED.iva_determinado,
         iva_pagar = EXCLUDED.iva_pagar,
         remanente_siguiente = EXCLUDED.remanente_siguiente,
         observacion = EXCLUDED.observacion,
         actualizado_en = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        empresa_id,
        periodo,
        remAnterior,
        ivaDebito,
        ivaCredito,
        ivaDisponible,
        ivaDeterminado,
        ivaPagar,
        remanenteSiguiente,
        observacion || "",
      ]
    );

    return res.json({
      mensaje: "Control de remanente IVA guardado correctamente",
      control: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al guardar control remanente IVA:", error);

    return res.status(500).json({
      error: "Error interno al guardar control remanente IVA",
    });
  }
}

async function listarControlesRemanenteIVA(req, res) {
  try {
    const { empresa_id } = req.query;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    const resultado = await pool.query(
      `SELECT *
       FROM remanente_iva
       WHERE empresa_id = $1
       ORDER BY periodo DESC`,
      [empresa_id]
    );

    return res.json({
      total: resultado.rows.length,
      controles: resultado.rows,
    });
  } catch (error) {
    console.error("Error al listar controles remanente IVA:", error);

    return res.status(500).json({
      error: "Error interno al listar controles remanente IVA",
    });
  }
}

module.exports = {
  obtenerControlRemanenteIVA,
  guardarControlRemanenteIVA,
  listarControlesRemanenteIVA,
};