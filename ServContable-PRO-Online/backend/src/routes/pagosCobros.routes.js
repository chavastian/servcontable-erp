const express = require("express");
const router = express.Router();

const {
  listarDocumentosPendientes,
  listarPagosCobros,
  registrarPagoCobro,
  anularPagoCobro,
} = require("../controllers/pagosCobros.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

router.get("/documentos-pendientes", verificarToken, listarDocumentosPendientes);
router.get("/", verificarToken, listarPagosCobros);
router.post(
  "/",
  verificarToken,
  bloquearDemo("el registro de pagos y cobros se habilita en la version contratada."),
  registrarPagoCobro
);
router.put(
  "/:id/anular",
  verificarToken,
  bloquearDemo("la anulacion de pagos y cobros se habilita en la version contratada."),
  anularPagoCobro
);

module.exports = router;
