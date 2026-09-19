/**
 * Sugerencias de calce de la cartola bancaria.
 *
 * Solo lee y propone. La confirmación de cada calce sigue pasando por
 * `PUT /api/conciliacion-bancaria/:id/estado`, que es donde se escribe, para que
 * exista un solo lugar por donde se marca un movimiento como conciliado.
 */

const pool = require("../database/db");
const { proponerCalces } = require("../helpers/calceBancario.helper");

async function sugerirCalces(req, res) {
  const cliente = await pool.connect();

  try {
    const { empresa_id, periodo } = req.query;

    if (!periodo || !/^\d{4}-\d{2}$/.test(String(periodo))) {
      return res.status(400).json({ error: "Debe indicar periodo con formato AAAA-MM" });
    }

    const limite = Math.min(Number(req.query.limite) || 200, 500);

    const resultado = await proponerCalces(
      cliente,
      Number(empresa_id),
      String(periodo),
      { limite }
    );

    return res.json({
      empresa_id: Number(empresa_id),
      ...resultado,
      // Que quede claro en la respuesta, no solo en la documentación.
      aviso:
        "Son propuestas. Ninguna se aplicó: cada calce se confirma al marcar el movimiento como conciliado.",
    });
  } catch (error) {
    console.error("Error al sugerir calces bancarios:", error);

    return res.status(500).json({ error: "Error interno al sugerir calces" });
  } finally {
    cliente.release();
  }
}

module.exports = { sugerirCalces };
