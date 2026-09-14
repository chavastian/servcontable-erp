const pool = require("../database/db");
const {
  ACCIONES_SUSCRIPCION,
  ESTADOS_PAGO,
  ESTADOS_SUSCRIPCION,
  calcularEstadoVigente,
  fechaISO,
  inicializarSuscripciones,
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

async function asegurarListo() {
  await inicializarSuscripciones(pool);
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
  agregar(limpiarTexto(query.plan), "sp.code = ?");
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
    plan: "plan_contratado ASC NULLS LAST",
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
  const limiteEmpresas = fila.max_companies_override ?? fila.max_companies;
  const limiteUsuarios = fila.max_users_override ?? fila.max_users;

  return {
    ...fila,
    estado_suscripcion_calculado: estado.status,
    dias_restantes: estado.days_remaining,
    gracia_restante: estado.grace_remaining,
    empresas_permitidas: limiteEmpresas,
    usuarios_permitidos: limiteUsuarios,
  };
}

async function obtenerDashboard(req, res) {
  try {
    await asegurarListo();
    const config = await obtenerConfiguracionSuscripcion(pool);

    const clientesResult = await pool.query(
      consultaClientesBase({ where: "LOWER(COALESCE(u.rol, '')) NOT IN ('superadmin', 'admin', 'administrador_sistema')" })
    );
    const clientes = clientesResult.rows.map((fila) => serializarCliente(fila, config));
    const inicioMes = new Date();
    inicioMes.setDate(1);
    const inicioMesISO = inicioMes.toISOString().slice(0, 10);

    const pagosMes = await pool.query(
      `
      SELECT COALESCE(SUM(amount), 0)::int AS total
      FROM subscription_payments
      WHERE status = 'PAID'
        AND payment_date >= $1::date
      `,
      [inicioMesISO]
    );

    const resumenPorPlan = await pool.query(`
      SELECT COALESCE(sp.name, 'Sin plan') AS plan, COUNT(*)::int AS total
      FROM subscriptions s
      LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
      GROUP BY COALESCE(sp.name, 'Sin plan')
      ORDER BY total DESC
    `);

    const proximas = clientes.filter((item) => {
      const dias = Number(item.dias_restantes);
      return Number.isFinite(dias) && dias >= 0 && dias <= 10;
    });

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
        mrr_estimado: clientes
          .filter((item) => item.estado_suscripcion_calculado === ESTADOS_SUSCRIPCION.ACTIVE)
          .reduce((total, item) => total + Number(item.billing_cycle === "annual" ? Math.round(Number(item.price || 0) / 12) : item.price || 0), 0),
      },
      distribucion_planes: resumenPorPlan.rows,
      proximas_vencer: proximas.slice(0, 10),
    });
  } catch (error) {
    console.error("Error dashboard suscripciones:", error);
    return res.status(500).json({ ok: false, error: "No se pudo obtener el dashboard de suscripciones." });
  }
}

async function listarClientes(req, res) {
  try {
    await asegurarListo();
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
    await asegurarListo();
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
    await asegurarListo();
    const resultado = await pool.query("SELECT * FROM subscription_plans ORDER BY sort_order ASC, id ASC");
    return res.json({ ok: true, planes: resultado.rows });
  } catch (error) {
    console.error("Error listar planes:", error);
    return res.status(500).json({ ok: false, error: "No se pudieron listar los planes." });
  }
}

