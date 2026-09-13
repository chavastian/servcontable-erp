const express = require("express");
const router = express.Router();

const { listarAuditoria } = require("../controllers/auditoria.controller");
const { verificarToken } = require("../middleware/auth.middleware");

router.get("/", verificarToken, listarAuditoria);

module.exports = router;
