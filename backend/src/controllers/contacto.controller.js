const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../database/db");
const { obtenerJwtSecret } = require("../config/env");
const { enviarCorreoSolicitudContacto } = require("../helpers/mail.helper");
const {
  ACCIONES_SUSCRIPCION,
  ESTADOS_SUSCRIPCION,
  inicializarSuscripciones,
  obtenerConfiguracionSuscripcion,
  registrarHistoriaSuscripcion,
  sumarDias,
} = require("../helpers/suscripcion.helper");

function limpiarTexto(valor) {
  if (valor === undefined || valor === null) return "";
  return String(valor).trim();
}

function validarCorreo(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

function validarPasswordCliente(password, confirmacion) {
  if (!password || String(password).length < 8) {
    return "La contrasena debe tener al menos 8 caracteres.";
  }

  if (password !== confirmacion) {
    return "Las contrasenas no coinciden.";
  }

  return "";
}

function construirSesionTrial(usuario, empresas, suscripcion) {
  const usuarioToken = {
    id: usuario.id,
    email: usuario.email,
    rol: usuario.rol,
    trial: true,
    trial_vence: suscripcion.trial_ends_at || suscripcion.expires_at,
  };

  const token = jwt.sign(usuarioToken, obtenerJwtSecret(), { expiresIn: "8h" });

  return {
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rut: usuario.rut,
      telefono: usuario.telefono,
      rol: usuario.rol,
      activo: usuario.activo,
      empresas,
      trial: true,
      trial_info: {
        activo: true,
        inicio: suscripcion.trial_starts_at,
        vence: suscripcion.trial_ends_at || suscripcion.expires_at,
        empresas_ilimitadas: true,
        dias_restantes: 30,
      },
      demo: false,
      demo_info: null,
      suscripcion: {
        estado: ESTADOS_SUSCRIPCION.TRIAL,
        status: "trial",
        operativo: true,
        plan: suscripcion.billing_cycle || "mensual",
        vence: suscripcion.trial_ends_at || suscripcion.expires_at,
        trial_inicio: suscripcion.trial_starts_at,
        trial_vence: suscripcion.trial_ends_at || suscripcion.expires_at,
        dias_restantes: 30,
        empresas_ilimitadas: true,
      },
      bienvenida_trial: true,
    },
  };
}

