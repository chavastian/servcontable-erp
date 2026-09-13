const express = require("express");
const router = express.Router();

const {
  crearEmpresa,
  listarEmpresas,
  actualizarEmpresa,
  eliminarEmpresa,
} = require("../controllers/empresas.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { limitarEmpresasDemo } = require("../middleware/demo.middleware");

router.post("/", verificarToken, limitarEmpresasDemo(1), crearEmpresa);
router.get("/", verificarToken, listarEmpresas);
router.patch("/:id", verificarToken, actualizarEmpresa);
router.delete("/:id", verificarToken, eliminarEmpresa);

module.exports = router;
