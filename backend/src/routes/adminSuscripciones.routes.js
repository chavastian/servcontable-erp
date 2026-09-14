const express = require("express");
const {
  ejecutarAccionCliente,
  ejecutarAccionSolicitudWeb,
  guardarConfiguracion,
  guardarPlan,
  listarAuditoriaAdmin,
  listarClientes,
  listarNotificaciones,
  listarPlanes,
  listarSolicitudesWeb,
  obtenerCliente,
  obtenerConfiguracion,
  obtenerDashboard,
  obtenerDetalleSolicitudWeb,
  registrarPagoManual,
} = require("../controllers/adminSuscripciones.controller");
const { verificarToken, exigirAdminSistema } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(verificarToken);
router.use(exigirAdminSistema);

router.get("/dashboard", obtenerDashboard);
router.get("/clientes", listarClientes);
router.get("/clientes/:id", obtenerCliente);
router.post("/clientes/:id/acciones", ejecutarAccionCliente);
router.post("/clientes/:id/pagos", registrarPagoManual);
router.get("/planes", listarPlanes);
router.post("/planes", guardarPlan);
router.patch("/planes/:id", guardarPlan);
router.get("/configuracion", obtenerConfiguracion);
router.patch("/configuracion", guardarConfiguracion);
router.get("/auditoria", listarAuditoriaAdmin);
router.get("/notificaciones", listarNotificaciones);
router.get("/solicitudes-web", listarSolicitudesWeb);
router.get("/solicitudes-web/:tipo/:id", obtenerDetalleSolicitudWeb);
router.post("/solicitudes-web/:tipo/:id/acciones", ejecutarAccionSolicitudWeb);

module.exports = router;
