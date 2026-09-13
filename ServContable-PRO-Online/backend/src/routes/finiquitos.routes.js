const express = require("express");
const router = express.Router();

const {
  crearFiniquito,
  listarFiniquitos,
  obtenerFiniquito,
  calcularVacacionesFiniquito,
  eliminarFiniquito,
  contabilizarFiniquito,
  pagarFiniquito,
} = require("../controllers/finiquitos.controller");

const { verificarToken } = require("../middleware/auth.middleware");
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
router.get("/:id", verificarToken, obtenerFiniquito);
router.post(
  "/",
  verificarToken,
  limitarCreacionDemoPorEmpresa({
    modulo: "finiquitos",
    tabla: "finiquitos",
    limite: 1,
    condicion: "COALESCE(estado, 'vigente') = 'vigente'",
  }),
  crearFiniquito
);
router.post(
  "/:id/contabilizar",
  verificarToken,
  bloquearDemo("la contabilizacion de finiquitos se habilita en la version contratada."),
  contabilizarFiniquito
);
router.delete(
  "/:id",
  verificarToken,
  bloquearDemo("la eliminacion de finiquitos se habilita en la version contratada."),
  eliminarFiniquito
);
router.post(
  "/:id/pagar",
  verificarToken,
  bloquearDemo("el pago de finiquitos se habilita en la version contratada."),
  pagarFiniquito
);


module.exports = router;
