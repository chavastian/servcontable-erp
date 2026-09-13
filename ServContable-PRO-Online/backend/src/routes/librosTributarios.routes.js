const express = require("express");
const router = express.Router();

const {
  obtenerLibroVentas,
  obtenerLibroCompras,
} = require("../controllers/librosTributarios.controller");

const { verificarToken } = require("../middleware/auth.middleware");

router.get("/ventas", verificarToken, obtenerLibroVentas);
router.get("/compras", verificarToken, obtenerLibroCompras);

module.exports = router;