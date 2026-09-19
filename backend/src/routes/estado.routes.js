const express = require("express");
const router = express.Router();

const {
  obtenerEstado,
  obtenerSalud,
  obtenerInicio,
  obtenerEstadoPrivado,
} = require("../controllers/estado.controller");

const { verificarToken } = require("../middleware/auth.middleware");

router.get("/", obtenerInicio);
router.get("/estado", obtenerEstado);
// Para monitoreo externo: responde 503 si la base no esta, de modo que un
// vigilante de disponibilidad se de cuenta sin interpretar el contenido.
router.get("/salud", obtenerSalud);
router.get("/estado-privado", verificarToken, obtenerEstadoPrivado);

module.exports = router;