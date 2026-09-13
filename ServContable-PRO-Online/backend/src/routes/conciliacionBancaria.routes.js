const express = require("express");
const multer = require("multer");
const router = express.Router();

const {
  listarMovimientos,
  importarCartola,
  actualizarEstado,
} = require("../controllers/conciliacionBancaria.controller");
const { verificarToken } = require("../middleware/auth.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

const upload = multer({ storage: multer.memoryStorage() });

router.get("/", verificarToken, listarMovimientos);
router.post(
  "/importar",
  verificarToken,
  bloquearDemo("la conciliacion bancaria masiva se habilita en la version contratada."),
  upload.single("archivo"),
  importarCartola
);
router.put(
  "/:id/estado",
  verificarToken,
  bloquearDemo("la conciliacion bancaria se habilita en la version contratada."),
  actualizarEstado
);

module.exports = router;
