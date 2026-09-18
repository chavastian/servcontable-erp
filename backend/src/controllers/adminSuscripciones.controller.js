const pool = require("../database/db");
const {
  ACCIONES_SUSCRIPCION,
  CODIGO_PLAN_UNICO,
  ESTADOS_PAGO,
  ESTADOS_SUSCRIPCION,
  NOMBRE_SERVICIO_UNICO,
  calcularMontoSuscripcion,
  calcularEstadoVigente,
  fechaISO,
  normalizarEstadoSuscripcion,
  obtenerConfiguracionSuscripcion,
  registrarAuditoriaAdmin,
  registrarHistoriaSuscripcion,
  sumarDias,
  sumarMeses,
} = require("../helpers/suscripcion.helper");
const { construirPagoSuscripcion } = require("../helpers/pagosSuscripcion.helper");

function limpiarTexto(valor) {
  if (valor === undefined || valor === null) return "";
  return String(valor).trim();
}

function numeroEntero(valor, defecto = 0) {
  const numero = Number.parseInt(valor, 10);
  return Number.isFinite(numero) ? numero : defecto;
}

function valorBooleano(valor, defecto = false) {
  if (typeof valor === "boolean") return valor;
  const texto = String(valor ?? "").trim().toLowerCase();
  if (["true", "1", "si", "sí", "yes", "activo"].includes(texto)) return true;
  if (["false", "0", "no", "inactivo"].includes(texto)) return false;
  return defecto;
}

function normalizarCiclo(valor = "") {
  const texto = limpiarTexto(valor).toLowerCase();
  if (["annual", "anual"].includes(texto)) return "annual";
  return "monthly";
}

function filtrosClientes(query = {}) {
  const valores = [];
  const where = ["LOWER(COALESCE(u.rol, '')) NOT IN ('superadmin', 'admin', 'administrador_sistema')"];

  function agregar(valor, sql) {
    if (!valor) return;
    valores.push(valor);
    where.push(sql.replace("?", `$${valores.length}`));
  }

  agregar(limpiarTexto(query.estado), "s.status = ?");
  agregar(limpiarTexto(query.desde), "u.creado_en::date >= ?::date");
  agregar(limpiarTexto(query.hasta), "u.creado_en::date <= ?::date");
  agregar(limpiarTexto(query.vence_desde), "s.expires_at >= ?::date");
  agregar(limpiarTexto(query.vence_hasta), "s.expires_at <= ?::date");

  const busqueda = limpiarTexto(query.buscar || query.q);
  if (busqueda) {
    valores.push(`%${busqueda.toLowerCase()}%`);
    where.push(`(
      LOWER(COALESCE(u.nombre, '')) LIKE $${valores.length}
      OR LOWER(COALESCE(u.email, '')) LIKE $${valores.length}
      OR LOWER(COALESCE(e.rut, '')) LIKE $${valores.length}
      OR LOWER(COALESCE(e.razon_social, '')) LIKE $${valores.length}
    )`);
  }

  return { where: where.join(" AND "), valores };
}

function ordenarClientes(sort = "created_desc") {
  const opciones = {
    nombre: "cliente_nombre ASC",
    alta: "fecha_registro DESC",
    vencimiento: "proximo_vencimiento ASC NULLS LAST",
    estado: "estado_suscripcion ASC NULLS LAST",
    ultimo_acceso: "ultimo_acceso DESC NULLS LAST",
    created_desc: "fecha_registro DESC",
  };

  return opciones[sort] || opciones.created_desc;
}

function consultaClientesBase({ where = "1=1", orderBy = "fecha_registro DESC" } = {}) {
  return `
    SELECT
      u.id,
      u.nombre AS cliente_nombre,
      u.email AS correo,
      u.activo AS usuario_activo,
      u.creado_en AS fecha_registro,
      u.ultimo_acceso_en AS ultimo_acceso,
      s.id AS subscription_id,
      COALESCE(s.status, 'ACTIVE') AS estado_suscripcion,
      s.starts_at AS fecha_inicio_suscripcion,
      s.renews_at AS proxima_renovacion,
      s.expires_at AS proximo_vencimiento,
      s.billing_cycle,
      s.price,
      s.currency,
      s.auto_renew,
      s.grace_days,
      s.max_companies_override,
      s.max_users_override,
      s.internal_notes,
      sp.id AS plan_id,
      sp.code AS plan_code,
      sp.name AS plan_contratado,
      sp.monthly_price,
      sp.annual_price,
      sp.max_companies,
      sp.max_users,
      COALESCE(emp.empresas_utilizadas, 0)::int AS empresas_utilizadas,
      COALESCE(emp.empresa_principal, '') AS razon_social,
      COALESCE(emp.rut_principal, '') AS rut,
      COALESCE(emp.telefono_principal, '') AS telefono,
      COALESCE(emp.direccion_principal, '') AS direccion,
      COALESCE(usr.usuarios_activos, 0)::int AS usuarios_activos,
      COALESCE(pay.ultimo_medio_pago, '') AS medio_pago
    FROM usuarios u
    LEFT JOIN LATERAL (
      SELECT *
      FROM subscriptions s0
      WHERE s0.user_id = u.id
      ORDER BY s0.created_at DESC
      LIMIT 1
    ) s ON true
    LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(DISTINCT ue.empresa_id) FILTER (WHERE ue.activo = true)::int AS empresas_utilizadas,
        MIN(e.razon_social) AS empresa_principal,
        MIN(e.rut) AS rut_principal,
        MIN(e.telefono) AS telefono_principal,
        MIN(e.direccion) AS direccion_principal
      FROM usuarios_empresas ue
      JOIN empresas e ON e.id = ue.empresa_id
      WHERE ue.usuario_id = u.id
        AND ue.activo = true
        AND COALESCE(e.activa, true) = true
    ) emp ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT ue2.usuario_id)::int AS usuarios_activos
      FROM usuarios_empresas base
      JOIN usuarios_empresas ue2 ON ue2.empresa_id = base.empresa_id AND ue2.activo = true
      JOIN usuarios u2 ON u2.id = ue2.usuario_id AND u2.activo = true
      WHERE base.usuario_id = u.id
        AND base.activo = true
    ) usr ON true
    LEFT JOIN LATERAL (
      SELECT payment_method AS ultimo_medio_pago
      FROM subscription_payments p
      WHERE p.user_id = u.id
      ORDER BY p.payment_date DESC, p.id DESC
      LIMIT 1
    ) pay ON true
    WHERE ${where}
    ORDER BY ${orderBy}
  `;
}

