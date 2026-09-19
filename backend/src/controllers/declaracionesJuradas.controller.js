const pool = require("../database/db");
const {
  resumen1879,
  resumen1887,
  COLUMNAS_1879,
  COLUMNAS_1887,
  construirCsv,
} = require("../helpers/declaracionesJuradas.helper");

const AVISO_FORMATO =
  "El SII cambia el formato y los códigos de columna de las declaraciones juradas casi todos los años por resolución. REQUIERE VALIDACIÓN TRIBUTARIA contra la resolución del año tributario que estás declarando antes de subir el archivo.";

function responderError(res, error, mensaje) {
  return res.status(error.statusCode || 500).json({
    // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
    // columnas y restricciones. Los errores de validacion propios
    // si conservan su mensaje y su codigo.
    error: error.statusCode ? error.message : mensaje,
  });
}

function leerAnio(valor) {
  const anio = Math.trunc(Number(valor));

  return Number.isInteger(anio) && anio >= 2000 && anio <= 2100 ? anio : null;
}

function normalizarRut(valor) {
  return String(valor || "")
    .toUpperCase()
    .replace(/[.\s]/g, "");
}

async function obtener1879(req, res) {
  try {
    const { empresa_id } = req.query;
    const anio = leerAnio(req.query.anio);

    if (!empresa_id || !anio) {
      return res.status(400).json({ error: "Debe indicar empresa_id y anio (comercial)" });
    }

    const resumen = await resumen1879(pool, empresa_id, anio);

    return res.json({
      declaracion: "1879",
      nombre: "Retenciones del artículo 42 N°2 (honorarios)",
      ...resumen,
      avisos: [...resumen.avisos, AVISO_FORMATO],
    });
  } catch (error) {
    console.error("Error al obtener la declaración jurada 1879:", error);

    return responderError(res, error, "Error interno al obtener la declaración jurada 1879");
  }
}

async function obtener1887(req, res) {
  try {
    const { empresa_id } = req.query;
    const anio = leerAnio(req.query.anio);

    if (!empresa_id || !anio) {
      return res.status(400).json({ error: "Debe indicar empresa_id y anio (comercial)" });
    }

    const resumen = await resumen1887(pool, empresa_id, anio);

    return res.json({
      declaracion: "1887",
      nombre: "Rentas del artículo 42 N°1 (sueldos)",
      ...resumen,
      avisos: [...resumen.avisos, AVISO_FORMATO],
    });
  } catch (error) {
    console.error("Error al obtener la declaración jurada 1887:", error);

    return responderError(res, error, "Error interno al obtener la declaración jurada 1887");
  }
}

