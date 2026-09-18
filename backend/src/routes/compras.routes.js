const express = require("express");
const router = express.Router();

const {
  crearCompra,
  listarCompras,
  importarComprasSII,
} = require("../controllers/compras.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { exigirEmpresa } = require("../middleware/tenant.middleware");
const {
  subidaArchivo,
  manejarErroresDeSubida,
} = require("../middleware/upload.middleware");
const {
  bloquearDemo,
  limitarCreacionDemoPorEmpresa,
} = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarCompras);
router.post(
  "/",
  verificarToken,
  limitarCreacionDemoPorEmpresa({
    modulo: "compras manuales",
    tabla: "compras",
    limite: 3,
    condicion: "COALESCE(estado, 'vigente') = 'vigente'",
  }),
  crearCompra
);

router.post(
  "/importar-sii",
  verificarToken,
  bloquearDemo("la importacion masiva SII se habilita en la version contratada."),
  subidaArchivo.single("archivo"),
  manejarErroresDeSubida,
  // Despues de multer: antes de esta linea req.body esta vacio y la
  // membresia en la empresa no se puede comprobar.
  exigirEmpresa,
  importarComprasSII
);

module.exports = router;
