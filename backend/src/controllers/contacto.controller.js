const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../database/db");
const { obtenerJwtSecret } = require("../config/env");
const { enviarCorreoSolicitudContacto } = require("../helpers/mail.helper");
const { asegurarEsquemaAuth, asignarUsuarioEmpresa, obtenerEmpresasPermitidas } = require("../helpers/auth.helper");
const {
  asegurarEsquemaDemo,
  diasDemo,
  normalizarEmailDemo,
  formatoFechaDemo,
} = require("../helpers/demo.helper");
const {
  ACCIONES_SUSCRIPCION,
  ESTADOS_SUSCRIPCION,
  inicializarSuscripciones,
  obtenerConfiguracionSuscripcion,
  registrarHistoriaSuscripcion,
  sumarDias,
} = require("../helpers/suscripcion.helper");
const { normalizarRut } = require("../helpers/rut.helper");

async function asegurarTablaContacto() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS solicitudes_contacto (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      correo VARCHAR(200) NOT NULL,
      empresa VARCHAR(200),
      interes VARCHAR(150),
      mensaje TEXT,
      estado VARCHAR(50) DEFAULT 'pendiente',
      origen VARCHAR(100) DEFAULT 'web',
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE solicitudes_contacto
    ADD COLUMN IF NOT EXISTS leido BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS nota_interna TEXT,
    ADD COLUMN IF NOT EXISTS rut VARCHAR(30),
    ADD COLUMN IF NOT EXISTS rut_normalizado VARCHAR(20),
    ADD COLUMN IF NOT EXISTS telefono VARCHAR(80),
    ADD COLUMN IF NOT EXISTS usuario_id INTEGER,
    ADD COLUMN IF NOT EXISTS empresa_id INTEGER,
    ADD COLUMN IF NOT EXISTS subscription_id INTEGER,
    ADD COLUMN IF NOT EXISTS trial_inicio DATE,
    ADD COLUMN IF NOT EXISTS trial_vence DATE,
    ADD COLUMN IF NOT EXISTS archivado BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS demo_usuario_id INTEGER,
    ADD COLUMN IF NOT EXISTS demo_inicio DATE,
    ADD COLUMN IF NOT EXISTS demo_vence DATE,
    ADD COLUMN IF NOT EXISTS demo_activado_en TIMESTAMP;
  `);

  await pool.query("CREATE INDEX IF NOT EXISTS idx_solicitudes_contacto_rut ON solicitudes_contacto (rut_normalizado)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_solicitudes_contacto_usuario ON solicitudes_contacto (usuario_id)");
}

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

async function asegurarColumnasTrialAutoservicio(client) {
  await asegurarEsquemaAuth(client);
  await client.query(`
    ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS rut VARCHAR(30),
      ADD COLUMN IF NOT EXISTS rut_normalizado VARCHAR(20),
      ADD COLUMN IF NOT EXISTS telefono VARCHAR(80),
      ADD COLUMN IF NOT EXISTS demo_activo BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS demo_inicio DATE,
      ADD COLUMN IF NOT EXISTS demo_vence DATE,
      ADD COLUMN IF NOT EXISTS demo_empresa_limite INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS demo_origen VARCHAR(80),
      ADD COLUMN IF NOT EXISTS demo_solicitud_id INTEGER,
      ADD COLUMN IF NOT EXISTS suscripcion_estado VARCHAR(50) DEFAULT 'activa',
      ADD COLUMN IF NOT EXISTS suscripcion_plan VARCHAR(50),
      ADD COLUMN IF NOT EXISTS suscripcion_inicio DATE,
      ADD COLUMN IF NOT EXISTS suscripcion_vence DATE,
      ADD COLUMN IF NOT EXISTS suscripcion_usuarios_adicionales INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS suscripcion_actualizada_en TIMESTAMP WITHOUT TIME ZONE,
      ADD COLUMN IF NOT EXISTS ultimo_acceso_en TIMESTAMP WITHOUT TIME ZONE
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_rut_normalizado_unico
    ON usuarios (rut_normalizado)
    WHERE rut_normalizado IS NOT NULL AND rut_normalizado <> ''
  `);
  await client.query(`
    ALTER TABLE empresas
      ADD COLUMN IF NOT EXISTS telefono VARCHAR(80),
      ADD COLUMN IF NOT EXISTS correo VARCHAR(180)
  `);
}

function construirSesionTrial(usuario, empresas, suscripcion) {
  const usuarioToken = {
    id: usuario.id,
    email: usuario.email,
    rol: usuario.rol,
    demo: true,
    demo_vence: suscripcion.trial_ends_at || suscripcion.expires_at,
    demo_empresa_limite: 1,
  };

  const token = jwt.sign(usuarioToken, obtenerJwtSecret(), { expiresIn: "4h" });

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
      demo: true,
      demo_info: {
        activo: true,
        inicio: suscripcion.trial_starts_at,
        vence: suscripcion.trial_ends_at || suscripcion.expires_at,
        empresa_limite: 1,
        dias_restantes: 30,
      },
      bienvenida_trial: true,
    },
  };
}

async function crearPruebaGratisAutoservicio(req, res) {
  await asegurarTablaContacto();
  await inicializarSuscripciones(pool);

  const client = await pool.connect();
  let transaccionIniciada = false;

  try {
    const nombre = limpiarTexto(req.body.nombre);
    const correo = limpiarTexto(req.body.correo || req.body.email).toLowerCase();
    const empresa = limpiarTexto(req.body.empresa);
    const telefono = limpiarTexto(req.body.telefono);
    const password = String(req.body.password || "");
    const confirmarPassword = String(req.body.confirmar_password || req.body.confirmarPassword || "");
    const rutValidado = normalizarRut(req.body.rut);

    if (!nombre || !empresa || !correo || !telefono || !req.body.rut) {
      return res.status(400).json({
        ok: false,
        error: "Nombre, empresa, RUT, correo y telefono son obligatorios.",
      });
    }

    if (!validarCorreo(correo)) {
      return res.status(400).json({ ok: false, error: "El correo ingresado no es valido." });
    }

    if (!rutValidado.valido) {
      return res.status(400).json({ ok: false, error: rutValidado.error || "RUT invalido." });
    }

    const errorPassword = validarPasswordCliente(password, confirmarPassword);
    if (errorPassword) {
      return res.status(400).json({ ok: false, error: errorPassword });
    }

    await asegurarColumnasTrialAutoservicio(client);

    const duplicado = await client.query(
      `
      SELECT id, email, rut_normalizado
      FROM usuarios
      WHERE LOWER(email) = $1 OR rut_normalizado = $2
      LIMIT 1
      `,
      [correo, rutValidado.rut_normalizado]
    );

    if (duplicado.rows.length > 0) {
      return res.status(409).json({
        ok: false,
        codigo: "CUENTA_EXISTENTE",
        error: "Este RUT o correo ya tiene una cuenta registrada.",
        acciones: ["iniciar_sesion", "recuperar_contrasena"],
      });
    }

    const trialPrevio = await client.query(
      `
      SELECT id
      FROM solicitudes_contacto
      WHERE rut_normalizado = $1
        AND origen IN ('prueba_gratis_autoservicio', 'prueba_gratis_30_dias', 'demo_login')
      LIMIT 1
      `,
      [rutValidado.rut_normalizado]
    );

    if (trialPrevio.rows.length > 0) {
      return res.status(409).json({
        ok: false,
        codigo: "TRIAL_EXISTENTE",
        error: "Este RUT ya tiene una prueba gratuita registrada.",
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
      ($1,$2,$3,'admin_cliente',true,$4,$5,$6,
       true,CURRENT_DATE,$7,1,'prueba_gratis',
       'trial',$8,CURRENT_DATE,$7,0,NOW(),NOW())
      RETURNING id, nombre, email, rol, activo, rut, rut_normalizado, telefono, demo_inicio, demo_vence, ultimo_acceso_en
      `,
      [nombre, correo, passwordHash, rutValidado.rut, rutValidado.rut_normalizado, telefono, vence, config.default_plan_code]
    );

    const usuario = usuarioResult.rows[0];

    const empresaResult = await client.query(
      `
      INSERT INTO empresas (rut, razon_social, giro, direccion, comuna, ciudad, regimen_tributario, telefono, correo, activa)
      VALUES ($1,$2,'','','','','',$3,$4,true)
      RETURNING *
      `,
      [rutValidado.rut, empresa, telefono, correo]
    );

    const empresaCreada = empresaResult.rows[0];
    await asignarUsuarioEmpresa(client, usuario.id, empresaCreada.id, "admin");

    const solicitudResult = await client.query(
      `
      INSERT INTO solicitudes_contacto
      (nombre, correo, empresa, interes, mensaje, estado, origen, rut, rut_normalizado, telefono,
       usuario_id, empresa_id, trial_inicio, trial_vence, demo_usuario_id, demo_inicio, demo_vence, demo_activado_en, leido)
      VALUES
      ($1,$2,$3,'Prueba gratis 30 dias','Prueba gratis creada automaticamente desde la pagina web.',
       'prueba_activa','prueba_gratis_autoservicio',$4,$5,$6,$7,$8,CURRENT_DATE,$9,$7,CURRENT_DATE,$9,NOW(),true)
      RETURNING *
      `,
      [nombre, correo, empresa, rutValidado.rut, rutValidado.rut_normalizado, telefono, usuario.id, empresaCreada.id, vence]
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
      VALUES ($1,$2,$3,'monthly',0,$4,CURRENT_DATE,$5,CURRENT_DATE,$5,false,$6,1,NULL)
      RETURNING *
      `,
      [usuario.id, plan?.id || null, ESTADOS_SUSCRIPCION.TRIAL, config.currency, vence, config.grace_days]
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
        empresa_id: empresaCreada.id,
        origen: "prueba_gratis_autoservicio",
      },
      observation: "Prueba gratis creada automaticamente por el cliente.",
    });

    await client.query("COMMIT");
    transaccionIniciada = false;

    const empresas = await obtenerEmpresasPermitidas(pool, {
      id: usuario.id,
      rol: usuario.rol,
      demo: true,
    });
    const sesion = construirSesionTrial(usuario, empresas, suscripcion);
    sesion.usuario.demo_info.dias_restantes = diasTrial;

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
    await asegurarTablaContacto();

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
    await asegurarTablaContacto();

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
    await asegurarTablaContacto();

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

async function activarDemoSolicitud(req, res) {
  await asegurarTablaContacto();

  const client = await pool.connect();
  let transaccionIniciada = false;

  try {
    const solicitudId = Number(req.params.id);
    const dias = Math.min(Math.max(Number(req.body?.dias || diasDemo()), 1), 90);

    if (!solicitudId) {
      return res.status(400).json({ ok: false, error: "Solicitud invalida." });
    }

    await client.query("BEGIN");
    transaccionIniciada = true;
    await asegurarEsquemaDemo(client);

    const solicitudResult = await client.query(
      "SELECT * FROM solicitudes_contacto WHERE id = $1 FOR UPDATE",
      [solicitudId]
    );

    if (solicitudResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transaccionIniciada = false;
      return res.status(404).json({ ok: false, error: "Solicitud no encontrada." });
    }

    const solicitud = solicitudResult.rows[0];
    const email = normalizarEmailDemo(solicitud.correo);

    if (!email) {
      await client.query("ROLLBACK");
      transaccionIniciada = false;
      return res.status(400).json({ ok: false, error: "La solicitud no tiene correo valido." });
    }

    const passwordTemporal = crypto.randomBytes(24).toString("hex");
    const passwordHash = await bcrypt.hash(passwordTemporal, 10);
    const nombre = limpiarTexto(solicitud.nombre) || "Usuario Demo";

    const existente = await client.query(
      "SELECT id FROM usuarios WHERE email = $1 LIMIT 1",
      [email]
    );

    const usuarioResult =
      existente.rows.length > 0
        ? await client.query(
            `UPDATE usuarios
             SET nombre = $1,
                 password_hash = $2,
                 rol = 'admin_cliente',
                 activo = true,
                 demo_activo = true,
                 demo_inicio = CURRENT_DATE,
                 demo_vence = (CURRENT_DATE + ($3::int * INTERVAL '1 day'))::date,
                 demo_empresa_limite = 1,
                 demo_solicitud_id = $4,
                 suscripcion_estado = 'demo',
                 suscripcion_plan = 'demo',
                 suscripcion_inicio = CURRENT_DATE,
                 suscripcion_vence = (CURRENT_DATE + ($3::int * INTERVAL '1 day'))::date,
                 suscripcion_usuarios_adicionales = 0,
                 suscripcion_actualizada_en = NOW()
             WHERE id = $5
             RETURNING *`,
            [nombre, passwordHash, dias, solicitudId, existente.rows[0].id]
          )
        : await client.query(
            `INSERT INTO usuarios
             (nombre, email, password_hash, rol, activo,
              demo_activo, demo_inicio, demo_vence, demo_empresa_limite, demo_solicitud_id,
              suscripcion_estado, suscripcion_plan, suscripcion_inicio, suscripcion_vence,
              suscripcion_usuarios_adicionales, suscripcion_actualizada_en)
             VALUES
             ($1, $2, $3, 'admin_cliente', true,
              true, CURRENT_DATE, (CURRENT_DATE + ($4::int * INTERVAL '1 day'))::date, 1, $5,
              'demo', 'demo', CURRENT_DATE, (CURRENT_DATE + ($4::int * INTERVAL '1 day'))::date,
              0, NOW())
             RETURNING *`,
            [nombre, email, passwordHash, dias, solicitudId]
          );

    const usuario = usuarioResult.rows[0];

    const solicitudActualizada = await client.query(
      `UPDATE solicitudes_contacto
       SET estado = 'demo_activado',
           leido = true,
           demo_usuario_id = $1,
           demo_inicio = CURRENT_DATE,
           demo_vence = (CURRENT_DATE + ($2::int * INTERVAL '1 day'))::date,
           demo_activado_en = NOW(),
           actualizado_en = NOW()
       WHERE id = $3
       RETURNING *`,
      [usuario.id, dias, solicitudId]
    );

    await client.query("COMMIT");
    transaccionIniciada = false;

    return res.json({
      ok: true,
      mensaje: `Demo activada por ${dias} dias para ${email}.`,
      demo: {
        email,
        usuario_id: usuario.id,
        empresa_id: null,
        inicio: formatoFechaDemo(usuario.demo_inicio),
        vence: formatoFechaDemo(usuario.demo_vence),
        dias,
        empresa_limite: Number(usuario.demo_empresa_limite || 1),
        password_temporal: passwordTemporal,
      },
      solicitud: solicitudActualizada.rows[0],
    });
  } catch (error) {
    if (transaccionIniciada) {
      await client.query("ROLLBACK");
    }

    console.error("Error al activar demo desde solicitud:", error);

    return res.status(500).json({
      ok: false,
      error: "No se pudo activar la demo.",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  crearSolicitudContacto,
  crearPruebaGratisAutoservicio,
  listarSolicitudesContacto,
  actualizarSolicitudContacto,
  activarDemoSolicitud,
};
