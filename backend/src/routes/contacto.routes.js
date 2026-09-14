const express = require("express");
const {
  crearSolicitudContacto,
  crearPruebaGratisAutoservicio,
  listarSolicitudesContacto,
  actualizarSolicitudContacto,
} = require("../controllers/contacto.controller");
const {
  verificarToken,
  exigirAdminSistema,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/prueba-gratis", crearPruebaGratisAutoservicio);
router.post("/", crearSolicitudContacto);
router.get("/", verificarToken, exigirAdminSistema, listarSolicitudesContacto);
router.patch("/:id", verificarToken, exigirAdminSistema, actualizarSolicitudContacto);

module.exports = router;