async function exportarDeclaracion(req, res) {
  try {
    const { empresa_id, tipo } = req.query;
    const anio = leerAnio(req.query.anio);

    if (!empresa_id || !anio || !["1879", "1887"].includes(String(tipo))) {
      return res.status(400).json({ error: "Debe indicar empresa_id, anio y tipo (1879 o 1887)" });
    }

    const resumen =
      String(tipo) === "1879"
        ? await resumen1879(pool, empresa_id, anio)
        : await resumen1887(pool, empresa_id, anio);

    if (resumen.detalle.length === 0) {
      return res.status(404).json({
        error: `No hay datos para la declaración ${tipo} del año comercial ${anio}.`,
      });
    }

    const columnas = String(tipo) === "1879" ? COLUMNAS_1879 : COLUMNAS_1887;
    const csv = construirCsv(columnas, resumen.detalle);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="DJ${tipo}_${anio}.csv"`);
    res.setHeader("X-Dj-Filas", String(resumen.detalle.length));
    res.setHeader("X-Dj-Aviso", "Requiere validacion tributaria del formato vigente");

    return res.send(`﻿${csv}`);
  } catch (error) {
    console.error("Error al exportar la declaración jurada:", error);

    return responderError(res, error, "Error interno al exportar la declaración jurada");
  }
}

/**
 * Certificado para entregar al contribuyente: el de honorarios y el de sueldos.
 *
 * Son los que el prestador o el trabajador necesitan para su propia renta. El
 * PDF lo arma la pantalla; acá van los datos ya cuadrados con la declaración,
 * para que el certificado y la jurada no puedan diferir.
 */
async function obtenerCertificado(req, res) {
  try {
    const { empresa_id, tipo, rut } = req.query;
    const anio = leerAnio(req.query.anio);

    if (!empresa_id || !anio || !["honorarios", "sueldos"].includes(String(tipo)) || !rut) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, anio, tipo (honorarios o sueldos) y rut",
      });
    }

    const empresaResult = await pool.query(
      `SELECT rut, razon_social, giro, direccion, comuna, ciudad, representante_legal, rut_representante
       FROM empresas WHERE id = $1`,
      [empresa_id]
    );

    if (empresaResult.rows.length === 0) {
      return res.status(404).json({ error: "Empresa no encontrada" });
    }

    const buscado = normalizarRut(rut);

    if (String(tipo) === "honorarios") {
      const resumen = await resumen1879(pool, empresa_id, anio);
      const fila = resumen.detalle.find((item) => normalizarRut(item.rut) === buscado);

      if (!fila) {
        return res.status(404).json({
          error: `No hay honorarios pagados a ${rut} en el año comercial ${anio}.`,
        });
      }

      const documentos = await pool.query(
        `SELECT folio, fecha_emision, fecha_pago, bruto, tasa_retencion, retencion, liquido
         FROM honorarios
         WHERE empresa_id = $1
           AND estado = 'vigente'
           AND UPPER(REPLACE(REPLACE(rut_prestador, '.', ''), ' ', '')) = $2
           AND COALESCE(fecha_pago, fecha_emision) BETWEEN $3 AND $4
         ORDER BY COALESCE(fecha_pago, fecha_emision), folio`,
        [empresa_id, buscado, `${anio}-01-01`, `${anio}-12-31`]
      );

      return res.json({
        tipo: "honorarios",
        titulo: "Certificado sobre honorarios pagados y retenciones practicadas",
        anio_comercial: anio,
        anio_tributario: anio + 1,
        empresa: empresaResult.rows[0],
        receptor: { rut: fila.rut, nombre: fila.nombre },
        totales: {
          honorarios_brutos: fila.honorarios_brutos,
          retencion: fila.retencion,
          liquido: fila.honorarios_brutos - fila.retencion,
          documentos: fila.documentos,
        },
        documentos: documentos.rows,
        avisos: [
          ...resumen.avisos,
          "Las cifras no están reajustadas. El certificado del SII pide los montos reajustados al 31 de diciembre. REQUIERE VALIDACIÓN TRIBUTARIA.",
        ],
      });
    }

    const resumen = await resumen1887(pool, empresa_id, anio);
    const fila = resumen.detalle.find((item) => normalizarRut(item.rut) === buscado);

    if (!fila) {
      return res.status(404).json({
        error: `No hay liquidaciones emitidas de ${rut} en el año comercial ${anio}.`,
      });
    }

    return res.json({
      tipo: "sueldos",
      titulo: "Certificado sobre sueldos, pensiones y otras rentas similares",
      anio_comercial: anio,
      anio_tributario: anio + 1,
      empresa: empresaResult.rows[0],
      receptor: { rut: fila.rut, nombre: fila.nombre },
      totales: {
        meses: fila.meses,
        renta_imponible: fila.renta_imponible,
        renta_tributable: fila.renta_tributable,
        impuesto_unico: fila.impuesto_unico,
        rentas_no_gravadas: fila.rentas_no_gravadas,
        cotizaciones_previsionales: fila.cotizaciones_previsionales,
      },
      // El certificado de sueldos va mes a mes.
      detalle_mensual: fila.detalle_mensual,
      avisos: resumen.avisos,
    });
  } catch (error) {
    console.error("Error al obtener el certificado:", error);

    return responderError(res, error, "Error interno al obtener el certificado");
  }
}

module.exports = {
  obtener1879,
  obtener1887,
  exportarDeclaracion,
  obtenerCertificado,
};
