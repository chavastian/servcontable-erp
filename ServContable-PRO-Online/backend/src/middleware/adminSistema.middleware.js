function rolNormalizado(rol = "") {
  return String(rol || "").trim().toLowerCase();
}

const ROLES_ADMIN_SISTEMA = [
  "admin_sistema",
  "administrador_sistema",
  "superadmin",
];

function soloAdminSistema(req, res, next) {
  const rol = rolNormalizado(req.usuario?.rol);

  if (!ROLES_ADMIN_SISTEMA.includes(rol)) {
    return res.status(403).json({
      ok: false,
      error: "Solo el administrador del sistema puede acceder a solicitudes web.",
    });
  }

  next();
}

module.exports = {
  soloAdminSistema,
};