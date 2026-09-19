const express = require("express");
const router = express.Router();

const {
  obtenerRenta,
  guardarRenta,
  cerrarRenta,
  reabrirRenta,
  propuestaF22,
  guardarRegimen,
} = require("../controllers/rentaAnual.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { exigirPermiso } = require("../middleware/tenant.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

router.get("/", verificarToken, obtenerRenta);
router.get("/f22", verificarToken, propuestaF22);
router.post("/", verificarToken, exigirPermiso("CERRAR_EJERCICIO"), guardarRenta);
router.post(
  "/cerrar",
  verificarToken,
  exigirPermiso("CERRAR_EJERCICIO"),
  bloquearDemo("el cierre de la renta anual se habilita en la version contratada."),
  cerrarRenta
);
router.post(
  "/reabrir",
  verificarToken,
  exigirPermiso("CERRAR_EJERCICIO"),
  bloquearDemo("la reapertura de la renta anual se habilita en la version contratada."),
  reabrirRenta
);
// El regimen es un dato de la empresa del que depende toda la determinacion.
router.post("/regimen", verificarToken, exigirPermiso("CONFIGURAR"), guardarRegimen);

module.exports = router;
