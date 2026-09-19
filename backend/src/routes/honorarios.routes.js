const express = require("express");
const router = express.Router();

const {
  crearHonorario,
  listarHonorarios,
  contabilizarHonorario,
  anularHonorario,
} = require("../controllers/honorarios.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { validar, esquemas } = require("../middleware/validacion.middleware");

const { exigirPermiso } = require("../middleware/tenant.middleware");
const {
  bloquearDemo,
  limitarCreacionDemoPorEmpresa,
} = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarHonorarios);
router.post(
  "/",
  verificarToken,
  exigirPermiso("REGISTRAR"),
  limitarCreacionDemoPorEmpresa({
    modulo: "honorarios",
    tabla: "honorarios",
    limite: 2,
    condicion: "COALESCE(estado, 'vigente') = 'vigente'",
  }),
  validar(esquemas.honorario), crearHonorario
);
router.put(
  "/:id/contabilizar",
  verificarToken,
  exigirPermiso("REGISTRAR"),
  bloquearDemo("la contabilizacion de honorarios se habilita en la version contratada."),
  validar(esquemas.conEmpresa), contabilizarHonorario
);
router.put(
  "/:id/anular",
  verificarToken,
  // Anular es una accion distinta de registrar: un EDITOR registra y no anula.
  exigirPermiso("ANULAR"),
  bloquearDemo("la anulacion de honorarios se habilita en la version contratada."),
  validar(esquemas.conEmpresa), anularHonorario
);

module.exports = router;
