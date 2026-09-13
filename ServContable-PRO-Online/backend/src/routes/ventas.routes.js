const express = require("express");
const multer = require("multer");
const router = express.Router();

const {
  crearVenta,
  listarVentas,
  importarVentasSII,
} = require("../controllers/ventas.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const {
  bloquearDemo,
  limitarCreacionDemoPorEmpresa,
} = require("../middleware/demo.middleware");

const upload = multer({ storage: multer.memoryStorage() });

router.get("/", verificarToken, listarVentas);
router.post(
  "/",
  verificarToken,
  limitarCreacionDemoPorEmpresa({
    modulo: "ventas manuales",
    tabla: "ventas",
    limite: 3,
    condicion: "COALESCE(estado, 'vigente') = 'vigente'",
  }),
  crearVenta
);
router.post(
  "/importar-sii",
  verificarToken,
  bloquearDemo("la importacion masiva SII se habilita en la version contratada."),
  upload.single("archivo"),
  importarVentasSII
);

module.exports = router;
