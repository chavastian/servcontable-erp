const express = require("express");
const router = express.Router();

const {
  obtenerDashboardContable,
} = require("../controllers/dashboardContable.controller");

const { verificarToken } = require("../middleware/auth.middleware");

router.get("/", verificarToken, obtenerDashboardContable);

module.exports = router;