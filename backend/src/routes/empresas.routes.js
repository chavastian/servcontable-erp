const express = require("express");
const router = express.Router();

const {
  crearEmpresa,
  listarEmpresas,
  actualizarEmpresa,
  eliminarEmpresa,
} = require("../controllers/empresas.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { validar, esquemas } = require("../middleware/validacion.middleware");

const { limitarEmpresasDemo } = require("../middleware/demo.middleware");

router.post("/", verificarToken, limitarEmpresasDemo(1), validar(esquemas.empresa), crearEmpresa);
router.get("/", verificarToken, listarEmpresas);
router.patch("/:id", verificarToken, validar(esquemas.empresa), actualizarEmpresa);
router.delete("/:id", verificarToken, eliminarEmpresa);

module.exports = router;
