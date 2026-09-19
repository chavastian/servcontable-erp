const express = require("express");
const router = express.Router();

const { obtenerPanelEstudio } = require("../controllers/panelEstudio.controller");
const { verificarToken } = require("../middleware/auth.middleware");

// No lleva exigirEmpresa: el panel es precisamente la vista de todas las
// empresas del usuario, y la membresia se resuelve dentro del controlador con
// obtenerEmpresasPermitidas.
router.get("/", verificarToken, obtenerPanelEstudio);

module.exports = router;
