/**
 * Los informes no cuentan lo que no corresponde.
 *
 * Varios informes unen el plan de cuentas con el detalle de los asientos, y
 * ponen los filtros de estado y fecha en el `ON` del comprobante. El detalle,
 * en cambio, se une sin filtro alguno. Sumar el detalle directamente hace que
 * una línea cuyo comprobante está anulado o fuera del rango pedido igual sume,
 * porque su propio join sí calzó.
 *
 * El resultado era un análisis de cuentas y un panel financiero que informaban
 * movimientos de otros períodos y asientos que ya no existen.
 *
 *   DATABASE_URL=<staging o test> node --test test/informesAnulados.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_informes_no_produccion_32_carac";
process.env.COBRANZA_AUTOMATICA = "false";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");

const SUFIJO = `inf${Date.now().toString().slice(-8)}`;
const CLAVE = "Informes-2026";
const CORREO = `${SUFIJO}@test.local`;

const ANIO = 2026;
const DESDE = `${ANIO}-04-01`;
const HASTA = `${ANIO}-04-30`;

const ctx = {};

async function pedir(ruta) {
  const respuesta = await fetch(`${ctx.raiz}${ruta}`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });

  return { status: respuesta.status, datos: await respuesta.json().catch(() => ({})) };
}

/**
 * Crea un asiento directo en la base, para poder dejarlo anulado o fuera de
 * rango sin pasar por las validaciones de la API.
 */
async function asiento({ numero, fecha, estado = "vigente", monto }) {
  const comprobanteId = (
    await pool.query(
      `INSERT INTO comprobantes (empresa_id, periodo, fecha, tipo, numero, glosa,
                                 total_debe, total_haber, estado)
       VALUES ($1, $2, $3, 'Traspaso', $4, 'Prueba informes', $5, $5, $6)
       RETURNING id`,
      [ctx.empresa, String(fecha).slice(0, 7), fecha, numero, monto, estado]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO comprobante_detalle (comprobante_id, cuenta_id, glosa, debe, haber)
     VALUES ($1, $2, 'Gasto', $3, 0), ($1, $4, 'Contrapartida', 0, $3)`,
    [comprobanteId, ctx.cuentaGasto, monto, ctx.cuentaBanco]
  );

  return comprobanteId;
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
      [`F${SUFIJO}-4`, `Empresa informes ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.cuentaGasto = (
    await pool.query(
      `INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, naturaleza, nivel, activo)
       VALUES ($1, '5101001', 'Gastos generales', 'Gasto', 'Deudora', 4, true) RETURNING id`,
      [ctx.empresa]
    )
  ).rows[0].id;

  ctx.cuentaBanco = (
    await pool.query(
      `INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, naturaleza, nivel, activo)
       VALUES ($1, '1102001', 'Banco', 'Activo', 'Deudora', 4, true) RETURNING id`,
      [ctx.empresa]
    )
  ).rows[0].id;

  // Solo este debe contar: vigente y dentro del rango.
  await asiento({ numero: 95001, fecha: `${ANIO}-04-10`, monto: 100000 });

  // Anulado, dentro del rango.
  await asiento({ numero: 95002, fecha: `${ANIO}-04-15`, estado: "anulado", monto: 500000 });

  // Vigente, fuera del rango.
  await asiento({ numero: 95003, fecha: `${ANIO}-07-20`, monto: 700000 });

  // Eliminado, dentro del rango.
  await asiento({ numero: 95004, fecha: `${ANIO}-04-20`, estado: "anulado", monto: 900000 });

  const hash = await bcrypt.hash(CLAVE, 10);
  const usuarioId = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Informes', $1, $2, 'admin_cliente', true) RETURNING id`,
      [CORREO, hash]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo)
     VALUES ($1, $2, 'OWNER', true)`,
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

test("el analisis de cuentas suma solo el asiento vigente del periodo", async () => {
  const { status, datos } = await pedir(
    `/api/analisis-cuentas?empresa_id=${ctx.empresa}&fecha_desde=${DESDE}&fecha_hasta=${HASTA}`
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));

  const cuentas = datos.cuentas || datos.analisis || datos.movimientos || [];
  const gasto = cuentas.find((c) => String(c.codigo) === "5101001");

  assert.ok(gasto, `debe aparecer la cuenta de gasto: ${JSON.stringify(datos).slice(0, 250)}`);

  // Solo los 100.000 del asiento vigente de abril.
  assert.equal(
    Number(gasto.total_debe),
    100000,
    "no debe incluir el anulado (500.000), el de julio (700.000) ni el eliminado (900.000)"
  );
});

test("una cuenta cuyos movimientos estan todos anulados no aparece", async () => {
  // Es el efecto del HAVING: si filtra por totales sin proteger, la cuenta pasa
  // el filtro y se muestra con saldo cero, que confunde mas que ayudar.
  const cuentaSolaAnulada = (
    await pool.query(
      `INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, naturaleza, nivel, activo)
       VALUES ($1, '5101999', 'Gasto solo anulado', 'Gasto', 'Deudora', 4, true) RETURNING id`,
      [ctx.empresa]
    )
  ).rows[0].id;

  const comprobanteId = (
    await pool.query(
      `INSERT INTO comprobantes (empresa_id, periodo, fecha, tipo, numero, glosa,
                                 total_debe, total_haber, estado)
       VALUES ($1, '2026-04', '2026-04-22', 'Traspaso', 95005, 'Solo anulado', 300000, 300000, 'anulado')
       RETURNING id`,
      [ctx.empresa]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO comprobante_detalle (comprobante_id, cuenta_id, glosa, debe, haber)
     VALUES ($1, $2, 'Anulado', 300000, 0), ($1, $3, 'Anulado', 0, 300000)`,
    [comprobanteId, cuentaSolaAnulada, ctx.cuentaBanco]
  );

  const { datos } = await pedir(
    `/api/analisis-cuentas?empresa_id=${ctx.empresa}&fecha_desde=${DESDE}&fecha_hasta=${HASTA}`
  );

  const cuentas = datos.cuentas || datos.analisis || datos.movimientos || [];
  const encontrada = cuentas.find((c) => String(c.codigo) === "5101999");

  assert.equal(
    encontrada,
    undefined,
    "una cuenta sin movimientos vigentes en el periodo no debe listarse"
  );
});

