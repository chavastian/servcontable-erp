const express = require("express");
const multer = require("multer");
const router = express.Router();

const {
  obtenerConfiguracionRemuneraciones,
  guardarConfiguracionRemuneraciones,
  guardarAFP,
  eliminarAFP,
  importarIndicadoresPrevisionales,
} = require("../controllers/configuracionRemuneraciones.controller");

const { verificarToken } = require("../middleware/auth.middleware");
const { exigirPermiso } = require("../middleware/tenant.middleware");
const { bloquearDemo } = require("../middleware/demo.middleware");

const uploadIndicadores = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

function cargarIndicadores(req, res, next) {
  uploadIndicadores.single("archivo")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "El archivo PDF supera el tamano maximo permitido.",
      });
    }

    console.error("Error al recibir PDF de indicadores Previred:", {
      mensaje: error.message,
      codigo: error.code,
    });

    return res.status(400).json({
      error: "No fue posible recibir el archivo PDF de Previred.",
    });
  });
}

router.get("/", verificarToken, obtenerConfiguracionRemuneraciones);
router.post("/", verificarToken, exigirPermiso("REMUNERACIONES"), guardarConfiguracionRemuneraciones);
router.post(
  "/importar-indicadores",
  verificarToken,
  cargarIndicadores,
  importarIndicadoresPrevisionales
);
router.post("/afp", verificarToken, exigirPermiso("REMUNERACIONES"), guardarAFP);
router.put(
  "/afp/:id/eliminar",
  verificarToken,
  exigirPermiso("REMUNERACIONES"),
  bloquearDemo("la eliminacion de AFP se habilita en la version contratada."),
  eliminarAFP
);

module.exports = router;
