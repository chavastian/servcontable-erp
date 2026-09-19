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
const { validar, esquemas } = require("../middleware/validacion.middleware");

const { exigirPermiso } = require("../middleware/tenant.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarCuentas);
router.post(
  "/",
  verificarToken,
  exigirPermiso("CONFIGURAR"),
  bloquearDemo("la creacion manual de cuentas se habilita en la version contratada. En demo puedes cargar el plan base."),
  validar(esquemas.cuentaPlan), crearCuenta
);
router.post("/plan-base", verificarToken,
  exigirPermiso("CONFIGURAR"), validar(esquemas.conEmpresa), cargarPlanBase);
router.put(
  "/:id",
  verificarToken,
  exigirPermiso("CONFIGURAR"),
  bloquearDemo("la edicion del plan de cuentas se habilita en la version contratada."),
  validar(esquemas.cuentaPlan), actualizarCuenta
);
router.patch(
  "/:id/estado",
  verificarToken,
  exigirPermiso("CONFIGURAR"),
  bloquearDemo("la activacion o desactivacion de cuentas se habilita en la version contratada."),
  validar(esquemas.conEmpresa), cambiarEstadoCuenta
);

module.exports = router;
