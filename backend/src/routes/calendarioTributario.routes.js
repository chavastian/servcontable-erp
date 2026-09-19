const express = require("express");
const router = express.Router();

const { obtenerCalendario } = require("../controllers/calendarioTributario.controller");
const { verificarToken } = require("../middleware/auth.middleware");
const { resolverEmpresaSiViene } = require("../middleware/tenant.middleware");

// Sirve tanto a una empresa concreta como al estudio completo, por eso la
// empresa se valida solo si viene.
router.get("/", verificarToken, resolverEmpresaSiViene, obtenerCalendario);

module.exports = router;
