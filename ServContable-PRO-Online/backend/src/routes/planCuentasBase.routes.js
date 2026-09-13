const express = require("express");
const router = express.Router();

const { cargarPlanBase } = require("../controllers/planCuentasBase.controller");

const { verificarToken } = require("../middleware/auth.middleware");

router.post("/cargar", verificarToken, cargarPlanBase);

module.exports = router;