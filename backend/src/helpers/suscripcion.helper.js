const ESTADOS_SUSCRIPCION = Object.freeze({
  TRIAL: "TRIAL",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  EXPIRED: "EXPIRED",
  SUSPENDED: "SUSPENDED",
  CANCELLED: "CANCELLED",
});

const ACCIONES_SUSCRIPCION = Object.freeze({
  ALTA: "ALTA",
  CAMBIO_PLAN: "CAMBIO_PLAN",
  RENOVACION: "RENOVACION",
  SUSPENSION: "SUSPENSION",
  REACTIVACION: "REACTIVACION",
  CANCELACION: "CANCELACION",
  VENCIMIENTO: "VENCIMIENTO",
  EXTENSION_MANUAL: "EXTENSION_MANUAL",
  PAGO_MANUAL: "PAGO_MANUAL",
  NOTA_INTERNA: "NOTA_INTERNA",
  LIMITES: "LIMITES",
});

const ESTADOS_PAGO = Object.freeze({
  PAID: "PAID",
  PENDING: "PENDING",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
  VOID: "VOID",
});

const CODIGO_PLAN_UNICO = "servcontable_pro";
const NOMBRE_SERVICIO_UNICO = "SERVCONTABLE PRO";
const PRECIO_BASE_MENSUAL_DEFECTO = 29990;
const PRECIO_USUARIO_ADICIONAL_DEFECTO = 3990;
const IVA_DEFECTO = 0.19;
const USUARIOS_INCLUIDOS_DEFECTO = 1;

const SETTINGS_DEFECTO = [
  ["trial_days", "30"],
  ["grace_days", "5"],
  ["expiry_notice_days", "10,5,2,0"],
  ["currency", "CLP"],
  ["expired_status", ESTADOS_SUSCRIPCION.EXPIRED],
  ["suspension_policy", "manual_after_grace"],
  ["default_plan_code", CODIGO_PLAN_UNICO],
  ["commercial_service_name", NOMBRE_SERVICIO_UNICO],
  ["commercial_monthly_base_price", String(PRECIO_BASE_MENSUAL_DEFECTO)],
  ["commercial_included_users", String(USUARIOS_INCLUIDOS_DEFECTO)],
  ["commercial_additional_user_price", String(PRECIO_USUARIO_ADICIONAL_DEFECTO)],
  ["commercial_iva_rate", String(IVA_DEFECTO)],
  ["commercial_companies_limit", "unlimited"],
];

const PLANES_INICIALES = [
  {
    code: CODIGO_PLAN_UNICO,
    name: NOMBRE_SERVICIO_UNICO,
    description: "Servicio unico mensual con 1 usuario incluido, empresas ilimitadas y usuarios adicionales facturables.",
    monthly_price: PRECIO_BASE_MENSUAL_DEFECTO,
    annual_price: PRECIO_BASE_MENSUAL_DEFECTO * 12,
    max_companies: null,
    max_users: null,
    trial_days: 30,
    sort_order: 10,
    features: ["1 usuario incluido", "Empresas ilimitadas", "Usuarios adicionales facturables"],
  },
];

let esquemaInicializado = false;

function normalizarEstadoSuscripcion(estado = "") {
  const valor = String(estado || "").trim().toUpperCase();

  if (Object.values(ESTADOS_SUSCRIPCION).includes(valor)) return valor;
  if (["ACTIVA", "ACTIVO", "PAGADA"].includes(valor)) return ESTADOS_SUSCRIPCION.ACTIVE;
  if (["DEMO", "PRUEBA"].includes(valor)) return ESTADOS_SUSCRIPCION.TRIAL;
  if (["VENCIDA", "VENCIDO"].includes(valor)) return ESTADOS_SUSCRIPCION.EXPIRED;
  if (["SUSPENDIDA", "SUSPENDIDO"].includes(valor)) return ESTADOS_SUSCRIPCION.SUSPENDED;
  if (["CANCELADA", "CANCELADO"].includes(valor)) return ESTADOS_SUSCRIPCION.CANCELLED;

  return ESTADOS_SUSCRIPCION.ACTIVE;
}

