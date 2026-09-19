const express = require("express");
const router = express.Router();

const {
  listarCentrosCosto,
  crearCentroCosto,
  actualizarCentroCosto,
  cambiarEstadoCentroCosto,
  informePorCentroCosto,
} = require("../controllers/centrosCosto.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { validar, esquemas } = require("../middleware/validacion.middleware");
const { exigirPermiso } = require("../middleware/tenant.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarCentrosCosto);
// El informe va antes de "/:id" para que "informe" no se lea como un id.
router.get("/informe", verificarToken, informePorCentroCosto);
router.post(
  "/",
  verificarToken,
  exigirPermiso("CONFIGURAR"),
  validar(esquemas.centroCosto),
  crearCentroCosto
);
router.put(
  "/:id",
  verificarToken,
  exigirPermiso("CONFIGURAR"),
  validar(esquemas.centroCosto),
  actualizarCentroCosto
);
router.put(
  "/:id/estado",
  verificarToken,
  exigirPermiso("CONFIGURAR"),
  bloquearDemo("la desactivacion de centros de costo se habilita en la version contratada."),
  validar(esquemas.terceroEstado),
  cambiarEstadoCentroCosto
);

module.exports = router;
