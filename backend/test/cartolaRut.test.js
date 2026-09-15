const assert = require("node:assert/strict");
const test = require("node:test");
const {
  __cartolaRutInternals,
} = require("../src/controllers/cartolaRut.controller");

test("normaliza RUT valido para cartola", () => {
  const filtro = __cartolaRutInternals.normalizarFiltroRut("87.949.500-8");

  assert.equal(filtro.esRut, true);
  assert.equal(filtro.rutLimpio, "879495008");
  assert.equal(filtro.rutFormateado, "87.949.500-8");
  assert.equal(filtro.error, "");
});

test("rechaza RUT con digito verificador invalido", () => {
  const filtro = __cartolaRutInternals.normalizarFiltroRut("16.153.127-9");

  assert.equal(filtro.esRut, true);
  assert.equal(filtro.rutLimpio, null);
  assert.match(filtro.error, /digito verificador/i);
});

test("permite busqueda por nombre sin tratarla como RUT", () => {
  const filtro = __cartolaRutInternals.normalizarFiltroRut("GLASSTECH");

  assert.equal(filtro.esRut, false);
  assert.equal(filtro.rutLimpio, null);
  assert.equal(filtro.error, "");
});

test("limita remuneraciones segun rol o permisos", () => {
  assert.equal(
    __cartolaRutInternals.puedeVerRemuneraciones({ rol: "superadmin" }),
    true
  );
  assert.equal(
    __cartolaRutInternals.puedeVerRemuneraciones({ rol: "usuario_cliente" }),
    false
  );
  assert.equal(
    __cartolaRutInternals.puedeVerRemuneraciones({
      rol: "usuario_cliente",
      permisos: ["ver_remuneraciones"],
    }),
    true
  );
});
