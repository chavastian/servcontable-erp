const express = require("express");
const router = express.Router();

const {
  obtenerEstadoResultados,
} = require("../controllers/estadoResultados.controller");

const { verificarToken } = require("../middleware/auth.middleware");

router.get("/", verificarToken, obtenerEstadoResultados);

module.exports = router;