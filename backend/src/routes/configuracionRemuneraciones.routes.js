const express = require("express");
const router = express.Router();

const {
  obtenerConfiguracionRemuneraciones,
  guardarConfiguracionRemuneraciones,
  guardarAFP,
  eliminarAFP,
  importarIndicadoresPrevisionales,
} = require("../controllers/configuracionRemuneraciones.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { validar, esquemas } = require("../middleware/validacion.middleware");

const { exigirPermiso } = require("../middleware/tenant.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");
const { exigirEmpresa } = require("../middleware/tenant.middleware");
const { subidaArchivo, manejarErroresDeSubida } = require("../middleware/upload.middleware");

router.get("/", verificarToken, obtenerConfiguracionRemuneraciones);
router.post("/", verificarToken, exigirPermiso("REMUNERACIONES"), validar(esquemas.configuracionRemuneraciones), guardarConfiguracionRemuneraciones);
// La empresa se valida después de multer: antes del archivo `req.body`
// está vacío y la membresía no se comprobaba. El límite de tamaño y el
// filtro de tipo son los mismos de todas las subidas.
router.post(
  "/importar-indicadores",
  verificarToken,
  subidaArchivo.single("archivo"),
  manejarErroresDeSubida,
  exigirEmpresa,
  exigirPermiso("REMUNERACIONES"),
  importarIndicadoresPrevisionales
);
router.post("/afp", verificarToken, exigirPermiso("REMUNERACIONES"), validar(esquemas.afp), guardarAFP);
router.put(
  "/afp/:id/eliminar",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  bloquearDemo("la eliminacion de AFP se habilita en la version contratada."),
  validar(esquemas.conEmpresa), eliminarAFP
);

module.exports = router;
