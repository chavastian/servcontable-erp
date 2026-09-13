const express = require("express");
const router = express.Router();

const {
  calcularLiquidacionBase,
  guardarLiquidacion,
  actualizarLiquidacion,
  eliminarLiquidacion,
  listarLiquidaciones,
  contabilizarLiquidaciones,
} = require("../controllers/liquidaciones.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const {
  bloquearDemo,
  limitarCreacionDemoPorEmpresa,
} = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarLiquidaciones);
router.post("/calcular", verificarToken, calcularLiquidacionBase);
router.post(
  "/",
  verificarToken,
  limitarCreacionDemoPorEmpresa({
    modulo: "liquidaciones guardadas",
    tabla: "liquidaciones",
    limite: 2,
    condicion: "COALESCE(estado, 'vigente') <> 'eliminada'",
  }),
  guardarLiquidacion
);
router.put("/:id", verificarToken, actualizarLiquidacion);
router.put(
  "/:id/eliminar",
  verificarToken,
  bloquearDemo("la eliminacion de liquidaciones se habilita en la version contratada."),
  eliminarLiquidacion
);
router.post(
  "/contabilizar",
  verificarToken,
  bloquearDemo("la contabilizacion de liquidaciones se habilita en la version contratada."),
  contabilizarLiquidaciones
);

module.exports = router;
