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

  return TIPOS_SII[codigo] || `Documento SII ${codigo}`;
}

const TIPOS_SII = Object.freeze({
  "30": "Factura",
  "32": "Factura exenta",
  "33": "Factura afecta",
  "34": "Factura exenta",
  "39": "Boleta",
  "41": "Boleta exenta",
  "43": "Liquidación factura",
  "46": "Factura de compra",
  "52": "Guía de despacho",
  "55": "Nota de débito",
  "56": "Nota de débito",
  "60": "Nota de crédito",
  "61": "Nota de crédito",
  "110": "Factura de exportación",
  "111": "Nota de débito de exportación",
  "112": "Nota de crédito de exportación",
});

/**
 * Codigo SII a partir del texto del tipo, para las compras y ventas que se
 * digitan a mano. Sin codigo, el indice unico por documento no aplicaba y el
 * signo tributario dependia de que el texto dijera "nota de credito".
 */
function codigoSiiDesdeTipoDocumento(tipoDocumento) {
  const texto = String(tipoDocumento || "").trim();

  if (/^\d+$/.test(texto)) return texto;

  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (t.includes("nota de debito") || t.startsWith("nd")) return "56";
  if (t.includes("nota de credito") || t.startsWith("nc")) return "61";
  if (t.includes("factura de compra")) return "46";
  if (t.includes("exportacion")) return "110";
  if (t.includes("boleta") && t.includes("exent")) return "41";
  if (t.includes("boleta")) return "39";
  if (t.includes("factura") && t.includes("exent")) return "34";
  if (t.includes("factura")) return "33";
  if (t.includes("guia")) return "52";

  return null;
}

module.exports = {
  convertirFechaSII,
  convertirNumeroSII,
  obtenerPeriodoDesdeFecha,
  mapearTipoDocumentoSII,
  codigoSiiDesdeTipoDocumento,
  TIPOS_SII,
};