/**
 * Recepcion de archivos con limites.
 *
 * Antes cada ruta creaba su propio multer sin tope de tamano ni filtro de tipo:
 * una peticion podia cargar en memoria un archivo arbitrariamente grande y
 * tumbar el servicio, que corre en un plan con 512 MB.
 *
 * Los archivos se siguen procesando en memoria a proposito: se leen una vez,
 * se importan y se descartan, sin escribir en el disco del contenedor.
 */

const multer = require("multer");

const TAMANO_MAXIMO_MB = Number(process.env.UPLOAD_MAX_MB || 10);

// Lo que el sistema realmente sabe leer: cartolas y libros del SII.
const EXTENSIONES = [".csv", ".txt", ".xls", ".xlsx", ".pdf", ".gz", ".xml"];

const TIPOS_MIME = [
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/pdf",
  "application/gzip",
  "application/x-gzip",
  "application/xml",
  "text/xml",
  "application/octet-stream",
];

function extensionDe(nombre = "") {
  const punto = String(nombre).lastIndexOf(".");
  return punto === -1 ? "" : String(nombre).slice(punto).toLowerCase();
}

function filtro(req, file, callback) {
  const extension = extensionDe(file.originalname);
  const mime = String(file.mimetype || "").toLowerCase();

  // La extension manda: los navegadores informan octet-stream con frecuencia.
  if (!EXTENSIONES.includes(extension)) {
    const error = new Error(
      `Tipo de archivo no permitido (${extension || "sin extension"}). Se aceptan: ${EXTENSIONES.join(", ")}`
    );
    error.statusHttp = 415;
    return callback(error);
  }

  if (mime && !TIPOS_MIME.includes(mime)) {
    const error = new Error(`Tipo de contenido no permitido (${mime})`);
    error.statusHttp = 415;
    return callback(error);
  }

  return callback(null, true);
}

const subidaArchivo = multer({
  storage: multer.memoryStorage(),
  fileFilter: filtro,
  limits: {
    fileSize: TAMANO_MAXIMO_MB * 1024 * 1024,
    files: 1,
    fields: 40,
    parts: 50,
  },
});

/**
 * Traduce los errores de multer a respuestas claras. Va inmediatamente despues
 * del middleware de subida, porque multer entrega el error como un error de
 * Express y sin esto el cliente recibe un 500 sin explicacion.
 */
function manejarErroresDeSubida(error, req, res, next) {
  if (!error) {
    return next();
  }

  if (error instanceof multer.MulterError) {
    const mensajes = {
      LIMIT_FILE_SIZE: `El archivo supera el maximo de ${TAMANO_MAXIMO_MB} MB`,
      LIMIT_FILE_COUNT: "Solo se acepta un archivo por peticion",
      LIMIT_UNEXPECTED_FILE: "Campo de archivo inesperado",
      LIMIT_PART_COUNT: "Demasiadas partes en el formulario",
      LIMIT_FIELD_COUNT: "Demasiados campos en el formulario",
    };

    return res.status(413).json({
      error: mensajes[error.code] || `Archivo rechazado (${error.code})`,
    });
  }

  if (error.statusHttp) {
    return res.status(error.statusHttp).json({ error: error.message });
  }

  return next(error);
}

module.exports = {
  subidaArchivo,
  manejarErroresDeSubida,
  TAMANO_MAXIMO_MB,
};
