const express = require("express");
const router = express.Router();

const {
  crearCompra,
  listarCompras,
  importarComprasSII,
} = require("../controllers/compras.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { exigirPermiso } = require("../middleware/tenant.middleware");
const { exigirEmpresa } = require("../middleware/tenant.middleware");
const {
  validar,
  esquemas,
} = require("../middleware/validacion.middleware");
const { limiteImportacion } = require("../middleware/seguridad.middleware");
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
  exigirPermiso("REGISTRAR"),
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
  limiteImportacion,
  verificarToken,
  bloquearDemo("la importacion masiva SII se habilita en la version contratada."),
  subidaArchivo.single("archivo"),
  manejarErroresDeSubida,
  // Despues de multer: antes de esta linea req.body esta vacio y la
  // membresia en la empresa no se puede comprobar.
  exigirEmpresa,
  exigirPermiso("IMPORTAR"),
  validar(esquemas.importacion),
  importarComprasSII
);

module.exports = router;
