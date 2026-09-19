const express = require("express");
const router = express.Router();

const {
  crearFiniquito,
  listarFiniquitos,
  obtenerFiniquito,
  calcularVacacionesFiniquito,
  calcularFiniquitoPrevio,
  eliminarFiniquito,
  contabilizarFiniquito,
  pagarFiniquito,
} = require("../controllers/finiquitos.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { validar, esquemas } = require("../middleware/validacion.middleware");

const { exigirPermiso } = require("../middleware/tenant.middleware");
const {
  bloquearDemo,
  limitarCreacionDemoPorEmpresa,
} = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarFiniquitos);
router.get(
  "/calcular-vacaciones",
  verificarToken,
  calcularVacacionesFiniquito
);
router.post(
  "/calcular",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  validar(esquemas.finiquito), calcularFiniquitoPrevio
);
router.get("/:id", verificarToken, obtenerFiniquito);
router.post(
  "/",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  limitarCreacionDemoPorEmpresa({
    modulo: "finiquitos",
    tabla: "finiquitos",
    limite: 1,
    condicion: "COALESCE(estado, 'vigente') = 'vigente'",
  }),
  validar(esquemas.finiquito), crearFiniquito
);
router.post(
  "/:id/contabilizar",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  bloquearDemo("la contabilizacion de finiquitos se habilita en la version contratada."),
  validar(esquemas.conEmpresa), contabilizarFiniquito
);
router.delete(
  "/:id",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  bloquearDemo("la eliminacion de finiquitos se habilita en la version contratada."),
  eliminarFiniquito
);
router.post(
  "/:id/pagar",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  bloquearDemo("el pago de finiquitos se habilita en la version contratada."),
  validar(esquemas.finiquitoPagar), pagarFiniquito
);


module.exports = router;
