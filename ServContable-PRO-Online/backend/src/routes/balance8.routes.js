const express = require("express");
const router = express.Router();

const { obtenerBalance8Columnas } = require("../controllers/balance8.controller");
const { verificarToken } = require("../middleware/auth.middleware");

router.get("/", verificarToken, obtenerBalance8Columnas);

module.exports = router;