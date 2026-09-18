const express = require("express");
const {
  crearPagoContratacion,
  crearRenovacionSuscripcionFlow,
  obtenerContratacion,
  listarContratacionesWeb,
  actualizarGestionContratacion,
  recibirWebhookFlow,
  procesarRetornoFlow,
} = require("../controllers/pagosFlow.controller");
const {
  verificarToken,
  exigirAdminSistema,
} = require("../middleware/auth.middleware");
const { limitePagos } = require("../middleware/seguridad.middleware");

const router = express.Router();

router.post("/preferencia", limitePagos, crearPagoContratacion);
router.post("/checkout", limitePagos, crearPagoContratacion);
router.post("/renovar", limitePagos, verificarToken, crearRenovacionSuscripcionFlow);
router.post("/webhook", recibirWebhookFlow);
router.get("/retorno", procesarRetornoFlow);
router.post("/retorno", procesarRetornoFlow);
router.get(
  "/contrataciones",
  verificarToken,
  exigirAdminSistema,
  listarContratacionesWeb
);
router.patch(
  "/contrataciones/:id/gestion",
  verificarToken,
  exigirAdminSistema,
  actualizarGestionContratacion
);
router.get("/contratacion/:id", obtenerContratacion);

module.exports = router;
