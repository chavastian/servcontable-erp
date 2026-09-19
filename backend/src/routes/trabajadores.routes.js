const express = require("express");
const router = express.Router();

const {
  crearTrabajador,
  listarTrabajadores,
  actualizarTrabajador,
  eliminarTrabajador,
} = require("../controllers/trabajadores.controller");

const { verificarToken } = require("../middleware/auth.middleware");
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
  crearTrabajador
);
router.put("/:id", verificarToken,
  exigirPermiso("REMUNERACIONES"), actualizarTrabajador);
router.put(
  "/:id/eliminar",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  bloquearDemo("la eliminacion de trabajadores se habilita en la version contratada."),
  eliminarTrabajador
);

module.exports = router;
