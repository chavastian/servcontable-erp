/**
 * Resumen F29. El calculo vive en helpers/f29.helper.js, que es el mismo que
 * usa el registro del F29 presentado y el cierre mensual: una sola forma de
 * calcular, para que las tres pantallas digan lo mismo.
 */

const pool = require("../database/db");
const { calcularF29 } = require("../helpers/f29.helper");

async function obtenerResumenF29(req, res) {
  try {
    const { empresa_id, periodo, tasa_ppm } = req.query;

    if (!empresa_id) {
      return res.status(400).json({ error: "Debe indicar empresa_id" });
    }

    if (!periodo || !/^\d{4}-\d{2}$/.test(String(periodo))) {
      return res.status(400).json({ error: "Debe indicar período con formato AAAA-MM" });
    }

    const resultado = await calcularF29(pool, Number(empresa_id), String(periodo), {
      tasa_ppm,
    });

    return res.json(resultado);
  } catch (error) {
    console.error("Error al obtener resumen F29:", error);

    return res.status(500).json({ error: "Error interno al obtener resumen F29" });
  }
}

module.exports = { obtenerResumenF29 };
