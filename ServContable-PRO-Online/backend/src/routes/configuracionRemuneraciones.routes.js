const express = require("express");
const router = express.Router();

const {
  obtenerConfiguracionRemuneraciones,
  guardarConfiguracionRemuneraciones,
  guardarAFP,
  eliminarAFP,
  copiarConfiguracionPeriodo,
} = require("../controllers/configuracionRemuneraciones.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

router.get("/", verificarToken, obtenerConfiguracionRemuneraciones);
router.post("/", verificarToken, guardarConfiguracionRemuneraciones);
router.post("/afp", verificarToken, guardarAFP);
router.put(
  "/afp/:id/eliminar",
  verificarToken,
  bloquearDemo("la eliminacion de AFP se habilita en la version contratada."),
  eliminarAFP
);
router.post(
  "/copiar-periodo",
  verificarToken,
  bloquearDemo("la copia de configuracion por periodo se habilita en la version contratada."),
  copiarConfiguracionPeriodo
);

module.exports = router;
