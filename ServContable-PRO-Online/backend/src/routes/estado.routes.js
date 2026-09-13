const express = require("express");
const router = express.Router();

const {
  obtenerEstado,
  obtenerInicio,
  obtenerEstadoPrivado,
} = require("../controllers/estado.controller");

const { verificarToken } = require("../middleware/auth.middleware");

router.get("/", obtenerInicio);
router.get("/estado", obtenerEstado);
router.get("/estado-privado", verificarToken, obtenerEstadoPrivado);

module.exports = router;