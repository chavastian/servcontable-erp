const express = require("express");
const multer = require("multer");
const router = express.Router();

const {
  obtenerConfiguracionRemuneraciones,
  guardarConfiguracionRemuneraciones,
  guardarAFP,
  eliminarAFP,
  importarIndicadoresPrevisionales,
} = require("../controllers/configuracionRemuneraciones.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

const uploadIndicadores = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

router.get("/", verificarToken, obtenerConfiguracionRemuneraciones);
router.post("/", verificarToken, guardarConfiguracionRemuneraciones);
router.post(
  "/importar-indicadores",
  verificarToken,
  uploadIndicadores.single("archivo"),
  importarIndicadoresPrevisionales
);
router.post("/afp", verificarToken, guardarAFP);
router.put(
  "/afp/:id/eliminar",
  verificarToken,
  bloquearDemo("la eliminacion de AFP se habilita en la version contratada."),
  eliminarAFP
);

module.exports = router;
