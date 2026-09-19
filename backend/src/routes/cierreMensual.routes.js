const express = require("express");
const router = express.Router();

const {
  obtenerCierreMensual,
  obtenerEstadoDelPeriodo,
} = require("../controllers/cierreMensual.controller");
const { verificarToken } = require("../middleware/auth.middleware");
const { exigirEmpresa } = require("../middleware/tenant.middleware");

router.get("/", verificarToken, exigirEmpresa, obtenerCierreMensual);
router.get("/estado", verificarToken, exigirEmpresa, obtenerEstadoDelPeriodo);

module.exports = router;
