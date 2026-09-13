const express = require("express");
const router = express.Router();

const {
  obtenerResumenPagosRemuneraciones,
  registrarPagoRemuneracion,
  anularPagoRemuneracion,
} = require("../controllers/pagosRemuneraciones.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

router.get("/", verificarToken, obtenerResumenPagosRemuneraciones);
router.post(
  "/",
  verificarToken,
  bloquearDemo("el pago de remuneraciones se habilita en la version contratada."),
  registrarPagoRemuneracion
);
router.put(
  "/:id/anular",
  verificarToken,
  bloquearDemo("la anulacion de pagos de remuneraciones se habilita en la version contratada."),
  anularPagoRemuneracion
);

module.exports = router;
