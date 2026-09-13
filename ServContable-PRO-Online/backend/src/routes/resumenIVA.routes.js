const express = require("express");
const router = express.Router();

const { obtenerResumenIVA } = require("../controllers/resumenIVA.controller");
const { verificarToken } = require("../middleware/auth.middleware");

router.get("/", verificarToken, obtenerResumenIVA);

module.exports = router;