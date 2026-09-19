/**
 * Sugerencias de cuenta para documentos sin clasificar, y su aplicación.
 *
 * Se separa en dos pasos a propósito: primero se ve qué se propone, después se
 * aplica lo que la persona aceptó. Aplicar sin mostrar sería cambiar la
 * contabilidad de alguien sin que lo vea.
 */

const pool = require("../database/db");
const {
  sugerirParaDocumentosSinCuenta,
  historialCuentasProveedor,
  historialCuentasCliente,
  normalizarRut,
} = require("../helpers/sugerenciaCuenta.helper");
const { ESTADO_CERRADO, anioDe } = require("../helpers/periodo.helper");

async function listarSugerencias(req, res) {
  const cliente = await pool.connect();

  try {
    const { empresa_id, periodo } = req.query;

    if (periodo && !/^\d{4}-\d{2}$/.test(String(periodo))) {
      return res.status(400).json({ error: "El periodo debe tener el formato AAAA-MM" });
    }

    const resultado = await sugerirParaDocumentosSinCuenta(cliente, Number(empresa_id), {
      periodo: periodo ? String(periodo) : null,
    });

    return res.json({
      empresa_id: Number(empresa_id),
      ...resultado,
      aviso:
        "Las sugerencias vienen del historial de la propia empresa: la cuenta que se usó antes para el mismo RUT. Nada se aplicó todavía.",
    });
  } catch (error) {
    console.error("Error al listar sugerencias de cuenta:", error);

    return res.status(500).json({ error: "Error interno al calcular las sugerencias" });
  } finally {
    cliente.release();
  }
}

/**
 * Aplica las sugerencias que la persona confirmó.
 *
 * Recibe una lista explícita de documentos, no un "aplicar todo" ciego: quien
 * revisa decide cuáles. Solo se tocan documentos de la empresa validada, que hoy
 * estén sin cuenta y en un período abierto.
 */
async function aplicarSugerencias(req, res) {
  const cliente = await pool.connect();

  try {
    const empresaId = Number(req.body.empresa_id);
    const documentos = Array.isArray(req.body.documentos) ? req.body.documentos : [];

    if (documentos.length === 0) {
      return res.status(400).json({ error: "Debe indicar los documentos a actualizar" });
    }

    if (documentos.length > 500) {
      return res.status(400).json({ error: "Máximo 500 documentos por solicitud" });
    }

    await cliente.query("BEGIN");

    // Los ejercicios cerrados se leen una vez, no una por documento: quien
    // aplica sugerencias en lote puede mandar quinientas filas.
    const { rows: cerrados } = await cliente.query(
      `SELECT anio FROM ejercicios_contables
       WHERE empresa_id = $1 AND LOWER(estado) = $2`,
      [empresaId, ESTADO_CERRADO]
    );
    const aniosCerrados = new Set(cerrados.map((fila) => Number(fila.anio)));

    const aplicados = [];
    const rechazados = [];

    for (const documento of documentos) {
      const libro = String(documento.libro || "").toLowerCase();
      const id = Number(documento.id);
      const cuentaId = Number(documento.cuenta_id);

      if (!["compras", "ventas"].includes(libro) || !Number.isInteger(id) || !Number.isInteger(cuentaId)) {
        rechazados.push({ ...documento, motivo: "Datos incompletos o libro desconocido." });
        continue;
      }

      // La cuenta tiene que ser de esta empresa. Sin esta comprobación se podría
      // imputar un gasto a una cuenta del plan de otro cliente.
      const { rows: cuentas } = await cliente.query(
        `SELECT id FROM plan_cuentas WHERE id = $1 AND empresa_id = $2 AND activo = true`,
        [cuentaId, empresaId]
      );

      if (cuentas.length === 0) {
        rechazados.push({ ...documento, motivo: "La cuenta no pertenece a esta empresa." });
        continue;
      }

      const tabla = libro === "compras" ? "compras" : "ventas";
      const columna = libro === "compras" ? "cuenta_gasto_id" : "cuenta_ingreso_id";

      const { rows: existentes } = await cliente.query(
        `SELECT id, periodo, ${columna} AS cuenta_actual
         FROM ${tabla}
         WHERE id = $1 AND empresa_id = $2 AND estado = 'vigente'`,
        [id, empresaId]
      );

      if (existentes.length === 0) {
        rechazados.push({ ...documento, motivo: "El documento no existe en esta empresa." });
        continue;
      }

      if (existentes[0].cuenta_actual) {
        rechazados.push({
          ...documento,
          motivo: "El documento ya tiene cuenta asignada. No se sobrescribe.",
        });
        continue;
      }

      if (aniosCerrados.has(anioDe(existentes[0].periodo))) {
        rechazados.push({
          ...documento,
          motivo: `El ejercicio ${anioDe(existentes[0].periodo)} está cerrado.`,
        });
        continue;
      }

      await cliente.query(
        `UPDATE ${tabla} SET ${columna} = $1 WHERE id = $2 AND empresa_id = $3`,
        [cuentaId, id, empresaId]
      );

      aplicados.push({ libro, id, cuenta_id: cuentaId });
    }

    await cliente.query("COMMIT");

    return res.json({
      aplicados: aplicados.length,
      rechazados: rechazados.length,
      detalle: { aplicados, rechazados },
      aviso:
        aplicados.length > 0
          ? "La cuenta quedó asignada en el documento. Los asientos ya generados no se modificaron: hay que regenerarlos si corresponde."
          : "No se modificó ningún documento.",
    });
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    console.error("Error al aplicar sugerencias de cuenta:", error);

    return res.status(500).json({ error: "Error interno al aplicar las sugerencias" });
  } finally {
    cliente.release();
  }
}

/**
 * Sugerencia puntual para un RUT. Sirve al formulario de carga manual: al
 * escribir el RUT del proveedor, proponer la cuenta de siempre.
 */
async function sugerirParaRut(req, res) {
  try {
    const empresaId = Number(req.query.empresa_id);
    const rut = normalizarRut(req.query.rut);
    const libro = String(req.query.libro || "compras").toLowerCase();

    if (!rut) {
      return res.status(400).json({ error: "Debe indicar el rut" });
    }

    const historial =
      libro === "ventas"
        ? await historialCuentasCliente(pool, empresaId, [rut])
        : await historialCuentasProveedor(pool, empresaId, [rut]);

    const sugerida = historial[rut] || null;

    return res.json({
      empresa_id: empresaId,
      rut,
      libro,
      sugerencia: sugerida,
      detalle: sugerida
        ? `Este RUT se clasificó ${sugerida.usos} vez/veces en ${sugerida.codigo} ${sugerida.nombre}.`
        : "No hay documentos anteriores de este RUT con cuenta asignada.",
    });
  } catch (error) {
    console.error("Error al sugerir cuenta por RUT:", error);

    return res.status(500).json({ error: "Error interno al sugerir la cuenta" });
  }
}

module.exports = { listarSugerencias, aplicarSugerencias, sugerirParaRut };
