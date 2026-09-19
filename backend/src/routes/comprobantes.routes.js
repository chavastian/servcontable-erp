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
  validar,
  esquemas,
} = require("../middleware/validacion.middleware");
const {
  bloquearDemo,
  limitarCreacionDemoPorEmpresa,
} = require("../middleware/demo.middleware");

router.get(
  "/",
  verificarToken,
  validar(esquemas.consultaPorEmpresa, "query"),
  listarComprobantes
);
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
  validar(esquemas.comprobante),
  crearComprobante
);
router.put(
  "/:id",
  verificarToken,
  validar(esquemas.comprobante),
  actualizarComprobante
);
router.delete(
  "/:id",
  verificarToken,
  bloquearDemo("la anulacion de comprobantes se habilita en la version contratada."),
  anularComprobante
);

module.exports = router;
