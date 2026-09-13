const express = require("express");
const multer = require("multer");
const router = express.Router();

const {
  listarBoletas,
  importarBoletasSII,
} = require("../controllers/boletas.controller");
const { verificarToken } = require("../middleware/auth.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

const upload = multer({ storage: multer.memoryStorage() });

router.get("/", verificarToken, listarBoletas);
router.post(
  "/importar-sii",
  verificarToken,
  bloquearDemo("la importacion masiva de boletas se habilita en la version contratada."),
  upload.single("archivo"),
  importarBoletasSII
);

module.exports = router;
