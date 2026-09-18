/**
 * Manejo central de errores.
 *
 * Antes cada controlador decidia que devolver, y varios pasaban
 * `error.message` de PostgreSQL directo al cliente. Eso revela nombres de
 * tablas, de columnas y de restricciones, que es informacion util para atacar
 * y confusa para quien usa el sistema.
 *
 * Acá el cliente recibe un mensaje entendible y el detalle queda en el registro
 * del servidor.
 */

const { ErrorEmpresaAjena } = require("../helpers/empresa.helper");

// Codigos de PostgreSQL que corresponden a un error del cliente, no del sistema.
const CODIGOS_POSTGRES = {
  "23505": {
    estado: 409,
    mensaje: "Ya existe un registro con esos datos",
  },
  "23503": {
    estado: 400,
    mensaje: "El registro referenciado no existe o pertenece a otra empresa",
  },
  "23502": {
    estado: 400,
    mensaje: "Falta un dato obligatorio",
  },
  "23514": {
    estado: 400,
    mensaje: "Alguno de los datos enviados no es valido",
  },
  "22P02": {
    estado: 400,
    mensaje: "Alguno de los datos enviados no tiene el formato esperado",
  },
  "22003": {
    estado: 400,
    mensaje: "Un monto o cantidad esta fuera del rango permitido",
  },
  "40001": {
    estado: 409,
    mensaje: "La operacion choco con otra en curso. Vuelve a intentar.",
  },
  "40P01": {
    estado: 409,
    mensaje: "La operacion choco con otra en curso. Vuelve a intentar.",
  },
  "57014": {
    estado: 504,
    mensaje: "La consulta tardo demasiado y se cancelo",
  },
};

function rutaDe(req) {
  return `${req.method} ${req.originalUrl || req.url}`;
}

/**
 * Ruta no encontrada. Va despues de todos los routers y antes del manejador
 * de errores, y solo responde a lo que empieza por /api para no interferir con
 * el frontend estatico.
 */
function rutaNoEncontrada(req, res, next) {
  if (!req.path.startsWith("/api")) {
    return next();
  }

  return res.status(404).json({
    error: "Recurso no encontrado",
  });
}

function manejadorDeErrores(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const usuario = req.usuario?.id ? `usuario ${req.usuario.id}` : "sin usuario";
  console.error(`[error] ${rutaDe(req)} (${usuario}):`, error?.message, error?.stack);

  // Un registro de otra empresa nunca se distingue de uno inexistente.
  if (error instanceof ErrorEmpresaAjena) {
    return res.status(403).json({
      error: "El registro indicado no pertenece a la empresa seleccionada",
    });
  }

  // Errores de validacion que el propio codigo levanta con su estado.
  const estadoPropio = error?.statusCode || error?.statusHttp;

  if (Number.isInteger(estadoPropio) && estadoPropio >= 400 && estadoPropio < 500) {
    return res.status(estadoPropio).json({
      error: error.message || "Peticion invalida",
    });
  }

  if (error?.code && CODIGOS_POSTGRES[error.code]) {
    const { estado, mensaje } = CODIGOS_POSTGRES[error.code];
    return res.status(estado).json({ error: mensaje });
  }

  // CORS
  if (/CORS/i.test(error?.message || "")) {
    return res.status(403).json({ error: "Origen no permitido" });
  }

  // JSON mal formado que express.json rechaza.
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo de la peticion no es JSON valido" });
  }

  if (error?.type === "entity.too.large") {
    return res.status(413).json({ error: "El cuerpo de la peticion es demasiado grande" });
  }

  return res.status(500).json({
    error: "Error interno del servidor",
  });
}

module.exports = {
  rutaNoEncontrada,
  manejadorDeErrores,
};
