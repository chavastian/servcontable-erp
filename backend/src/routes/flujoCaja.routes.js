const express = require("express");
const router = express.Router();

const { obtenerFlujoCaja } = require("../controllers/flujoCaja.controller");
const { verificarToken } = require("../middleware/auth.middleware");
const { exigirEmpresa } = require("../middleware/tenant.middleware");

router.get("/", verificarToken, exigirEmpresa, obtenerFlujoCaja);

module.exports = router;
