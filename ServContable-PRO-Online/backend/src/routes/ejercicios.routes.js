const express = require("express");
const router = express.Router();

const {
  crearEjercicio,
  listarEjercicios,
  cerrarEjercicio,
  reabrirEjercicio,
} = require("../controllers/ejercicios.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const {
  bloquearDemo,
  limitarCreacionDemoPorEmpresa,
} = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarEjercicios);
router.post(
  "/",
  verificarToken,
  limitarCreacionDemoPorEmpresa({
    modulo: "a\u00f1o de trabajo",
    tabla: "ejercicios_contables",
    limite: 1,
  }),
  crearEjercicio
);
router.put(
  "/:id/cerrar",
  verificarToken,
  bloquearDemo("el cierre de a\u00f1o se habilita en la version contratada."),
  cerrarEjercicio
);
router.put(
  "/:id/reabrir",
  verificarToken,
  bloquearDemo("la reapertura de a\u00f1o se habilita en la version contratada."),
  reabrirEjercicio
);

module.exports = router;

