const express = require("express");
const router = express.Router();

const {
  registrarUsuario,
  loginUsuario,
  obtenerSesion,
  renovarSesion,
  listarUsuarios,
  crearUsuarioCliente,
  actualizarUsuarioCliente,
  cambiarEstadoUsuario,
  resetearPasswordUsuario,
  solicitarRecuperacionPassword,
  resetearPasswordConToken,
} = require("../controllers/auth.controller");
const {
  validar,
  esquemas,
} = require("../middleware/validacion.middleware");
const {
  limiteLogin,
  limiteRegistro,
  limiteRecuperacion,
} = require("../middleware/seguridad.middleware");
const {
  verificarToken,
  exigirAdministradorUsuarios,
} = require("../middleware/auth.middleware");

router.post("/registro", limiteRegistro, validar(esquemas.registro), registrarUsuario);
router.post("/login", limiteLogin, validar(esquemas.login), loginUsuario);
router.post("/recuperar-password", limiteRecuperacion, solicitarRecuperacionPassword);
router.post("/resetear-password", limiteRecuperacion, resetearPasswordConToken);
router.get("/me", verificarToken, obtenerSesion);
router.post("/renovar-sesion", verificarToken, renovarSesion);
router.get("/usuarios", verificarToken, exigirAdministradorUsuarios, listarUsuarios);
router.post(
  "/usuarios",
  verificarToken,
  exigirAdministradorUsuarios,
  crearUsuarioCliente
);
router.patch(
  "/usuarios/:id",
  verificarToken,
  exigirAdministradorUsuarios,
  actualizarUsuarioCliente
);
router.patch(
  "/usuarios/:id/estado",
  verificarToken,
  exigirAdministradorUsuarios,
  cambiarEstadoUsuario
);
router.patch(
  "/usuarios/:id/password",
  verificarToken,
  exigirAdministradorUsuarios,
  resetearPasswordUsuario
);

module.exports = router;
