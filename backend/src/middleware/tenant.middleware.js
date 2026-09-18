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

  for (const contenedor of [req.body, req.query, req.params]) {
    if (!contenedor || typeof contenedor !== "object") continue;

    if ("empresaId" in contenedor) {
      delete contenedor.empresaId;
    }

    if ("empresa_id" in contenedor) {
      contenedor.empresa_id = empresaId;
    }
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
 * Exige un rol dentro de la empresa. El administrador del sistema pasa siempre.
 * Requiere que exigirEmpresa haya corrido antes.
 */
function exigirRolEmpresa(...rolesPermitidos) {
  const roles = rolesPermitidos.map((rol) => String(rol).toLowerCase());

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

      const { rows } = await pool.query(
        `SELECT LOWER(rol_empresa) AS rol
         FROM usuarios_empresas
         WHERE usuario_id = $1 AND empresa_id = $2 AND activo = true
         LIMIT 1`,
        [req.usuario?.id, req.empresaId]
      );

      const rol = rows[0]?.rol;

      if (!rol || !roles.includes(rol)) {
        return res.status(403).json({
          error: "No tienes permisos suficientes en esta empresa",
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
};
