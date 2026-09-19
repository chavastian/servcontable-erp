const express = require("express");
const router = express.Router();

const {
  obtenerConfiguracionContable,
  guardarConfiguracionContable,
} = require("../controllers/configuracionContable.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { exigirPermiso } = require("../middleware/tenant.middleware");

router.get("/", verificarToken, obtenerConfiguracionContable);
router.post("/", verificarToken,
  exigirPermiso("CONFIGURAR"), guardarConfiguracionContable);

module.exports = router;