async function crearPruebaGratisAutoservicio(req, res) {

  const client = await pool.connect();
  let transaccionIniciada = false;

  try {
    const correo = limpiarTexto(req.body.correo || req.body.email).toLowerCase();
    const password = String(req.body.password || "");
    const confirmarPassword = String(req.body.confirmar_password || req.body.confirmarPassword || "");
    const nombre = correo.split("@")[0] || "Usuario ServContable";

    if (!correo) {
      return res.status(400).json({
        ok: false,
        error: "El correo es obligatorio.",
      });
    }

    if (!validarCorreo(correo)) {
      return res.status(400).json({ ok: false, error: "El correo ingresado no es valido." });
    }

    const errorPassword = validarPasswordCliente(password, confirmarPassword);
    if (errorPassword) {
      return res.status(400).json({ ok: false, error: errorPassword });
    }


    const duplicado = await client.query(
      `
      SELECT id, email
      FROM usuarios
      WHERE LOWER(email) = $1
      LIMIT 1
      `,
      [correo]
    );

    if (duplicado.rows.length > 0) {
      return res.status(409).json({
        ok: false,
        codigo: "CUENTA_EXISTENTE",
        error: "Este correo ya tiene una cuenta registrada.",
        acciones: ["iniciar_sesion", "recuperar_contrasena"],
      });
    }

    const trialPrevio = await client.query(
      `
      SELECT id
      FROM solicitudes_contacto
      WHERE LOWER(correo) = $1
        AND origen IN ('prueba_gratis_autoservicio', 'prueba_gratis_30_dias')
      LIMIT 1
      `,
      [correo]
    );

    if (trialPrevio.rows.length > 0) {
      return res.status(409).json({
        ok: false,
        codigo: "TRIAL_EXISTENTE",
        error: "Este correo ya tiene una prueba gratuita registrada.",
        acciones: ["iniciar_sesion", "recuperar_contrasena"],
      });
    }

    const config = await obtenerConfiguracionSuscripcion(client);
    const diasTrial = Math.max(Number(config.trial_days || 30), 1);
    const vence = sumarDias(new Date().toISOString().slice(0, 10), diasTrial);
    const passwordHash = await bcrypt.hash(password, 10);

    await client.query("BEGIN");
    transaccionIniciada = true;

    const usuarioResult = await client.query(
      `
      INSERT INTO usuarios
      (nombre, email, password_hash, rol, activo, rut, rut_normalizado, telefono,
       demo_activo, demo_inicio, demo_vence, demo_empresa_limite, demo_origen,
       suscripcion_estado, suscripcion_plan, suscripcion_inicio, suscripcion_vence,
       suscripcion_usuarios_adicionales, suscripcion_actualizada_en, ultimo_acceso_en)
      VALUES
      ($1,$2,$3,'admin_cliente',true,NULL,NULL,'',
       false,NULL,NULL,1,'prueba_gratis',
       'trial',$4,CURRENT_DATE,$5,0,NOW(),NOW())
      RETURNING id, nombre, email, rol, activo, rut, rut_normalizado, telefono, demo_inicio, demo_vence, ultimo_acceso_en
      `,
      [nombre, correo, passwordHash, config.default_plan_code, vence]
    );

    const usuario = usuarioResult.rows[0];

    const solicitudResult = await client.query(
      `
      INSERT INTO solicitudes_contacto
      (nombre, correo, empresa, interes, mensaje, estado, origen, rut, rut_normalizado, telefono,
       usuario_id, empresa_id, trial_inicio, trial_vence, demo_usuario_id, demo_inicio, demo_vence, demo_activado_en, leido)
      VALUES
      ($1,$2,'','Prueba gratis 30 dias','Prueba gratis creada automaticamente desde la pagina web.',
       'prueba_activa','prueba_gratis_autoservicio',NULL,NULL,'',$3,NULL,CURRENT_DATE,$4,NULL,NULL,NULL,NOW(),true)
      RETURNING *
      `,
      [nombre, correo, usuario.id, vence]
    );

    const planResult = await client.query(
      "SELECT * FROM subscription_plans WHERE code = $1 LIMIT 1",
      [config.default_plan_code]
    );
    const plan = planResult.rows[0] || null;

    const suscripcionResult = await client.query(
      `
      INSERT INTO subscriptions
      (user_id, plan_id, status, billing_cycle, price, currency, starts_at, expires_at,
       trial_starts_at, trial_ends_at, auto_renew, grace_days, max_companies_override, max_users_override)
      VALUES ($1,$2,$3,'monthly',$4,$5,CURRENT_DATE,$6,CURRENT_DATE,$6,false,$7,NULL,NULL)
      RETURNING *
      `,
      [
        usuario.id,
        plan?.id || null,
        ESTADOS_SUSCRIPCION.TRIAL,
        Number(config.monthly_base_price || plan?.monthly_price || 0),
        config.currency,
        vence,
        config.grace_days,
      ]
    );

    const suscripcion = suscripcionResult.rows[0];

    await client.query(
      `
      UPDATE solicitudes_contacto
      SET subscription_id = $1,
          actualizado_en = NOW()
      WHERE id = $2
      `,
      [suscripcion.id, solicitudResult.rows[0].id]
    );

    await registrarHistoriaSuscripcion({
      client,
      subscriptionId: suscripcion.id,
      userId: usuario.id,
      action: ACCIONES_SUSCRIPCION.ALTA,
      newStatus: ESTADOS_SUSCRIPCION.TRIAL,
      newValues: {
        solicitud_id: solicitudResult.rows[0].id,
        empresa_id: null,
        origen: "prueba_gratis_autoservicio",
      },
      observation: "Prueba gratis creada automaticamente por el cliente.",
    });

    await client.query("COMMIT");
    transaccionIniciada = false;

    const sesion = construirSesionTrial(usuario, [], suscripcion);
    sesion.usuario.trial_info.dias_restantes = diasTrial;
    sesion.usuario.suscripcion.dias_restantes = diasTrial;

    return res.status(201).json({
      ok: true,
      mensaje: "Tu prueba gratis fue creada correctamente.",
      solicitud: { ...solicitudResult.rows[0], subscription_id: suscripcion.id },
      suscripcion,
      ...sesion,
    });
  } catch (error) {
    if (transaccionIniciada) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Error al crear prueba gratis autoservicio:", {
      mensaje: error.message,
      codigo: error.code,
    });

    return res.status(500).json({
      ok: false,
      error: "No pudimos crear tu cuenta en este momento. Intenta nuevamente.",
    });
  } finally {
    client.release();
  }
}