async function guardarPlan(req, res) {
  const client = await pool.connect();

  try {
    await inicializarSuscripciones(pool);
    const id = numeroEntero(req.params.id);
    const datos = {
      code: limpiarTexto(req.body.code).toLowerCase().replace(/\s+/g, "_"),
      name: limpiarTexto(req.body.name),
      description: limpiarTexto(req.body.description),
      monthly_price: numeroEntero(req.body.monthly_price),
      annual_price: numeroEntero(req.body.annual_price),
      max_companies: req.body.max_companies === "" ? null : numeroEntero(req.body.max_companies, null),
      max_users: req.body.max_users === "" ? null : numeroEntero(req.body.max_users, null),
      features: Array.isArray(req.body.features)
        ? req.body.features
        : limpiarTexto(req.body.features).split("\n").map((item) => item.trim()).filter(Boolean),
      active: valorBooleano(req.body.active, true),
      trial_days: numeroEntero(req.body.trial_days, 0),
      sort_order: numeroEntero(req.body.sort_order, 0),
    };

    if (!datos.code || !datos.name) {
      return res.status(400).json({ ok: false, error: "Codigo y nombre del plan son obligatorios." });
    }

    await client.query("BEGIN");
    const anterior = id
      ? (await client.query("SELECT * FROM subscription_plans WHERE id = $1", [id])).rows[0] || null
      : null;

    const resultado = id
      ? await client.query(
          `
          UPDATE subscription_plans
          SET code=$1, name=$2, description=$3, monthly_price=$4, annual_price=$5,
              max_companies=$6, max_users=$7, features=$8::jsonb, active=$9,
              trial_days=$10, sort_order=$11, updated_at=NOW()
          WHERE id=$12
          RETURNING *
          `,
          [
            datos.code,
            datos.name,
            datos.description,
            datos.monthly_price,
            datos.annual_price,
            datos.max_companies,
            datos.max_users,
            JSON.stringify(datos.features),
            datos.active,
            datos.trial_days,
            datos.sort_order,
            id,
          ]
        )
      : await client.query(
          `
          INSERT INTO subscription_plans
          (code, name, description, monthly_price, annual_price, max_companies, max_users, features, active, trial_days, sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
          RETURNING *
          `,
          [
            datos.code,
            datos.name,
            datos.description,
            datos.monthly_price,
            datos.annual_price,
            datos.max_companies,
            datos.max_users,
            JSON.stringify(datos.features),
            datos.active,
            datos.trial_days,
            datos.sort_order,
          ]
        );

    await registrarAuditoriaAdmin({
      client,
      req,
      action: id ? "Actualizar plan" : "Crear plan",
      previousValues: anterior || {},
      newValues: resultado.rows[0],
      observation: datos.name,
    });

    await client.query("COMMIT");
    return res.status(id ? 200 : 201).json({ ok: true, plan: resultado.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error guardar plan:", error);
    return res.status(500).json({ ok: false, error: "No se pudo guardar el plan." });
  } finally {
    client.release();
  }
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
    [usuarioId, planBase?.id || null, Number(planBase?.monthly_price || 0), config.currency, vence, config.grace_days]
  );

  return creado.rows[0];
}

async function ejecutarAccionCliente(req, res) {
  const client = await pool.connect();

  try {
    await inicializarSuscripciones(pool);
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
    const anterior = { ...suscripcion };
    let nuevoStatus = suscripcion.status;
    let planId = suscripcion.plan_id;
    let expiresAt = suscripcion.expires_at;
    let maxCompaniesOverride = suscripcion.max_companies_override;
    let maxUsersOverride = suscripcion.max_users_override;
    let internalNotes = suscripcion.internal_notes;
    let billingCycle = suscripcion.billing_cycle;
    let price = suscripcion.price;
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
    } else if (accion === "CAMBIAR_PLAN") {
      const plan = await client.query("SELECT * FROM subscription_plans WHERE id = $1 LIMIT 1", [
        numeroEntero(req.body.plan_id),
      ]);
      if (plan.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: "Plan no encontrado." });
      }
      planId = plan.rows[0].id;
      billingCycle = normalizarCiclo(req.body.billing_cycle);
      price = billingCycle === "annual" ? plan.rows[0].annual_price : plan.rows[0].monthly_price;
      actionHistory = ACCIONES_SUSCRIPCION.CAMBIO_PLAN;
    } else if (accion === "LIMITES") {
      maxCompaniesOverride = req.body.max_companies_override === "" ? null : numeroEntero(req.body.max_companies_override, null);
      maxUsersOverride = req.body.max_users_override === "" ? null : numeroEntero(req.body.max_users_override, null);
      actionHistory = ACCIONES_SUSCRIPCION.LIMITES;
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
    await inicializarSuscripciones(pool);
    const usuarioId = numeroEntero(req.params.id);
    await client.query("BEGIN");
    const suscripcion = await asegurarSuscripcionCliente(client, usuarioId);
    const pagoProveedor = construirPagoSuscripcion({
      provider: req.body.provider || "manual",
      transactionId: limpiarTexto(req.body.transaction_id),
      paymentMethod: limpiarTexto(req.body.payment_method || "manual"),
    });
    const pago = await client.query(
      `
      INSERT INTO subscription_payments
      (subscription_id, user_id, payment_date, amount, period_label, payment_method, status, transaction_id, tax_document, notes, provider, provider_payload)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
      RETURNING *
      `,
      [
        suscripcion.id,
        usuarioId,
        req.body.payment_date || new Date().toISOString().slice(0, 10),
        numeroEntero(req.body.amount),
        limpiarTexto(req.body.period_label),
        pagoProveedor.payment_method,
        limpiarTexto(req.body.status || ESTADOS_PAGO.PAID).toUpperCase(),
        pagoProveedor.transaction_id,
        limpiarTexto(req.body.tax_document),
        limpiarTexto(req.body.notes),
        pagoProveedor.provider,
        JSON.stringify(pagoProveedor.provider_payload),
      ]
    );

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
    await asegurarListo();
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
    await inicializarSuscripciones(pool);
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
    await asegurarListo();
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
    await asegurarListo();
    const resultado = await pool.query(
      "SELECT * FROM subscription_notifications ORDER BY scheduled_at ASC NULLS LAST, created_at DESC LIMIT 300"
    );
    return res.json({ ok: true, notificaciones: resultado.rows });
  } catch (error) {
    console.error("Error notificaciones suscripcion:", error);
    return res.status(500).json({ ok: false, error: "No se pudieron listar las notificaciones." });
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
};
