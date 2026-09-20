/**
 * El importador de boletas de honorarios contra el formato real del SII.
 *
 * Los alias originales se escribieron sin tener un archivo del SII a la vista, y
 * al investigar el formato real aparecieron tres diferencias que no son de
 * detalle:
 *
 * 1. **El estado no dice «anulada», dice `S` o `N`.** Leyendo solo texto, una
 *    boleta anulada entraba como vigente y se contabilizaba un honorario que no
 *    existe. Es el error más caro de los tres.
 * 2. **El RUT viene partido en dos columnas**, el número por un lado y el dígito
 *    verificador por otro. Juntos no estaban, así que el RUT quedaba incompleto.
 * 3. **No hay columna que diga quién retuvo.** Hay dos columnas de retención, y
 *    quien retuvo es el dueño de la que trae monto.
 *
 * Los nombres de campo del informe del SII son observados de su portal, no
 * documentados por el SII, que no publica el formato. Por eso el importador
 * sigue teniendo mapeo manual y sigue negándose cuando algo esencial falta: esto
 * amplía lo que reconoce, no reemplaza esa red de seguridad.
 *
 *   node --test test/bhe-formato-sii.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";

const {
  CAMPOS,
  detectarColumnas,
  leerFila,
  estaAnulada,
} = require("../src/helpers/bheSii.helper");
const { claveRut } = require("../src/helpers/terceros.helper");

// Las claves tal como las emite el informe mensual de boletas recibidas.
const ENCABEZADOS_SII = [
  "nroboleta",
  "fecha_boleta",
  "rutemisor",
  "dvemisor",
  "nombre_emisor",
  "totalhonorarios",
  "retencion_emisor",
  "retencion_receptor",
  "honorariosliquidos",
  "estado",
  "fechaanulacion",
  "es_soc_profesional",
];

function filaSii(extra = {}) {
  return {
    nroboleta: "1234",
    fecha_boleta: "15/03/2025",
    rutemisor: "12345678",
    dvemisor: "5",
    nombre_emisor: "JUAN PEREZ",
    totalhonorarios: "1.000.000",
    retencion_emisor: "0",
    retencion_receptor: "145.000",
    honorariosliquidos: "855.000",
    estado: "N",
    fechaanulacion: "",
    es_soc_profesional: "N",
    ...extra,
  };
}

test("el archivo del SII se reconoce completo, sin mapeo manual", () => {
  const r = detectarColumnas(ENCABEZADOS_SII);

  assert.equal(r.faltan_obligatorios.length, 0, JSON.stringify(r.faltan_obligatorios));
  assert.equal(r.mapeo.folio, "nroboleta");
  assert.equal(r.mapeo.fecha_emision, "fecha_boleta");
  assert.equal(r.mapeo.rut_prestador, "rutemisor");
  assert.equal(r.mapeo.dv_prestador, "dvemisor");
  assert.equal(r.mapeo.bruto, "totalhonorarios");
  assert.equal(r.mapeo.retencion_emisor, "retencion_emisor");
  assert.equal(r.mapeo.retencion_receptor, "retencion_receptor");
});

test("el RUT se arma juntando el número con su dígito verificador", () => {
  const r = detectarColumnas(ENCABEZADOS_SII);
  const { boleta, error } = leerFila(filaSii(), r.mapeo, 0);

  assert.equal(error, undefined, error);
  // El sistema lo guarda en su forma canónica, con puntos. Lo que importa es
  // que el dígito verificador llegó: sin él el RUT no identifica a nadie.
  assert.equal(claveRut(boleta.rut_prestador), "12345678-5");
  assert.ok(boleta.rut_prestador.endsWith("-5"));
});

test("sin la columna del dígito verificador el RUT queda incompleto y se rechaza", () => {
  // Antes de reconocer `dvemisor`, esto era lo que pasaba con todo el archivo.
  const r = detectarColumnas(ENCABEZADOS_SII.filter((e) => e !== "dvemisor"));
  const { error } = leerFila(filaSii(), r.mapeo, 0);

  assert.ok(error, "un RUT sin dígito verificador no puede pasar en silencio");
});

test("una boleta anulada del SII viene como S, y antes entraba como vigente", () => {
  // Este es el error que motivó la prueba: 'S' no contiene "anulad", así que la
  // lectura por texto la daba por vigente.
  assert.equal(estaAnulada("S"), true);
  assert.equal(estaAnulada("N"), false);
  // Y las formas de otros archivos siguen funcionando.
  assert.equal(estaAnulada("ANULADA"), true);
  assert.equal(estaAnulada("Vigente"), false);
  assert.equal(estaAnulada(""), false);

  const r = detectarColumnas(ENCABEZADOS_SII);
  const { boleta } = leerFila(filaSii({ estado: "S" }), r.mapeo, 0);

  assert.equal(boleta.anulada, true);
});

test("la fecha de anulación basta para saber que está anulada", () => {
  // Por si la columna de estado no se reconoció.
  assert.equal(estaAnulada("", "2025-04-01"), true);

  const r = detectarColumnas(ENCABEZADOS_SII);
  const { boleta } = leerFila(
    filaSii({ estado: "", fechaanulacion: "01/04/2025" }),
    r.mapeo,
    0
  );

  assert.equal(boleta.anulada, true);
});

test("quién retuvo se deduce de cuál columna de retención trae monto", () => {
  const r = detectarColumnas(ENCABEZADOS_SII);

  // Retuvo el receptor, que es el caso normal: la empresa retiene.
  const normal = leerFila(filaSii(), r.mapeo, 0);
  assert.equal(normal.boleta.emisor_retiene, false);
  assert.equal(normal.boleta.retencion, 145000);

  // Retuvo el emisor: la empresa no retiene nada.
  const delEmisor = leerFila(
    filaSii({ retencion_emisor: "145.000", retencion_receptor: "0" }),
    r.mapeo,
    0
  );
  assert.equal(delEmisor.boleta.emisor_retiene, true);
  assert.equal(delEmisor.boleta.retencion, 0);
  assert.ok(
    delEmisor.avisos.some((a) => /cargo del emisor/i.test(a)),
    "lo avisa, porque cambia lo que se declara"
  );
});

test("una sociedad de profesionales emite sin retención", () => {
  const r = detectarColumnas(ENCABEZADOS_SII);
  const { boleta, avisos } = leerFila(
    filaSii({ es_soc_profesional: "S", retencion_receptor: "0", honorariosliquidos: "1.000.000" }),
    r.mapeo,
    0
  );

  assert.equal(boleta.sociedad_profesional, true);
  assert.equal(boleta.retencion, 0);
  assert.ok(avisos.some((a) => /sociedad de profesionales/i.test(a)));
});

test("la fecha de pago no viene en el archivo del SII y el campo lo dice", () => {
  const campo = CAMPOS.find((c) => c.campo === "fecha_pago");

  assert.ok(campo, "el campo existe");
  assert.equal(campo.obligatorio, false, "no puede ser obligatorio: el SII no lo trae");

  const r = detectarColumnas(ENCABEZADOS_SII);
  assert.equal(r.mapeo.fecha_pago, undefined, "no se mapea con el archivo del SII");

  const { boleta } = leerFila(filaSii(), r.mapeo, 0);
  assert.equal(boleta.fecha_pago, null, "queda nula, no inventada");
});

test("los montos con puntos y las fechas chilenas se leen bien", () => {
  const r = detectarColumnas(ENCABEZADOS_SII);
  const { boleta } = leerFila(filaSii(), r.mapeo, 0);

  assert.equal(boleta.bruto, 1000000);
  assert.equal(boleta.liquido, 855000);
  // 15 de marzo, no 3 de mayo.
  assert.equal(boleta.fecha_emision, "2025-03-15");
});

test("si falta una columna esencial se sigue negando", () => {
  // La red de seguridad no se toca: estos alias son observados, no oficiales.
  const r = detectarColumnas(["nroboleta", "fecha_boleta", "totalhonorarios"]);

  assert.ok(r.faltan_obligatorios.length > 0);
  assert.ok(r.faltan_obligatorios.some((f) => /RUT/i.test(f)));
});
