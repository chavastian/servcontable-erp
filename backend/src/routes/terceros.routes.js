const express = require("express");
const router = express.Router();

const {
  listarTerceros,
  obtenerTercero,
  crearTercero,
  actualizarTercero,
  cambiarEstadoTercero,
} = require("../controllers/terceros.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { validar, esquemas } = require("../middleware/validacion.middleware");
const { exigirPermiso } = require("../middleware/tenant.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarTerceros);
router.get("/:id", verificarToken, obtenerTercero);
router.post(
  "/",
  verificarToken,
  exigirPermiso("REGISTRAR"),
  validar(esquemas.tercero),
  crearTercero
);
router.put(
  "/:id",
  verificarToken,
  exigirPermiso("REGISTRAR"),
  validar(esquemas.terceroActualizar),
  actualizarTercero
);
router.put(
  "/:id/estado",
  verificarToken,
  exigirPermiso("CONFIGURAR"),
  bloquearDemo("la desactivacion de proveedores y clientes se habilita en la version contratada."),
  validar(esquemas.terceroEstado),
  cambiarEstadoTercero
);

module.exports = router;
