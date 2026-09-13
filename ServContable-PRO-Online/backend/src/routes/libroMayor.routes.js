const express = require("express");
const router = express.Router();

const { obtenerLibroMayor } = require("../controllers/libroMayor.controller");
const { verificarToken } = require("../middleware/auth.middleware");

router.get("/", verificarToken, obtenerLibroMayor);

module.exports = router;