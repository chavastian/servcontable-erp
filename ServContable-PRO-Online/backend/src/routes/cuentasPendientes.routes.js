const express = require("express");
const router = express.Router();

const {
  obtenerCuentasPorCobrar,
  obtenerCuentasPorPagar,
} = require("../controllers/cuentasPendientes.controller");

const { verificarToken } = require("../middleware/auth.middleware");

router.get("/por-cobrar", verificarToken, obtenerCuentasPorCobrar);
router.get("/por-pagar", verificarToken, obtenerCuentasPorPagar);

module.exports = router;