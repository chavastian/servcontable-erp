const express = require("express");
const {
  crearSolicitudContacto,
  listarSolicitudesContacto,
  actualizarSolicitudContacto,
  activarDemoSolicitud,
} = require("../controllers/contacto.controller");
const {
  verificarToken,
  exigirAdminSistema,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/", crearSolicitudContacto);
router.get("/", verificarToken, exigirAdminSistema, listarSolicitudesContacto);
router.patch("/:id", verificarToken, exigirAdminSistema, actualizarSolicitudContacto);
router.post("/:id/activar-demo", verificarToken, exigirAdminSistema, activarDemoSolicitud);

module.exports = router;
