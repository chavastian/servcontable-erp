/**
 * Bloque 10 de la revisión del 19-09-2026: módulo 11, boletas de honorarios
 * electrónicas del SII.
 *
 * Lo que estas pruebas fijan, y es el punto del módulo:
 *
 * - Si una columna esencial no se reconoce, NO se importa nada. Se devuelven
 *   los encabezados del archivo para asignarlos a mano. Importar con montos en
 *   cero porque un nombre no calzó es el error que el registro de compras ya
 *   tuvo (hallazgo C-10) y no se repite.
 * - El mapeo manual funciona con encabezados que el sistema no conoce.
 * - Una boleta cuya retención es de cargo del emisor no genera retención.
 * - El cruce distingue lo nuevo, lo que coincide, lo que difiere en monto y lo
 *   que está en el sistema y no en el SII. Lo que difiere no se pisa.
 *
 *   DATABASE_URL=<staging o test> node --test test/bloque10.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_bloque10_no_produccion_32_cara";
process.env.COBRANZA_AUTOMATICA = "false";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");
const {
  detectarColumnas,
  numeroChileno,
  fechaChilena,
  retieneElEmisor,
  estaAnulada,
} = require("../src/helpers/bheSii.helper");

const SUFIJO = `b10${Date.now().toString().slice(-7)}`;
const CLAVE = "Bloque10-2026";
const CORREO = `${SUFIJO}@test.local`;
const ctx = {};

async function subir(ruta, csv, extra = {}) {
  const formulario = new FormData();

  formulario.append("empresa_id", String(ctx.empresa));
  formulario.append("archivo", new Blob([csv], { type: "text/csv" }), "bhe.csv");

  for (const [clave, valor] of Object.entries(extra)) {
    formulario.append(clave, typeof valor === "string" ? valor : JSON.stringify(valor));
  }

  const respuesta = await fetch(`${ctx.raiz}${ruta}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.token}` },
    body: formulario,
  });

  return { status: respuesta.status, datos: await respuesta.json().catch(() => ({})) };
}

async function pedir(ruta) {
  const respuesta = await fetch(`${ctx.raiz}${ruta}`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });

  return { status: respuesta.status, datos: await respuesta.json().catch(() => ({})) };
}

test.before(async () => {
  const base = (await pool.query("SELECT current_database() AS d")).rows[0].d;

  if (!/test|staging/i.test(base)) {
    throw new Error(`La base "${base}" no es de pruebas.`);
  }

  ctx.empresa = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa) VALUES ($1, $2, true) RETURNING id`,
      [`BA${SUFIJO}-1`, `Empresa bloque10 ${SUFIJO}`]
    )
  ).rows[0].id;

  // Una boleta ya registrada a mano, con el mismo folio que traerá el archivo
  // pero con otro monto: el cruce tiene que detectarla y no pisarla.
  await pool.query(
    `INSERT INTO honorarios
       (empresa_id, periodo, fecha_emision, tipo_documento, folio, rut_prestador,
        nombre_prestador, bruto, tasa_retencion, retencion, liquido, estado, origen)
     VALUES ($1, '2039-03', '2039-03-05', 'Boleta de Honorarios', '500', '11111111-1',
             'Ana Prestadora', 900000, 15.25, 137250, 762750, 'vigente', 'manual'),
            ($1, '2039-03', '2039-03-06', 'Boleta de Honorarios', '999', '22222222-2',
             'Solo en el sistema', 100000, 15.25, 15250, 84750, 'vigente', 'manual')`,
    [ctx.empresa]
  );

  const hash = await bcrypt.hash(CLAVE, 10);
  ctx.usuario = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Bloque10', $1, $2, 'admin_cliente', true) RETURNING id`,
      [CORREO, hash]
    )
  ).rows[0].id;
  await pool.query(
    `INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo)
     VALUES ($1, $2, 'OWNER', true)`,
    [ctx.usuario, ctx.empresa]
  );
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_id, status, billing_cycle, price, currency, starts_at, expires_at, auto_renew, grace_days)
     SELECT $1, sp.id, 'ACTIVE', 'monthly', sp.monthly_price, 'CLP', CURRENT_DATE, CURRENT_DATE + 365, true, 5
     FROM subscription_plans sp WHERE sp.active = true ORDER BY sp.id LIMIT 1`,
    [ctx.usuario]
  );

  const iniciado = await iniciarServidor({ host: "127.0.0.1", port: 0 });
  ctx.server = iniciado.server;
  ctx.raiz = `http://127.0.0.1:${iniciado.port}`;

  const login = await fetch(`${ctx.raiz}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: CORREO, password: CLAVE }),
  });
  ctx.token = (await login.json()).token;
  assert.ok(ctx.token);
});

test.after(async () => {
  if (ctx.server) await detenerServidor(ctx.server);
});

// ---------------------------------------------------------- las piezas

test("los números y las fechas se leen como los escribe el SII", () => {
  assert.equal(numeroChileno("1.234.567"), 1234567);
  assert.equal(numeroChileno("$ 850.000"), 850000);
  assert.equal(numeroChileno("1234567,89"), 1234567.89);
  assert.equal(numeroChileno(""), 0);
  assert.equal(numeroChileno("no es un número"), 0);

  assert.equal(fechaChilena("05-03-2039"), "2039-03-05");
  assert.equal(fechaChilena("5/3/2039"), "2039-03-05");
  assert.equal(fechaChilena("2039-03-05"), "2039-03-05");
  assert.equal(fechaChilena("cualquier cosa"), null);

  assert.equal(retieneElEmisor("Emisor"), true);
  assert.equal(retieneElEmisor("Retiene el contribuyente"), true);
  assert.equal(retieneElEmisor("Receptor"), false);
  assert.equal(retieneElEmisor(""), false);
  assert.equal(estaAnulada("Anulada"), true);
  assert.equal(estaAnulada("Vigente"), false);
});

test("las columnas se reconocen sin importar tildes ni mayúsculas", () => {
  const deteccion = detectarColumnas([
    "RUT EMISOR",
    "Nombre Emisor",
    "FOLIO",
    "Fecha Emisión",
    "Monto Bruto",
    "Retención",
  ]);

  assert.equal(deteccion.mapeo.rut_prestador, "RUT EMISOR");
  assert.equal(deteccion.mapeo.fecha_emision, "Fecha Emisión");
  assert.equal(deteccion.mapeo.retencion, "Retención");
  assert.equal(deteccion.faltan_obligatorios.length, 0);

  // Un archivo con nombres desconocidos no se puede leer solo.
  const desconocido = detectarColumnas(["Col1", "Col2", "Col3"]);
  assert.ok(desconocido.faltan_obligatorios.includes("rut_prestador"));
  assert.ok(desconocido.faltan_obligatorios.includes("bruto"));

  // Con mapeo manual, sí.
  const conMapeo = detectarColumnas(["Col1", "Col2", "Col3", "Col4", "Col5"], {
    rut_prestador: "Col1",
    folio: "Col2",
    fecha_emision: "Col3",
    bruto: "Col4",
  });
  assert.equal(conMapeo.faltan_obligatorios.length, 0);
  assert.equal(conMapeo.mapeo.bruto, "Col4");
  assert.ok(conMapeo.reconocidos.some((r) => r.origen === "manual"));
});

test("los campos del importador se pueden consultar para armar el mapeo", async () => {
  const { status, datos } = await pedir("/api/honorarios/bhe/campos");

  assert.equal(status, 200);
  const obligatorios = datos.campos.filter((c) => c.obligatorio).map((c) => c.campo);
  assert.deepEqual(obligatorios.sort(), ["bruto", "fecha_emision", "folio", "rut_prestador"]);
  assert.match(datos.aviso, /cambia/i);
});

// ------------------------------------------------------- la importación

test("un archivo con columnas desconocidas no importa nada y pide el mapeo", async () => {
  const csv = ["Columna A;Columna B;Columna C", "11111111-1;500;850000"].join("\n");

  const revisar = await subir("/api/honorarios/bhe/revisar", csv);

  assert.equal(revisar.status, 400, JSON.stringify(revisar.datos).slice(0, 300));
  assert.match(revisar.datos.error, /montos en cero/i);
  assert.deepEqual(revisar.datos.encabezados_del_archivo, ["Columna A", "Columna B", "Columna C"]);
  assert.ok(revisar.datos.columnas.faltan_obligatorios.length > 0);

  // Y tampoco importa.
  const importar = await subir("/api/honorarios/bhe/importar", csv);
  assert.equal(importar.status, 400);

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM honorarios WHERE empresa_id = $1 AND origen = 'sii'`,
    [ctx.empresa]
  );
  assert.equal(rows[0].n, 0, "no entró nada");
});

test("con el mapeo manual el mismo archivo desconocido se importa bien", async () => {
  const csv = [
    "Columna A;Columna B;Columna C;Columna D",
    "16.153.127-8;700;05-03-2039;1.000.000",
  ].join("\n");

  const { status, datos } = await subir("/api/honorarios/bhe/importar", csv, {
    mapeo: {
      rut_prestador: "Columna A",
      folio: "Columna B",
      fecha_emision: "Columna C",
      bruto: "Columna D",
    },
  });

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 300));
  assert.equal(datos.insertadas, 1);

  const { rows } = await pool.query(
    `SELECT rut_prestador, bruto, retencion, tasa_retencion, periodo, origen
     FROM honorarios WHERE empresa_id = $1 AND folio = '700'`,
    [ctx.empresa]
  );

  assert.equal(rows[0].rut_prestador, "16.153.127-8");
  assert.equal(Math.round(Number(rows[0].bruto)), 1000000);
  // Sin retención en el archivo, se calcula con la tasa vigente a la fecha.
  assert.ok(Number(rows[0].retencion) > 0);
  assert.equal(rows[0].periodo, "2039-03");
  assert.equal(rows[0].origen, "sii");
});

test("una fila con el bruto en cero se rechaza en lugar de entrar vacía", async () => {
  const csv = [
    "RUT Emisor;Folio;Fecha Emision;Monto Bruto",
    "11111111-1;800;05-03-2039;0",
    "11111111-1;801;05-03-2039;500.000",
  ].join("\n");

  const { status, datos } = await subir("/api/honorarios/bhe/revisar", csv);

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));
  assert.equal(datos.filas_leidas, 1, "solo la que tiene monto");
  assert.equal(datos.filas_con_error, 1);
  assert.match(datos.errores[0], /bruto qued[óo] en cero/i);
});

test("si la retención es de cargo del emisor, la empresa no retiene", async () => {
  const csv = [
    "RUT Emisor;Nombre Emisor;Folio;Fecha Emision;Monto Bruto;Retencion;Tipo Retencion",
    "16.153.127-8;Marta Consultora;900;10-03-2039;600.000;0;Emisor",
  ].join("\n");

  const { status, datos } = await subir("/api/honorarios/bhe/importar", csv);

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 300));
  assert.ok(
    datos.avisos.some((aviso) => /cargo del emisor/i.test(aviso)),
    "lo dice explícitamente"
  );

  const { rows } = await pool.query(
    `SELECT bruto, retencion, tasa_retencion, liquido, emisor_retiene
     FROM honorarios WHERE empresa_id = $1 AND folio = '900'`,
    [ctx.empresa]
  );

  assert.equal(Math.round(Number(rows[0].retencion)), 0, "no retiene nada");
  assert.equal(Math.round(Number(rows[0].tasa_retencion)), 0);
  assert.equal(Math.round(Number(rows[0].liquido)), 600000);
  assert.equal(rows[0].emisor_retiene, true);
});

test("el cruce separa lo nuevo, lo que difiere y lo que solo está en el sistema", async () => {
  const csv = [
    "RUT Emisor;Nombre Emisor;Folio;Fecha Emision;Monto Bruto;Retencion",
    // Ya registrada a mano con 900.000: difiere.
    "11111111-1;Ana Prestadora;500;05-03-2039;850.000;129.625",
    // Nueva.
    "11111111-1;Ana Prestadora;501;06-03-2039;200.000;30.500",
  ].join("\n");

  const revisar = await subir("/api/honorarios/bhe/revisar", csv);

  assert.equal(revisar.status, 200, JSON.stringify(revisar.datos).slice(0, 300));
  assert.equal(revisar.datos.cruce.nuevas, 1);
  assert.equal(revisar.datos.cruce.difieren, 1);
  // La 999 está registrada y no viene en el archivo.
  assert.ok(revisar.datos.cruce.solo_en_sistema >= 1);

  const diferencia = revisar.datos.detalle.difieren[0];
  assert.equal(diferencia.folio, "500");
  assert.equal(diferencia.bruto_registrado, 900000);
  assert.equal(diferencia.bruto, 850000);
  assert.equal(diferencia.diferencia_bruto, 50000);

  const importar = await subir("/api/honorarios/bhe/importar", csv);

  assert.equal(importar.status, 201);
  assert.equal(importar.datos.insertadas, 1, "solo la nueva");
  assert.match(importar.datos.aviso_diferencias, /REQUIERE VALIDACI[ÓO]N/);

  // La que difería quedó como estaba: no se pisa un monto registrado.
  const { rows } = await pool.query(
    `SELECT bruto, origen FROM honorarios WHERE empresa_id = $1 AND folio = '500'`,
    [ctx.empresa]
  );
  assert.equal(Math.round(Number(rows[0].bruto)), 900000);
  assert.equal(rows[0].origen, "manual");
});

test("una boleta anulada en el SII entra anulada y no se declara", async () => {
  const csv = [
    "RUT Emisor;Folio;Fecha Emision;Monto Bruto;Estado",
    "11111111-1;600;15-03-2039;400.000;Anulada",
  ].join("\n");

  const { status, datos } = await subir("/api/honorarios/bhe/importar", csv);

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 300));
  assert.equal(datos.anuladas, 1);

  const { rows } = await pool.query(
    `SELECT estado FROM honorarios WHERE empresa_id = $1 AND folio = '600'`,
    [ctx.empresa]
  );
  assert.equal(rows[0].estado, "anulado");

  // Y por lo tanto no aparece en la declaración jurada 1879.
  const dj = await pedir(`/api/declaraciones-juradas/1879?empresa_id=${ctx.empresa}&anio=2039`);
  const folios = JSON.stringify(dj.datos);
  assert.ok(!folios.includes('"folio":"600"'));
});

test("reimportar el mismo archivo no duplica nada", async () => {
  // El mismo archivo, con la retención incluida: así el cruce lo reconoce como
  // idéntico y no como una diferencia de monto.
  const csv = [
    "RUT Emisor;Nombre Emisor;Folio;Fecha Emision;Monto Bruto;Retencion",
    "11111111-1;Ana Prestadora;501;06-03-2039;200.000;30.500",
  ].join("\n");

  const { status, datos } = await subir("/api/honorarios/bhe/importar", csv);

  assert.equal(status, 201);
  assert.equal(datos.insertadas, 0);
  assert.equal(datos.ya_registradas, 1);

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM honorarios WHERE empresa_id = $1 AND folio = '501'`,
    [ctx.empresa]
  );
  assert.equal(rows[0].n, 1);
});