test("el panel financiero no cuenta asientos anulados ni de otro periodo", async () => {
  const { status, datos } = await pedir(
    `/api/dashboard-financiero?empresa_id=${ctx.empresa}&fecha_desde=${DESDE}&fecha_hasta=${HASTA}`
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));

  const texto = JSON.stringify(datos);

  for (const monto of ["500000", "700000", "900000", "1200000", "2200000"]) {
    assert.ok(
      !texto.includes(monto),
      `no debe aparecer ${monto}: es un anulado, uno de otro periodo o una suma que los incluye. ${texto.slice(0, 300)}`
    );
  }
});

test("el balance de ocho columnas ya tenia la proteccion y sigue correcto", async () => {
  const { status, datos } = await pedir(
    `/api/balance-8-columnas?empresa_id=${ctx.empresa}&fecha_desde=${DESDE}&fecha_hasta=${HASTA}`
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));

  const filas = datos.balance || datos.cuentas || datos.filas || [];
  const gasto = filas.find((f) => String(f.codigo) === "5101001");

  if (gasto) {
    assert.equal(Number(gasto.debitos ?? gasto.total_debe ?? 0), 100000);
  }
});

test("el libro diario tampoco trae los anulados", async () => {
  const { status, datos } = await pedir(
    `/api/libro-diario?empresa_id=${ctx.empresa}&fecha_desde=${DESDE}&fecha_hasta=${HASTA}`
  );

  assert.equal(status, 200);

  const movimientos = datos.movimientos || [];
  const numeros = movimientos.map((m) => Number(m.numero));

  assert.ok(numeros.includes(95001), "debe traer el asiento vigente");
  assert.ok(!numeros.includes(95002), "no debe traer el anulado");
  assert.ok(!numeros.includes(95004), "no debe traer el eliminado");
  assert.ok(!numeros.includes(95003), "no debe traer el de otro periodo");
});
