const express = require("express");
const router = express.Router();

const {
  crearHaberDescuento,
  listarHaberesDescuentos,
  obtenerResumenLiquidacion,
  actualizarHaberDescuento,
  actualizarRecurrenteHaberDescuento,
  eliminarHaberDescuento,
} = require("../controllers/haberesDescuentos.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { validar, esquemas } = require("../middleware/validacion.middleware");

const { exigirPermiso } = require("../middleware/tenant.middleware");
const {
  bloquearDemo,
  limitarCreacionDemoPorEmpresa,
} = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarHaberesDescuentos);
router.get("/resumen-liquidacion", verificarToken, obtenerResumenLiquidacion);
router.post(
  "/",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  limitarCreacionDemoPorEmpresa({
    modulo: "conceptos de haberes y descuentos",
    tabla: "haberes_descuentos_remuneraciones",
    limite: 4,
    condicion: "COALESCE(estado, 'vigente') = 'vigente'",
  }),
  validar(esquemas.haberDescuento), crearHaberDescuento
);
router.put("/:id", verificarToken, exigirPermiso("REMUNERACIONES"), validar(esquemas.haberDescuento), actualizarHaberDescuento);
router.put(
  "/:id/recurrente",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  bloquearDemo("los conceptos fijos mensuales se habilitan en la version contratada."),
  validar(esquemas.conEmpresa), actualizarRecurrenteHaberDescuento
);
router.put(
  "/:id/eliminar",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  bloquearDemo("la eliminacion de conceptos se habilita en la version contratada."),
  validar(esquemas.conEmpresa), eliminarHaberDescuento
);

module.exports = router;
