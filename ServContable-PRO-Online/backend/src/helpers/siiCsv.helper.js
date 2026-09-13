function convertirFechaSII(fechaTexto) {
  if (!fechaTexto) return null;

  const limpia = String(fechaTexto).trim();

  // Formato SII: dd/mm/yyyy
  const partes = limpia.split("/");

  if (partes.length !== 3) {
    return null;
  }

  const [dia, mes, anio] = partes;

  return `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

function convertirNumeroSII(valor) {
  if (valor === null || valor === undefined) return 0;

  const limpio = String(valor)
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .trim();

  const numero = Number(limpio);

  return Number.isNaN(numero) ? 0 : numero;
}

function obtenerPeriodoDesdeFecha(fechaISO) {
  if (!fechaISO) return "";

  return fechaISO.substring(0, 7);
}

function mapearTipoDocumentoSII(tipoDoc) {
  const codigo = String(tipoDoc || "").trim();

  const mapa = {
    "33": "Factura afecta",
    "34": "Factura exenta",
    "39": "Boleta",
    "41": "Boleta exenta",
    "56": "Nota de débito",
    "61": "Nota de crédito",
  };

  return mapa[codigo] || `Documento SII ${codigo}`;
}

module.exports = {
  convertirFechaSII,
  convertirNumeroSII,
  obtenerPeriodoDesdeFecha,
  mapearTipoDocumentoSII,
};