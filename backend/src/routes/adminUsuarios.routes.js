const express = require("express");
const router = express.Router();

const {
  listarUsuarios,
  crearUsuarioCliente,
  actualizarUsuarioCliente,
  cambiarEstadoUsuario,
  solicitarRecuperacionPasswordUsuario,
} = require("../controllers/auth.controller");
const { verificarToken, exigirAdminSistema } = require("../middleware/auth.middleware");

router.use(verificarToken);
router.use(exigirAdminSistema);

router.get("/", listarUsuarios);
router.post("/", crearUsuarioCliente);
router.patch("/:id", actualizarUsuarioCliente);
router.patch("/:id/estado", cambiarEstadoUsuario);
router.post("/:id/recuperacion-password", solicitarRecuperacionPasswordUsuario);

module.exports = router;
