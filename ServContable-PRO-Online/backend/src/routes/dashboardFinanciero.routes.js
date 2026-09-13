const express = require("express");
const router = express.Router();

const {
  obtenerDashboardFinanciero,
} = require("../controllers/dashboardFinanciero.controller");

const { verificarToken } = require("../middleware/auth.middleware");

router.get("/", verificarToken, obtenerDashboardFinanciero);

module.exports = router;