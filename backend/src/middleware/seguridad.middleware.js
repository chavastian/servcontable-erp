/**
 * Cabeceras de seguridad y limitacion de intentos.
 *
 * Antes no habia ninguna de las dos cosas: cualquiera podia probar contrasenas
 * contra el login sin freno, pedir recuperaciones de contrasena en serie o
 * crear cuentas de prueba de forma automatizada.
 *
 * Los limites cuentan por direccion IP y viven en la memoria del proceso. Con
 * un solo servicio eso alcanza; si algun dia hay mas de una instancia habra que
 * mover el contador a la base o a un cache compartido.
 */

const helmet = require("helmet");
// ipKeyGenerator normaliza la IP antes de usarla como clave. Con IPv6 cada
// cliente suele tener un rango completo a su disposicion, asi que contar por
// direccion exacta permitiria una direccion nueva por intento y burlar el
// limite. El ayudante agrupa por prefijo /64.
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

const MINUTO = 60 * 1000;

function esProduccion() {
  return process.env.NODE_ENV === "production";
}

/**
 * Cabeceras de seguridad.
 *
 * La politica de contenido se aplica solo cuando el backend sirve el frontend.
 * Si el frontend vive en Cloudflare Pages, la cabecera que importa es la que
 * manda Pages, no esta.
 */
function cabecerasSeguridad() {
  return helmet({
    contentSecurityPolicy:
      process.env.SERVE_FRONTEND === "true"
        ? {
            directives: {
              defaultSrc: ["'self'"],
              // El frontend compilado por Vite inyecta estilos en linea.
              styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
              fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
              scriptSrc: ["'self'"],
              imgSrc: ["'self'", "data:", "blob:"],
              connectSrc: ["'self'"],
              frameAncestors: ["'none'"],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
            },
          }
        : false,
    // La API responde JSON a un frontend en otro dominio.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // Solo tiene efecto sobre HTTPS y Render termina TLS por delante.
    hsts: esProduccion() ? { maxAge: 15552000, includeSubDomains: true } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });
}

function crearLimitador({ ventanaMinutos, maximo, mensaje, porCorreo = false }) {
  return rateLimit({
    windowMs: ventanaMinutos * MINUTO,
    limit: maximo,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // En pruebas los limites estorban.
    skip: () => process.env.NODE_ENV === "test",
    keyGenerator: (req, res) => {
      const ip = ipKeyGenerator(req.ip || req.socket?.remoteAddress || "sin-ip", res);

      if (!porCorreo) {
        return ip;
      }

      // Para el login se cuenta por IP y correo a la vez: asi un atacante no
      // agota el limite de una oficina entera probando un solo usuario, y
      // tampoco puede repartir intentos sobre muchas cuentas desde una IP.
      const correo = String(req.body?.email || "").trim().toLowerCase();
      return `${ip}|${correo}`;
    },
    handler: (req, res) =>
      res.status(429).json({
        error: mensaje,
      }),
  });
}

// Contrasenas: el limite es agresivo a proposito.
const limiteLogin = crearLimitador({
  ventanaMinutos: 15,
  maximo: 10,
  porCorreo: true,
  mensaje: "Demasiados intentos de ingreso. Espera unos minutos y vuelve a intentar.",
});

const limiteRecuperacion = crearLimitador({
  ventanaMinutos: 60,
  maximo: 5,
  mensaje: "Demasiadas solicitudes de recuperacion. Intenta de nuevo en una hora.",
});

// Alta de cuentas y pruebas gratis: evita la creacion automatizada.
const limiteRegistro = crearLimitador({
  ventanaMinutos: 60,
  maximo: 5,
  mensaje: "Demasiadas cuentas creadas desde esta conexion. Intenta mas tarde.",
});

// Formularios publicos que terminan en un correo.
const limiteContacto = crearLimitador({
  ventanaMinutos: 60,
  maximo: 10,
  mensaje: "Demasiadas solicitudes enviadas. Intenta mas tarde.",
});

// Pagos: cada intento crea una orden en Flow.
const limitePagos = crearLimitador({
  ventanaMinutos: 15,
  maximo: 20,
  mensaje: "Demasiadas operaciones de pago. Espera unos minutos.",
});

// Importaciones: cada una lee un archivo y escribe muchas filas.
const limiteImportacion = crearLimitador({
  ventanaMinutos: 10,
  maximo: 30,
  mensaje: "Demasiadas importaciones seguidas. Espera unos minutos.",
});

// Red de seguridad general para el resto de la API.
const limiteGeneral = crearLimitador({
  ventanaMinutos: 1,
  maximo: 300,
  mensaje: "Demasiadas peticiones. Espera un momento.",
});

module.exports = {
  cabecerasSeguridad,
  limiteLogin,
  limiteRecuperacion,
  limiteRegistro,
  limiteContacto,
  limitePagos,
  limiteImportacion,
  limiteGeneral,
};
