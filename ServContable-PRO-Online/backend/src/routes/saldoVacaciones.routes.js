const express = require("express");
const router = express.Router();

const {
  obtenerSaldoVacaciones,
  obtenerHistorialVacacionesTrabajador,
} = require("../controllers/saldoVacaciones.controller");

const { verificarToken } = require("../middleware/auth.middleware");

router.get("/", verificarToken, obtenerSaldoVacaciones);
router.get("/historial", verificarToken, obtenerHistorialVacacionesTrabajador);

module.exports = router;