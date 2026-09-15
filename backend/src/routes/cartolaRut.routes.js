const express = require("express");
const router = express.Router();

const {
  obtenerCartolaRut,
  buscarTerceros,
} = require("../controllers/cartolaRut.controller");

const { verificarToken } = require("../middleware/auth.middleware");

router.get("/", verificarToken, obtenerCartolaRut);
router.get("/terceros", verificarToken, buscarTerceros);

module.exports = router;
