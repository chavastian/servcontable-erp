const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ESTADOS_SUSCRIPCION,
  calcularEstadoVigente,
  normalizarEstadoSuscripcion,
} = require("../src/helpers/suscripcion.helper");
const { esAdminSistema, normalizarRol } = require("../src/helpers/auth.helper");
const {
  PROVEEDORES_PAGO_SUSCRIPCION,
  construirPagoSuscripcion,
} = require("../src/helpers/pagosSuscripcion.helper");

function fechaEnDias(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

test("normaliza estados legacy y oficiales de suscripcion", () => {
  assert.equal(normalizarEstadoSuscripcion("TRIAL"), ESTADOS_SUSCRIPCION.TRIAL);
  assert.equal(normalizarEstadoSuscripcion("activa"), ESTADOS_SUSCRIPCION.ACTIVE);
  assert.equal(normalizarEstadoSuscripcion("demo"), ESTADOS_SUSCRIPCION.TRIAL);
  assert.equal(normalizarEstadoSuscripcion("vencida"), ESTADOS_SUSCRIPCION.EXPIRED);
  assert.equal(normalizarEstadoSuscripcion("suspendida"), ESTADOS_SUSCRIPCION.SUSPENDED);
  assert.equal(normalizarEstadoSuscripcion("cancelada"), ESTADOS_SUSCRIPCION.CANCELLED);
});

test("calcula suscripcion activa vigente", () => {
  const estado = calcularEstadoVigente(
    { status: "ACTIVE", expires_at: fechaEnDias(8), grace_days: 5 },
    { grace_days: 5 }
  );

  assert.equal(estado.status, ESTADOS_SUSCRIPCION.ACTIVE);
  assert.equal(estado.days_remaining >= 7, true);
});

test("calcula trial vencido como expired", () => {
  const estado = calcularEstadoVigente(
    { status: "TRIAL", trial_ends_at: fechaEnDias(-10), grace_days: 5 },
    { grace_days: 5 }
  );

  assert.equal(estado.status, ESTADOS_SUSCRIPCION.EXPIRED);
});

test("calcula periodo de gracia para suscripcion vencida", () => {
  const estado = calcularEstadoVigente(
    { status: "ACTIVE", expires_at: fechaEnDias(-2), grace_days: 5 },
    { grace_days: 5 }
  );

  assert.equal(estado.status, ESTADOS_SUSCRIPCION.PAST_DUE);
  assert.equal(estado.grace_remaining > 0, true);
});

test("mantiene estados suspendido y cancelado sin reactivar por fecha", () => {
  const suspendida = calcularEstadoVigente(
    { status: "SUSPENDED", expires_at: fechaEnDias(30), grace_days: 5 },
    { grace_days: 5 }
  );
  const cancelada = calcularEstadoVigente(
    { status: "CANCELLED", expires_at: fechaEnDias(30), grace_days: 5 },
    { grace_days: 5 }
  );

  assert.equal(suspendida.status, ESTADOS_SUSCRIPCION.SUSPENDED);
  assert.equal(cancelada.status, ESTADOS_SUSCRIPCION.CANCELLED);
});

test("solo roles globales califican como administrador de sistema", () => {
  assert.equal(normalizarRol("SUPER_ADMIN"), "superadmin");
  assert.equal(esAdminSistema("SUPER_ADMIN"), true);
  assert.equal(esAdminSistema("superadmin"), true);
  assert.equal(esAdminSistema("admin_cliente"), false);
  assert.equal(esAdminSistema("usuario_cliente"), false);
});

test("abstraccion de pagos conserva proveedor futuro sin acoplar la suscripcion", () => {
  const pago = construirPagoSuscripcion({
    provider: PROVEEDORES_PAGO_SUSCRIPCION.FLOW,
    transactionId: "TRX-1",
    paymentMethod: "tarjeta",
  });

  assert.equal(pago.provider, "flow");
  assert.equal(pago.transaction_id, "TRX-1");
  assert.equal(pago.payment_method, "tarjeta");
});
