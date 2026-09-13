const express = require("express");
const multer = require("multer");
const router = express.Router();

const {
  crearCompra,
  listarCompras,
  importarComprasSII,
} = require("../controllers/compras.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const {
  bloquearDemo,
  limitarCreacionDemoPorEmpresa,
} = require("../middleware/demo.middleware");

const upload = multer({ storage: multer.memoryStorage() });

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
  upload.single("archivo"),
  importarComprasSII
);

module.exports = router;
