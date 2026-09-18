/**
 * Bloqueo de ejercicios cerrados.
 *
 * Cerrar un ejercicio deja sus cifras firmes: son la base de lo declarado al
 * SII. Antes el cierre solo cambiaba un estado en la tabla y no impedia nada,
 * asi que se podian seguir creando, modificando y anulando asientos con fecha
 * dentro del ejercicio cerrado y los libros dejaban de cuadrar con la
 * declaracion.
 *
 *   DATABASE_URL=<staging o test> node --test test/periodoCerrado.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_periodo_no_produccion_32_caract";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");

const SUFIJO = `per${Date.now().toString().slice(-8)}`;
const CLAVE = "Periodo-2026";
const CORREO = `${SUFIJO}@test.local`;

const ANIO_CERRADO = 2024;
const ANIO_ABIERTO = 2026;

const ctx = {};

async function pedir(ruta, { metodo = "GET", cuerpo } = {}) {
  const respuesta = await fetch(`${ctx.raiz}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      ...(cuerpo ? { "Content-Type": "application/json" } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });

  const datos = await respuesta.json().catch(() => ({}));
  return { status: respuesta.status, datos };
}

function asiento(fecha) {
  return {
    empresa_id: ctx.empresa,
    fecha,
    tipo: "Traspaso",
    glosa: "Prueba de periodo",
    detalles: [
      { cuenta_id: ctx.cuentaDebe, debe: 1000, haber: 0 },
      { cuenta_id: ctx.cuentaHaber, debe: 0, haber: 1000 },
    ],
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
      [`P${SUFIJO}-3`, `Empresa periodo ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.cuentaDebe = (
    await pool.query(
      `INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, naturaleza, nivel, activo)
       VALUES ($1, '1101001', 'Caja', 'Activo', 'Deudora', 4, true) RETURNING id`,
      [ctx.empresa]
    )
  ).rows[0].id;

  ctx.cuentaHaber = (
    await pool.query(
      `INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, naturaleza, nivel, activo)
       VALUES ($1, '3101001', 'Capital', 'Patrimonio', 'Acreedora', 4, true) RETURNING id`,
      [ctx.empresa]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO ejercicios_contables (empresa_id, anio, estado, fecha_inicio, fecha_termino)
     VALUES ($1, $2, 'cerrado', $3, $4), ($1, $5, 'abierto', $6, $7)`,
    [
      ctx.empresa,
      ANIO_CERRADO,
      `${ANIO_CERRADO}-01-01`,
      `${ANIO_CERRADO}-12-31`,
      ANIO_ABIERTO,
      `${ANIO_ABIERTO}-01-01`,
      `${ANIO_ABIERTO}-12-31`,
    ]
  );

  const hash = await bcrypt.hash(CLAVE, 10);
  const usuarioId = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Periodo', $1, $2, 'admin_cliente', true) RETURNING id`,
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

test("no se puede crear un asiento con fecha en un ejercicio cerrado", async () => {
  const { status, datos } = await pedir("/api/comprobantes", {
    metodo: "POST",
    cuerpo: asiento(`${ANIO_CERRADO}-06-15`),
  });

  assert.equal(status, 409, `deberia dar 409 y dio ${status} ${JSON.stringify(datos).slice(0, 150)}`);
  assert.match(datos.error, /cerrado/i);

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM comprobantes
     WHERE empresa_id = $1 AND fecha >= $2 AND fecha <= $3`,
    [ctx.empresa, `${ANIO_CERRADO}-01-01`, `${ANIO_CERRADO}-12-31`]
  );

  assert.equal(rows[0].n, 0, "no debe quedar ningun asiento en el ejercicio cerrado");
});

test("si se puede crear un asiento en un ejercicio abierto", async () => {
  const { status, datos } = await pedir("/api/comprobantes", {
    metodo: "POST",
    cuerpo: asiento(`${ANIO_ABIERTO}-06-15`),
  });

  assert.equal(status, 201, `${JSON.stringify(datos).slice(0, 200)}`);
  ctx.comprobanteAbierto = datos.comprobante.id;
});

test("no se puede mover un asiento hacia un ejercicio cerrado", async () => {
  const { status, datos } = await pedir(`/api/comprobantes/${ctx.comprobanteAbierto}`, {
    metodo: "PUT",
    cuerpo: {
      ...asiento(`${ANIO_CERRADO}-03-10`),
      glosa: "Intento de mover al periodo cerrado",
    },
  });

  assert.equal(status, 409, `deberia dar 409 y dio ${status} ${JSON.stringify(datos).slice(0, 150)}`);

  const { rows } = await pool.query(
    "SELECT EXTRACT(YEAR FROM fecha)::int AS anio FROM comprobantes WHERE id = $1",
    [ctx.comprobanteAbierto]
  );

  assert.equal(
    rows[0].anio,
    ANIO_ABIERTO,
    "la fecha original no debe haber cambiado"
  );
});

test("no se puede anular un asiento de un ejercicio cerrado", async () => {
  // Se inserta directo en la base para simular un asiento historico, anterior
  // al cierre del ejercicio.
  const historico = (
    await pool.query(
      `INSERT INTO comprobantes (empresa_id, periodo, fecha, tipo, numero, glosa,
                                 total_debe, total_haber, estado)
       VALUES ($1, $2, $3, 'Traspaso', 91001, 'Asiento historico', 1000, 1000, 'vigente')
       RETURNING id`,
      [ctx.empresa, `${ANIO_CERRADO}-06`, `${ANIO_CERRADO}-06-20`]
    )
  ).rows[0].id;

  const { status } = await pedir(`/api/comprobantes/${historico}`, {
    metodo: "DELETE",
    cuerpo: { empresa_id: ctx.empresa },
  });

  assert.equal(status, 409, `deberia dar 409 y dio ${status}`);

  const { rows } = await pool.query("SELECT estado FROM comprobantes WHERE id = $1", [
    historico,
  ]);

  assert.equal(rows[0].estado, "vigente", "el asiento del periodo cerrado no debe anularse");
});

test("reabrir el ejercicio vuelve a permitir escribir", async () => {
  await pool.query(
    "UPDATE ejercicios_contables SET estado = 'abierto' WHERE empresa_id = $1 AND anio = $2",
    [ctx.empresa, ANIO_CERRADO]
  );

  const { status, datos } = await pedir("/api/comprobantes", {
    metodo: "POST",
    cuerpo: asiento(`${ANIO_CERRADO}-07-01`),
  });

  assert.equal(status, 201, `${JSON.stringify(datos).slice(0, 200)}`);

  await pool.query(
    "UPDATE ejercicios_contables SET estado = 'cerrado' WHERE empresa_id = $1 AND anio = $2",
    [ctx.empresa, ANIO_CERRADO]
  );
});

test("un ano sin ejercicio registrado no se bloquea", async () => {
  // Muchas empresas trabajan sin haber creado el ejercicio. Exigirlo aca
  // rompería el flujo actual sin mejorar nada.
  const { status } = await pedir("/api/comprobantes", {
    metodo: "POST",
    cuerpo: asiento("2019-05-05"),
  });

  assert.equal(status, 201, `un ano sin ejercicio deberia permitirse y dio ${status}`);
});
