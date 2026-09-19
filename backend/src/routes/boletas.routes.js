const express = require("express");
const router = express.Router();

const {
  listarBoletas,
  importarBoletasSII,
} = require("../controllers/boletas.controller");
const { verificarToken } = require("../middleware/auth.middleware");
const { exigirPermiso } = require("../middleware/tenant.middleware");
const { exigirEmpresa } = require("../middleware/tenant.middleware");
const {
  validar,
  esquemas,
} = require("../middleware/validacion.middleware");
const { limiteImportacion } = require("../middleware/seguridad.middleware");
const {
  subidaArchivo,
  manejarErroresDeSubida,
} = require("../middleware/upload.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarBoletas);
router.post(
  "/importar-sii",
  limiteImportacion,
  verificarToken,
  bloquearDemo("la importacion masiva de boletas se habilita en la version contratada."),
  subidaArchivo.single("archivo"),
  manejarErroresDeSubida,
  // Despues de multer: antes de esta linea req.body esta vacio y la
  // membresia en la empresa no se puede comprobar.
  exigirEmpresa,
  exigirPermiso("IMPORTAR"),
  validar(esquemas.importacion),
  importarBoletasSII
);

module.exports = router;
