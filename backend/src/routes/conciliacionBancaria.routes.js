const express = require("express");
const router = express.Router();

const {
  listarMovimientos,
  importarCartola,
  actualizarEstado,
} = require("../controllers/conciliacionBancaria.controller");
const { verificarToken } = require("../middleware/auth.middleware");
const { exigirEmpresa } = require("../middleware/tenant.middleware");
const {
  subidaArchivo,
  manejarErroresDeSubida,
} = require("../middleware/upload.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarMovimientos);
router.post(
  "/importar",
  verificarToken,
  bloquearDemo("la conciliacion bancaria masiva se habilita en la version contratada."),
  subidaArchivo.single("archivo"),
  manejarErroresDeSubida,
  // Despues de multer: antes de esta linea req.body esta vacio y la
  // membresia en la empresa no se puede comprobar.
  exigirEmpresa,
  importarCartola
);
router.put(
  "/:id/estado",
  verificarToken,
  bloquearDemo("la conciliacion bancaria se habilita en la version contratada."),
  actualizarEstado
);

module.exports = router;
