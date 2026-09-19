/**
 * Los importadores del registro de compras y ventas ya no adivinan columnas.
 *
 * Esto nace de la factura 79386404 de enero de 2026, encontrada el 19-09-2026:
 * quedó registrada con todos los montos en cero mientras su asiento contable
 * tenía los 177.248 correctos, repartidos bien entre gasto, IVA y proveedor. La
 * causa es que los importadores leían `fila["Monto Neto"]` por nombre exacto, y
 * `convertirNumeroSII(undefined)` devuelve 0. Un encabezado apenas distinto
 * entraba completo, en cero, sin una sola advertencia. Es el hallazgo C-10.
 *
 * Lo que estas pruebas fijan:
 *
 * - Un archivo con encabezados razonables se reconoce, con tildes o sin ellas,
 *   en mayúsculas o minúsculas.
 * - Si falta una columna esencial, **no se importa nada** y se dicen los
 *   encabezados que traía el archivo.
 * - Una columna de monto ausente se distingue de un monto en cero.
 * - El mapeo manual manda sobre la detección automática.
 *
 *   DATABASE_URL=<staging o test> node --test test/importadores-columnas.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";

const {
  detectarColumnasSii,
  valorSegunMapeo,
  numeroSegunMapeo,
  leerMapeoManual,
  COLUMNAS_COMPRA,
  COLUMNAS_VENTA,
} = require("../src/helpers/siiCsv.helper");

// Los encabezados tal como vienen en el registro de compras del SII.
const ENCABEZADOS_COMPRA = [
  "Nro",
  "Tipo Doc",
  "Tipo Compra",
  "RUT Proveedor",
  "Razon Social",
  "Folio",
  "Fecha Docto",
  "Fecha Recepcion",
  "Monto Exento",
  "Monto Neto",
  "Monto IVA Recuperable",
  "Monto Iva No Recuperable",
  "Monto Total",
];

test("un archivo normal del SII se reconoce completo", () => {
  const r = detectarColumnasSii(ENCABEZADOS_COMPRA, COLUMNAS_COMPRA);

  assert.equal(r.faltan_obligatorios.length, 0);
  assert.equal(r.mapeo.total, "Monto Total");
  assert.equal(r.mapeo.neto, "Monto Neto");
  assert.equal(r.mapeo.iva, "Monto IVA Recuperable");
  assert.equal(r.mapeo.rut, "RUT Proveedor");
  assert.equal(r.mapeo.fecha, "Fecha Docto");
});

test("las tildes y las mayúsculas no cambian nada", () => {
  const r = detectarColumnasSii(
    ["TIPO DOC", "folio", "rut proveedor", "RAZÓN SOCIAL", "Fecha Emisión", "monto neto", "MONTO TOTAL"],
    COLUMNAS_COMPRA
  );

  assert.equal(r.faltan_obligatorios.length, 0);
  assert.equal(r.mapeo.razon_social, "RAZÓN SOCIAL");
  assert.equal(r.mapeo.fecha, "Fecha Emisión");
  assert.equal(r.mapeo.total, "MONTO TOTAL");
});

test("si falta una columna esencial se dice cuál, con su etiqueta en español", () => {
  // El archivo trae los montos pero no el folio ni el RUT.
  const r = detectarColumnasSii(
    ["Tipo Doc", "Fecha Docto", "Monto Neto", "Monto Total"],
    COLUMNAS_COMPRA
  );

  assert.deepEqual(r.faltan_obligatorios.sort(), ["Folio", "RUT del proveedor"]);

  const folio = r.faltantes.find((f) => f.campo === "folio");
  assert.ok(folio.nombres_esperados.includes("Folio"), "dice qué nombres buscó");
});

test("una columna de monto ausente no es lo mismo que un monto en cero", () => {
  // Este es exactamente el error de la factura 79386404: el archivo no trae la
  // columna y el código la leía como cero.
  const r = detectarColumnasSii(["Tipo Doc", "Folio", "RUT Proveedor", "Fecha Docto", "Monto Total"], COLUMNAS_COMPRA);
  const fila = { "Tipo Doc": "33", Folio: "79386404", "RUT Proveedor": "76134941-4", "Fecha Docto": "11/01/2026", "Monto Total": "177.248" };

  // El total sí viene.
  assert.equal(numeroSegunMapeo(fila, r.mapeo, "total"), 177248);
  // El neto no viene: null, no cero. Quien llama decide qué hacer.
  assert.equal(numeroSegunMapeo(fila, r.mapeo, "neto"), null);
  assert.equal(valorSegunMapeo(fila, r.mapeo, "neto"), undefined);
});

test("un monto que de verdad viene en cero se lee como cero", () => {
  const r = detectarColumnasSii(ENCABEZADOS_COMPRA, COLUMNAS_COMPRA);
  const fila = { "Monto Neto": "0", "Monto Total": "0" };

  assert.equal(numeroSegunMapeo(fila, r.mapeo, "neto"), 0);
});

test("el mapeo manual manda sobre la detección automática", () => {
  const encabezados = ["Tipo Doc", "Folio", "RUT Proveedor", "Fecha Docto", "Monto Total", "Valor Afecto"];
  const r = detectarColumnasSii(encabezados, COLUMNAS_COMPRA, { neto: "Valor Afecto" });

  assert.equal(r.mapeo.neto, "Valor Afecto");
  assert.ok(r.reconocidos.find((c) => c.campo === "neto").manual, "queda marcada como asignada a mano");
});

test("un mapeo manual que apunta a una columna inexistente se ignora", () => {
  // Si se aceptara, se leería undefined y volveríamos al cero silencioso.
  const r = detectarColumnasSii(ENCABEZADOS_COMPRA, COLUMNAS_COMPRA, { neto: "Columna Que No Existe" });

  assert.equal(r.mapeo.neto, "Monto Neto", "cae en la detección automática");
});

test("las tres escrituras del RUT del cliente se reconocen igual", () => {
  // El importador de ventas tenía tres variantes encadenadas a mano, y peor: el
  // documento leía "Rut cliente" mientras el tercero leía "RUT cliente", así que
  // podían discrepar sobre el mismo archivo.
  for (const escritura of ["RUT cliente", "RUT Cliente", "Rut cliente"]) {
    const r = detectarColumnasSii(
      ["Tipo Doc", "Folio", escritura, "Fecha Docto", "Monto Total"],
      COLUMNAS_VENTA
    );

    assert.equal(r.faltan_obligatorios.length, 0, `falló con "${escritura}"`);
    assert.equal(r.mapeo.rut, escritura);
  }
});

test("el mapeo manual ilegible se trata como si no viniera", () => {
  assert.deepEqual(leerMapeoManual('{"neto":"Valor"}'), { neto: "Valor" });
  assert.deepEqual(leerMapeoManual("{roto"), {});
  assert.deepEqual(leerMapeoManual(""), {});
  assert.deepEqual(leerMapeoManual(null), {});
});

test("un archivo sin encabezados no reconoce nada y lo dice", () => {
  const r = detectarColumnasSii([], COLUMNAS_COMPRA);

  assert.equal(Object.keys(r.mapeo).length, 0);
  assert.ok(r.faltan_obligatorios.length > 0);
});
