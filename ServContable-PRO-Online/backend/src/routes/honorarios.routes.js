const express = require("express");
const router = express.Router();

const {
  crearHonorario,
  listarHonorarios,
  contabilizarHonorario,
  anularHonorario,
} = require("../controllers/honorarios.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const {
  bloquearDemo,
  limitarCreacionDemoPorEmpresa,
} = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarHonorarios);
router.post(
  "/",
  verificarToken,
  limitarCreacionDemoPorEmpresa({
    modulo: "honorarios",
    tabla: "honorarios",
    limite: 2,
    condicion: "COALESCE(estado, 'vigente') = 'vigente'",
  }),
  crearHonorario
);
router.put(
  "/:id/contabilizar",
  verificarToken,
  bloquearDemo("la contabilizacion de honorarios se habilita en la version contratada."),
  contabilizarHonorario
);
router.put(
  "/:id/anular",
  verificarToken,
  bloquearDemo("la anulacion de honorarios se habilita en la version contratada."),
  anularHonorario
);

module.exports = router;
