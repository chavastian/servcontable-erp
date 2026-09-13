const express = require("express");
const router = express.Router();

const {
  crearComprobante,
  listarComprobantes,
  obtenerComprobante,
  actualizarComprobante,
  anularComprobante,
  obtenerSiguienteNumero,
} = require("../controllers/comprobantes.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const {
  bloquearDemo,
  limitarCreacionDemoPorEmpresa,
} = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarComprobantes);
router.get("/siguiente-numero", verificarToken, obtenerSiguienteNumero);
router.get("/:id", verificarToken, obtenerComprobante);
router.post(
  "/",
  verificarToken,
  limitarCreacionDemoPorEmpresa({
    modulo: "comprobantes de prueba",
    tabla: "comprobantes",
    limite: 5,
    condicion: "COALESCE(estado, 'vigente') <> 'anulado'",
  }),
  crearComprobante
);
router.put("/:id", verificarToken, actualizarComprobante);
router.delete(
  "/:id",
  verificarToken,
  bloquearDemo("la anulacion de comprobantes se habilita en la version contratada."),
  anularComprobante
);

module.exports = router;
