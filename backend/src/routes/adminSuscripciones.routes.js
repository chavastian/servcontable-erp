const express = require("express");
const {
  ejecutarAccionCliente,
  guardarConfiguracion,
  guardarPlan,
  listarAuditoriaAdmin,
  listarClientes,
  listarNotificaciones,
  listarPlanes,
  obtenerCliente,
  obtenerConfiguracion,
  obtenerDashboard,
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

module.exports = router;
