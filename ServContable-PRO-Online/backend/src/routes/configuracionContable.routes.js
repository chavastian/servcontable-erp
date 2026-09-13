const express = require("express");
const router = express.Router();

const {
  obtenerConfiguracionContable,
  guardarConfiguracionContable,
} = require("../controllers/configuracionContable.controller");

const { verificarToken } = require("../middleware/auth.middleware");

router.get("/", verificarToken, obtenerConfiguracionContable);
router.post("/", verificarToken, guardarConfiguracionContable);

module.exports = router;
