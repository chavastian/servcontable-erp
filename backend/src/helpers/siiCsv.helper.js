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

/**
 * Columnas del registro de compras del SII que definen el tratamiento del IVA.
 * Los nombres varian entre exportaciones (mayusculas, tildes, puntos), asi que
 * se busca sin distinguir. Lo que no venga queda en cero o nulo.
 */
function buscarColumna(fila, nombres) {
  const claves = Object.keys(fila || {});
  const normal = (t) =>
    String(t || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  for (const nombre of nombres) {
    const buscado = normal(nombre);
    const clave = claves.find((k) => normal(k) === buscado);

    if (clave !== undefined) return fila[clave];
  }

  return undefined;
}

function leerColumnasRcv(fila) {
  const codigoNoRec = String(buscarColumna(fila, ["Codigo IVA No Rec.", "Codigo IVA No Rec", "Código IVA No Rec."]) || "").trim();
  const fechaRecepcion = buscarColumna(fila, ["Fecha Recepcion", "Fecha Recepción"]);

  return {
    tipo_compra: String(buscarColumna(fila, ["Tipo Compra"]) || "").trim() || null,
    codigo_iva_no_rec: /^\d+$/.test(codigoNoRec) ? Number(codigoNoRec) : null,
    iva_uso_comun: convertirNumeroSII(buscarColumna(fila, ["IVA Uso Comun", "IVA uso Común", "Monto IVA Uso Comun"])),
    neto_activo_fijo: convertirNumeroSII(buscarColumna(fila, ["Monto Neto Activo Fijo", "Neto Activo Fijo"])),
    iva_activo_fijo: convertirNumeroSII(buscarColumna(fila, ["IVA Activo Fijo", "Monto IVA Activo Fijo"])),
    iva_no_retenido: convertirNumeroSII(buscarColumna(fila, ["IVA No Retenido"])),
    codigo_otro_impuesto: String(buscarColumna(fila, ["Codigo Otro Impuesto", "Código Otro Impuesto"]) || "").trim() || null,
    tasa_otro_impuesto: convertirNumeroSII(buscarColumna(fila, ["Tasa Otro Impuesto"])) || null,
    fecha_recepcion: fechaRecepcion ? convertirFechaSII(fechaRecepcion) : null,
  };
}

module.exports = {
  leerColumnasRcv,
  buscarColumna,
  convertirFechaSII,
  convertirNumeroSII,
  obtenerPeriodoDesdeFecha,
  mapearTipoDocumentoSII,
  codigoSiiDesdeTipoDocumento,
  TIPOS_SII,
};