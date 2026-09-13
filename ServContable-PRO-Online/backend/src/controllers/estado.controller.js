function obtenerEstado(req, res) {
  res.json({
    sistema: "ServContable PRO Web",
    backend: "Activo",
    version: "1.0.0",
  });
}

function obtenerInicio(req, res) {
  res.json({
    mensaje: "API ServContable PRO funcionando correctamente",
    estado: "OK",
  });
}

module.exports = {
  obtenerEstado,
  obtenerInicio,
  obtenerEstadoPrivado,
};

function obtenerEstadoPrivado(req, res) {
  res.json({
    mensaje: "Acceso autorizado a ruta protegida",
    usuario: req.usuario,
  });
}