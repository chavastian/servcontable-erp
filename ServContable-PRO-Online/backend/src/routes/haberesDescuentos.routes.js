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
const {
  bloquearDemo,
  limitarCreacionDemoPorEmpresa,
} = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarHaberesDescuentos);
router.get("/resumen-liquidacion", verificarToken, obtenerResumenLiquidacion);
router.post(
  "/",
  verificarToken,
  limitarCreacionDemoPorEmpresa({
    modulo: "conceptos de haberes y descuentos",
    tabla: "haberes_descuentos_remuneraciones",
    limite: 4,
    condicion: "COALESCE(estado, 'vigente') = 'vigente'",
  }),
  crearHaberDescuento
);
router.put("/:id", verificarToken, actualizarHaberDescuento);
router.put(
  "/:id/recurrente",
  verificarToken,
  bloquearDemo("los conceptos fijos mensuales se habilitan en la version contratada."),
  actualizarRecurrenteHaberDescuento
);
router.put(
  "/:id/eliminar",
  verificarToken,
  bloquearDemo("la eliminacion de conceptos se habilita en la version contratada."),
  eliminarHaberDescuento
);

module.exports = router;
