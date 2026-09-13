const jwt = require("jsonwebtoken");
const { obtenerJwtSecret } = require("../config/env");
const pool = require("../database/db");
const {
  esAdminSistema,
  puedeAdministrarUsuarios,
  usuarioPuedeAccederEmpresa,
} = require("../helpers/auth.helper");

function obtenerEmpresaIdRequest(req) {
  return (
    req.body?.empresa_id ||
    req.body?.empresaId ||
    req.query?.empresa_id ||
    req.query?.empresaId ||
    req.params?.empresa_id ||
    req.params?.empresaId ||
    null
  );
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
    req.usuario = decoded;

    const empresaId = obtenerEmpresaIdRequest(req);

    if (empresaId) {
      const permitido = await usuarioPuedeAccederEmpresa(
        pool,
        decoded,
        Number(empresaId)
      );

      if (!permitido) {
        return res.status(403).json({
          error: "No tienes acceso a la empresa solicitada",
        });
      }
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
  if (req.usuario?.demo === true) {
    return res.status(403).json({
      error: "La version demo no permite administrar usuarios",
    });
  }

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
