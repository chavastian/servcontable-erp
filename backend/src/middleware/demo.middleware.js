function continuarSinRestriccion(req, res, next) {
  return next();
}

function bloquearDemo() {
  return continuarSinRestriccion;
}

function limitarEmpresasDemo() {
  return continuarSinRestriccion;
}

function limitarCreacionDemoPorEmpresa(_opciones = {}) {
  return continuarSinRestriccion;
}

module.exports = {
  bloquearDemo,
  limitarEmpresasDemo,
  limitarCreacionDemoPorEmpresa,
};
