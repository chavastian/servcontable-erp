const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ESTADOS_SUSCRIPCION,
  calcularMontoSuscripcion,
  calcularEstadoVigente,
  tieneAccesoOperativo,
  normalizarEstadoSuscripcion,
} = require("../src/helpers/suscripcion.helper");
const { esAdminSistema, normalizarRol } = require("../src/helpers/auth.helper");
const {
  PROVEEDORES_PAGO_SUSCRIPCION,
  construirPagoSuscripcion,
} = require("../src/helpers/pagosSuscripcion.helper");
const { normalizarRut, pareceRut } = require("../src/helpers/rut.helper");

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

test("centraliza acceso operativo de suscripciones", () => {
  assert.equal(tieneAccesoOperativo(null), false);
  assert.equal(tieneAccesoOperativo({ status: "ACTIVE" }), true);
  assert.equal(
    tieneAccesoOperativo({ status: "TRIAL", trial_ends_at: fechaEnDias(1) }),
    true
  );
  assert.equal(
    tieneAccesoOperativo({ status: "TRIAL", trial_ends_at: fechaEnDias(-10) }),
    false
  );
  assert.equal(tieneAccesoOperativo({ status: "EXPIRED" }), false);
  assert.equal(tieneAccesoOperativo({ status: "SUSPENDED" }), false);
  assert.equal(tieneAccesoOperativo({ status: "CANCELLED" }), false);
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

test("calcula servicio unico con 1 usuario incluido y empresas ilimitadas", () => {
  const monto = calcularMontoSuscripcion({ usuariosActivos: 1 });

  assert.equal(monto.precio_base_mensual, 29990);
  assert.equal(monto.usuarios_incluidos, 1);
  assert.equal(monto.usuarios_adicionales, 0);
  assert.equal(monto.subtotal, 29990);
  assert.equal(monto.iva, 5698);
  assert.equal(monto.total, 35688);
  assert.equal(monto.empresas_ilimitadas, true);
});

test("calcula usuarios adicionales facturables sin cobrar empresas", () => {
  const monto = calcularMontoSuscripcion({ usuariosActivos: 5 });

  assert.equal(monto.usuarios_adicionales, 4);
  assert.equal(monto.usuarios_adicionales_total, 15960);
  assert.equal(monto.subtotal, 45950);
  assert.equal(monto.iva, 8731);
  assert.equal(monto.total, 54681);
});

test("normaliza y valida RUT chileno para login autoservicio", () => {
  const rut = normalizarRut("16.153.127-8");

  assert.equal(rut.valido, true);
  assert.equal(rut.rut, "16.153.127-8");
  assert.equal(rut.rut_normalizado, "16153127-8");
  assert.equal(pareceRut("161531278"), true);
  assert.equal(normalizarRut("16.153.127-9").valido, false);
});