function serializarCliente(fila, config) {
  const estado = calcularEstadoVigente(
    {
      status: fila.estado_suscripcion,
      expires_at: fila.proximo_vencimiento,
      trial_ends_at: fila.trial_ends_at,
      grace_days: fila.grace_days,
    },
    config
  );
  const resumenMensual = calcularMontoSuscripcion({
    usuariosActivos: Number(fila.usuarios_activos || 1),
    meses: 1,
    config,
  });

  return {
    ...fila,
    plan_code: CODIGO_PLAN_UNICO,
    plan_contratado: NOMBRE_SERVICIO_UNICO,
    estado_suscripcion_calculado: estado.status,
    dias_restantes: estado.days_remaining,
    gracia_restante: estado.grace_remaining,
    empresas_permitidas: null,
    empresas_ilimitadas: true,
    usuarios_incluidos: resumenMensual.usuarios_incluidos,
    usuarios_adicionales: resumenMensual.usuarios_adicionales,
    precio_base_mensual: resumenMensual.precio_base_mensual,
    precio_usuario_adicional: resumenMensual.precio_usuario_adicional,
    subtotal_mensual: resumenMensual.subtotal,
    iva_mensual: resumenMensual.iva,
    total_mensual: resumenMensual.total,
    resumen_mensual: resumenMensual,
  };
}

