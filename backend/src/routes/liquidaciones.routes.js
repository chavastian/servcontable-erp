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
const { exigirPermiso } = require("../middleware/tenant.middleware");
const {
  bloquearDemo,
  limitarCreacionDemoPorEmpresa,
} = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarLiquidaciones);
router.post("/calcular", verificarToken,
  exigirPermiso("REMUNERACIONES"), calcularLiquidacionBase);
router.post(
  "/",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  limitarCreacionDemoPorEmpresa({
    modulo: "liquidaciones guardadas",
    tabla: "liquidaciones",
    limite: 2,
    condicion: "COALESCE(estado, 'vigente') <> 'eliminada'",
  }),
  guardarLiquidacion
);
router.put("/:id", verificarToken,
  exigirPermiso("REMUNERACIONES"), actualizarLiquidacion);
router.put(
  "/:id/eliminar",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  bloquearDemo("la eliminacion de liquidaciones se habilita en la version contratada."),
  eliminarLiquidacion
);
router.post(
  "/contabilizar",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  bloquearDemo("la contabilizacion de liquidaciones se habilita en la version contratada."),
  contabilizarLiquidaciones
);

module.exports = router;
