/**
 * Lógica del aviso de suscripción que ve el usuario.
 *
 * Vive en el frontend pero se prueba desde acá porque el proyecto no tiene
 * corredor de pruebas de interfaz: la función es JavaScript puro y lo que
 * importa verificar es la decisión de negocio, no el dibujo.
 *
 * Lo que sostiene: el aviso aparece cuando hay algo que decir y calla cuando no,
 * porque un aviso permanente se vuelve invisible.
 *
 *   node --test test/avisoSuscripcionFrontend.test.js
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// El archivo del frontend usa módulos de ES. Se carga quitando el export, que es
// la única línea que Node no entiende en formato CommonJS.
const RUTA = path.join(
  __dirname,
  "..",
  "..",
  "frontend",
  "src",
  "utils",
  "avisoSuscripcion.js"
);

const fuente = fs
  .readFileSync(RUTA, "utf8")
  .replace(/^export\s*\{[^}]*\};?\s*$/m, "")
  .concat("\nmodule.exports = { contenidoDelAviso, formatearFecha, numeroONulo };\n");

const contexto = { module: { exports: {} }, console };
contexto.exports = contexto.module.exports;
vm.createContext(contexto);
vm.runInContext(fuente, contexto);

const { contenidoDelAviso } = contexto.module.exports;

test("una suscripcion vigente y holgada no muestra nada", () => {
  // Un aviso permanente se vuelve invisible.
  assert.equal(
    contenidoDelAviso({ estado: "ACTIVE", dias_restantes: 45, vence: "2026-12-31" }),
    null
  );
  assert.equal(contenidoDelAviso({ estado: "ACTIVE", dias_restantes: 11 }), null);
  assert.equal(contenidoDelAviso(null), null);
  assert.equal(contenidoDelAviso({}), null);
});

test("avisa cuando faltan diez dias o menos", () => {
  const aviso = contenidoDelAviso({
    estado: "ACTIVE",
    dias_restantes: 10,
    vence: "2026-10-01",
  });

  assert.ok(aviso, "con diez dias ya debe avisar");
  assert.match(aviso.titulo, /10 d[ií]as/);
  assert.equal(aviso.tono, "aviso");
  assert.match(aviso.accion, /renovar/i);
});

test("el tono se vuelve urgente en los ultimos tres dias", () => {
  assert.equal(contenidoDelAviso({ estado: "ACTIVE", dias_restantes: 4 }).tono, "aviso");
  assert.equal(contenidoDelAviso({ estado: "ACTIVE", dias_restantes: 3 }).tono, "urgente");
  assert.equal(contenidoDelAviso({ estado: "ACTIVE", dias_restantes: 1 }).tono, "urgente");
});

test("el dia del vencimiento lo dice sin rodeos", () => {
  const aviso = contenidoDelAviso({ estado: "ACTIVE", dias_restantes: 0 });

  assert.match(aviso.titulo, /vence hoy/i);
  assert.equal(aviso.tono, "urgente");
});

test("en dias de gracia dice cuantos quedan", () => {
  const aviso = contenidoDelAviso({
    estado: "PAST_DUE",
    dias_restantes: -2,
    grace_remaining: 3,
    vence: "2026-09-17",
  });

  assert.match(aviso.titulo, /venci[oó]/i);
  assert.match(aviso.texto, /3 d[ií]as/);
  assert.equal(aviso.tono, "urgente");
});

test("en gracia sin dias restantes no inventa un numero", () => {
  const aviso = contenidoDelAviso({ estado: "PAST_DUE", grace_remaining: 0 });

  assert.ok(aviso);
  assert.ok(
    !/\d+ d[ií]as? m[aá]s/.test(aviso.texto),
    `no debe prometer dias que no hay: ${aviso.texto}`
  );
});

test("la prueba gratuita se anuncia como prueba, no como impago", () => {
  const aviso = contenidoDelAviso({
    estado: "TRIAL",
    dias_restantes: 5,
    trial_vence: "2026-09-24",
  });

  assert.match(aviso.titulo, /prueba/i);
  assert.match(aviso.accion, /contratar/i);
  assert.match(aviso.texto, /datos queda/i, "tranquiliza sobre los datos");
});

test("una prueba con mas de diez dias por delante no molesta", () => {
  assert.equal(contenidoDelAviso({ estado: "TRIAL", dias_restantes: 25 }), null);
});

test("el ultimo dia de la prueba se avisa", () => {
  const aviso = contenidoDelAviso({ estado: "TRIAL", dias_restantes: 0 });

  assert.match(aviso.titulo, /termina hoy/i);
  assert.equal(aviso.tono, "urgente");
});

test("acepta el campo status ademas de estado", () => {
  // La sesion del backend informa las dos formas segun el endpoint.
  const aviso = contenidoDelAviso({ status: "PAST_DUE", grace_remaining: 2 });

  assert.ok(aviso);
  assert.match(aviso.texto, /2 d[ií]as/);
});

test("un numero de dias no valido no rompe el aviso", () => {
  assert.equal(contenidoDelAviso({ estado: "ACTIVE", dias_restantes: null }), null);
  assert.equal(contenidoDelAviso({ estado: "ACTIVE", dias_restantes: "muchos" }), null);
  assert.equal(contenidoDelAviso({ estado: "TRIAL", dias_restantes: undefined }), null);
});

test("una suscripcion ya vencida sin gracia no cae en el aviso de dias", () => {
  // Ese caso lo cubre la pantalla de renovacion completa, no la barra.
  assert.equal(contenidoDelAviso({ estado: "ACTIVE", dias_restantes: -5 }), null);
});
