/**
 * Cierre mensual asistido.
 *
 * Reúne en una respuesta todas las comprobaciones que hay que hacer antes de
 * declarar un período, y dice con claridad si se puede declarar tranquilo.
 *
 * Antes cada una de estas revisiones existía repartida: el balance para ver si
 * cuadraba, el libro de compras para ver si faltaban cuentas, la conciliación
 * aparte. Nadie las juntaba, así que un error se descubría después de presentar
 * el F29.
 */

const pool = require("../database/db");
const { revisarPeriodo, ESTADOS } = require("../helpers/revisiones.helper");

async function obtenerCierreMensual(req, res) {
  const cliente = await pool.connect();

  try {
    const { empresa_id, periodo } = req.query;

    if (!empresa_id) {
      return res.status(400).json({ error: "Debe indicar empresa_id" });
    }

    if (!periodo || !/^\d{4}-\d{2}$/.test(String(periodo))) {
      return res.status(400).json({ error: "Debe indicar periodo con formato AAAA-MM" });
    }

    const resultado = await revisarPeriodo(cliente, Number(empresa_id), String(periodo));

    return res.json({
      empresa_id: Number(empresa_id),
      ...resultado,
      // Lo primero que quiere saber quien abre esta pantalla.
      mensaje: resultado.resumen.listo_para_declarar
        ? resultado.resumen.avisos > 0
          ? `El período cuadra. Hay ${resultado.resumen.avisos} aviso(s) que conviene revisar.`
          : "El período está listo para declarar."
        : `Hay ${resultado.resumen.errores} problema(s) que hacen que lo declarado no cuadre. Conviene resolverlos antes de presentar.`,
    });
  } catch (error) {
    console.error("Error en el cierre mensual:", error);

    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Error interno al revisar el período",
    });
  } finally {
    cliente.release();
  }
}

/**
 * Solo el semáforo, sin el detalle. Para pintar un indicador sin traer listas.
 */
async function obtenerEstadoDelPeriodo(req, res) {
  const cliente = await pool.connect();

  try {
    const { empresa_id, periodo } = req.query;

    if (!empresa_id || !periodo) {
      return res.status(400).json({ error: "Debe indicar empresa_id y periodo" });
    }

    const { resumen } = await revisarPeriodo(cliente, Number(empresa_id), String(periodo));

    return res.json({
      empresa_id: Number(empresa_id),
      periodo,
      estado: resumen.estado,
      errores: resumen.errores,
      avisos: resumen.avisos,
      listo_para_declarar: resumen.listo_para_declarar,
    });
  } catch (error) {
    console.error("Error al obtener el estado del período:", error);

    return res.status(500).json({ error: "Error interno al obtener el estado del período" });
  } finally {
    cliente.release();
  }
}

module.exports = { obtenerCierreMensual, obtenerEstadoDelPeriodo, ESTADOS };
