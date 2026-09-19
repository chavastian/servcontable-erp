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
const { exportarLre } = require("../controllers/libroRemuneracionesElectronico.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { validar, esquemas } = require("../middleware/validacion.middleware");

const { exigirPermiso } = require("../middleware/tenant.middleware");
const {
  bloquearDemo,
  limitarCreacionDemoPorEmpresa,
} = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarLiquidaciones);
router.get("/lre", verificarToken, exigirPermiso("REMUNERACIONES"), exportarLre);
router.post("/calcular", verificarToken,
  exigirPermiso("REMUNERACIONES"), validar(esquemas.liquidacionGuardar), calcularLiquidacionBase);
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
  validar(esquemas.liquidacionGuardar), guardarLiquidacion
);
router.put("/:id", verificarToken,
  exigirPermiso("REMUNERACIONES"), validar(esquemas.liquidacionGuardar), actualizarLiquidacion);
router.put(
  "/:id/eliminar",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  bloquearDemo("la eliminacion de liquidaciones se habilita en la version contratada."),
  validar(esquemas.conEmpresa), eliminarLiquidacion
);
router.post(
  "/contabilizar",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  bloquearDemo("la contabilizacion de liquidaciones se habilita en la version contratada."),
  validar(esquemas.porPeriodo), contabilizarLiquidaciones
);

module.exports = router;
