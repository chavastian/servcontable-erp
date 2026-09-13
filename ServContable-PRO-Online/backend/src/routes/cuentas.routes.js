const express = require("express");
const router = express.Router();

const {
  crearCuenta,
  listarCuentas,
  cargarPlanBase,
  actualizarCuenta,
  cambiarEstadoCuenta,
} = require("../controllers/cuentas.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarCuentas);
router.post(
  "/",
  verificarToken,
  bloquearDemo("la creacion manual de cuentas se habilita en la version contratada. En demo puedes cargar el plan base."),
  crearCuenta
);
router.post("/plan-base", verificarToken, cargarPlanBase);
router.put(
  "/:id",
  verificarToken,
  bloquearDemo("la edicion del plan de cuentas se habilita en la version contratada."),
  actualizarCuenta
);
router.patch(
  "/:id/estado",
  verificarToken,
  bloquearDemo("la activacion o desactivacion de cuentas se habilita en la version contratada."),
  cambiarEstadoCuenta
);

module.exports = router;
