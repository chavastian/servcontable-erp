const express = require("express");
const router = express.Router();

const {
  obtenerF29,
  registrarPresentada,
  listarPresentadas,
} = require("../controllers/declaracionesF29.controller");
const { verificarToken } = require("../middleware/auth.middleware");
const { validar, esquemas } = require("../middleware/validacion.middleware");

const { exigirEmpresa, exigirPermiso } = require("../middleware/tenant.middleware");

router.get("/", verificarToken, exigirEmpresa, obtenerF29);
router.get("/presentadas", verificarToken, exigirEmpresa, listarPresentadas);
// Registrar lo presentado fija el remanente del periodo: es un cierre.
router.post(
  "/presentada",
  verificarToken,
  exigirEmpresa,
  exigirPermiso("CERRAR_EJERCICIO"),
  validar(esquemas.f29Presentada), registrarPresentada
);

module.exports = router;
