/**
 * Validación de la entrada.
 *
 * Antes cada controlador comprobaba a mano lo que se le ocurría: un monto podía
 * llegar como texto, una fecha en cualquier formato y un identificador como
 * `NaN`. Lo que no se validaba terminaba en PostgreSQL, y su mensaje de error
 * volvía al cliente.
 *
 *   DATABASE_URL=<staging o test> node --test test/validacion.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_validacion_no_produccion_32_car";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");

const SUFIJO = `val${Date.now().toString().slice(-8)}`;
const CLAVE = "Validacion-2026";
const CORREO = `${SUFIJO}@test.local`;

const ctx = {};

async function enviar(ruta, cuerpo, metodo = "POST") {
  const respuesta = await fetch(`${ctx.raiz}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cuerpo),
  });

  return { status: respuesta.status, datos: await respuesta.json().catch(() => ({})) };
}

function asiento(cambios = {}) {
  return {
    empresa_id: ctx.empresa,
    fecha: "2026-05-10",
    tipo: "Traspaso",
    glosa: "Prueba de validacion",
    detalles: [
      { cuenta_id: ctx.cuentaDebe, debe: 1000, haber: 0 },
      { cuenta_id: ctx.cuentaHaber, debe: 0, haber: 1000 },
    ],
    ...cambios,
  };
}

test.before(async () => {
  const base = (await pool.query("SELECT current_database() AS d")).rows[0].d;

  if (!/test|staging/i.test(base)) {
    throw new Error(`La base "${base}" no es de pruebas.`);
  }

  ctx.empresa = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa)
       VALUES ($1, $2, true) RETURNING id`,
      [`V${SUFIJO}-7`, `Empresa validacion ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.cuentaDebe = (
    await pool.query(
      `INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, naturaleza, nivel, activo)
       VALUES ($1, '1101010', 'Caja', 'Activo', 'Deudora', 4, true) RETURNING id`,
      [ctx.empresa]
    )
  ).rows[0].id;

  ctx.cuentaHaber = (
    await pool.query(
      `INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, naturaleza, nivel, activo)
       VALUES ($1, '3101010', 'Capital', 'Patrimonio', 'Acreedora', 4, true) RETURNING id`,
      [ctx.empresa]
    )
  ).rows[0].id;

  const hash = await bcrypt.hash(CLAVE, 10);
  const usuarioId = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Validacion', $1, $2, 'admin_cliente', true) RETURNING id`,
      [CORREO, hash]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo)
     VALUES ($1, $2, 'admin', true)`,
    [usuarioId, ctx.empresa]
  );

  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_id, status, billing_cycle, price,
                                currency, starts_at, expires_at, auto_renew, grace_days)
     SELECT $1, sp.id, 'ACTIVE', 'monthly', sp.monthly_price, 'CLP',
            CURRENT_DATE, CURRENT_DATE + 365, true, 5
     FROM subscription_plans sp WHERE sp.active = true ORDER BY sp.id LIMIT 1`,
    [usuarioId]
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

test("un asiento que no cuadra se rechaza con el detalle", async () => {
  const { status, datos } = await enviar(
    "/api/comprobantes",
    asiento({
      detalles: [
        { cuenta_id: ctx.cuentaDebe, debe: 1000, haber: 0 },
        { cuenta_id: ctx.cuentaHaber, debe: 0, haber: 900 },
      ],
    })
  );

  assert.equal(status, 400);
  assert.match(datos.error, /no cuadra/i);
  assert.match(JSON.stringify(datos.errores), /1000.*900|900/);
});

test("un asiento por cero se rechaza", async () => {
  const { status, datos } = await enviar(
    "/api/comprobantes",
    asiento({
      detalles: [
        { cuenta_id: ctx.cuentaDebe, debe: 0, haber: 0 },
        { cuenta_id: ctx.cuentaHaber, debe: 0, haber: 0 },
      ],
    })
  );

  assert.equal(status, 400);
  assert.match(JSON.stringify(datos), /cero|monto en debe/i);
});

test("una linea con debe y haber a la vez se rechaza", async () => {
  const { status, datos } = await enviar(
    "/api/comprobantes",
    asiento({
      detalles: [
        { cuenta_id: ctx.cuentaDebe, debe: 500, haber: 500 },
        { cuenta_id: ctx.cuentaHaber, debe: 500, haber: 500 },
      ],
    })
  );

  assert.equal(status, 400);
  assert.match(JSON.stringify(datos), /debe y haber a la vez/i);
});

test("un asiento de una sola linea se rechaza", async () => {
  const { status } = await enviar(
    "/api/comprobantes",
    asiento({ detalles: [{ cuenta_id: ctx.cuentaDebe, debe: 1000, haber: 0 }] })
  );

  assert.equal(status, 400);
});

test("una fecha con formato invalido se rechaza sin llegar a PostgreSQL", async () => {
  for (const fecha of ["10-05-2026", "2026/05/10", "ayer", "2026-13-45"]) {
    const { status, datos } = await enviar("/api/comprobantes", asiento({ fecha }));

    assert.equal(status, 400, `la fecha "${fecha}" deberia rechazarse`);
    assert.ok(
      !JSON.stringify(datos).match(/relation|column|invalid input syntax/i),
      "no debe filtrar mensajes de PostgreSQL"
    );
  }
});

test("un monto como texto no numerico se rechaza", async () => {
  const { status } = await enviar(
    "/api/comprobantes",
    asiento({
      detalles: [
        { cuenta_id: ctx.cuentaDebe, debe: "mil pesos", haber: 0 },
        { cuenta_id: ctx.cuentaHaber, debe: 0, haber: 1000 },
      ],
    })
  );

  assert.equal(status, 400);
});

test("un monto negativo en una linea se rechaza", async () => {
  const { status } = await enviar(
    "/api/comprobantes",
    asiento({
      detalles: [
        { cuenta_id: ctx.cuentaDebe, debe: -1000, haber: 0 },
        { cuenta_id: ctx.cuentaHaber, debe: 0, haber: -1000 },
      ],
    })
  );

  assert.equal(status, 400);
});

test("un monto como texto numerico si se acepta y se convierte", async () => {
  // El frontend envía valores de formularios, que llegan como texto.
  const { status, datos } = await enviar(
    "/api/comprobantes",
    asiento({
      detalles: [
        { cuenta_id: ctx.cuentaDebe, debe: "1500", haber: 0 },
        { cuenta_id: ctx.cuentaHaber, debe: 0, haber: "1500" },
      ],
    })
  );

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 200));
});

test("un rango de fechas invertido se rechaza al consultar", async () => {
  const respuesta = await fetch(
    `${ctx.raiz}/api/comprobantes?empresa_id=${ctx.empresa}&fecha_desde=2026-12-31&fecha_hasta=2026-01-01`,
    { headers: { Authorization: `Bearer ${ctx.token}` } }
  );

  assert.equal(respuesta.status, 400);
});

test("el login valida el formato del correo", async () => {
  const respuesta = await fetch(`${ctx.raiz}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "no-es-correo", password: "cualquiera" }),
  });

  assert.equal(respuesta.status, 400);
});

test("el cuerpo con JSON roto responde 400 y no 500", async () => {
  const respuesta = await fetch(`${ctx.raiz}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"email": "roto"',
  });

  assert.equal(respuesta.status, 400);
  const datos = await respuesta.json().catch(() => ({}));
  assert.match(JSON.stringify(datos), /JSON/i);
});

test("una ruta de la API que no existe responde 404 en JSON", async () => {
  const respuesta = await fetch(`${ctx.raiz}/api/no-existe-esta-ruta`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });

  assert.equal(respuesta.status, 404);
  const datos = await respuesta.json().catch(() => null);
  assert.ok(datos, "debe responder JSON, no HTML");
});

test("el asiento creado registra quien lo creo", async () => {
  const { status, datos } = await enviar("/api/comprobantes", asiento({ fecha: "2026-05-11" }));

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 200));

  const { rows } = await pool.query(
    "SELECT creado_por FROM comprobantes WHERE id = $1",
    [datos.comprobante.id]
  );

  assert.ok(
    Number(rows[0].creado_por) > 0,
    "creado_por debe quedar registrado para poder rastrear el asiento"
  );
});
