const express = require("express");
const router = express.Router();

const {
  obtenerControlRemanenteIVA,
  guardarControlRemanenteIVA,
  listarControlesRemanenteIVA,
} = require("../controllers/remanenteIVA.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { exigirPermiso } = require("../middleware/tenant.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

router.get("/", verificarToken, obtenerControlRemanenteIVA);
router.get("/historial", verificarToken, listarControlesRemanenteIVA);
router.post(
  "/",
  verificarToken,
  exigirPermiso("CONFIGURAR"),
  bloquearDemo("el control de remanente IVA operativo se habilita en la version contratada."),
  guardarControlRemanenteIVA
);

module.exports = router;