function fechaISO(fecha) {
  if (!fecha) return null;
  if (fecha instanceof Date) return fecha.toISOString().slice(0, 10);
  return String(fecha).slice(0, 10);
}

function sumarMeses(fechaBase, meses) {
  const fecha = fechaBase ? new Date(`${fechaISO(fechaBase)}T12:00:00`) : new Date();
  fecha.setMonth(fecha.getMonth() + Number(meses || 0));
  return fecha.toISOString().slice(0, 10);
}

function sumarDias(fechaBase, dias) {
  const fecha = fechaBase ? new Date(`${fechaISO(fechaBase)}T12:00:00`) : new Date();
  fecha.setDate(fecha.getDate() + Number(dias || 0));
  return fecha.toISOString().slice(0, 10);
}

function numeroConfiguracion(valor, defecto = 0) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : defecto;
}

function tasaIvaConfiguracion(valor) {
  const numero = numeroConfiguracion(valor, IVA_DEFECTO);
  if (numero > 1) return numero / 100;
  if (numero < 0) return IVA_DEFECTO;
  return numero;
}

function normalizarConfiguracionComercial(config = {}) {
  const usuariosIncluidos = Math.max(
    1,
    Math.round(numeroConfiguracion(config.commercial_included_users ?? config.included_users, USUARIOS_INCLUIDOS_DEFECTO))
  );

  return {
    service_name: limpiarNombreServicio(config.commercial_service_name || config.service_name),
    monthly_base_price: Math.max(
      0,
      Math.round(numeroConfiguracion(config.commercial_monthly_base_price ?? config.monthly_base_price, PRECIO_BASE_MENSUAL_DEFECTO))
    ),
    included_users: usuariosIncluidos,
    additional_user_price: Math.max(
      0,
      Math.round(numeroConfiguracion(config.commercial_additional_user_price ?? config.additional_user_price, PRECIO_USUARIO_ADICIONAL_DEFECTO))
    ),
    iva_rate: tasaIvaConfiguracion(config.commercial_iva_rate ?? config.iva_rate),
    companies_unlimited: String(config.commercial_companies_limit || "unlimited").toLowerCase() !== "limited",
  };
}

function limpiarNombreServicio(valor) {
  const texto = String(valor || "").trim();
  return texto || NOMBRE_SERVICIO_UNICO;
}

function calcularMontoSuscripcion({ usuariosActivos = 1, meses = 1, config = {} } = {}) {
  const comercial = normalizarConfiguracionComercial(config);
  const mesesCobrados = Math.max(1, Math.round(numeroConfiguracion(meses, 1)));
  const usuariosActivosFinal = Math.max(0, Math.round(numeroConfiguracion(usuariosActivos, 0)));
  const usuariosAdicionales = Math.max(0, usuariosActivosFinal - comercial.included_users);
  const precioBaseTotal = comercial.monthly_base_price * mesesCobrados;
  const usuariosAdicionalesTotal =
    usuariosAdicionales * comercial.additional_user_price * mesesCobrados;
  const subtotal = precioBaseTotal + usuariosAdicionalesTotal;
  const iva = Math.round(subtotal * comercial.iva_rate);

  return {
    service_name: comercial.service_name,
    usuarios_activos: usuariosActivosFinal,
    usuarios_incluidos: comercial.included_users,
    usuarios_adicionales: usuariosAdicionales,
    meses_cobrados: mesesCobrados,
    precio_base_mensual: comercial.monthly_base_price,
    precio_base_total: precioBaseTotal,
    precio_usuario_adicional: comercial.additional_user_price,
    usuarios_adicionales_total: usuariosAdicionalesTotal,
    subtotal,
    iva_rate: comercial.iva_rate,
    iva,
    total: subtotal + iva,
    empresas_ilimitadas: comercial.companies_unlimited,
  };
}

