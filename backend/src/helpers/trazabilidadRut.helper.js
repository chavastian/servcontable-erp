const { normalizarRut } = require("./rut.helper");

function crearErrorValidacion(mensaje) {
  const error = new Error(mensaje);
  error.statusCode = 400;
  return error;
}

function normalizarRutDocumento(valor = "", etiqueta = "RUT") {
  const entrada = String(valor || "").trim();

  if (!entrada) {
    throw crearErrorValidacion(`Debes ingresar el ${etiqueta}.`);
  }

  const rut = normalizarRut(entrada);

  if (!rut.valido) {
    throw crearErrorValidacion(rut.error || `El ${etiqueta} no es valido.`);
  }

  return rut.rut;
}

function normalizarRutDocumentoOpcional(valor = "") {
  const entrada = String(valor || "").trim();

  if (!entrada) return "";

  const rut = normalizarRut(entrada);
  return rut.valido ? rut.rut : entrada;
}

function normalizarNombreTercero(valor = "") {
  return String(valor || "").trim();
}

module.exports = {
  normalizarRutDocumento,
  normalizarRutDocumentoOpcional,
  normalizarNombreTercero,
};
