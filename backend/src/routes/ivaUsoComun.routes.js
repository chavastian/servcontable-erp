const express = require("express");
const router = express.Router();

const { obtenerAjuste, contabilizarAjuste } = require("../controllers/ivaUsoComun.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { validar, esquemas } = require("../middleware/validacion.middleware");
const { exigirPermiso } = require("../middleware/tenant.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

router.get("/", verificarToken, obtenerAjuste);
router.post(
  "/contabilizar",
  verificarToken,
  exigirPermiso("REGISTRAR"),
  bloquearDemo("el ajuste del IVA de uso comun se habilita en la version contratada."),
  validar(esquemas.porPeriodo),
  contabilizarAjuste
);

module.exports = router;
