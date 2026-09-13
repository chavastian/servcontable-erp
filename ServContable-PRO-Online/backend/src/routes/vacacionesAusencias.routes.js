const express = require("express");
const router = express.Router();

const {
  crearRegistro,
  listarRegistros,
  obtenerResumenTrabajador,
  eliminarRegistro,
} = require("../controllers/vacacionesAusencias.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const {
  bloquearDemo,
  limitarCreacionDemoPorEmpresa,
} = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarRegistros);
router.get("/resumen-trabajador", verificarToken, obtenerResumenTrabajador);
router.post(
  "/",
  verificarToken,
  limitarCreacionDemoPorEmpresa({
    modulo: "registros de vacaciones o ausencias",
    tabla: "vacaciones_ausencias",
    limite: 3,
    condicion: "COALESCE(estado, 'vigente') = 'vigente'",
  }),
  crearRegistro
);
router.delete(
  "/:id",
  verificarToken,
  bloquearDemo("la eliminacion de vacaciones y ausencias se habilita en la version contratada."),
  eliminarRegistro
);

module.exports = router;