async function obtenerDashboard(req, res) {
  try {
    const config = await obtenerConfiguracionSuscripcion(pool);

    const clientesResult = await pool.query(
      consultaClientesBase({ where: "LOWER(COALESCE(u.rol, '')) NOT IN ('superadmin', 'admin', 'administrador_sistema')" })
    );
    const clientes = clientesResult.rows.map((fila) => serializarCliente(fila, config));
    const inicioMes = new Date();
    inicioMes.setDate(1);
    const inicioMesISO = inicioMes.toISOString().slice(0, 10);

    const [pagosMes, pagosPendientes] = await Promise.all([
      pool.query(
      `
      SELECT COALESCE(SUM(amount), 0)::int AS total
      FROM subscription_payments
      WHERE status = 'PAID'
        AND payment_date >= $1::date
      `,
      [inicioMesISO]
      ),
      pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM subscription_payments
        WHERE status = 'PENDING'
        `
      ),
    ]);

    const proximas = clientes.filter((item) => {
      const dias = Number(item.dias_restantes);
      return Number.isFinite(dias) && dias >= 0 && dias <= 10;
    });
    const clientesFacturables = clientes.filter((item) =>
      [ESTADOS_SUSCRIPCION.ACTIVE, ESTADOS_SUSCRIPCION.PAST_DUE].includes(item.estado_suscripcion_calculado)
    );
    const empresasRegistradas = clientes.reduce((total, item) => total + Number(item.empresas_utilizadas || 0), 0);
    const usuariosActivos = clientes.reduce((total, item) => total + Number(item.usuarios_activos || 0), 0);
    const usuariosAdicionalesActivos = clientesFacturables.reduce(
      (total, item) => total + Number(item.usuarios_adicionales || 0),
      0
    );
    const ingresoBaseMensual = clientesFacturables.reduce(
      (total, item) => total + Number(item.resumen_mensual?.precio_base_mensual || 0),
      0
    );
    const ingresoUsuariosAdicionales = clientesFacturables.reduce(
      (total, item) => total + Number(item.resumen_mensual?.usuarios_adicionales_total || 0),
      0
    );
    const ingresoMensualNeto = ingresoBaseMensual + ingresoUsuariosAdicionales;
    const ivaEstimado = Math.round(ingresoMensualNeto * Number(config.iva_rate || 0));

    return res.json({
      ok: true,
      metricas: {
        total_clientes: clientes.length,
        activos: clientes.filter((item) => item.estado_suscripcion_calculado === ESTADOS_SUSCRIPCION.ACTIVE).length,
        trial: clientes.filter((item) => item.estado_suscripcion_calculado === ESTADOS_SUSCRIPCION.TRIAL).length,
        proximas_vencer: proximas.length,
        vencidas: clientes.filter((item) => item.estado_suscripcion_calculado === ESTADOS_SUSCRIPCION.EXPIRED).length,
        suspendidas: clientes.filter((item) => item.estado_suscripcion_calculado === ESTADOS_SUSCRIPCION.SUSPENDED).length,
        canceladas: clientes.filter((item) => item.estado_suscripcion_calculado === ESTADOS_SUSCRIPCION.CANCELLED).length,
        nuevos_mes: clientes.filter((item) => fechaISO(item.fecha_registro) >= inicioMesISO).length,
        ingresos_mensuales: Number(pagosMes.rows[0]?.total || 0),
        mrr_estimado: ingresoMensualNeto,
        empresas_registradas: empresasRegistradas,
        usuarios_activos: usuariosActivos,
        usuarios_adicionales_activos: usuariosAdicionalesActivos,
        ingreso_base_mensual: ingresoBaseMensual,
        ingreso_usuarios_adicionales: ingresoUsuariosAdicionales,
        ingreso_mensual_neto: ingresoMensualNeto,
        iva_estimado: ivaEstimado,
        total_mensual_estimado: ingresoMensualNeto + ivaEstimado,
        pagos_recibidos: Number(pagosMes.rows[0]?.total || 0),
        pagos_pendientes: Number(pagosPendientes.rows[0]?.total || 0),
      },
      configuracion_comercial: {
        servicio: config.service_name,
        precio_base_mensual: config.monthly_base_price,
        iva_rate: config.iva_rate,
        usuarios_incluidos: config.included_users,
        precio_usuario_adicional: config.additional_user_price,
        empresas: "Ilimitadas",
        moneda: config.currency,
      },
      ingresos: {
        base_mensual: ingresoBaseMensual,
        usuarios_adicionales: ingresoUsuariosAdicionales,
        neto: ingresoMensualNeto,
        iva: ivaEstimado,
        total: ingresoMensualNeto + ivaEstimado,
      },
      proximas_vencer: proximas.slice(0, 10),
    });
  } catch (error) {
    console.error("Error dashboard suscripciones:", error);
    return res.status(500).json({ ok: false, error: "No se pudo obtener el dashboard de suscripciones." });
  }
}

async function listarClientes(req, res) {
  try {
    const config = await obtenerConfiguracionSuscripcion(pool);
    const { where, valores } = filtrosClientes(req.query);
    const sort = ordenarClientes(req.query.sort);
    const limite = Math.min(numeroEntero(req.query.limite, 300), 500);
    const resultado = await pool.query(`${consultaClientesBase({ where, orderBy: sort })} LIMIT $${valores.length + 1}`, [
      ...valores,
      limite,
    ]);

    return res.json({
      ok: true,
      total: resultado.rows.length,
      clientes: resultado.rows.map((fila) => serializarCliente(fila, config)),
    });
  } catch (error) {
    console.error("Error listar clientes suscripcion:", error);
    return res.status(500).json({ ok: false, error: "No se pudieron listar los clientes." });
  }
}

async function obtenerCliente(req, res) {
  try {
    const config = await obtenerConfiguracionSuscripcion(pool);
    const clienteId = numeroEntero(req.params.id);
    const clienteResult = await pool.query(
      consultaClientesBase({ where: "u.id = $1", orderBy: "u.id ASC" }),
      [clienteId]
    );

    if (clienteResult.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Cliente no encontrado." });
    }

    const cliente = serializarCliente(clienteResult.rows[0], config);
    const subscriptionId = cliente.subscription_id || null;

    const [pagos, historial, auditoria, notificaciones] = await Promise.all([
      pool.query(
        "SELECT * FROM subscription_payments WHERE user_id = $1 ORDER BY payment_date DESC, id DESC LIMIT 100",
        [clienteId]
      ),
      pool.query(
        "SELECT * FROM subscription_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100",
        [clienteId]
      ),
      pool.query(
        "SELECT * FROM admin_audit_logs WHERE customer_user_id = $1 ORDER BY created_at DESC LIMIT 100",
        [clienteId]
      ),
      pool.query(
        "SELECT * FROM subscription_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100",
        [clienteId]
      ),
    ]);

    return res.json({
      ok: true,
      cliente,
      suscripcion_id: subscriptionId,
      pagos: pagos.rows,
      historial: historial.rows,
      auditoria: auditoria.rows,
      notificaciones: notificaciones.rows,
    });
  } catch (error) {
    console.error("Error obtener cliente suscripcion:", error);
    return res.status(500).json({ ok: false, error: "No se pudo obtener la ficha del cliente." });
  }
}

async function listarPlanes(req, res) {
  try {
    const resultado = await pool.query("SELECT * FROM subscription_plans WHERE code = $1 ORDER BY id ASC", [
      CODIGO_PLAN_UNICO,
    ]);
    return res.json({ ok: true, planes: resultado.rows });
  } catch (error) {
    console.error("Error listar planes:", error);
    return res.status(500).json({ ok: false, error: "No se pudo listar el servicio comercial." });
  }
}

async function guardarPlan(req, res) {
  return res.status(400).json({
    ok: false,
    error: "El sistema trabaja con un solo servicio. Usa Configuracion Comercial para cambiar precios y condiciones.",
  });
}

async function asegurarSuscripcionCliente(client, usuarioId) {
  const existente = await client.query(
    "SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
    [usuarioId]
  );

  if (existente.rows.length > 0) return existente.rows[0];

  const config = await obtenerConfiguracionSuscripcion(client);
  const plan = await client.query("SELECT * FROM subscription_plans WHERE code = $1 LIMIT 1", [
    config.default_plan_code,
  ]);
  const planBase = plan.rows[0] || null;
  const vence = sumarDias(new Date().toISOString().slice(0, 10), config.trial_days);
  const creado = await client.query(
    `
    INSERT INTO subscriptions
    (user_id, plan_id, status, price, currency, starts_at, expires_at, trial_starts_at, trial_ends_at, grace_days)
    VALUES ($1,$2,'TRIAL',$3,$4,CURRENT_DATE,$5,CURRENT_DATE,$5,$6)
    RETURNING *
    `,
    [usuarioId, planBase?.id || null, Number(config.monthly_base_price || planBase?.monthly_price || 0), config.currency, vence, config.grace_days]
  );

  return creado.rows[0];
}

async function ejecutarAccionCliente(req, res) {
  const client = await pool.connect();

  try {
    const usuarioId = numeroEntero(req.params.id);
    const accion = limpiarTexto(req.body.accion).toUpperCase();
    const observacion = limpiarTexto(req.body.observacion);
    const usuario = await client.query("SELECT id, nombre, email FROM usuarios WHERE id = $1 LIMIT 1", [
      usuarioId,
    ]);

    if (usuario.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Cliente no encontrado." });
    }

    await client.query("BEGIN");
    const suscripcion = await asegurarSuscripcionCliente(client, usuarioId);
    const config = await obtenerConfiguracionSuscripcion(client);
    const planUnico = (await client.query("SELECT * FROM subscription_plans WHERE code = $1 LIMIT 1", [
      CODIGO_PLAN_UNICO,
    ])).rows[0] || null;
    const anterior = { ...suscripcion };
    let nuevoStatus = suscripcion.status;
    let planId = planUnico?.id || suscripcion.plan_id;
    let expiresAt = suscripcion.expires_at;
    let maxCompaniesOverride = null;
    let maxUsersOverride = null;
    let internalNotes = suscripcion.internal_notes;
    let billingCycle = suscripcion.billing_cycle;
    let price = config.monthly_base_price || suscripcion.price;
    let autoRenew = suscripcion.auto_renew;
    let actionHistory = accion;

    if (accion === "ACTIVAR" || accion === "REACTIVAR") {
      nuevoStatus = ESTADOS_SUSCRIPCION.ACTIVE;
      actionHistory = ACCIONES_SUSCRIPCION.REACTIVACION;
    } else if (accion === "SUSPENDER") {
      nuevoStatus = ESTADOS_SUSCRIPCION.SUSPENDED;
      actionHistory = ACCIONES_SUSCRIPCION.SUSPENSION;
    } else if (accion === "CANCELAR") {
      nuevoStatus = ESTADOS_SUSCRIPCION.CANCELLED;
      actionHistory = ACCIONES_SUSCRIPCION.CANCELACION;
    } else if (accion === "EXTENDER") {
      expiresAt = sumarDias(expiresAt || new Date().toISOString().slice(0, 10), numeroEntero(req.body.dias, 0));
      nuevoStatus = ESTADOS_SUSCRIPCION.ACTIVE;
      actionHistory = ACCIONES_SUSCRIPCION.EXTENSION_MANUAL;
    } else if (accion === "CAMBIAR_PLAN" || accion === "LIMITES") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: "Esta accion no aplica. ServContable PRO tiene un solo servicio con empresas ilimitadas.",
      });
    } else if (accion === "NOTA_INTERNA") {
      internalNotes = observacion || internalNotes;
      actionHistory = ACCIONES_SUSCRIPCION.NOTA_INTERNA;
    } else if (accion === "RENOVAR") {
      const meses = normalizarCiclo(req.body.billing_cycle) === "annual" ? 12 : numeroEntero(req.body.meses, 1);
      expiresAt = sumarMeses(expiresAt || new Date().toISOString().slice(0, 10), meses);
      nuevoStatus = ESTADOS_SUSCRIPCION.ACTIVE;
      billingCycle = normalizarCiclo(req.body.billing_cycle);
      actionHistory = ACCIONES_SUSCRIPCION.RENOVACION;
    } else {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "Accion no reconocida." });
    }

    autoRenew = req.body.auto_renew === undefined ? autoRenew : valorBooleano(req.body.auto_renew, autoRenew);

    const actualizado = await client.query(
      `
      UPDATE subscriptions
      SET status=$1, plan_id=$2, billing_cycle=$3, price=$4, expires_at=$5, renews_at=$5,
          auto_renew=$6, max_companies_override=$7, max_users_override=$8,
          internal_notes=$9,
          cancelled_at = CASE WHEN $1 = 'CANCELLED' THEN NOW() ELSE cancelled_at END,
          suspended_at = CASE WHEN $1 = 'SUSPENDED' THEN NOW() ELSE suspended_at END,
          updated_at=NOW()
      WHERE id=$10
      RETURNING *
      `,
      [
        normalizarEstadoSuscripcion(nuevoStatus),
        planId,
        billingCycle,
        numeroEntero(price),
        expiresAt,
        autoRenew,
        maxCompaniesOverride,
        maxUsersOverride,
        internalNotes,
        suscripcion.id,
      ]
    );

    await client.query(
      `
      UPDATE usuarios
      SET suscripcion_estado = $1,
          suscripcion_vence = $2,
          suscripcion_actualizada_en = NOW()
      WHERE id = $3
      `,
      [normalizarEstadoSuscripcion(nuevoStatus).toLowerCase(), expiresAt, usuarioId]
    );

    await registrarHistoriaSuscripcion({
      client,
      subscriptionId: suscripcion.id,
      userId: usuarioId,
      adminUserId: req.usuario?.id || null,
      action: actionHistory,
      previousStatus: anterior.status,
      newStatus: actualizado.rows[0].status,
      previousValues: anterior,
      newValues: actualizado.rows[0],
      observation: observacion,
    });

    await registrarAuditoriaAdmin({
      client,
      req,
      customerUserId: usuarioId,
      action: actionHistory,
      previousValues: anterior,
      newValues: actualizado.rows[0],
      observation: observacion,
    });

    await client.query("COMMIT");
    return res.json({ ok: true, mensaje: "Accion aplicada correctamente.", suscripcion: actualizado.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error accion suscripcion:", error);
    return res.status(500).json({ ok: false, error: "No se pudo aplicar la accion administrativa." });
  } finally {
    client.release();
  }
}

async function registrarPagoManual(req, res) {
  const client = await pool.connect();

  try {
    const usuarioId = numeroEntero(req.params.id);
    await client.query("BEGIN");
    const suscripcion = await asegurarSuscripcionCliente(client, usuarioId);
    const config = await obtenerConfiguracionSuscripcion(client);
    const clienteResult = await client.query(
      consultaClientesBase({ where: "u.id = $1", orderBy: "u.id ASC" }),
      [usuarioId]
    );
    const clienteSerializado = clienteResult.rows[0]
      ? serializarCliente(clienteResult.rows[0], config)
      : { usuarios_activos: 1 };
    const mesesPago = Math.max(1, numeroEntero(req.body.meses || req.body.meses_cobrados, 1));
    const resumenMensual = calcularMontoSuscripcion({
      usuariosActivos: clienteSerializado.usuarios_activos || 1,
      meses: mesesPago,
      config,
    });
    const montoInformado = limpiarTexto(req.body.amount);
    const montoPago = montoInformado
      ? numeroEntero(montoInformado, resumenMensual.total)
      : resumenMensual.total;
    const pagoProveedor = construirPagoSuscripcion({
      provider: req.body.provider || "manual",
      transactionId: limpiarTexto(req.body.transaction_id),
      paymentMethod: limpiarTexto(req.body.payment_method || "manual"),
    });
    const pago = await client.query(
      `
      INSERT INTO subscription_payments
      (subscription_id, user_id, payment_date, amount, period_label, payment_method, status, transaction_id, tax_document, notes, provider, provider_payload,
       service_name, base_price, included_users, active_users, additional_users, additional_user_price, additional_users_amount,
       subtotal, iva_rate, iva_amount, total_amount)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING *
      `,
      [
        suscripcion.id,
        usuarioId,
        req.body.payment_date || new Date().toISOString().slice(0, 10),
        montoPago,
        limpiarTexto(req.body.period_label) || `${mesesPago} mes${mesesPago === 1 ? "" : "es"}`,
        pagoProveedor.payment_method,
        limpiarTexto(req.body.status || ESTADOS_PAGO.PAID).toUpperCase(),
        pagoProveedor.transaction_id,
        limpiarTexto(req.body.tax_document),
        limpiarTexto(req.body.notes),
        pagoProveedor.provider,
        JSON.stringify(pagoProveedor.provider_payload),
        resumenMensual.service_name,
        resumenMensual.precio_base_total,
        resumenMensual.usuarios_incluidos,
        resumenMensual.usuarios_activos,
        resumenMensual.usuarios_adicionales,
        resumenMensual.precio_usuario_adicional,
        resumenMensual.usuarios_adicionales_total,
        resumenMensual.subtotal,
        resumenMensual.iva_rate,
        resumenMensual.iva,
        resumenMensual.total,
      ]
    );
    const estadoPago = pago.rows[0].status;

    if (estadoPago === ESTADOS_PAGO.PAID) {
      const fechaPago = fechaISO(pago.rows[0].payment_date) || new Date().toISOString().slice(0, 10);
      const baseVigencia =
        suscripcion.expires_at &&
        new Date(`${fechaISO(suscripcion.expires_at)}T23:59:59`) > new Date()
          ? suscripcion.expires_at
          : fechaPago;
      const nuevoVencimiento = sumarMeses(baseVigencia, mesesPago);

      await client.query(
        `
        UPDATE subscriptions
        SET status = 'ACTIVE',
            billing_cycle = 'monthly',
            price = $1,
            renews_at = $2,
            expires_at = $2,
            trial_starts_at = NULL,
            trial_ends_at = NULL,
            updated_at = NOW()
        WHERE id = $3
        `,
        [resumenMensual.subtotal, nuevoVencimiento, suscripcion.id]
      );

      await client.query(
        `
        UPDATE usuarios
        SET activo = true,
            suscripcion_estado = 'activa',
            suscripcion_plan = $1,
            suscripcion_vence = $2,
            suscripcion_usuarios_adicionales = $3,
            suscripcion_actualizada_en = NOW()
        WHERE id = $4
        `,
        [CODIGO_PLAN_UNICO, nuevoVencimiento, resumenMensual.usuarios_adicionales, usuarioId]
      );
    }

    await registrarHistoriaSuscripcion({
      client,
      subscriptionId: suscripcion.id,
      userId: usuarioId,
      adminUserId: req.usuario?.id || null,
      action: ACCIONES_SUSCRIPCION.PAGO_MANUAL,
      previousStatus: suscripcion.status,
      newStatus: suscripcion.status,
      newValues: pago.rows[0],
      observation: pago.rows[0].notes || "Pago registrado manualmente.",
    });

    await registrarAuditoriaAdmin({
      client,
      req,
      customerUserId: usuarioId,
      action: ACCIONES_SUSCRIPCION.PAGO_MANUAL,
      newValues: pago.rows[0],
      observation: pago.rows[0].notes,
    });

    await client.query("COMMIT");
    return res.status(201).json({ ok: true, pago: pago.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error pago manual:", error);
    return res.status(500).json({ ok: false, error: "No se pudo registrar el pago manual." });
  } finally {
    client.release();
  }
}

async function obtenerConfiguracion(req, res) {
  try {
    const resultado = await pool.query("SELECT key, value, description FROM subscription_settings ORDER BY key ASC");
    return res.json({ ok: true, configuracion: resultado.rows });
  } catch (error) {
    console.error("Error configuracion suscripcion:", error);
    return res.status(500).json({ ok: false, error: "No se pudo obtener la configuracion." });
  }
}

async function guardarConfiguracion(req, res) {
  const client = await pool.connect();

  try {
    const items = Array.isArray(req.body.configuracion) ? req.body.configuracion : [];
    await client.query("BEGIN");

    for (const item of items) {
      const key = limpiarTexto(item.key);
      if (!key) continue;
      await client.query(
        `
        INSERT INTO subscription_settings (key, value, description, updated_at)
        VALUES ($1,$2,$3,NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = NOW()
        `,
        [key, limpiarTexto(item.value), limpiarTexto(item.description)]
      );
    }

    await registrarAuditoriaAdmin({
      client,
      req,
      action: "Actualizar configuracion suscripciones",
      newValues: { configuracion: items },
    });

    await client.query("COMMIT");
    return res.json({ ok: true, mensaje: "Configuracion guardada correctamente." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error guardar configuracion:", error);
    return res.status(500).json({ ok: false, error: "No se pudo guardar la configuracion." });
  } finally {
    client.release();
  }
}

async function listarAuditoriaAdmin(req, res) {
  try {
    const resultado = await pool.query(
      "SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT 300"
    );
    return res.json({ ok: true, auditoria: resultado.rows });
  } catch (error) {
    console.error("Error auditoria admin:", error);
    return res.status(500).json({ ok: false, error: "No se pudo listar la auditoria administrativa." });
  }
}

async function listarNotificaciones(req, res) {
  try {
    const resultado = await pool.query(
      "SELECT * FROM subscription_notifications ORDER BY scheduled_at ASC NULLS LAST, created_at DESC LIMIT 300"
    );
    return res.json({ ok: true, notificaciones: resultado.rows });
  } catch (error) {
    console.error("Error notificaciones suscripcion:", error);
    return res.status(500).json({ ok: false, error: "No se pudieron listar las notificaciones." });
  }
}

async function tablaExiste(nombreTabla) {
  const resultado = await pool.query("SELECT to_regclass($1) AS tabla", [`public.${nombreTabla}`]);
  return Boolean(resultado.rows[0]?.tabla);
}

// Las tablas de solicitudes web se crean en database/migrations/. Acá solo se
// consulta si existen, para que el panel no falle en una instalación donde
// todavía no se aplicaron las migraciones.
async function tablasSolicitudesWebDisponibles() {
  const [contacto, contrataciones] = await Promise.all([
    tablaExiste("solicitudes_contacto"),
    tablaExiste("contrataciones_web"),
  ]);

  return { contacto, contrataciones };
}

function diasEntreHoy(fecha) {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const destino = new Date(`${fechaISO(fecha)}T00:00:00`);
  if (Number.isNaN(destino.getTime())) return null;
  return Math.ceil((destino.getTime() - hoy.getTime()) / 86400000);
}

function estadoComercialSolicitud(item) {
  const estado = String(item.estado || "").toLowerCase();
  const status = String(item.subscription_status || item.flow_status || "").toUpperCase();
  const diasRestantes = diasEntreHoy(item.trial_vence || item.demo_vence || item.trial_ends_at || item.expires_at);

  if (estado === "archived" || item.archivado) return "archivado";
  if (status === ESTADOS_SUSCRIPCION.ACTIVE || estado === "activo") return "convertido";
  if (status === ESTADOS_SUSCRIPCION.SUSPENDED || estado === "suspendido") return "suspendido";
  if (String(item.tipo || "").startsWith("SUSCRIPCION")) {
    if (estado.includes("fall") || estado.includes("rechaz") || estado.includes("error")) return "pago_fallido";
    if (estado.includes("pendiente")) return "pendiente_pago";
    return estado || "pendiente_pago";
  }
  if (diasRestantes !== null && diasRestantes < 0) return "prueba_vencida";
  if (diasRestantes !== null && diasRestantes <= 3) return "vence_3_dias";
  if (diasRestantes !== null && diasRestantes <= 7) return "vence_semana";
  if (!item.ultimo_acceso_en) return "nunca_ingreso";
  return "prueba_activa";
}

function seguimientoSolicitud(item) {
  const labels = {
    archivado: "Archivado",
    convertido: "Convertido",
    suspendido: "Suspendido",
    pago_fallido: "Por contactar",
    pendiente_pago: "Por contactar",
    prueba_vencida: "Vencido",
    vence_3_dias: "Próximo a vencer",
    vence_semana: "Próximo a vencer",
    nunca_ingreso: "Sin actividad",
    prueba_activa: "Activo",
  };
  return labels[item.estado_comercial] || "Nuevo";
}

function filtrosSolicitudesWeb(query = {}) {
  return {
    buscar: limpiarTexto(query.buscar || query.q).toLowerCase(),
    tipo: limpiarTexto(query.tipo).toUpperCase(),
    estado: limpiarTexto(query.estado).toLowerCase(),
    desde: limpiarTexto(query.desde),
    hasta: limpiarTexto(query.hasta),
  };
}

function filtrarSolicitudesWeb(solicitudes, filtros) {
  return solicitudes.filter((item) => {
    if (filtros.tipo && item.tipo !== filtros.tipo) return false;
    if (filtros.estado && String(item.estado_comercial || item.estado || "").toLowerCase() !== filtros.estado) return false;
    if (filtros.desde && String(item.creado_en || "").slice(0, 10) < filtros.desde) return false;
    if (filtros.hasta && String(item.creado_en || "").slice(0, 10) > filtros.hasta) return false;

    if (filtros.buscar) {
      const texto = [item.nombre, item.empresa, item.rut, item.correo, item.telefono]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!texto.includes(filtros.buscar)) return false;
    }

    return true;
  });
}

function calcularResumenSolicitudes(solicitudes) {
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const hace7 = new Date(ahora);
  hace7.setDate(hace7.getDate() - 7);

  const resumen = {
    pruebas_activas: 0,
    vencen_semana: 0,
    vencen_3_dias: 0,
    nunca_ingresaron: 0,
    sin_actividad_reciente: 0,
    pruebas_vencidas: 0,
    conversiones_mes: 0,
    nuevas_pruebas_mes: 0,
    pagos_pendientes: 0,
    pagos_fallidos: 0,
  };

  for (const item of solicitudes) {
    const esTrial = item.tipo === "PRUEBA_GRATIS";
    const estado = item.estado_comercial;
    const creado = item.creado_en ? new Date(item.creado_en) : null;
    const ultimoAcceso = item.ultimo_acceso_en ? new Date(item.ultimo_acceso_en) : null;

    if (esTrial && ["prueba_activa", "vence_semana", "vence_3_dias", "nunca_ingreso"].includes(estado)) resumen.pruebas_activas += 1;
    if (estado === "vence_semana" || estado === "vence_3_dias") resumen.vencen_semana += 1;
    if (estado === "vence_3_dias") resumen.vencen_3_dias += 1;
    if (estado === "nunca_ingreso") resumen.nunca_ingresaron += 1;
    if (ultimoAcceso && ultimoAcceso < hace7 && ["prueba_activa", "vence_semana", "vence_3_dias"].includes(estado)) resumen.sin_actividad_reciente += 1;
    if (estado === "prueba_vencida") resumen.pruebas_vencidas += 1;
    if (estado === "convertido" && creado && creado >= inicioMes) resumen.conversiones_mes += 1;
    if (esTrial && creado && creado >= inicioMes) resumen.nuevas_pruebas_mes += 1;
    if (estado === "pendiente_pago") resumen.pagos_pendientes += 1;
    if (estado === "pago_fallido") resumen.pagos_fallidos += 1;
  }

  return resumen;
}

async function listarSolicitudesWeb(req, res) {
  try {

    const { contacto: existeContacto, contrataciones: existeContrataciones } =
      await tablasSolicitudesWebDisponibles();

    const [contactosResult, contratacionesResult] = await Promise.all([
      existeContacto
        ? pool.query(`
            SELECT
              solicitudes_contacto.id,
              'PRUEBA_GRATIS' AS tipo,
              solicitudes_contacto.nombre,
              solicitudes_contacto.correo,
              solicitudes_contacto.empresa,
              solicitudes_contacto.rut,
              solicitudes_contacto.telefono,
              solicitudes_contacto.usuario_id,
              solicitudes_contacto.empresa_id,
              solicitudes_contacto.subscription_id,
              solicitudes_contacto.trial_inicio,
              solicitudes_contacto.trial_vence,
              solicitudes_contacto.archivado,
              u.ultimo_acceso_en,
              s.status AS subscription_status,
              s.expires_at,
              s.trial_ends_at,
              $query$${NOMBRE_SERVICIO_UNICO}$query$ AS plan,
              CASE WHEN solicitudes_contacto.archivado = true THEN 'archived' ELSE solicitudes_contacto.estado END AS estado,
              solicitudes_contacto.origen,
              solicitudes_contacto.creado_en,
              solicitudes_contacto.actualizado_en,
              solicitudes_contacto.mensaje,
              solicitudes_contacto.nota_interna,
              solicitudes_contacto.demo_usuario_id,
              solicitudes_contacto.demo_inicio,
              solicitudes_contacto.demo_vence,
              solicitudes_contacto.demo_activado_en,
              NULL::numeric AS total,
              NULL::text AS periodicidad,
              NULL::text AS flow_status,
              NULL::text AS flow_order,
              jsonb_build_object('fuente', 'solicitudes_contacto') AS metadata
            FROM solicitudes_contacto
            LEFT JOIN usuarios u ON u.id = solicitudes_contacto.usuario_id OR u.id = solicitudes_contacto.demo_usuario_id
            LEFT JOIN subscriptions s ON s.id = solicitudes_contacto.subscription_id
            ORDER BY solicitudes_contacto.creado_en DESC
            LIMIT 300
          `)
        : Promise.resolve({ rows: [] }),
      existeContrataciones
        ? pool.query(`
            SELECT
              id,
              'SUSCRIPCION_MENSUAL' AS tipo,
              nombre,
              correo,
              empresa,
              rut,
              telefono,
              NULL::integer AS usuario_id,
              NULL::integer AS empresa_id,
              NULL::integer AS subscription_id,
              NULL::date AS trial_inicio,
              NULL::date AS trial_vence,
              false AS archivado,
              NULL::timestamp AS ultimo_acceso_en,
              NULL::text AS subscription_status,
              NULL::date AS expires_at,
              NULL::date AS trial_ends_at,
              COALESCE(metadata->>'servicio', $query$${NOMBRE_SERVICIO_UNICO}$query$) AS plan,
              estado,
              origen,
              creado_en,
              actualizado_en,
              metadata->>'mensaje' AS mensaje,
              NULL::text AS nota_interna,
              NULL::integer AS demo_usuario_id,
              NULL::date AS demo_inicio,
              NULL::date AS demo_vence,
              NULL::timestamp AS demo_activado_en,
              total,
              periodicidad,
              flow_status,
              flow_order,
              metadata
            FROM contrataciones_web
            ORDER BY creado_en DESC
            LIMIT 300
          `)
        : Promise.resolve({ rows: [] }),
    ]);

    const solicitudesBase = [...contactosResult.rows, ...contratacionesResult.rows]
      .sort((a, b) => new Date(b.creado_en || 0) - new Date(a.creado_en || 0))
      .map((item) => {
        const estadoComercial = estadoComercialSolicitud(item);
        return {
          ...item,
          estado_comercial: estadoComercial,
          seguimiento: seguimientoSolicitud({ estado_comercial: estadoComercial }),
          dias_restantes: diasEntreHoy(item.trial_vence || item.demo_vence || item.trial_ends_at || item.expires_at),
        };
      });
    const solicitudes = filtrarSolicitudesWeb(solicitudesBase, filtrosSolicitudesWeb(req.query)).slice(0, 300);
    const resumenComercial = calcularResumenSolicitudes(solicitudesBase);
    const alertas = [
      resumenComercial.vencen_semana ? { tipo: "vence_semana", texto: `${resumenComercial.vencen_semana} pruebas vencen esta semana` } : null,
      resumenComercial.vencen_3_dias ? { tipo: "vence_3_dias", texto: `${resumenComercial.vencen_3_dias} pruebas vencen en 3 dias o menos` } : null,
      resumenComercial.nunca_ingresaron ? { tipo: "nunca_ingreso", texto: `${resumenComercial.nunca_ingresaron} clientes nunca han ingresado` } : null,
      resumenComercial.pruebas_vencidas ? { tipo: "prueba_vencida", texto: `${resumenComercial.pruebas_vencidas} pruebas vencieron y no contrataron` } : null,
      resumenComercial.pagos_pendientes ? { tipo: "pendiente_pago", texto: `${resumenComercial.pagos_pendientes} pagos estan pendientes` } : null,
      resumenComercial.pagos_fallidos ? { tipo: "pago_fallido", texto: `${resumenComercial.pagos_fallidos} pagos fallaron` } : null,
      resumenComercial.sin_actividad_reciente ? { tipo: "sin_actividad", texto: `${resumenComercial.sin_actividad_reciente} clientes llevan mas de 7 dias sin ingresar` } : null,
    ].filter(Boolean);

    return res.json({
      ok: true,
      solicitudes,
      resumen: {
        total: solicitudesBase.length,
        pruebas_gratis: contactosResult.rows.length,
        suscripciones: contratacionesResult.rows.length,
        ...resumenComercial,
      },
      alertas,
    });
  } catch (error) {
    console.error("Error solicitudes web suscripciones:", error);
    return res.status(500).json({ ok: false, error: "No se pudieron listar las solicitudes web." });
  }
}

async function obtenerSolicitudWebBase(client, tipo, id) {
  const tipoNormalizado = limpiarTexto(tipo).toUpperCase();
  const solicitudId = numeroEntero(id);

  if (!solicitudId) return null;

  if (tipoNormalizado === "PRUEBA_GRATIS") {
    const resultado = await client.query(
      `
      SELECT
        sc.*,
        COALESCE(sc.usuario_id, sc.demo_usuario_id) AS usuario_vinculado_id,
        u.nombre AS usuario_nombre,
        u.email AS usuario_email,
        u.activo AS usuario_activo,
        u.ultimo_acceso_en,
        e.razon_social AS empresa_creada,
        e.activa AS empresa_activa,
        s.id AS subscription_id_real,
        s.status AS subscription_status,
        s.expires_at,
        s.trial_starts_at,
        s.trial_ends_at,
        sp.name AS plan_nombre
      FROM solicitudes_contacto sc
      LEFT JOIN usuarios u ON u.id = COALESCE(sc.usuario_id, sc.demo_usuario_id)
      LEFT JOIN empresas e ON e.id = sc.empresa_id
      LEFT JOIN subscriptions s ON s.id = sc.subscription_id
      LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE sc.id = $1
      LIMIT 1
      `,
      [solicitudId]
    );
    const fila = resultado.rows[0];
    return fila ? { tipo: "PRUEBA_GRATIS", ...fila } : null;
  }

  const resultado = await client.query(
    `
    SELECT *, id AS contratacion_id
    FROM contrataciones_web
    WHERE id = $1
    LIMIT 1
    `,
    [solicitudId]
  );
  const fila = resultado.rows[0];
  return fila ? { tipo: "SUSCRIPCION_MENSUAL", ...fila } : null;
}

async function obtenerDetalleSolicitudWeb(req, res) {
  const client = await pool.connect();

  try {

    const solicitud = await obtenerSolicitudWebBase(client, req.params.tipo, req.params.id);
    if (!solicitud) {
      return res.status(404).json({ ok: false, error: "Solicitud no encontrada." });
    }

    const usuarioId = solicitud.usuario_vinculado_id || solicitud.usuario_id || null;
    const suscripcionId = solicitud.subscription_id_real || solicitud.subscription_id || null;
    const [historial, pagos] = await Promise.all([
      usuarioId
        ? client.query(
            "SELECT * FROM subscription_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 80",
            [usuarioId]
          )
        : Promise.resolve({ rows: [] }),
      usuarioId
        ? client.query(
            "SELECT * FROM subscription_payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 80",
            [usuarioId]
          )
        : Promise.resolve({ rows: [] }),
    ]);

    return res.json({
      ok: true,
      solicitud: {
        ...solicitud,
        estado_comercial: estadoComercialSolicitud(solicitud),
        seguimiento: seguimientoSolicitud({
          estado_comercial: estadoComercialSolicitud(solicitud),
        }),
        dias_restantes: diasEntreHoy(
          solicitud.trial_vence || solicitud.demo_vence || solicitud.trial_ends_at || solicitud.expires_at
        ),
      },
      usuario_id: usuarioId,
      suscripcion_id: suscripcionId,
      historial: historial.rows,
      pagos: pagos.rows,
    });
  } catch (error) {
    console.error("Error detalle solicitud web:", error);
    return res.status(500).json({ ok: false, error: "No se pudo obtener el detalle de la solicitud." });
  } finally {
    client.release();
  }
}

async function ejecutarAccionSolicitudWeb(req, res) {
  const client = await pool.connect();

  try {

    const accion = limpiarTexto(req.body.accion).toUpperCase();
    const motivo = limpiarTexto(req.body.motivo || req.body.observacion);
    const solicitud = await obtenerSolicitudWebBase(client, req.params.tipo, req.params.id);

    if (!solicitud) {
      return res.status(404).json({ ok: false, error: "Solicitud no encontrada." });
    }

    await client.query("BEGIN");

    if (solicitud.tipo !== "PRUEBA_GRATIS") {
      if (accion === "ARCHIVAR") {
        await client.query(
          "UPDATE contrataciones_web SET estado = 'archived', actualizado_en = NOW() WHERE id = $1",
          [solicitud.id]
        );
      } else {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: "Accion no disponible para esta solicitud de pago." });
      }
    } else {
      const usuarioId = solicitud.usuario_vinculado_id;
      const suscripcionId = solicitud.subscription_id_real || solicitud.subscription_id;

      if (accion !== "ARCHIVAR" && !usuarioId) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: "La solicitud no tiene usuario vinculado." });
      }

      const suscripcionActual =
        suscripcionId
          ? (await client.query("SELECT * FROM subscriptions WHERE id = $1 FOR UPDATE", [suscripcionId])).rows[0]
          : null;
      const anterior = suscripcionActual ? { ...suscripcionActual } : {};

      if (accion === "EXTENDER") {
        const dias = numeroEntero(req.body.dias, 0);
        if (dias <= 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ ok: false, error: "Indica dias validos para extender la prueba." });
        }

        const nuevaFecha = sumarDias(
          suscripcionActual?.expires_at || solicitud.trial_vence || solicitud.demo_vence || new Date().toISOString().slice(0, 10),
          dias
        );

        await client.query(
          `
          UPDATE subscriptions
          SET status = 'TRIAL', expires_at = $1, trial_ends_at = $1, updated_at = NOW()
          WHERE id = $2
          `,
          [nuevaFecha, suscripcionId]
        );
        await client.query(
          `
          UPDATE usuarios
          SET activo = true, demo_activo = false, demo_vence = NULL, suscripcion_estado = 'trial',
              suscripcion_vence = $1, suscripcion_actualizada_en = NOW()
          WHERE id = $2
          `,
          [nuevaFecha, usuarioId]
        );
        await client.query(
          `
          UPDATE solicitudes_contacto
          SET estado = 'prueba_activa', trial_vence = $1, demo_vence = $1, actualizado_en = NOW()
          WHERE id = $2
          `,
          [nuevaFecha, solicitud.id]
        );
        await registrarHistoriaSuscripcion({
          client,
          subscriptionId: suscripcionId,
          userId: usuarioId,
          adminUserId: req.usuario?.id || null,
          action: ACCIONES_SUSCRIPCION.EXTENSION_MANUAL,
          previousStatus: anterior.status,
          newStatus: ESTADOS_SUSCRIPCION.TRIAL,
          previousValues: anterior,
          newValues: { expires_at: nuevaFecha, dias_agregados: dias },
          observation: motivo,
        });
      } else if (accion === "SUSPENDER" || accion === "BLOQUEAR") {
        if (!motivo) {
          await client.query("ROLLBACK");
          return res.status(400).json({ ok: false, error: "El motivo es obligatorio." });
        }
        await client.query(
          "UPDATE subscriptions SET status = 'SUSPENDED', suspended_at = NOW(), updated_at = NOW() WHERE id = $1",
          [suscripcionId]
        );
        await client.query(
          "UPDATE usuarios SET activo = false, suscripcion_estado = 'suspended', suscripcion_actualizada_en = NOW() WHERE id = $1",
          [usuarioId]
        );
        await client.query(
          "UPDATE solicitudes_contacto SET estado = 'suspendido', actualizado_en = NOW() WHERE id = $1",
          [solicitud.id]
        );
        await registrarHistoriaSuscripcion({
          client,
          subscriptionId: suscripcionId,
          userId: usuarioId,
          adminUserId: req.usuario?.id || null,
          action: ACCIONES_SUSCRIPCION.SUSPENSION,
          previousStatus: anterior.status,
          newStatus: ESTADOS_SUSCRIPCION.SUSPENDED,
          previousValues: anterior,
          newValues: { usuario_activo: false },
          observation: motivo,
        });
      } else if (accion === "REACTIVAR") {
        await client.query(
          "UPDATE subscriptions SET status = 'TRIAL', updated_at = NOW() WHERE id = $1",
          [suscripcionId]
        );
        await client.query(
          "UPDATE usuarios SET activo = true, demo_activo = false, demo_vence = NULL, suscripcion_estado = 'trial', suscripcion_actualizada_en = NOW() WHERE id = $1",
          [usuarioId]
        );
        await client.query(
          "UPDATE solicitudes_contacto SET estado = 'prueba_activa', actualizado_en = NOW() WHERE id = $1",
          [solicitud.id]
        );
        await registrarHistoriaSuscripcion({
          client,
          subscriptionId: suscripcionId,
          userId: usuarioId,
          adminUserId: req.usuario?.id || null,
          action: ACCIONES_SUSCRIPCION.REACTIVACION,
          previousStatus: anterior.status,
          newStatus: ESTADOS_SUSCRIPCION.TRIAL,
          previousValues: anterior,
          newValues: { usuario_activo: true },
          observation: motivo,
        });
      } else if (accion === "CONVERTIR") {
        const config = await obtenerConfiguracionSuscripcion(client);
        const plan = (await client.query("SELECT * FROM subscription_plans WHERE code = $1 LIMIT 1", [
          CODIGO_PLAN_UNICO,
        ])).rows[0];
        if (!plan) {
          await client.query("ROLLBACK");
          return res.status(400).json({ ok: false, error: "Servicio comercial no configurado." });
        }
        const billingCycle = normalizarCiclo(req.body.billing_cycle);
        const mesesCobro = billingCycle === "annual" ? 12 : 1;
        const resumenPago = calcularMontoSuscripcion({ usuariosActivos: 1, meses: mesesCobro, config });
        const precio = numeroEntero(req.body.monto, resumenPago.subtotal);
        const inicio = limpiarTexto(req.body.fecha_inicio) || new Date().toISOString().slice(0, 10);
        const vence = billingCycle === "annual" ? sumarMeses(inicio, 12) : sumarMeses(inicio, 1);

        await client.query(
          `
          UPDATE subscriptions
          SET status = 'ACTIVE', plan_id = $1, billing_cycle = $2, price = $3,
              starts_at = $4, renews_at = $5, expires_at = $5,
              trial_starts_at = NULL, trial_ends_at = NULL, updated_at = NOW()
          WHERE id = $6
          `,
          [plan.id, billingCycle, precio, inicio, vence, suscripcionId]
        );
        await client.query(
          `
          UPDATE usuarios
          SET activo = true, demo_activo = false, suscripcion_estado = 'activa',
              suscripcion_plan = $1, suscripcion_inicio = $2, suscripcion_vence = $3,
              suscripcion_actualizada_en = NOW()
          WHERE id = $4
          `,
          [plan.code, inicio, vence, usuarioId]
        );
        await client.query(
          "UPDATE solicitudes_contacto SET estado = 'activo', actualizado_en = NOW() WHERE id = $1",
          [solicitud.id]
        );
        await registrarHistoriaSuscripcion({
          client,
          subscriptionId: suscripcionId,
          userId: usuarioId,
          adminUserId: req.usuario?.id || null,
          action: ACCIONES_SUSCRIPCION.RENOVACION,
          previousStatus: anterior.status,
          newStatus: ESTADOS_SUSCRIPCION.ACTIVE,
          previousValues: anterior,
          newValues: { plan_id: plan.id, billing_cycle: billingCycle, price: precio, expires_at: vence },
          observation: motivo || "Conversion manual desde prueba gratis.",
        });
      } else if (accion === "ARCHIVAR") {
        await client.query(
          "UPDATE solicitudes_contacto SET archivado = true, estado = 'archived', actualizado_en = NOW() WHERE id = $1",
          [solicitud.id]
        );
      } else if (accion === "RECUPERACION" || accion === "INSTRUCCIONES") {
        await client.query(
          "UPDATE solicitudes_contacto SET nota_interna = COALESCE(nota_interna, '') || $1, actualizado_en = NOW() WHERE id = $2",
          [`\n${new Date().toISOString()}: ${accion} solicitada por administrador.`, solicitud.id]
        );
      } else {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: "Accion no reconocida." });
      }
    }

    await registrarAuditoriaAdmin({
      client,
      req,
      customerUserId: solicitud.usuario_vinculado_id || null,
      action: `Solicitud web: ${accion}`,
      previousValues: solicitud,
      newValues: req.body,
      observation: motivo,
    });

    await client.query("COMMIT");
    return res.json({ ok: true, mensaje: "Accion aplicada correctamente." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error accion solicitud web:", error);
    return res.status(500).json({ ok: false, error: "No se pudo aplicar la accion solicitada." });
  } finally {
    client.release();
  }
}

module.exports = {
  obtenerDashboard,
  listarClientes,
  obtenerCliente,
  listarPlanes,
  guardarPlan,
  ejecutarAccionCliente,
  registrarPagoManual,
  obtenerConfiguracion,
  guardarConfiguracion,
  listarAuditoriaAdmin,
  listarNotificaciones,
  listarSolicitudesWeb,
  obtenerDetalleSolicitudWeb,
  ejecutarAccionSolicitudWeb,
};
