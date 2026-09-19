const express = require("express");
const router = express.Router();

const {
  crearTrabajador,
  listarTrabajadores,
  actualizarTrabajador,
  eliminarTrabajador,
} = require("../controllers/trabajadores.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { validar, esquemas } = require("../middleware/validacion.middleware");

const { exigirPermiso } = require("../middleware/tenant.middleware");
const {
  bloquearDemo,
  limitarCreacionDemoPorEmpresa,
} = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarTrabajadores);
router.post(
  "/",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  limitarCreacionDemoPorEmpresa({
    modulo: "trabajadores",
    tabla: "trabajadores",
    limite: 2,
    condicion: "COALESCE(estado, 'activo') <> 'eliminado'",
  }),
  validar(esquemas.trabajador), crearTrabajador
);
router.put("/:id", verificarToken,
  exigirPermiso("REMUNERACIONES"), validar(esquemas.trabajador), actualizarTrabajador);
router.put(
  "/:id/eliminar",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  bloquearDemo("la eliminacion de trabajadores se habilita en la version contratada."),
  validar(esquemas.conEmpresa), eliminarTrabajador
);

module.exports = router;
