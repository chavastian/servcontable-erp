const express = require("express");
const router = express.Router();

const { cargarPlanBase } = require("../controllers/planCuentasBase.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { exigirPermiso } = require("../middleware/tenant.middleware");

router.post("/cargar", verificarToken,
  exigirPermiso("CONFIGURAR"), cargarPlanBase);

module.exports = router;