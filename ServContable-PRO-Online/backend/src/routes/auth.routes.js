const express = require("express");
const router = express.Router();

const {
  registrarUsuario,
  loginUsuario,
  loginDemo,
  obtenerSesion,
  listarUsuarios,
  crearUsuarioCliente,
  actualizarUsuarioCliente,
  cambiarEstadoUsuario,
  resetearPasswordUsuario,
  solicitarRecuperacionPassword,
  resetearPasswordConToken,
} = require("../controllers/auth.controller");
const {
  verificarToken,
  exigirAdministradorUsuarios,
} = require("../middleware/auth.middleware");

router.post("/registro", registrarUsuario);
router.post("/login", loginUsuario);
router.post("/demo-login", loginDemo);
router.post("/recuperar-password", solicitarRecuperacionPassword);
router.post("/resetear-password", resetearPasswordConToken);
router.get("/me", verificarToken, obtenerSesion);
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
