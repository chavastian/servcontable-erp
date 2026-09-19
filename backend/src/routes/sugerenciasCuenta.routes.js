const express = require("express");
const router = express.Router();

const {
  listarSugerencias,
  aplicarSugerencias,
  sugerirParaRut,
} = require("../controllers/sugerenciaCuenta.controller");
const { verificarToken } = require("../middleware/auth.middleware");
const { exigirEmpresa, exigirPermiso } = require("../middleware/tenant.middleware");

router.get("/", verificarToken, exigirEmpresa, listarSugerencias);
router.get("/por-rut", verificarToken, exigirEmpresa, sugerirParaRut);

// Aplicar si escribe en los documentos, asi que pide permiso de registro.
router.post(
  "/aplicar",
  verificarToken,
  exigirEmpresa,
  exigirPermiso("REGISTRAR"),
  aplicarSugerencias
);

module.exports = router;
