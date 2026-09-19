const jwt = require("jsonwebtoken");
const { obtenerJwtSecret } = require("../config/env");
const pool = require("../database/db");
const {
  esAdminSistema,
  puedeAdministrarUsuarios,
  usuarioPuedeAccederEmpresa,
} = require("../helpers/auth.helper");
const {
  ESTADOS_SUSCRIPCION,
  validarAccesoSuscripcion,
} = require("../helpers/suscripcion.helper");
const { sesionVigente } = require("../helpers/sesion.helper");

const CLAVES_EMPRESA = ["empresa_id", "empresaId"];

/**
 * Todos los valores de empresa que trae la peticion, vengan donde vengan.
 *
 * Antes se tomaba el primero que apareciera, en orden cuerpo, consulta,
 * parametros, y se validaba solo ese. Pero el controlador leia el de la
 * consulta. Un GET con cuerpo JSON (express.json lo parsea sin mirar el
 * metodo) pasaba la membresia con la empresa propia en el cuerpo y consultaba
 * la ajena en la query. Con eso se leian trabajadores, libros y balances de
 * cualquier cliente.
 */
function valoresEmpresaRequest(req) {
  const valores = [];

  for (const contenedor of [req.body, req.query, req.params]) {
    if (!contenedor || typeof contenedor !== "object") continue;

    for (const clave of CLAVES_EMPRESA) {
      const valor = contenedor[clave];

      if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
        valores.push(String(valor).trim());
      }
    }
  }

  return valores;
}

/**
 * Deja un solo empresa_id, ya validado, en los tres contenedores, y elimina
 * la variante en camelCase para que no quede una segunda fuente de verdad.
 * Es lo mismo que hace tenant.middleware: aca se repite porque verificarToken
 * es la unica capa que tienen la mayoria de las rutas de lectura.
 */
function normalizarEmpresaRequest(req, empresaId) {
  req.empresaId = empresaId;
  req.tenantValidado = true;

  // En Express 5, req.query es un getter que vuelve a parsear la URL en cada
  // acceso: modificar el objeto que devuelve no sirve de nada. Se reemplaza
  // por una propiedad propia con la copia ya normalizada, que es lo que los
  // controladores van a leer.
  const query = { ...(req.query || {}) };
  Object.defineProperty(req, "query", {
    value: query,
    writable: true,
    configurable: true,
    enumerable: true,
  });

  // Cuerpo y consulta reciben siempre el valor validado, aunque hayan venido
  // solo con la variante en camelCase: el controlador lee empresa_id.
  for (const contenedor of [req.body, query]) {
    if (!contenedor || typeof contenedor !== "object") continue;

    if ("empresaId" in contenedor) delete contenedor.empresaId;
    contenedor.empresa_id = empresaId;
  }

  if (req.params && typeof req.params === "object") {
    if ("empresaId" in req.params) delete req.params.empresaId;
    if ("empresa_id" in req.params) req.params.empresa_id = empresaId;
  }
}

function rutaAutenticadaSinAccesoOperativo(req, accesoSuscripcion) {
  const ruta = `${req.baseUrl || ""}${req.path || ""}`.toLowerCase();
  const metodo = String(req.method || "").toUpperCase();
  const status = String(accesoSuscripcion?.status || "").toUpperCase();

  if (metodo === "GET" && ruta === "/api/auth/me") {
    return true;
  }

  if (
    metodo === "POST" &&
    ruta === "/api/pagos-flow/renovar" &&
    [ESTADOS_SUSCRIPCION.EXPIRED, ESTADOS_SUSCRIPCION.PAST_DUE].includes(status)
  ) {
    return true;
  }

  return false;
}

async function verificarToken(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.status(401).json({
      error: "Token no enviado",
    });
  }

  const partes = authorization.split(" ");

  if (partes.length !== 2 || partes[0] !== "Bearer") {
    return res.status(401).json({
      error: "Formato de token invalido",
    });
  }

  const token = partes[1];

  try {
    const decoded = jwt.verify(token, obtenerJwtSecret());

    // El token es un JWT firmado y el servidor no guarda los emitidos, asi que
    // la unica forma de invalidarlo antes de que expire es compararlo con la
    // version de sesion del usuario. Cambiar la contrasena o desactivar la
    // cuenta sube ese contador y deja fuera los tokens anteriores.
    if (!(await sesionVigente(pool, decoded))) {
      return res.status(401).json({
        error: "Tu sesion se cerro. Vuelve a iniciar sesion.",
      });
    }

    req.usuario = decoded;

    const accesoSuscripcion = await validarAccesoSuscripcion(pool, decoded);

    req.suscripcion = accesoSuscripcion;

    if (
      !accesoSuscripcion.permitido &&
      !rutaAutenticadaSinAccesoOperativo(req, accesoSuscripcion)
    ) {
      return res.status(402).json({
        error: accesoSuscripcion.mensaje || "Suscripcion no vigente",
        suscripcion_estado: accesoSuscripcion.status,
      });
    }

    const valoresEmpresa = valoresEmpresaRequest(req);

    // Dos valores distintos en la misma peticion no son un error de tipeo:
    // son el vector de la fuga. Se rechaza antes de mirar cualquiera.
    if (new Set(valoresEmpresa).size > 1) {
      return res.status(400).json({
        error: "La peticion trae mas de un empresa_id y no coinciden",
      });
    }

    if (valoresEmpresa.length > 0) {
      const empresaCruda = valoresEmpresa[0];
      const empresaId = Number(empresaCruda);

      // El formato se valida antes de consultar. Un valor como "abc" se
      // convertia en NaN, que es falso, y la comprobacion de membresia se
      // saltaba entera; la peticion seguia hasta el controlador y terminaba en
      // un error de PostgreSQL devuelto al cliente.
      if (!Number.isInteger(empresaId) || empresaId <= 0) {
        return res.status(400).json({
          error: "empresa_id no valido",
        });
      }

      const permitido = await usuarioPuedeAccederEmpresa(pool, decoded, empresaId);

      if (!permitido) {
        return res.status(403).json({
          error: "No tienes acceso a la empresa solicitada",
        });
      }

      normalizarEmpresaRequest(req, empresaId);
    }

    return next();
  } catch (error) {
    return res.status(401).json({
      error: "Token invalido o vencido",
    });
  }
}

function exigirAdminSistema(req, res, next) {
  if (!esAdminSistema(req.usuario?.rol)) {
    return res.status(403).json({
      error: "Solo el administrador del sistema puede realizar esta accion",
    });
  }

  return next();
}

function exigirAdministradorUsuarios(req, res, next) {
  if (!puedeAdministrarUsuarios(req.usuario?.rol)) {
    return res.status(403).json({
      error: "No tienes permisos para administrar usuarios",
    });
  }

  return next();
}

module.exports = {
  verificarToken,
  exigirAdminSistema,
  exigirAdministradorUsuarios,
};
