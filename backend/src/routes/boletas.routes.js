const express = require("express");
const router = express.Router();

const {
  listarBoletas,
  importarBoletasSII,
} = require("../controllers/boletas.controller");
const { verificarToken } = require("../middleware/auth.middleware");
const { exigirEmpresa } = require("../middleware/tenant.middleware");
const {
  subidaArchivo,
  manejarErroresDeSubida,
} = require("../middleware/upload.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarBoletas);
router.post(
  "/importar-sii",
  verificarToken,
  bloquearDemo("la importacion masiva de boletas se habilita en la version contratada."),
  subidaArchivo.single("archivo"),
  manejarErroresDeSubida,
  // Despues de multer: antes de esta linea req.body esta vacio y la
  // membresia en la empresa no se puede comprobar.
  exigirEmpresa,
  importarBoletasSII
);

module.exports = router;
