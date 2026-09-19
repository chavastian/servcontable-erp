const express = require("express");
const router = express.Router();

const {
  listarMovimientos,
  importarCartola,
  actualizarEstado,
} = require("../controllers/conciliacionBancaria.controller");
const { sugerirCalces } = require("../controllers/calceBancario.controller");
const { verificarToken } = require("../middleware/auth.middleware");
const { validar, esquemas } = require("../middleware/validacion.middleware");

const { exigirPermiso } = require("../middleware/tenant.middleware");
const { exigirEmpresa } = require("../middleware/tenant.middleware");
const { limiteImportacion } = require("../middleware/seguridad.middleware");
const {
  subidaArchivo,
  manejarErroresDeSubida,
} = require("../middleware/upload.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

router.get("/", verificarToken, listarMovimientos);

// Propuestas de calce. Solo lee: la confirmacion sigue pasando por
// PUT /:id/estado, que es el unico lugar donde se escribe el estado.
router.get("/sugerencias", verificarToken, exigirEmpresa, sugerirCalces);
router.post(
  "/importar",
  limiteImportacion,
  verificarToken,
  bloquearDemo("la conciliacion bancaria masiva se habilita en la version contratada."),
  subidaArchivo.single("archivo"),
  manejarErroresDeSubida,
  // Despues de multer: antes de esta linea req.body esta vacio y la
  // membresia en la empresa no se puede comprobar.
  exigirEmpresa,
  exigirPermiso("IMPORTAR"),
  importarCartola
);
router.put(
  "/:id/estado",
  limiteImportacion,
  verificarToken,
  bloquearDemo("la conciliacion bancaria se habilita en la version contratada."),
  // Faltaba: el controlador filtraba por el empresa_id del cuerpo sin comprobar
  // que el usuario fuera miembro de esa empresa, asi que cualquiera autenticado
  // podia marcar como conciliado un movimiento de otro cliente.
  exigirEmpresa,
  exigirPermiso("REGISTRAR"),
  validar(esquemas.conciliacionEstado), actualizarEstado
);

module.exports = router;
