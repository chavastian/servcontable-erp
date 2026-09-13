const express = require("express");
const router = express.Router();

const { obtenerLibroDiario } = require("../controllers/libroDiario.controller");
const { verificarToken } = require("../middleware/auth.middleware");

router.get("/", verificarToken, obtenerLibroDiario);

module.exports = router;