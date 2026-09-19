/**
 * Antigüedad de la cartera y proyección de flujo de caja.
 *
 * La antigüedad es un hecho. La proyección es una estimación y la respuesta lo
 * dice, junto con los supuestos que usó.
 */

const pool = require("../database/db");
const { flujoDeCaja, PLAZO_POR_DEFECTO } = require("../helpers/flujoCaja.helper");

async function obtenerFlujoCaja(req, res) {
  const cliente = await pool.connect();

  try {
    const empresaId = Number(req.query.empresa_id);

    const plazo = Number(req.query.plazo_dias);
    const plazoDias =
      Number.isFinite(plazo) && plazo >= 0 && plazo <= 365 ? plazo : PLAZO_POR_DEFECTO;

    const semanasPedidas = Number(req.query.semanas);
    const semanas =
      Number.isFinite(semanasPedidas) && semanasPedidas >= 1 && semanasPedidas <= 26
        ? semanasPedidas
        : 8;

    const resultado = await flujoDeCaja(cliente, empresaId, { plazoDias, semanas });

    return res.json({ empresa_id: empresaId, ...resultado });
  } catch (error) {
    console.error("Error al calcular el flujo de caja:", error);

    return res.status(500).json({ error: "Error interno al calcular el flujo de caja" });
  } finally {
    cliente.release();
  }
}

module.exports = { obtenerFlujoCaja };
