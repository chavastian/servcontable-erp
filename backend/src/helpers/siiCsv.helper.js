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

/**
 * Las columnas que los importadores del registro de compras y ventas necesitan,
 * con los nombres que el SII ha usado.
 *
 * Esto existe por la factura 79386404 de enero de 2026: quedó registrada con
 * todos los montos en cero mientras su asiento contable tenía los 177.248
 * correctos. La causa es que los importadores leían `fila["Monto Neto"]` por
 * nombre exacto, y `convertirNumeroSII(undefined)` devuelve 0. Un archivo con el
 * encabezado apenas distinto entraba completo, en cero, sin una sola advertencia,
 * y el error aparecía recién en el F29. Es el hallazgo C-10 del informe.
 *
 * Que el nombre exacto no sirve ya estaba a la vista: el importador de ventas
 * tenía tres variantes de «RUT Cliente» encadenadas con `||` y un «Monto total»
 * en minúscula. Cada una es una vez que alguien se topó con esto y lo parchó
 * donde le dolía.
 */
const COLUMNAS_COMPRA = Object.freeze([
  { campo: "tipo_doc", etiqueta: "Tipo de documento", obligatorio: true, alias: ["Tipo Doc", "Tipo Documento", "Tipo DTE"] },
  { campo: "folio", etiqueta: "Folio", obligatorio: true, alias: ["Folio", "Nro Folio", "Numero Folio"] },
  { campo: "rut", etiqueta: "RUT del proveedor", obligatorio: true, alias: ["RUT Proveedor", "Rut Proveedor", "RUT del Proveedor"] },
  { campo: "razon_social", etiqueta: "Razón social", obligatorio: false, alias: ["Razon Social", "Razón Social", "Razon Social Proveedor"] },
  { campo: "fecha", etiqueta: "Fecha del documento", obligatorio: true, alias: ["Fecha Docto", "Fecha Documento", "Fecha Emision", "Fecha Emisión"] },
  { campo: "neto", etiqueta: "Monto neto", obligatorio: false, alias: ["Monto Neto", "Neto"] },
  { campo: "exento", etiqueta: "Monto exento", obligatorio: false, alias: ["Monto Exento", "Exento"] },
  { campo: "iva", etiqueta: "IVA recuperable", obligatorio: false, alias: ["Monto IVA Recuperable", "Monto IVA", "IVA Recuperable", "IVA"] },
  { campo: "iva_no_recuperable", etiqueta: "IVA no recuperable", obligatorio: false, alias: ["Monto Iva No Recuperable", "Monto IVA No Recuperable", "IVA No Recuperable"] },
  { campo: "total", etiqueta: "Monto total", obligatorio: true, alias: ["Monto Total", "Monto total", "Total"] },
]);

const COLUMNAS_VENTA = Object.freeze([
  { campo: "tipo_doc", etiqueta: "Tipo de documento", obligatorio: true, alias: ["Tipo Doc", "Tipo Documento", "Tipo DTE"] },
  { campo: "folio", etiqueta: "Folio", obligatorio: true, alias: ["Folio", "Nro Folio", "Numero Folio"] },
  { campo: "rut", etiqueta: "RUT del cliente", obligatorio: true, alias: ["RUT Cliente", "Rut Cliente", "RUT del Cliente"] },
  { campo: "razon_social", etiqueta: "Razón social", obligatorio: false, alias: ["Razon Social", "Razón Social", "Razon Social Cliente"] },
  { campo: "fecha", etiqueta: "Fecha del documento", obligatorio: true, alias: ["Fecha Docto", "Fecha Documento", "Fecha Emision", "Fecha Emisión"] },
  { campo: "neto", etiqueta: "Monto neto", obligatorio: false, alias: ["Monto Neto", "Neto"] },
  { campo: "exento", etiqueta: "Monto exento", obligatorio: false, alias: ["Monto Exento", "Exento"] },
  { campo: "iva", etiqueta: "IVA", obligatorio: false, alias: ["Monto IVA", "IVA", "Monto IVA Debito"] },
  { campo: "total", etiqueta: "Monto total", obligatorio: true, alias: ["Monto Total", "Monto total", "Total"] },
]);

/** Compara nombres de columna ignorando tildes, mayúsculas y puntuación. */
function normalizarEncabezado(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Qué columna del archivo corresponde a cada dato. `mapeoManual` permite que una
 * persona asigne a mano lo que el reconocimiento no encontró, y manda sobre la
 * detección automática: si el SII vuelve a cambiar un encabezado, se resuelve en
 * la pantalla y no hay que tocar el sistema.
 */
function detectarColumnasSii(encabezados, especificacion, mapeoManual = {}) {
  const disponibles = (encabezados || []).filter((e) => String(e || "").trim() !== "");
  const porNormal = new Map(disponibles.map((e) => [normalizarEncabezado(e), e]));

  const mapeo = {};
  const reconocidos = [];
  const faltantes = [];

  for (const columna of especificacion) {
    const manual = mapeoManual[columna.campo];

    if (manual && disponibles.includes(manual)) {
      mapeo[columna.campo] = manual;
      reconocidos.push({ ...columna, columna: manual, manual: true });
      continue;
    }

    let encontrada;

    for (const alias of columna.alias) {
      const candidata = porNormal.get(normalizarEncabezado(alias));

      if (candidata !== undefined) {
        encontrada = candidata;
        break;
      }
    }

    if (encontrada !== undefined) {
      mapeo[columna.campo] = encontrada;
      reconocidos.push({ ...columna, columna: encontrada, manual: false });
    } else {
      faltantes.push({ campo: columna.campo, etiqueta: columna.etiqueta, obligatorio: columna.obligatorio, nombres_esperados: columna.alias });
    }
  }

  return {
    mapeo,
    reconocidos,
    faltantes,
    faltan_obligatorios: faltantes.filter((f) => f.obligatorio).map((f) => f.etiqueta),
  };
}

/**
 * El valor de un dato en una fila, según el mapeo. Devuelve `undefined` cuando
 * la columna no está mapeada, que no es lo mismo que cero: quien llama decide.
 */
function valorSegunMapeo(fila, mapeo, campo) {
  const columna = mapeo[campo];

  if (columna === undefined) return undefined;

  return fila[columna];
}

/** Un número, o `null` si la columna no existe en el archivo. */
function numeroSegunMapeo(fila, mapeo, campo) {
  const valor = valorSegunMapeo(fila, mapeo, campo);

  return valor === undefined ? null : convertirNumeroSII(valor);
}

/**
 * El mapeo manual que viene en el formulario. Llega como texto porque va junto a
 * un archivo; un mapeo ilegible se trata como si no viniera, para que un error de
 * escritura no impida importar con la detección automática.
 */
function leerMapeoManual(valor) {
  if (!valor) return {};

  try {
    const mapeo = typeof valor === "string" ? JSON.parse(valor) : valor;

    return mapeo && typeof mapeo === "object" ? mapeo : {};
  } catch {
    return {};
  }
}

module.exports = {
  leerColumnasRcv,
  buscarColumna,
  convertirFechaSII,
  convertirNumeroSII,
  obtenerPeriodoDesdeFecha,
  mapearTipoDocumentoSII,
  codigoSiiDesdeTipoDocumento,
  detectarColumnasSii,
  normalizarEncabezado,
  valorSegunMapeo,
  numeroSegunMapeo,
  leerMapeoManual,
  COLUMNAS_COMPRA,
  COLUMNAS_VENTA,
  TIPOS_SII,
};