async function asegurarEsquemaSuscripcion(client) {
  await client.query(`
    ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS suscripcion_estado VARCHAR(50) DEFAULT 'activa',
      ADD COLUMN IF NOT EXISTS suscripcion_plan VARCHAR(50),
      ADD COLUMN IF NOT EXISTS suscripcion_inicio DATE,
      ADD COLUMN IF NOT EXISTS suscripcion_vence DATE,
      ADD COLUMN IF NOT EXISTS suscripcion_usuarios_adicionales INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS suscripcion_actualizada_en TIMESTAMP WITHOUT TIME ZONE,
      ADD COLUMN IF NOT EXISTS ultimo_acceso_en TIMESTAMP WITHOUT TIME ZONE,
      ADD COLUMN IF NOT EXISTS demo_activo BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS demo_inicio DATE,
      ADD COLUMN IF NOT EXISTS demo_vence DATE
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id SERIAL PRIMARY KEY,
      code VARCHAR(80) NOT NULL UNIQUE,
      name VARCHAR(160) NOT NULL,
      description TEXT,
      monthly_price INTEGER NOT NULL DEFAULT 0,
      annual_price INTEGER NOT NULL DEFAULT 0,
      max_companies INTEGER,
      max_users INTEGER,
      features JSONB NOT NULL DEFAULT '[]'::jsonb,
      active BOOLEAN NOT NULL DEFAULT true,
      trial_days INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      plan_id INTEGER REFERENCES subscription_plans(id),
      status VARCHAR(30) NOT NULL DEFAULT 'TRIAL',
      billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',
      price INTEGER NOT NULL DEFAULT 0,
      currency VARCHAR(12) NOT NULL DEFAULT 'CLP',
      starts_at DATE NOT NULL DEFAULT CURRENT_DATE,
      renews_at DATE,
      expires_at DATE,
      trial_starts_at DATE,
      trial_ends_at DATE,
      auto_renew BOOLEAN NOT NULL DEFAULT false,
      grace_days INTEGER NOT NULL DEFAULT 5,
      max_companies_override INTEGER,
      max_users_override INTEGER,
      internal_notes TEXT,
      cancelled_at TIMESTAMP WITHOUT TIME ZONE,
      suspended_at TIMESTAMP WITHOUT TIME ZONE,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS subscription_payments (
      id SERIAL PRIMARY KEY,
      subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
      amount INTEGER NOT NULL DEFAULT 0,
      period_label VARCHAR(80),
      payment_method VARCHAR(80),
      status VARCHAR(30) NOT NULL DEFAULT 'PAID',
      transaction_id VARCHAR(160),
      tax_document VARCHAR(160),
      notes TEXT,
      provider VARCHAR(80) DEFAULT 'manual',
      provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE subscription_payments
      ADD COLUMN IF NOT EXISTS service_name VARCHAR(160),
      ADD COLUMN IF NOT EXISTS base_price INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS included_users INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS active_users INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS additional_users INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS additional_user_price INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS additional_users_amount INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS subtotal INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS iva_rate NUMERIC(8,4) NOT NULL DEFAULT 0.19,
      ADD COLUMN IF NOT EXISTS iva_amount INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_amount INTEGER NOT NULL DEFAULT 0
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS subscription_history (
      id SERIAL PRIMARY KEY,
      subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      admin_user_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      action VARCHAR(80) NOT NULL,
      previous_status VARCHAR(30),
      new_status VARCHAR(30),
      previous_values JSONB NOT NULL DEFAULT '{}'::jsonb,
      new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
      observation TEXT,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id SERIAL PRIMARY KEY,
      admin_user_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      admin_email VARCHAR(220),
      customer_user_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      action VARCHAR(120) NOT NULL,
      previous_values JSONB NOT NULL DEFAULT '{}'::jsonb,
      new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip_address VARCHAR(120),
      observation TEXT,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS subscription_notifications (
      id SERIAL PRIMARY KEY,
      subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      event_type VARCHAR(80) NOT NULL,
      title VARCHAR(180) NOT NULL,
      message TEXT NOT NULL,
      channel VARCHAR(40) NOT NULL DEFAULT 'in_app',
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      scheduled_at TIMESTAMP WITHOUT TIME ZONE,
      sent_at TIMESTAMP WITHOUT TIME ZONE,
      read_at TIMESTAMP WITHOUT TIME ZONE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS subscription_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await client.query("CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id)");
  await client.query("CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status)");
  await client.query("CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions (expires_at)");
  await client.query("CREATE INDEX IF NOT EXISTS idx_subscription_payments_user ON subscription_payments (user_id)");
  await client.query("CREATE INDEX IF NOT EXISTS idx_subscription_history_user ON subscription_history (user_id)");
  await client.query("CREATE INDEX IF NOT EXISTS idx_admin_audit_customer ON admin_audit_logs (customer_user_id)");
  await client.query("CREATE INDEX IF NOT EXISTS idx_subscription_notifications_user ON subscription_notifications (user_id)");
  await client.query("CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios (email)");
}

async function asegurarDatosBaseSuscripcion(client) {
  for (const [key, value] of SETTINGS_DEFECTO) {
    await client.query(
      "INSERT INTO subscription_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
      [key, value]
    );
  }

  for (const plan of PLANES_INICIALES) {
    await client.query(
      `
      INSERT INTO subscription_plans
      (code, name, description, monthly_price, annual_price, max_companies, max_users, features, active, trial_days, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,true,$9,$10)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          description = EXCLUDED.description,
          monthly_price = EXCLUDED.monthly_price,
          annual_price = EXCLUDED.annual_price,
          max_companies = NULL,
          max_users = NULL,
          features = EXCLUDED.features,
          active = true,
          trial_days = EXCLUDED.trial_days,
          sort_order = EXCLUDED.sort_order,
          updated_at = NOW()
      `,
      [
        plan.code,
        plan.name,
        plan.description,
        plan.monthly_price,
        plan.annual_price,
        plan.max_companies,
        plan.max_users,
        JSON.stringify(plan.features),
        plan.trial_days,
        plan.sort_order,
      ]
    );
  }

  await client.query(
    "UPDATE subscription_plans SET active = false, updated_at = NOW() WHERE code <> $1",
    [CODIGO_PLAN_UNICO]
  );
}

async function inicializarSuscripciones(pool) {
  if (esquemaInicializado) return;

  const client = await pool.connect();

  try {
    await asegurarEsquemaSuscripcion(client);
    await asegurarDatosBaseSuscripcion(client);
    esquemaInicializado = true;
  } finally {
    client.release();
  }
}

async function obtenerConfiguracionSuscripcion(client) {
  await asegurarEsquemaSuscripcion(client);
  const resultado = await client.query("SELECT key, value FROM subscription_settings");
  const config = Object.fromEntries(SETTINGS_DEFECTO);

  for (const fila of resultado.rows) {
    config[fila.key] = fila.value;
  }

  const comercial = normalizarConfiguracionComercial(config);

  return {
    trial_days: Number(config.trial_days || 14),
    grace_days: Number(config.grace_days || 5),
    expiry_notice_days: String(config.expiry_notice_days || "10,5,2,0")
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item) && item >= 0),
    currency: config.currency || "CLP",
    expired_status: normalizarEstadoSuscripcion(config.expired_status),
    suspension_policy: config.suspension_policy || "manual_after_grace",
    default_plan_code: CODIGO_PLAN_UNICO,
    commercial_service_name: comercial.service_name,
    commercial_monthly_base_price: comercial.monthly_base_price,
    commercial_included_users: comercial.included_users,
    commercial_additional_user_price: comercial.additional_user_price,
    commercial_iva_rate: comercial.iva_rate,
    commercial_companies_limit: comercial.companies_unlimited ? "unlimited" : "limited",
    service_name: comercial.service_name,
    monthly_base_price: comercial.monthly_base_price,
    included_users: comercial.included_users,
    additional_user_price: comercial.additional_user_price,
    iva_rate: comercial.iva_rate,
    companies_unlimited: comercial.companies_unlimited,
  };
}

async function registrarHistoriaSuscripcion({
  client,
  subscriptionId,
  userId,
  adminUserId = null,
  action,
  previousStatus = null,
  newStatus = null,
  previousValues = {},
  newValues = {},
  observation = "",
}) {
  await client.query(
    `
    INSERT INTO subscription_history
    (subscription_id, user_id, admin_user_id, action, previous_status, new_status, previous_values, new_values, observation)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)
    `,
    [
      subscriptionId || null,
      userId || null,
      adminUserId || null,
      action,
      previousStatus,
      newStatus,
      JSON.stringify(previousValues || {}),
      JSON.stringify(newValues || {}),
      observation || "",
    ]
  );
}

async function registrarAuditoriaAdmin({
  client,
  req = null,
  customerUserId = null,
  action,
  previousValues = {},
  newValues = {},
  observation = "",
}) {
  await client.query(
    `
    INSERT INTO admin_audit_logs
    (admin_user_id, admin_email, customer_user_id, action, previous_values, new_values, ip_address, observation)
    VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)
    `,
    [
      req?.usuario?.id || null,
      req?.usuario?.email || null,
      customerUserId || null,
      action,
      JSON.stringify(previousValues || {}),
      JSON.stringify(newValues || {}),
      req?.ip || req?.headers?.["x-forwarded-for"] || null,
      observation || "",
    ]
  );
}

async function obtenerPlanPorCodigo(client, code) {
  const resultado = await client.query(
    "SELECT * FROM subscription_plans WHERE code = $1 LIMIT 1",
    [code]
  );
  return resultado.rows[0] || null;
}

async function obtenerSuscripcionUsuario(client, usuarioId) {
  const resultado = await client.query(
    `
    SELECT s.*, sp.code AS plan_code, sp.name AS plan_name, sp.max_companies, sp.max_users
    FROM subscriptions s
    LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE s.user_id = $1
    ORDER BY s.created_at DESC
    LIMIT 1
    `,
    [usuarioId]
  );

  return resultado.rows[0] || null;
}

async function crearSuscripcionDesdeUsuarioLegacy(client, usuario) {
  const config = await obtenerConfiguracionSuscripcion(client);
  const planCode = config.default_plan_code;
  const plan =
    (await obtenerPlanPorCodigo(client, planCode)) ||
    (await obtenerPlanPorCodigo(client, config.default_plan_code));
  const estado = usuario.demo_activo
    ? ESTADOS_SUSCRIPCION.TRIAL
    : normalizarEstadoSuscripcion(usuario.suscripcion_estado);
  const inicio =
    fechaISO(usuario.suscripcion_inicio || usuario.demo_inicio) ||
    new Date().toISOString().slice(0, 10);
  const vence =
    fechaISO(usuario.suscripcion_vence || usuario.demo_vence) ||
    sumarDias(inicio, config.trial_days);

  const resultado = await client.query(
    `
    INSERT INTO subscriptions
    (user_id, plan_id, status, billing_cycle, price, currency, starts_at, renews_at, expires_at,
     trial_starts_at, trial_ends_at, auto_renew, grace_days)
    VALUES ($1,$2,$3,'monthly',$4,$5,$6,$7,$7,$8,$9,false,$10)
    RETURNING *
    `,
    [
      usuario.id,
      plan?.id || null,
      estado,
      Number(config.monthly_base_price || plan?.monthly_price || 0),
      config.currency,
      inicio,
      vence,
      estado === ESTADOS_SUSCRIPCION.TRIAL ? inicio : null,
      estado === ESTADOS_SUSCRIPCION.TRIAL ? vence : null,
      config.grace_days,
    ]
  );

  const suscripcion = resultado.rows[0];
  await registrarHistoriaSuscripcion({
    client,
    subscriptionId: suscripcion.id,
    userId: usuario.id,
    action: ACCIONES_SUSCRIPCION.ALTA,
    newStatus: estado,
    newValues: suscripcion,
    observation: "Suscripcion creada desde datos legacy del usuario.",
  });

  return obtenerSuscripcionUsuario(client, usuario.id);
}

function calcularEstadoVigente(suscripcion, config) {
  if (!suscripcion) {
    return { status: ESTADOS_SUSCRIPCION.ACTIVE, days_remaining: null, grace_remaining: null };
  }

  const status = normalizarEstadoSuscripcion(suscripcion.status);

  if ([ESTADOS_SUSCRIPCION.SUSPENDED, ESTADOS_SUSCRIPCION.CANCELLED].includes(status)) {
    return { status, days_remaining: 0, grace_remaining: 0 };
  }

  const expiresAt = fechaISO(suscripcion.expires_at || suscripcion.trial_ends_at);

  if (!expiresAt) {
    return { status, days_remaining: null, grace_remaining: null };
  }

  const hoy = new Date(new Date().toISOString().slice(0, 10));
  const vence = new Date(`${expiresAt}T00:00:00`);
  const diff = Math.ceil((vence.getTime() - hoy.getTime()) / 86400000);

  if (diff >= 0) {
    return {
      status,
      days_remaining: diff,
      grace_remaining: Number(suscripcion.grace_days || config.grace_days),
    };
  }

  const graceDays = Number(suscripcion.grace_days || config.grace_days || 0);
  const graceRemaining = Math.max(graceDays + diff, 0);

  if (graceRemaining > 0 && status !== ESTADOS_SUSCRIPCION.TRIAL) {
    return { status: ESTADOS_SUSCRIPCION.PAST_DUE, days_remaining: diff, grace_remaining: graceRemaining };
  }

  return { status: ESTADOS_SUSCRIPCION.EXPIRED, days_remaining: diff, grace_remaining: 0 };
}

function calcularDiasRestantesTrial(suscripcion, fechaReferencia = new Date()) {
  if (!suscripcion) return null;

  const status = normalizarEstadoSuscripcion(suscripcion.status);

  if (status !== ESTADOS_SUSCRIPCION.TRIAL) return null;

  const trialEnd = fechaISO(
    suscripcion.trial_ends_at ||
      suscripcion.trial_end ||
      suscripcion.trial_vence ||
      suscripcion.expires_at
  );

  if (!trialEnd) return null;

  const referenciaISO = fechaISO(fechaReferencia) || new Date().toISOString().slice(0, 10);
  const referencia = new Date(`${referenciaISO}T00:00:00`);
  const vence = new Date(`${trialEnd}T00:00:00`);

  if (Number.isNaN(referencia.getTime()) || Number.isNaN(vence.getTime())) {
    return null;
  }

  return Math.ceil((vence.getTime() - referencia.getTime()) / 86400000);
}

function tieneAccesoOperativo(suscripcion, opciones = {}) {
  if (!suscripcion) return false;

  const estadoCalculado =
    Object.prototype.hasOwnProperty.call(suscripcion, "days_remaining") ||
    Object.prototype.hasOwnProperty.call(suscripcion, "grace_remaining")
      ? suscripcion
      : calcularEstadoVigente(suscripcion, opciones.config || {});
  const status = normalizarEstadoSuscripcion(estadoCalculado.status);

  if (status === ESTADOS_SUSCRIPCION.ACTIVE) return true;
  if (status === ESTADOS_SUSCRIPCION.PAST_DUE) return true;

  if (status === ESTADOS_SUSCRIPCION.TRIAL) {
    if (estadoCalculado.days_remaining !== null && estadoCalculado.days_remaining !== undefined) {
      return Number(estadoCalculado.days_remaining) >= 0;
    }

    const diasRestantes = calcularDiasRestantesTrial(suscripcion, opciones.fechaReferencia);
    return diasRestantes !== null && diasRestantes >= 0;
  }

  return false;
}

const hasOperationalAccess = tieneAccesoOperativo;

async function sincronizarEstadoVencido(client, suscripcion, estadoCalculado) {
  if (!suscripcion || suscripcion.status === estadoCalculado.status) return suscripcion;

  if (![ESTADOS_SUSCRIPCION.PAST_DUE, ESTADOS_SUSCRIPCION.EXPIRED].includes(estadoCalculado.status)) {
    return suscripcion;
  }

  const anterior = { status: suscripcion.status };
  const resultado = await client.query(
    "UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
    [estadoCalculado.status, suscripcion.id]
  );

  await registrarHistoriaSuscripcion({
    client,
    subscriptionId: suscripcion.id,
    userId: suscripcion.user_id,
    action: ACCIONES_SUSCRIPCION.VENCIMIENTO,
    previousStatus: anterior.status,
    newStatus: estadoCalculado.status,
    previousValues: anterior,
    newValues: { status: estadoCalculado.status },
    observation: "Estado ajustado automaticamente segun vencimiento.",
  });

  return resultado.rows[0];
}

async function validarAccesoSuscripcion(client, usuario) {
  await asegurarEsquemaSuscripcion(client);
  const { esAdminSistema } = require("./auth.helper");

  if (!usuario?.id || esAdminSistema(usuario?.rol)) {
    return { permitido: true, status: ESTADOS_SUSCRIPCION.ACTIVE };
  }

  const usuarioDb = await client.query(
    `
    SELECT id, activo, suscripcion_estado, suscripcion_plan, suscripcion_inicio, suscripcion_vence,
           demo_activo, demo_inicio, demo_vence
    FROM usuarios
    WHERE id = $1
    LIMIT 1
    `,
    [usuario.id]
  );

  if (usuarioDb.rows.length === 0 || usuarioDb.rows[0].activo === false) {
    return { permitido: false, status: "USER_INACTIVE", mensaje: "Usuario inactivo." };
  }

  const config = await obtenerConfiguracionSuscripcion(client);
  let suscripcion = await obtenerSuscripcionUsuario(client, usuario.id);

  if (!suscripcion) {
    suscripcion = await crearSuscripcionDesdeUsuarioLegacy(client, usuarioDb.rows[0]);
  }

  const estadoCalculado = calcularEstadoVigente(suscripcion, config);
  await sincronizarEstadoVencido(client, suscripcion, estadoCalculado);

  const accesoOperativo = tieneAccesoOperativo(estadoCalculado, { config });

  if (!accesoOperativo) {
    return {
      permitido: false,
      status: estadoCalculado.status,
      subscription: suscripcion,
      days_remaining: estadoCalculado.days_remaining,
      grace_remaining: estadoCalculado.grace_remaining,
      mensaje:
        estadoCalculado.status === ESTADOS_SUSCRIPCION.SUSPENDED
          ? "La cuenta esta suspendida. Contacta al administrador."
          : "La suscripcion no esta vigente. Regulariza el servicio para continuar.",
    };
  }

  return {
    permitido: true,
    status: estadoCalculado.status,
    subscription: suscripcion,
    operational_access: true,
    days_remaining: estadoCalculado.days_remaining,
    grace_remaining: estadoCalculado.grace_remaining,
  };
}

async function obtenerLimitesPlanUsuario(client, usuarioId) {
  await asegurarEsquemaSuscripcion(client);
  const config = await obtenerConfiguracionSuscripcion(client);
  let suscripcion = await obtenerSuscripcionUsuario(client, usuarioId);

  if (!suscripcion) {
    const usuario = await client.query("SELECT * FROM usuarios WHERE id = $1 LIMIT 1", [usuarioId]);
    if (usuario.rows.length === 0) return { max_companies: null, max_users: null };
    suscripcion = await crearSuscripcionDesdeUsuarioLegacy(client, usuario.rows[0]);
  }

  const estado = calcularEstadoVigente(suscripcion, config);

  return {
    status: estado.status,
    max_companies: null,
    max_users: null,
    empresas_ilimitadas: true,
    usuarios_adicionales_facturables: true,
  };
}

async function validarLimiteEmpresasUsuario(client, usuario) {
  const { esAdminSistema } = require("./auth.helper");
  if (!usuario?.id || esAdminSistema(usuario?.rol)) return { permitido: true };
  return { permitido: true, empresas_ilimitadas: true };
}

async function validarLimiteUsuariosCliente(client, usuario) {
  const { esAdminSistema } = require("./auth.helper");
  if (!usuario?.id || esAdminSistema(usuario?.rol)) return { permitido: true };
  return { permitido: true, usuarios_adicionales_facturables: true };
}

async function extenderSuscripcionUsuario(
  client,
  usuarioId,
  meses,
  periodicidad = "mensual",
  usuariosAdicionales = 0,
  externalReference = ""
) {
  await asegurarEsquemaSuscripcion(client);
  const usuarioResult = await client.query("SELECT * FROM usuarios WHERE id = $1 LIMIT 1", [
    usuarioId,
  ]);

  if (usuarioResult.rows.length === 0) {
    throw new Error("Usuario no encontrado para activar suscripcion.");
  }

  let suscripcion = await obtenerSuscripcionUsuario(client, usuarioId);

  if (!suscripcion) {
    suscripcion = await crearSuscripcionDesdeUsuarioLegacy(client, usuarioResult.rows[0]);
  }

  const mesesFinal = periodicidad === "anual" ? 12 : Math.max(Number(meses || 1), 1);
  const base =
    suscripcion.expires_at &&
    new Date(`${fechaISO(suscripcion.expires_at)}T23:59:59`) > new Date()
      ? suscripcion.expires_at
      : new Date().toISOString().slice(0, 10);
  const nuevaFecha = sumarMeses(base, mesesFinal);
  const anterior = { ...suscripcion };

  const actualizado = await client.query(
    `
    UPDATE subscriptions
    SET status = 'ACTIVE',
        billing_cycle = $1,
        renews_at = $2,
        expires_at = $2,
        trial_starts_at = NULL,
        trial_ends_at = NULL,
        updated_at = NOW()
    WHERE id = $3
    RETURNING *
    `,
    [periodicidad === "anual" ? "annual" : "monthly", nuevaFecha, suscripcion.id]
  );

  await client.query(
    `
    UPDATE usuarios
    SET suscripcion_estado = 'activa',
        suscripcion_vence = $1,
        suscripcion_usuarios_adicionales = $2,
        suscripcion_actualizada_en = NOW()
    WHERE id = $3
    `,
    [nuevaFecha, Number(usuariosAdicionales || 0), usuarioId]
  );

  await registrarHistoriaSuscripcion({
    client,
    subscriptionId: suscripcion.id,
    userId: usuarioId,
    action: ACCIONES_SUSCRIPCION.RENOVACION,
    previousStatus: anterior.status,
    newStatus: ESTADOS_SUSCRIPCION.ACTIVE,
    previousValues: anterior,
    newValues: actualizado.rows[0],
    observation: externalReference ? `Pago externo ${externalReference}` : "Renovacion de suscripcion.",
  });

  return actualizado.rows[0];
}

module.exports = {
  ESTADOS_SUSCRIPCION,
  ACCIONES_SUSCRIPCION,
  ESTADOS_PAGO,
  CODIGO_PLAN_UNICO,
  NOMBRE_SERVICIO_UNICO,
  calcularMontoSuscripcion,
  asegurarEsquemaSuscripcion,
  inicializarSuscripciones,
  obtenerConfiguracionSuscripcion,
  registrarHistoriaSuscripcion,
  registrarAuditoriaAdmin,
  normalizarEstadoSuscripcion,
  calcularEstadoVigente,
  calcularDiasRestantesTrial,
  tieneAccesoOperativo,
  hasOperationalAccess,
  validarAccesoSuscripcion,
  validarLimiteEmpresasUsuario,
  validarLimiteUsuariosCliente,
  extenderSuscripcionUsuario,
  fechaISO,
  sumarMeses,
  sumarDias,
};
