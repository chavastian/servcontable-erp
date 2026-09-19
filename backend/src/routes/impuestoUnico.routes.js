const express = require("express");
const router = express.Router();

const {
  listarTramosImpuestoUnico,
  guardarTramoImpuestoUnico,
  eliminarTramoImpuestoUnico,
  eliminarTramosPeriodo,
} = require("../controllers/impuestoUnico.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { exigirPermiso } = require("../middleware/tenant.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarTramosImpuestoUnico);
router.post("/", verificarToken, exigirPermiso("REMUNERACIONES"), guardarTramoImpuestoUnico);
router.put(
  "/periodo/eliminar",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  bloquearDemo("la eliminacion masiva de tramos se habilita en la version contratada."),
  eliminarTramosPeriodo
);
router.put(
  "/:id/eliminar",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  bloquearDemo("la eliminacion de tramos se habilita en la version contratada."),
  eliminarTramoImpuestoUnico
);

module.exports = router;
