const express = require("express");
const router = express.Router();

const {
  tablaVidasUtiles,
  listarActivosFijos,
  obtenerActivoFijo,
  crearActivoFijo,
  actualizarActivoFijo,
  darDeBajaActivoFijo,
  calcularDepreciacionPeriodo,
  contabilizarDepreciacion,
  informeActivoFijo,
} = require("../controllers/activosFijos.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { validar, esquemas } = require("../middleware/validacion.middleware");
const { exigirPermiso } = require("../middleware/tenant.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

// Las rutas con nombre fijo van antes de "/:id" para que no se lean como un id.
router.get("/vidas-utiles", verificarToken, tablaVidasUtiles);
router.get("/informe", verificarToken, informeActivoFijo);
router.get("/depreciacion", verificarToken, calcularDepreciacionPeriodo);
router.get("/", verificarToken, listarActivosFijos);
router.get("/:id", verificarToken, obtenerActivoFijo);

router.post(
  "/",
  verificarToken,
  exigirPermiso("REGISTRAR"),
  validar(esquemas.activoFijo),
  crearActivoFijo
);
router.put(
  "/:id",
  verificarToken,
  exigirPermiso("REGISTRAR"),
  validar(esquemas.conEmpresa),
  actualizarActivoFijo
);
router.put(
  "/:id/baja",
  verificarToken,
  // Dar de baja un bien es una accion contable, no de registro.
  exigirPermiso("ANULAR"),
  bloquearDemo("la baja de bienes del activo fijo se habilita en la version contratada."),
  validar(esquemas.bajaActivoFijo),
  darDeBajaActivoFijo
);
router.post(
  "/depreciacion/contabilizar",
  verificarToken,
  exigirPermiso("REGISTRAR"),
  bloquearDemo("la contabilizacion de la depreciacion se habilita en la version contratada."),
  validar(esquemas.porPeriodo),
  contabilizarDepreciacion
);

module.exports = router;