async function crearSolicitudContacto(req, res) {
  try {

    const nombre = limpiarTexto(req.body.nombre);
    const correo = limpiarTexto(req.body.correo || req.body.email).toLowerCase();
    const empresa = limpiarTexto(req.body.empresa);
    const interes = limpiarTexto(
      req.body.interes || req.body.interes_principal || req.body.interesPrincipal
    );
    const mensaje = limpiarTexto(req.body.mensaje);
    const origen = limpiarTexto(req.body.origen || "web");

    if (!nombre || !correo) {
      return res.status(400).json({
        ok: false,
        error: "Nombre y correo son obligatorios.",
      });
    }

    if (!validarCorreo(correo)) {
      return res.status(400).json({
        ok: false,
        error: "El correo ingresado no es valido.",
      });
    }

    const resultado = await pool.query(
      `
      INSERT INTO solicitudes_contacto
      (nombre, correo, empresa, interes, mensaje, origen)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, nombre, correo, empresa, interes, mensaje, estado, origen, creado_en;
      `,
      [nombre, correo, empresa, interes, mensaje, origen]
    );

    const solicitud = resultado.rows[0];

    try {
      await enviarCorreoSolicitudContacto(solicitud);
    } catch (errorCorreo) {
      console.error("Solicitud guardada, pero no se pudo enviar correo:", errorCorreo);
    }

    return res.status(201).json({
      ok: true,
      mensaje: "Solicitud enviada correctamente.",
      solicitud,
    });
  } catch (error) {
    console.error("Error al crear solicitud de contacto:", error);

    return res.status(500).json({
      ok: false,
      error: "No se pudo registrar la solicitud de contacto.",
    });
  }
}

async function listarSolicitudesContacto(req, res) {
  try {

    const limite = Math.min(Number(req.query.limite || 300), 500);

    const resultado = await pool.query(
      `
      SELECT
        id,
        nombre,
        correo,
        empresa,
        interes,
        mensaje,
        estado,
        leido,
        nota_interna,
        origen,
        creado_en,
        actualizado_en,
        demo_usuario_id,
        demo_inicio,
        demo_vence,
        demo_activado_en
      FROM solicitudes_contacto
      ORDER BY creado_en DESC
      LIMIT $1;
      `,
      [limite]
    );

    return res.json({
      ok: true,
      solicitudes: resultado.rows,
    });
  } catch (error) {
    console.error("Error al listar solicitudes de contacto:", error);

    return res.status(500).json({
      ok: false,
      error: "No se pudieron obtener las solicitudes.",
    });
  }
}

async function actualizarSolicitudContacto(req, res) {
  try {

    const estado = limpiarTexto(req.body.estado || "contactado");
    const notaInterna = limpiarTexto(req.body.nota_interna || req.body.notaInterna);

    const resultado = await pool.query(
      `
      UPDATE solicitudes_contacto
      SET
        estado = $1,
        leido = true,
        nota_interna = COALESCE(NULLIF($2, ''), nota_interna),
        actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *;
      `,
      [estado, notaInterna, req.params.id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: "Solicitud no encontrada.",
      });
    }

    return res.json({
      ok: true,
      mensaje: "Solicitud actualizada correctamente.",
      solicitud: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al actualizar solicitud de contacto:", error);

    return res.status(500).json({
      ok: false,
      error: "No se pudo actualizar la solicitud.",
    });
  }
}

module.exports = {
  crearSolicitudContacto,
  crearPruebaGratisAutoservicio,
  listarSolicitudesContacto,
  actualizarSolicitudContacto,
};
