const express = require("express");
const router = express.Router();

const {
  obtenerAnalisisCuentas,
  obtenerMovimientosCuentaAnalisis,
} = require("../controllers/analisisCuentas.controller");

const { verificarToken } = require("../middleware/auth.middleware");

router.get("/", verificarToken, obtenerAnalisisCuentas);
router.get("/movimientos", verificarToken, obtenerMovimientosCuentaAnalisis);

module.exports = router;