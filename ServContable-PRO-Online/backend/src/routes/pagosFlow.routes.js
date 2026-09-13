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
  exigirAdministradorUsuarios,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/preferencia", crearPagoContratacion);
router.post("/checkout", crearPagoContratacion);
router.post("/renovar", verificarToken, crearRenovacionSuscripcionFlow);
router.post("/webhook", recibirWebhookFlow);
router.get("/retorno", procesarRetornoFlow);
router.post("/retorno", procesarRetornoFlow);
router.get(
  "/contrataciones",
  verificarToken,
  exigirAdministradorUsuarios,
  listarContratacionesWeb
);
router.patch(
  "/contrataciones/:id/gestion",
  verificarToken,
  exigirAdministradorUsuarios,
  actualizarGestionContratacion
);
router.get("/contratacion/:id", obtenerContratacion);

module.exports = router;
