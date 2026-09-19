/**
 * Frontera entre empresas.
 *
 * Todo dato del sistema pertenece a una empresa y ningun usuario puede ver ni
 * escribir en una empresa de la que no es miembro. Este middleware es el unico
 * lugar donde se decide cual es la empresa de la peticion.
 *
 * Por que existe aparte de verificarToken: en las importaciones el archivo
 * llega como multipart/form-data, y multer recien llena req.body despues de la
 * autenticacion. Antes de esto, en esas rutas req.body estaba vacio cuando se
 * revisaba la membresia, la revision se saltaba por completo y el controlador
 * confiaba en el empresa_id del formulario. Cualquier usuario autenticado podia
 * importar documentos a la empresa de otro cliente.
 *
 * Despues de validar, el valor se normaliza sobre la propia peticion: los
 * controladores que leen req.query.empresa_id o req.body.empresa_id reciben
 * siempre un numero ya verificado, y las variantes en camelCase se eliminan
 * para que no quede una segunda fuente de verdad.
 */

const pool = require("../database/db");
const {
  esAdminSistema,
  usuarioPuedeAccederEmpresa,
} = require("../helpers/auth.helper");
const {
  ROLES,
  normalizarRolEmpresa,
  rolTienePermiso,
} = require("../helpers/roles.helper");

const CLAVES = ["empresa_id", "empresaId"];

function leerEmpresaId(req) {
  for (const contenedor of [req.body, req.query, req.params]) {
    if (!contenedor) continue;

    for (const clave of CLAVES) {
      const valor = contenedor[clave];

      if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
        return valor;
      }
    }
  }

  return null;
}

function normalizar(req, empresaId) {
  req.empresaId = empresaId;
  req.tenantValidado = true;

  // req.query es un getter en Express 5 (ver auth.middleware): se sombrea con
  // una copia propia para que la normalizacion persista.
  const query = { ...(req.query || {}) };
  Object.defineProperty(req, "query", {
    value: query,
    writable: true,
    configurable: true,
    enumerable: true,
  });

  for (const contenedor of [req.body, query]) {
    if (!contenedor || typeof contenedor !== "object") continue;

    if ("empresaId" in contenedor) {
      delete contenedor.empresaId;
    }

    contenedor.empresa_id = empresaId;
  }

  if (req.params && typeof req.params === "object") {
    if ("empresaId" in req.params) delete req.params.empresaId;
    if ("empresa_id" in req.params) req.params.empresa_id = empresaId;
  }
}

async function validar(req, res, { obligatoria }) {
  const crudo = leerEmpresaId(req);

  if (crudo === null) {
    if (obligatoria) {
      res.status(400).json({ error: "Debe indicar empresa_id" });
      return false;
    }

    return true;
  }

  const empresaId = Number(crudo);

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    res.status(400).json({ error: "empresa_id no valido" });
    return false;
  }

  const permitido = await usuarioPuedeAccederEmpresa(pool, req.usuario, empresaId);

  if (!permitido) {
    res.status(403).json({ error: "No tienes acceso a la empresa solicitada" });
    return false;
  }

  normalizar(req, empresaId);
  return true;
}

/**
 * Exige que la peticion traiga una empresa y que el usuario sea miembro.
 * Va siempre despues de multer en las rutas que reciben archivos.
 */
async function exigirEmpresa(req, res, next) {
  try {
    if (await validar(req, res, { obligatoria: true })) {
      return next();
    }

    return undefined;
  } catch (error) {
    return next(error);
  }
}

/**
 * Valida la empresa solo si la peticion la trae. Para rutas que sirven tanto a
 * una empresa concreta como al listado general del usuario.
 */
async function resolverEmpresaSiViene(req, res, next) {
  try {
    if (await validar(req, res, { obligatoria: false })) {
      return next();
    }

    return undefined;
  } catch (error) {
    return next(error);
  }
}

/**
 * Lee el rol del usuario en la empresa de la petición y lo deja en req.
 */
async function leerRolEnEmpresa(req) {
  if (esAdminSistema(req.usuario?.rol)) {
    return ROLES.OWNER;
  }

  const { rows } = await pool.query(
    `SELECT rol_empresa
     FROM usuarios_empresas
     WHERE usuario_id = $1 AND empresa_id = $2 AND activo = true
     LIMIT 1`,
    [req.usuario?.id, req.empresaId]
  );

  return rows.length > 0 ? normalizarRolEmpresa(rows[0].rol_empresa) : null;
}

/**
 * Exige un rol concreto dentro de la empresa.
 * Requiere que exigirEmpresa haya corrido antes.
 */
function exigirRolEmpresa(...rolesPermitidos) {
  const roles = rolesPermitidos.map((rol) => normalizarRolEmpresa(rol));

  return async (req, res, next) => {
    try {
      if (esAdminSistema(req.usuario?.rol)) {
        return next();
      }

      if (!req.tenantValidado) {
        return res.status(500).json({
          error: "Configuracion invalida: falta validar la empresa antes del rol",
        });
      }

      const rol = await leerRolEnEmpresa(req);

      if (!rol || !roles.includes(rol)) {
        return res.status(403).json({
          error: "No tienes permisos suficientes en esta empresa",
        });
      }

      req.rolEmpresa = rol;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * Exige un permiso, no un rol.
 *
 * Es la forma preferida: las rutas declaran lo que hacen ("ANULAR",
 * "CERRAR_EJERCICIO") y el modelo de roles decide quién alcanza. Así agregar un
 * rol no obliga a repasar las rutas una por una.
 *
 * Sin esto, cualquiera con acceso a una empresa podía crear asientos, anular
 * documentos y cerrar ejercicios: el rol no se consultaba en ninguna operación
 * contable.
 */
function exigirPermiso(permiso) {
  return async (req, res, next) => {
    try {
      if (esAdminSistema(req.usuario?.rol)) {
        req.rolEmpresa = ROLES.OWNER;
        return next();
      }

      if (!req.tenantValidado) {
        return res.status(400).json({ error: "Debe indicar empresa_id" });
      }

      const rol = await leerRolEnEmpresa(req);

      if (!rol) {
        return res.status(403).json({
          error: "No tienes acceso a la empresa solicitada",
        });
      }

      req.rolEmpresa = rol;

      if (!rolTienePermiso(rol, permiso)) {
        return res.status(403).json({
          error: `Tu rol en esta empresa (${rol}) no permite esta accion`,
          rol,
          permiso_requerido: permiso,
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  exigirEmpresa,
  resolverEmpresaSiViene,
  exigirRolEmpresa,
  exigirPermiso,
  leerRolEnEmpresa,
};
