const express = require("express");
const router = express.Router();

const {
  obtener1879,
  obtener1887,
  exportarDeclaracion,
  obtenerCertificado,
} = require("../controllers/declaracionesJuradas.controller");

const { verificarToken } = require("../middleware/auth.middleware");

// Solo lectura: las declaraciones juradas se arman con lo ya registrado.
router.get("/1879", verificarToken, obtener1879);
router.get("/1887", verificarToken, obtener1887);
router.get("/exportar", verificarToken, exportarDeclaracion);
router.get("/certificado", verificarToken, obtenerCertificado);

module.exports = router;
