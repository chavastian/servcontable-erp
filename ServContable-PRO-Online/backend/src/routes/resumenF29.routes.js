const express = require("express");
const router = express.Router();

const { obtenerResumenF29 } = require("../controllers/resumenF29.controller");
const { verificarToken } = require("../middleware/auth.middleware");

router.get("/", verificarToken, obtenerResumenF29);

module.exports = router;