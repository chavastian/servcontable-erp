/**
 * Estado del servicio.
 *
 * `/api/estado` respondía "Activo" sin comprobar nada, así que seguía diciendo
 * que todo andaba bien con la base de datos caída. Un chequeo que no puede
 * fallar no sirve para vigilar nada.
 *
 * Ahora hay dos niveles:
 *
 *   /api/estado   compatible con lo anterior, más el estado de la base.
 *   /api/salud    para monitoreo: responde 503 si algo esencial no está.
 */

const pool = require("../database/db");

const VERSION = process.env.APP_VERSION || require("../../package.json").version || "1.0.0";
const ARRANQUE = Date.now();

/**
 * Comprueba la base con una consulta trivial y mide cuánto tarda.
 *
 * El tiempo importa: una base que responde en dos segundos está viva pero el
 * sistema es inusable, y eso hay que poder verlo antes de que lo reporte un
 * cliente.
 */
async function revisarBase() {
  const inicio = Date.now();

  try {
    const { rows } = await pool.query("SELECT 1 AS ok");
    return {
      ok: rows[0]?.ok === 1,
      ms: Date.now() - inicio,
    };
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - inicio,
      // El mensaje del driver sí se informa acá: es un endpoint de operación y
      // saber si es un problema de red, de credenciales o de permisos es justo
      // lo que hace falta para reaccionar.
      detalle: error.message,
    };
  }
}

/**
 * Lista las migraciones aplicadas. Si la tabla no existe, es que la base nunca
 * pasó por el mecanismo de migraciones.
 */
async function revisarMigraciones() {
  try {
    const { rows } = await pool.query(
      "SELECT name, run_on FROM pgmigrations ORDER BY id DESC LIMIT 1"
    );

    const { rows: total } = await pool.query("SELECT COUNT(*)::int AS n FROM pgmigrations");

    return {
      ok: true,
      aplicadas: total[0].n,
      ultima: rows[0]?.name || null,
      ultima_en: rows[0]?.run_on || null,
    };
  } catch {
    return { ok: false, aplicadas: 0, ultima: null };
  }
}

function tiempoEnLinea() {
  const segundos = Math.floor((Date.now() - ARRANQUE) / 1000);
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);

  return { segundos, texto: `${horas}h ${minutos}m` };
}

async function obtenerEstado(req, res) {
  const base = await revisarBase();

  return res.status(base.ok ? 200 : 503).json({
    sistema: "ServContable PRO Web",
    backend: base.ok ? "Activo" : "Con problemas",
    version: VERSION,
    base_datos: base.ok ? "Conectada" : "Sin conexion",
  });
}

/**
 * Chequeo para monitoreo externo.
 *
 * Responde 503 cuando la base no está: así un vigilante de disponibilidad se da
 * cuenta sin tener que interpretar el contenido.
 */
async function obtenerSalud(req, res) {
  const [base, migraciones] = await Promise.all([revisarBase(), revisarMigraciones()]);
  const sano = base.ok;

  return res.status(sano ? 200 : 503).json({
    estado: sano ? "sano" : "degradado",
    version: VERSION,
    entorno: process.env.ENTORNO || process.env.NODE_ENV || "desconocido",
    en_linea: tiempoEnLinea(),
    comprobaciones: {
      base_datos: base,
      migraciones,
      correo_configurado: Boolean(
        process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
      ),
      pagos_configurados: Boolean(
        process.env.FLOW_API_KEY && process.env.FLOW_SECRET_KEY
      ),
    },
    revisado_en: new Date().toISOString(),
  });
}

function obtenerInicio(req, res) {
  res.json({
    mensaje: "API ServContable PRO funcionando correctamente",
    estado: "OK",
    version: VERSION,
  });
}

/**
 * Confirma que el token sirve.
 *
 * Antes devolvía el JWT decodificado completo, que incluye el rol y la versión
 * de sesión. No es un secreto para su propio dueño, pero un endpoint de prueba
 * no tiene por qué exponer la forma interna del token.
 */
function obtenerEstadoPrivado(req, res) {
  res.json({
    mensaje: "Acceso autorizado a ruta protegida",
    usuario: {
      id: req.usuario?.id,
      email: req.usuario?.email,
    },
  });
}

module.exports = {
  obtenerEstado,
  obtenerSalud,
  obtenerInicio,
  obtenerEstadoPrivado,
};
