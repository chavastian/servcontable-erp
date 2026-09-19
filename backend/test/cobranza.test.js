/**
 * Cobranza: transiciones por fecha, avisos sin repetir y activación idempotente.
 *
 * Lo que sostiene el cobro:
 *
 * 1. Una suscripción vencida pasa a gracia y luego a bloqueada sola, sin
 *    esperar a que el cliente intente entrar.
 * 2. Los avisos se emiten una vez por usuario, evento y día. Si el proceso corre
 *    dos veces, el cliente recibe un solo correo.
 * 3. Un pago activa la suscripción exactamente una vez. Flow avisa por el
 *    webhook y por el retorno del navegador a la vez, y antes ambos extendían:
 *    el cliente recibía dos meses por un pago.
 *
 *   DATABASE_URL=<staging o test> node --test test/cobranza.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.COBRANZA_AUTOMATICA = "false";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const {
  procesarCobranza,
  diasDeAviso,
  textoAviso,
  EVENTOS,
} = require("../src/helpers/cobranza.helper");
const { activarPorPago } = require("../src/helpers/activacionPago.helper");
const {
  ESTADOS_SUSCRIPCION,
  obtenerSuscripcionUsuario,
} = require("../src/helpers/suscripcion.helper");

const SUFIJO = `cob${Date.now().toString().slice(-8)}`;
const creados = { usuarios: [], contrataciones: [] };

async function crearCliente(nombre, { vence, estado = "ACTIVE", graciaDias = 5, trial = false }) {
  const hash = await bcrypt.hash("Cobranza-2026", 10);
  const correo = `${nombre}-${SUFIJO}@test.local`;

  const usuarioId = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ($1, $2, $3, 'admin_cliente', true) RETURNING id`,
      [`Cliente ${nombre}`, correo, hash]
    )
  ).rows[0].id;

  creados.usuarios.push(usuarioId);

  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_id, status, billing_cycle, price, currency,
                                starts_at, expires_at, trial_ends_at, auto_renew, grace_days)
     SELECT $1, sp.id, $2, 'monthly', sp.monthly_price, 'CLP',
            CURRENT_DATE - 30, $3::date, $4, true, $5
     FROM subscription_plans sp WHERE sp.active = true ORDER BY sp.id LIMIT 1`,
    [usuarioId, estado, vence, trial ? vence : null, graciaDias]
  );

  return { usuarioId, correo };
}

async function estadoDe(usuarioId) {
  const { rows } = await pool.query(
    "SELECT status, expires_at FROM subscriptions WHERE user_id = $1",
    [usuarioId]
  );

  return rows[0];
}

async function avisosDe(usuarioId) {
  const { rows } = await pool.query(
    `SELECT event_type, status, scheduled_at::date AS dia
     FROM subscription_notifications
     WHERE user_id = $1
     ORDER BY id`,
    [usuarioId]
  );

  return rows;
}

function enDias(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

test.before(async () => {
  const base = (await pool.query("SELECT current_database() AS d")).rows[0].d;

  if (!/test|staging/i.test(base)) {
    throw new Error(`La base "${base}" no es de pruebas.`);
  }
});

test("los dias de aviso se leen de la configuracion", () => {
  assert.deepEqual(diasDeAviso({ expiry_notice_days: "10,5,2,0" }), [10, 5, 2, 0]);
  assert.deepEqual(diasDeAviso({ expiry_notice_days: "3, 1" }), [3, 1]);
  assert.deepEqual(diasDeAviso({}), [10, 5, 2, 0], "por defecto 10, 5, 2 y 0");
  assert.deepEqual(diasDeAviso({ expiry_notice_days: "basura" }), []);
});

test("el texto del aviso cambia segun el evento", () => {
  const hoy = textoAviso({
    evento: EVENTOS.AVISO_VENCIMIENTO,
    nombre: "Ana",
    dias: 0,
    vence: "2026-09-30",
    servicio: "ServContable PRO",
  });

  assert.match(hoy.titulo, /vence hoy/i);
  assert.match(hoy.mensaje, /Ana/);

  const bloqueado = textoAviso({
    evento: EVENTOS.BLOQUEADO,
    nombre: "Ana",
    vence: "2026-09-30",
    servicio: "ServContable PRO",
  });

  assert.match(bloqueado.titulo, /bloqueado/i);
  assert.match(bloqueado.mensaje, /datos est[aá]n intactos/i);

  const gracia = textoAviso({
    evento: EVENTOS.ENTRO_EN_GRACIA,
    nombre: "Ana",
    vence: "2026-09-30",
    graciaRestante: 3,
    servicio: "ServContable PRO",
  });

  assert.match(gracia.mensaje, /3 d[ií]as/);
});

test("una suscripcion vencida dentro de la gracia pasa a PAST_DUE sola", async () => {
  // Vencio hace 2 dias, con 5 dias de gracia.
  const { usuarioId } = await crearCliente("gracia", { vence: enDias(-2), graciaDias: 5 });

  await procesarCobranza(pool, { enviar: false });

  const estado = await estadoDe(usuarioId);
  assert.equal(estado.status, ESTADOS_SUSCRIPCION.PAST_DUE);

  const avisos = await avisosDe(usuarioId);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].event_type, EVENTOS.ENTRO_EN_GRACIA);
});

test("una suscripcion con la gracia agotada pasa a EXPIRED sola", async () => {
  // Vencio hace 10 dias, con 5 de gracia: ya no hay acceso.
  const { usuarioId } = await crearCliente("bloqueado", { vence: enDias(-10), graciaDias: 5 });

  await procesarCobranza(pool, { enviar: false });

  const estado = await estadoDe(usuarioId);
  assert.equal(estado.status, ESTADOS_SUSCRIPCION.EXPIRED);

  const avisos = await avisosDe(usuarioId);
  assert.equal(avisos[0].event_type, EVENTOS.BLOQUEADO);
});

test("se avisa en los dias configurados antes del vencimiento", async () => {
  const { usuarioId } = await crearCliente("aviso5", { vence: enDias(5) });

  await procesarCobranza(pool, { enviar: false });

  const avisos = await avisosDe(usuarioId);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].event_type, EVENTOS.AVISO_VENCIMIENTO);

  const estado = await estadoDe(usuarioId);
  assert.equal(estado.status, ESTADOS_SUSCRIPCION.ACTIVE, "aun esta vigente");
});

test("no se avisa en un dia que no esta configurado", async () => {
  const { usuarioId } = await crearCliente("aviso7", { vence: enDias(7) });

  await procesarCobranza(pool, { enviar: false });

  assert.equal((await avisosDe(usuarioId)).length, 0, "el dia 7 no esta en 10, 5, 2, 0");
});

test("correr el proceso dos veces no duplica el aviso", async () => {
  // Es lo que evita que el cliente reciba el mismo correo varias veces.
  const { usuarioId } = await crearCliente("dedup", { vence: enDias(2) });

  await procesarCobranza(pool, { enviar: false });
  await procesarCobranza(pool, { enviar: false });
  await procesarCobranza(pool, { enviar: false });

  const avisos = await avisosDe(usuarioId);
  assert.equal(avisos.length, 1, `se encolaron ${avisos.length} avisos en lugar de uno`);
});

test("el fin de la prueba gratuita avisa como prueba, no como impago", async () => {
  const { usuarioId } = await crearCliente("trial", {
    vence: enDias(2),
    estado: "TRIAL",
    trial: true,
  });

  await procesarCobranza(pool, { enviar: false });

  const avisos = await avisosDe(usuarioId);
  assert.equal(avisos[0].event_type, EVENTOS.TRIAL_POR_VENCER);
});

test("una prueba vencida no tiene gracia y queda bloqueada", async () => {
  const { usuarioId } = await crearCliente("trialvencido", {
    vence: enDias(-1),
    estado: "TRIAL",
    trial: true,
  });

  await procesarCobranza(pool, { enviar: false });

  const estado = await estadoDe(usuarioId);
  assert.equal(estado.status, ESTADOS_SUSCRIPCION.EXPIRED, "las pruebas no tienen gracia");

  const avisos = await avisosDe(usuarioId);
  assert.equal(avisos[0].event_type, EVENTOS.TRIAL_VENCIDO);
});

test("una suscripcion cancelada no se toca ni recibe avisos", async () => {
  const { usuarioId } = await crearCliente("cancelado", {
    vence: enDias(-30),
    estado: "CANCELLED",
  });

  await procesarCobranza(pool, { enviar: false });

  const estado = await estadoDe(usuarioId);
  assert.equal(estado.status, "CANCELLED");
  assert.equal((await avisosDe(usuarioId)).length, 0);
});

// --------------------------------------------------------------------------
// Activacion por pago
// --------------------------------------------------------------------------

async function crearContratacion(usuarioId, { total = 35688, meses = 1 } = {}) {
  const id = (
    await pool.query(
      `INSERT INTO contrataciones_web
         (nombre, correo, periodicidad, monto_neto, iva, total, estado, flow_order, metadata)
       VALUES ('Cliente pago', $1, 'mensual', 29990, 5698, $2, 'pendiente', $3, $4::jsonb)
       RETURNING id`,
      [
        `pago-${SUFIJO}-${usuarioId}@test.local`,
        total,
        `orden-${SUFIJO}-${usuarioId}`,
        JSON.stringify({ usuario_id: usuarioId, meses_cobrados: meses }),
      ]
    )
  ).rows[0].id;

  creados.contrataciones.push(id);
  return id;
}

test("un pago extiende la suscripcion y queda registrado", async () => {
  const { usuarioId } = await crearCliente("pago", { vence: enDias(-1) });
  const contratacionId = await crearContratacion(usuarioId);
  const antes = await obtenerSuscripcionUsuario(pool, usuarioId);

  const resultado = await activarPorPago(pool, {
    contratacionId,
    usuarioId,
    meses: 1,
    periodicidad: "mensual",
    proveedor: "flow",
    transaccionId: `tx-${SUFIJO}-${usuarioId}`,
    monto: 35688,
  });

  assert.equal(resultado.activado, true);

  const despues = await obtenerSuscripcionUsuario(pool, usuarioId);
  assert.equal(despues.status, "ACTIVE");
  assert.ok(
    new Date(despues.expires_at) > new Date(antes.expires_at),
    "la fecha de vencimiento debe avanzar"
  );

  const pagos = await pool.query(
    "SELECT amount, provider, status FROM subscription_payments WHERE user_id = $1",
    [usuarioId]
  );

  assert.equal(pagos.rows.length, 1, "el cobro debe quedar registrado");
  assert.equal(Number(pagos.rows[0].amount), 35688);
  assert.equal(pagos.rows[0].provider, "flow");
  assert.equal(pagos.rows[0].status, "PAID");
});

test("el mismo pago avisado dos veces no extiende dos veces", async () => {
  // Flow avisa por el webhook y por el retorno del navegador. Antes ambos
  // extendian la suscripcion: un pago, dos meses.
  const { usuarioId } = await crearCliente("doble", { vence: enDias(10) });
  const contratacionId = await crearContratacion(usuarioId);

  const datos = {
    contratacionId,
    usuarioId,
    meses: 1,
    periodicidad: "mensual",
    proveedor: "flow",
    transaccionId: `tx-doble-${SUFIJO}-${usuarioId}`,
    monto: 35688,
  };

  const primero = await activarPorPago(pool, datos);
  const vencePrimero = (await obtenerSuscripcionUsuario(pool, usuarioId)).expires_at;

  const segundo = await activarPorPago(pool, datos);
  const venceSegundo = (await obtenerSuscripcionUsuario(pool, usuarioId)).expires_at;

  assert.equal(primero.activado, true);
  assert.equal(segundo.activado, false);
  assert.equal(segundo.motivo, "ya_activado");

  assert.equal(
    new Date(venceSegundo).getTime(),
    new Date(vencePrimero).getTime(),
    "el segundo aviso no debe mover la fecha de vencimiento"
  );

  const pagos = await pool.query(
    "SELECT COUNT(*)::int AS n FROM subscription_payments WHERE user_id = $1",
    [usuarioId]
  );

  assert.equal(pagos.rows[0].n, 1, "solo debe quedar un cobro registrado");
});

test("dos avisos simultaneos tampoco duplican", async () => {
  // El caso real: el webhook y el retorno llegan a la vez.
  const { usuarioId } = await crearCliente("simultaneo", { vence: enDias(10) });
  const contratacionId = await crearContratacion(usuarioId);

  const datos = {
    contratacionId,
    usuarioId,
    meses: 1,
    periodicidad: "mensual",
    proveedor: "flow",
    transaccionId: `tx-sim-${SUFIJO}-${usuarioId}`,
    monto: 35688,
  };

  const [a, b] = await Promise.all([
    activarPorPago(pool, datos),
    activarPorPago(pool, datos),
  ]);

  const activaciones = [a, b].filter((r) => r.activado).length;
  assert.equal(activaciones, 1, `se activo ${activaciones} veces en lugar de una`);

  const pagos = await pool.query(
    "SELECT COUNT(*)::int AS n FROM subscription_payments WHERE user_id = $1",
    [usuarioId]
  );

  assert.equal(pagos.rows[0].n, 1);
});

test("pagar reactiva una cuenta desactivada", async () => {
  const { usuarioId } = await crearCliente("reactivar", { vence: enDias(-30) });
  await pool.query("UPDATE usuarios SET activo = false WHERE id = $1", [usuarioId]);

  const contratacionId = await crearContratacion(usuarioId);

  await activarPorPago(pool, {
    contratacionId,
    usuarioId,
    meses: 1,
    periodicidad: "mensual",
    proveedor: "flow",
    transaccionId: `tx-react-${SUFIJO}-${usuarioId}`,
    monto: 35688,
  });

  const { rows } = await pool.query("SELECT activo FROM usuarios WHERE id = $1", [usuarioId]);
  assert.equal(rows[0].activo, true, "pagar tiene que devolver el acceso");
});

test("el pago queda en el historial de la suscripcion", async () => {
  const { usuarioId } = await crearCliente("historial", { vence: enDias(5) });
  const contratacionId = await crearContratacion(usuarioId);

  await activarPorPago(pool, {
    contratacionId,
    usuarioId,
    meses: 1,
    periodicidad: "mensual",
    proveedor: "flow",
    transaccionId: `tx-hist-${SUFIJO}-${usuarioId}`,
    monto: 35688,
  });

  const { rows } = await pool.query(
    "SELECT action, observation FROM subscription_history WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
    [usuarioId]
  );

  assert.equal(rows[0].action, "RENOVACION");
  assert.match(rows[0].observation, /flow/i);
});
