const express = require("express");
const router = express.Router();

const {
  obtenerCorreccion,
  clasificarCuentas,
  sugerirClasificaciones,
  contabilizarCorreccion,
  guardarVariacionIpc,
} = require("../controllers/correccionMonetaria.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { exigirPermiso } = require("../middleware/tenant.middleware");
const { soloAdminSistema } = require("../middleware/adminSistema.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

router.get("/", verificarToken, obtenerCorreccion);
router.get("/clasificaciones", verificarToken, sugerirClasificaciones);
router.post(
  "/clasificaciones",
  verificarToken,
  exigirPermiso("CONFIGURAR"),
  clasificarCuentas
);
router.post(
  "/contabilizar",
  verificarToken,
  exigirPermiso("CERRAR_EJERCICIO"),
  bloquearDemo("la correccion monetaria se habilita en la version contratada."),
  contabilizarCorreccion
);

// El IPC es un dato nacional: lo carga quien administra el sistema, no cada
// empresa por separado.
router.post("/ipc", verificarToken, soloAdminSistema, guardarVariacionIpc);

module.exports = router;
