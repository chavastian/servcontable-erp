const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../database/db");
const { obtenerJwtSecret } = require("../config/env");
const {
  normalizarRol,
  esAdminSistema,
  usuarioPuedeAdministrarEmpresa,
  puedeAdministrarUsuarioObjetivo,
  obtenerEmpresasPermitidas,
  asignarUsuarioEmpresa,
} = require("../helpers/auth.helper");
const { registrarAuditoria } = require("../helpers/auditoria.helper");
const {
  ESTADOS_SUSCRIPCION,
  calcularDiasRestantesTrial,
  normalizarEstadoSuscripcion,
  validarAccesoSuscripcion,
  validarLimiteUsuariosCliente,
} = require("../helpers/suscripcion.helper");
const { normalizarRut, pareceRut } = require("../helpers/rut.helper");
const { rechazarPasswordInvalida } = require("../helpers/password.helper");
const { firmarToken, revocarSesiones } = require("../helpers/sesion.helper");
const { enviarCorreoRecuperacionPassword } = require("../helpers/mail.helper");

function registroPublicoHabilitado() {
  return process.env.ALLOW_PUBLIC_REGISTRATION === "true";
}

const solicitudesRecuperacion = new Map();
const MENSAJE_RECUPERACION =
  "Si el correo esta registrado, enviaremos instrucciones para recuperar la contrasena.";

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function normalizarEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizarRolEmpresa(rolEmpresa = "") {
  const valor = String(rolEmpresa || "").trim().toLowerCase();

  if (["admin", "administrador"].includes(valor)) {
    return "admin";
  }

  return "usuario";
}

function normalizarActivo(valor, valorActual = true) {
  if (typeof valor === "boolean") {
    return valor;
  }

  const texto = String(valor ?? "").trim().toLowerCase();

  if (["true", "1", "si", "s?", "activo"].includes(texto)) {
    return true;
  }

  if (["false", "0", "no", "inactivo"].includes(texto)) {
    return false;
  }

  return Boolean(valorActual);
}

function normalizarListaEmpresas(valor) {
  const lista = Array.isArray(valor) ? valor : valor ? [valor] : [];
  return [
    ...new Set(
      lista
        .map((item) => Number(item || 0))
        .filter((item) => Number.isInteger(item) && item > 0)
    ),
  ];
}

function esRolAdminSistema(rol = "") {
  return esAdminSistema(normalizarRol(rol || ""));
}

async function esUltimoAdminSistemaActivo(client, usuarioId) {
  const resultado = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM usuarios
     WHERE activo = true
       AND LOWER(rol) IN ('admin', 'superadmin', 'super_admin', 'administrador_sistema')
       AND id <> $1`,
    [Number(usuarioId)]
  );

  return Number(resultado.rows[0]?.total || 0) === 0;
}

function fechaISO(valor) {
  if (!valor) {
    return null;
  }

  if (valor instanceof Date) {
    return valor.toISOString().slice(0, 10);
  }

  return String(valor).slice(0, 10);
}

function limiteRecuperacionExcedido(req, email) {
  const ventanaMs = 15 * 60 * 1000;
  const maxIntentos = 3;
  const ahora = Date.now();
  const ip = req.ip || req.headers["x-forwarded-for"] || "sin-ip";
  const clave = `${ip}:${normalizarEmail(email)}`;
  const registro = solicitudesRecuperacion.get(clave) || {
    inicio: ahora,
    intentos: 0,
  };

  if (ahora - registro.inicio > ventanaMs) {
    solicitudesRecuperacion.set(clave, { inicio: ahora, intentos: 1 });
    return false;
  }

  registro.intentos += 1;
  solicitudesRecuperacion.set(clave, registro);

  return registro.intentos > maxIntentos;
}

function construirUrlReset(req, token) {
  const base = (
    process.env.PASSWORD_RESET_URL_BASE ||
    process.env.FRONTEND_URL ||
    req.headers.origin ||
    "http://localhost:5173"
  ).replace(/\/+$/, "");

  return `${base}?resetToken=${encodeURIComponent(token)}`;
}

async function crearTokenRecuperacionPassword(conexion, req, usuarioId) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(token);
  const minutosVigencia = Number(process.env.PASSWORD_RESET_MINUTES || 30);
  const resetUrl = construirUrlReset(req, token);

  await conexion.query(
    `UPDATE password_reset_tokens
     SET usado_en = NOW()
     WHERE usuario_id = $1
       AND usado_en IS NULL`,
    [usuarioId]
  );

  await conexion.query(
    `INSERT INTO password_reset_tokens
     (usuario_id, token_hash, vence_en, ip_solicitud, user_agent)
     VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 minute'), $4, $5)`,
    [
      usuarioId,
      tokenHash,
      minutosVigencia,
      req.ip || req.headers["x-forwarded-for"] || null,
      req.headers["user-agent"] || null,
    ]
  );

  return { resetUrl, minutosVigencia };
}

function datosUsuarioPublico(usuario, empresas = []) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
    activo: usuario.activo,
    empresas,
  };
}

function datosSuscripcionPublica(accesoSuscripcion = {}, usuario = {}) {
  const subscription = accesoSuscripcion.subscription || {};
  const estado = normalizarEstadoSuscripcion(
    accesoSuscripcion.status ||
      subscription.status ||
      usuario.suscripcion_estado ||
      (usuario.demo_activo ? ESTADOS_SUSCRIPCION.TRIAL : ESTADOS_SUSCRIPCION.ACTIVE)
  );
  const vence = fechaISO(
    subscription.expires_at ||
      subscription.trial_ends_at ||
      usuario.suscripcion_vence ||
      usuario.demo_vence
  );
  const trialVence = fechaISO(
    subscription.trial_ends_at ||
      (estado === ESTADOS_SUSCRIPCION.TRIAL ? vence : null)
  );
  const diasTrial =
    estado === ESTADOS_SUSCRIPCION.TRIAL
      ? calcularDiasRestantesTrial({ status: estado, trial_ends_at: trialVence })
      : null;

  return {
    estado,
    status: estado.toLowerCase(),
    operativo: accesoSuscripcion.permitido !== false,
    plan: subscription.billing_cycle || usuario.suscripcion_plan || "mensual",
    vence,
    trial_inicio: fechaISO(subscription.trial_starts_at || usuario.demo_inicio),
    trial_vence: trialVence,
    dias_restantes:
      diasTrial !== null
        ? diasTrial
        : accesoSuscripcion.days_remaining ?? null,
    grace_remaining: accesoSuscripcion.grace_remaining ?? null,
    usuarios_adicionales: Number(usuario.suscripcion_usuarios_adicionales || 0),
    empresas_ilimitadas: true,
  };
}

async function registrarUsuario(req, res) {
  try {
    const { nombre, email, password } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({
        error: "Nombre, email y contrasena son obligatorios",
      });
    }

    if (rechazarPasswordInvalida(res, password, { email })) {
      return undefined;
    }

    if (!registroPublicoHabilitado()) {
      return res.status(403).json({
        error:
          "El registro publico esta deshabilitado. Solicita acceso al administrador del sistema.",
      });
    }

    const emailNormalizado = String(email).trim().toLowerCase();

    const usuarioExiste = await pool.query(
      "SELECT id FROM usuarios WHERE email = $1",
      [emailNormalizado]
    );

    if (usuarioExiste.rows.length > 0) {
      return res.status(400).json({
        error: "El correo ya esta registrado",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // El rol siempre es de cliente. Antes, si la tabla de usuarios estaba
    // vacia, el primero en registrarse quedaba como superadministrador por un
    // endpoint publico: bastaba llegar antes que el dueno del sistema. El
    // administrador inicial se crea solo desde ADMIN_EMAIL y ADMIN_PASSWORD
    // al arrancar el servicio (helpers/auth.helper.js).
    const nuevoUsuario = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ($1, $2, $3, 'admin_cliente', true)
       RETURNING id, nombre, email, rol, activo, creado_en`,
      [nombre, emailNormalizado, passwordHash]
    );

    return res.status(201).json({
      mensaje: "Usuario registrado correctamente",
      usuario: nuevoUsuario.rows[0],
    });
  } catch (error) {
    console.error("Error al registrar usuario:", error);

    return res.status(500).json({
      error: "Error interno al registrar usuario",
    });
  }
}

async function loginUsuario(req, res) {
  try {
    const identificador = String(req.body.email || req.body.identificador || req.body.rut || "").trim();
    const { password } = req.body;

    if (!identificador || !password) {
      return res.status(400).json({
        error: "RUT o correo y contrasena son obligatorios",
      });
    }

    const emailNormalizado = identificador.toLowerCase();
    const rutNormalizado = pareceRut(identificador)
      ? normalizarRut(identificador).rut_normalizado
      : "";


    const resultado = await pool.query(
      `SELECT
         u.*,
         CASE
           WHEN u.demo_vence IS NULL THEN 0
           ELSE GREATEST((u.demo_vence - CURRENT_DATE), 0)::int
         END AS demo_dias_restantes
       FROM usuarios u
       WHERE u.activo = true
         AND (
           u.email = $1
           OR ($2 <> '' AND u.rut_normalizado = $2)
         )
       LIMIT 1`,
      [emailNormalizado, rutNormalizado]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({
        error: "Credenciales incorrectas",
      });
    }

    const usuario = resultado.rows[0];

    const passwordCorrecta = await bcrypt.compare(
      password,
      usuario.password_hash
    );

    if (!passwordCorrecta) {
      return res.status(401).json({
        error: "Credenciales incorrectas",
      });
    }

    const accesoSuscripcion = await validarAccesoSuscripcion(pool, usuario);

    const usuarioToken = {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
    };

    await pool.query("UPDATE usuarios SET ultimo_acceso_en = NOW() WHERE id = $1", [
      usuario.id,
    ]);

    const empresas = await obtenerEmpresasPermitidas(pool, usuarioToken);

    const token = await firmarToken(pool, usuarioToken);

    return res.json({
      mensaje: "Login correcto",
      token,
      usuario: {
        ...datosUsuarioPublico(usuario, empresas),
        demo: false,
        demo_info: null,
        trial: accesoSuscripcion.status === ESTADOS_SUSCRIPCION.TRIAL,
        trial_info:
          accesoSuscripcion.status === ESTADOS_SUSCRIPCION.TRIAL
            ? {
                activo: accesoSuscripcion.permitido === true,
                inicio: fechaISO(accesoSuscripcion.subscription?.trial_starts_at || usuario.demo_inicio),
                vence: fechaISO(
                  accesoSuscripcion.subscription?.trial_ends_at ||
                    accesoSuscripcion.subscription?.expires_at ||
                    usuario.demo_vence
                ),
                dias_restantes: accesoSuscripcion.days_remaining ?? null,
                empresas_ilimitadas: true,
              }
            : null,
        suscripcion: datosSuscripcionPublica(accesoSuscripcion, usuario),
      },
    });
  } catch (error) {
    console.error("Error al iniciar sesion:", error);

    return res.status(500).json({
      error: "Error interno al iniciar sesion",
    });
  }
}

/**
 * Renueva el token de la sesion en curso.
 *
 * La vigencia paso de 8 a 4 horas para acortar la ventana util de un token
 * robado. Para que eso no expulse a quien esta trabajando, el frontend pide un
 * token nuevo mientras el actual siga siendo valido. No es un token de refresco
 * aparte: exige un token vigente, de modo que uno vencido no sirve para revivir
 * la sesion.
 */
async function renovarSesion(req, res) {
  try {
    const resultado = await pool.query(
      "SELECT id, email, rol, activo FROM usuarios WHERE id = $1 LIMIT 1",
      [req.usuario.id]
    );

    const usuario = resultado.rows[0];

    if (!usuario || usuario.activo !== true) {
      return res.status(401).json({ error: "La cuenta no esta activa" });
    }

    const token = await firmarToken(pool, usuario, {
      ...(req.usuario.trial ? { trial: true, trial_vence: req.usuario.trial_vence } : {}),
    });

    return res.json({ token });
  } catch (error) {
    console.error("Error al renovar sesion:", error);
    return res.status(500).json({ error: "No se pudo renovar la sesion" });
  }
}

async function obtenerSesion(req, res) {
  try {

    const resultado = await pool.query(
      `SELECT
         id,
         nombre,
         email,
         rol,
         activo,
         creado_en,
         demo_activo,
         demo_inicio,
         demo_vence,
         demo_empresa_limite,
         suscripcion_estado,
         suscripcion_plan,
         suscripcion_vence,
         suscripcion_usuarios_adicionales,
         CASE
           WHEN demo_vence IS NULL THEN 0
           ELSE GREATEST((demo_vence - CURRENT_DATE), 0)::int
         END AS demo_dias_restantes
       FROM usuarios
       WHERE id = $1 AND activo = true`,
      [req.usuario.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({
        error: "Usuario no encontrado o inactivo",
      });
    }

    const usuario = resultado.rows[0];
    const usuarioToken = {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
    };

    const empresas = await obtenerEmpresasPermitidas(pool, usuarioToken);
    const accesoSuscripcion =
      req.suscripcion || (await validarAccesoSuscripcion(pool, usuarioToken));

    return res.json({
      usuario: {
        ...datosUsuarioPublico(usuario, empresas),
        demo: false,
        demo_info: null,
        trial: accesoSuscripcion.status === ESTADOS_SUSCRIPCION.TRIAL,
        trial_info:
          accesoSuscripcion.status === ESTADOS_SUSCRIPCION.TRIAL
            ? {
                activo: accesoSuscripcion.permitido === true,
                inicio: fechaISO(accesoSuscripcion.subscription?.trial_starts_at || usuario.demo_inicio),
                vence: fechaISO(
                  accesoSuscripcion.subscription?.trial_ends_at ||
                    accesoSuscripcion.subscription?.expires_at ||
                    usuario.demo_vence
                ),
                dias_restantes: accesoSuscripcion.days_remaining ?? null,
                empresas_ilimitadas: true,
              }
            : null,
        suscripcion: datosSuscripcionPublica(accesoSuscripcion, usuario),
      },
    });
  } catch (error) {
    console.error("Error al obtener sesion:", error);

    return res.status(500).json({
      error: "Error interno al obtener sesion",
    });
  }
}

async function listarUsuarios(req, res) {
  try {

    const { empresa_id } = req.query;
    const valores = [];
    let filtroEmpresa = "";

    if (empresa_id) {
      const puedeAdministrar = await usuarioPuedeAdministrarEmpresa(
        pool,
        req.usuario,
        Number(empresa_id)
      );

      if (!puedeAdministrar) {
        return res.status(403).json({
          error: "No puedes administrar usuarios de esta empresa",
        });
      }

      valores.push(Number(empresa_id));
      filtroEmpresa = "AND ue.empresa_id = $1";
    }

    if (!esAdminSistema(req.usuario.rol) && !empresa_id) {
      const empresas = await obtenerEmpresasPermitidas(pool, req.usuario);
      const empresasAdmin = empresas
        .filter((empresa) => ["admin", "administrador"].includes(empresa.rol_empresa))
        .map((empresa) => Number(empresa.id));

      if (empresasAdmin.length === 0) {
        return res.json({ total: 0, usuarios: [] });
      }

      valores.push(empresasAdmin);
      filtroEmpresa = "AND ue.empresa_id = ANY($1::int[])";
    }

    const resultado = await pool.query(
      `
      SELECT
        u.id,
        u.nombre,
        u.email,
        u.rut,
        u.rut_normalizado,
        u.telefono,
        u.rol,
        u.activo,
        u.creado_en,
        u.ultimo_acceso_en,
        u.suscripcion_estado,
        u.suscripcion_plan,
        u.suscripcion_vence,
        COALESCE(
          json_agg(
            json_build_object(
              'empresa_id', e.id,
              'razon_social', e.razon_social,
              'rut', e.rut,
              'rol_empresa', ue.rol_empresa,
              'activo', ue.activo
            )
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'::json
        ) AS empresas
      FROM usuarios u
      LEFT JOIN usuarios_empresas ue ON ue.usuario_id = u.id
      LEFT JOIN empresas e ON e.id = ue.empresa_id
      WHERE 1 = 1
      ${filtroEmpresa}
      GROUP BY u.id
      ORDER BY u.id DESC
      `,
      valores
    );

    return res.json({
      total: resultado.rows.length,
      usuarios: resultado.rows,
    });
  } catch (error) {
    console.error("Error al listar usuarios:", error);

    return res.status(500).json({
      error: "Error interno al listar usuarios",
    });
  }
}

async function crearUsuarioCliente(req, res) {
  const client = await pool.connect();
  let transaccionIniciada = false;
  let correoInvitacion = null;

  try {

    const { nombre, email, rol, empresa_id, empresa_ids, rol_empresa, activo, rut, telefono } = req.body;
    const adminSistema = esAdminSistema(req.usuario.rol);

    if (!nombre || !email) {
      return res.status(400).json({
        error: "Nombre y email son obligatorios",
      });
    }

    const rolNormalizado = normalizarRol(rol || "usuario_cliente");
    const empresasIds = normalizarListaEmpresas(empresa_ids);
    const empresaId = Number(empresa_id || empresasIds[0] || 0) || null;
    const empresasAsignar = empresasIds.length > 0 ? empresasIds : empresaId ? [empresaId] : [];
    const activoFinal = normalizarActivo(activo, true);

    if (!adminSistema && rolNormalizado === "superadmin") {
      return res.status(403).json({
        error: "Solo el administrador del sistema puede crear super administradores",
      });
    }

    if (
      rolNormalizado !== "superadmin" &&
      empresasAsignar.length === 0 &&
      !adminSistema
    ) {
      return res.status(400).json({
        error: "Debe seleccionar la empresa del cliente",
      });
    }

    for (const empresaAsignadaId of empresasAsignar) {
      const puedeAdministrar = await usuarioPuedeAdministrarEmpresa(
        client,
        req.usuario,
        empresaAsignadaId
      );

      if (!puedeAdministrar) {
        return res.status(403).json({
          error: "No puedes administrar usuarios de esta empresa",
        });
      }
    }

    if (!adminSistema) {
      const limite = await validarLimiteUsuariosCliente(client, req.usuario);

      if (!limite.permitido) {
        return res.status(403).json({
          error: limite.mensaje || "Limite de usuarios alcanzado para el plan actual",
        });
      }
    }

    const emailNormalizado = String(email).trim().toLowerCase();
    const rutTexto = String(rut || "").trim();
    const rutDatos = rutTexto ? normalizarRut(rutTexto) : null;
    const telefonoNormalizado = String(telefono || "").trim();

    if (rutTexto && !rutDatos.valido) {
      return res.status(400).json({
        error: "RUT invalido",
      });
    }

    const existe = await client.query("SELECT id FROM usuarios WHERE email = $1", [
      emailNormalizado,
    ]);

    if (existe.rows.length > 0) {
      return res.status(400).json({
        error: "Ya existe un usuario con ese correo",
      });
    }

    if (rutDatos?.rut_normalizado) {
      const rutDuplicado = await client.query(
        "SELECT id FROM usuarios WHERE rut_normalizado = $1 LIMIT 1",
        [rutDatos.rut_normalizado]
      );

      if (rutDuplicado.rows.length > 0) {
        return res.status(400).json({
          error: "Ya existe un usuario con ese RUT",
        });
      }
    }

    await client.query("BEGIN");
    transaccionIniciada = true;

    const claveInicialSegura = crypto.randomBytes(32).toString("hex");
    const passwordHash = await bcrypt.hash(claveInicialSegura, 10);
    const usuario = await client.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo, rut, rut_normalizado, telefono)
       VALUES ($1, $2, $3, $4, true, $5, $6, $7)
       RETURNING id, nombre, email, rol, activo, rut, rut_normalizado, telefono, creado_en`,
      [
        String(nombre).trim(),
        emailNormalizado,
        passwordHash,
        rolNormalizado,
        rutDatos?.rut || rutTexto || null,
        rutDatos?.rut_normalizado || null,
        telefonoNormalizado || null,
      ]
    );

    if (activoFinal === false) {
      await client.query("UPDATE usuarios SET activo = false WHERE id = $1", [
        usuario.rows[0].id,
      ]);
      usuario.rows[0].activo = false;
    }

    for (const empresaAsignadaId of empresasAsignar) {
      await asignarUsuarioEmpresa(
        client,
        usuario.rows[0].id,
        empresaAsignadaId,
        rol_empresa || (rolNormalizado === "admin_cliente" ? "admin" : "usuario")
      );
    }

    await registrarAuditoria({
      client,
      req,
      empresaId,
      modulo: "Administración",
      accion: "Crear usuario",
      detalle: `Usuario creado desde administracion: ${emailNormalizado}`,
      tablaAfectada: "usuarios",
      registroId: usuario.rows[0].id,
      datos: {
        usuario: {
          nombre: String(nombre).trim(),
          email: emailNormalizado,
          rut: rutDatos?.rut_normalizado || null,
          telefono: telefonoNormalizado || null,
          rol: rolNormalizado,
          activo: activoFinal,
          empresas: empresasAsignar,
        },
      },
    });

    correoInvitacion = await crearTokenRecuperacionPassword(
      client,
      req,
      usuario.rows[0].id
    );

    await client.query("COMMIT");
    transaccionIniciada = false;

    let resultadoCorreo;
    try {
      resultadoCorreo = await enviarCorreoRecuperacionPassword({
        nombre: usuario.rows[0].nombre,
        email: usuario.rows[0].email,
        resetUrl: correoInvitacion.resetUrl,
        minutosVigencia: correoInvitacion.minutosVigencia,
        modo: "invitacion",
      });
    } catch (errorCorreo) {
      console.error("Usuario creado, pero no se pudo enviar invitacion:", errorCorreo.message);
      resultadoCorreo = { enviado: false, motivo: "Error al enviar correo" };
    }

    return res.status(201).json({
      mensaje: resultadoCorreo.enviado
        ? "Usuario creado correctamente. Se envio invitacion para definir contrasena."
        : `Usuario creado correctamente. No se envio correo: ${resultadoCorreo.motivo || "SMTP no disponible"}.`,
      correo_enviado: resultadoCorreo.enviado,
      correo_motivo: resultadoCorreo.motivo || null,
      usuario: usuario.rows[0],
    });
  } catch (error) {
    if (transaccionIniciada) {
      await client.query("ROLLBACK");
    }

    console.error("Error al crear usuario:", error);

    return res.status(500).json({
      error: "Error interno al crear usuario",
    });
  } finally {
    client.release();
  }
}

async function actualizarUsuarioCliente(req, res) {
  const client = await pool.connect();
  let transaccionIniciada = false;

  try {

    const { id } = req.params;
    const { nombre, email, rol, empresa_id, empresa_ids, rol_empresa, activo, rut, telefono } = req.body;
    const usuarioId = Number(id || 0);

    if (!usuarioId) {
      return res.status(400).json({
        error: "Usuario invalido",
      });
    }

    if (!nombre || !email) {
      return res.status(400).json({
        error: "Nombre y correo son obligatorios",
      });
    }

    // Un administrador de cliente solo administra usuarios de sus propias
    // empresas, y nunca a un Administrador del Sistema.
    const alcance = await puedeAdministrarUsuarioObjetivo(
      client,
      req.usuario,
      usuarioId
    );

    if (!alcance.permitido) {
      return res.status(alcance.noEncontrado ? 404 : 403).json({
        error: alcance.motivo,
      });
    }

    const usuarioActual = await client.query(
      `SELECT id, nombre, email, rut, rut_normalizado, telefono, rol, activo
       FROM usuarios
       WHERE id = $1
       LIMIT 1`,
      [usuarioId]
    );

    if (usuarioActual.rows.length === 0) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    const usuarioObjetivo = usuarioActual.rows[0];
    const rolNormalizado = normalizarRol(rol || usuarioObjetivo.rol);
    const emailNormalizado = normalizarEmail(email);
    const empresasIds = normalizarListaEmpresas(empresa_ids);
    const empresaId = Number(empresa_id || empresasIds[0] || 0) || null;
    const empresasAsignar = empresasIds.length > 0 ? empresasIds : empresaId ? [empresaId] : [];
    const activoFinal = normalizarActivo(activo, usuarioObjetivo.activo);
    const rutTexto = String(rut || "").trim();
    const rutDatos = rutTexto ? normalizarRut(rutTexto) : null;
    const telefonoNormalizado = String(telefono || "").trim();

    if (!emailNormalizado) {
      return res.status(400).json({
        error: "Correo invalido",
      });
    }

    if (rutTexto && !rutDatos.valido) {
      return res.status(400).json({
        error: "RUT invalido",
      });
    }

    if (!esAdminSistema(req.usuario.rol) && rolNormalizado === "superadmin") {
      return res.status(403).json({
        error: "Solo el administrador del sistema puede asignar rol de sistema",
      });
    }

    if (Number(req.usuario.id) === usuarioId && activoFinal === false) {
      return res.status(400).json({
        error: "No puedes desactivar tu propio usuario",
      });
    }

    if (
      esRolAdminSistema(usuarioObjetivo.rol) &&
      (!esRolAdminSistema(rolNormalizado) || activoFinal === false) &&
      (await esUltimoAdminSistemaActivo(client, usuarioId))
    ) {
      return res.status(400).json({
        error: "No se puede desactivar ni quitar el rol al ultimo Administrador del Sistema activo",
      });
    }

    const correoDuplicado = await client.query(
      `SELECT id
       FROM usuarios
       WHERE email = $1
         AND id <> $2
       LIMIT 1`,
      [emailNormalizado, usuarioId]
    );

    if (correoDuplicado.rows.length > 0) {
      return res.status(400).json({
        error: "Ya existe otro usuario con ese correo",
      });
    }

    if (rutDatos?.rut_normalizado) {
      const rutDuplicado = await client.query(
        `SELECT id
         FROM usuarios
         WHERE rut_normalizado = $1
           AND id <> $2
         LIMIT 1`,
        [rutDatos.rut_normalizado, usuarioId]
      );

      if (rutDuplicado.rows.length > 0) {
        return res.status(400).json({
          error: "Ya existe otro usuario con ese RUT",
        });
      }
    }

    let empresasAdministrables = null;

    if (!esAdminSistema(req.usuario.rol)) {
      const empresasPermitidas = await obtenerEmpresasPermitidas(client, req.usuario);
      empresasAdministrables = empresasPermitidas
        .filter((empresa) => ["admin", "administrador"].includes(empresa.rol_empresa))
        .map((empresa) => Number(empresa.id));

      const empresasObjetivo = await client.query(
        `SELECT empresa_id
         FROM usuarios_empresas
         WHERE usuario_id = $1
           AND activo = true`,
        [usuarioId]
      );

      const puedeEditarObjetivo =
        Number(req.usuario.id) === usuarioId ||
        empresasObjetivo.rows.some((empresa) =>
          empresasAdministrables.includes(Number(empresa.empresa_id))
        );

      if (!puedeEditarObjetivo) {
        return res.status(403).json({
          error: "No puedes modificar este usuario",
        });
      }

      if (!empresaId || !empresasAdministrables.includes(empresaId)) {
        return res.status(403).json({
          error: "No puedes asignar usuarios a esta empresa",
        });
      }
    }

    for (const empresaAsignadaId of empresasAsignar) {
      const puedeAdministrar = await usuarioPuedeAdministrarEmpresa(
        client,
        req.usuario,
        empresaAsignadaId
      );

      if (!puedeAdministrar) {
        return res.status(403).json({
          error: "No puedes administrar usuarios de esta empresa",
        });
      }
    }

    await client.query("BEGIN");
    transaccionIniciada = true;

    const actualizado = await client.query(
      `UPDATE usuarios
       SET nombre = $1,
           email = $2,
           rol = $3,
           activo = $4,
           rut = $5,
           rut_normalizado = $6,
           telefono = $7
       WHERE id = $8
       RETURNING id, nombre, email, rol, activo, rut, rut_normalizado, telefono, creado_en`,
      [
        String(nombre).trim(),
        emailNormalizado,
        rolNormalizado,
        activoFinal,
        rutDatos?.rut || rutTexto || null,
        rutDatos?.rut_normalizado || null,
        telefonoNormalizado || null,
        usuarioId,
      ]
    );

    if (rolNormalizado === "superadmin") {
      await client.query(
        `UPDATE usuarios_empresas
         SET activo = false,
             actualizado_en = NOW()
         WHERE usuario_id = $1`,
        [usuarioId]
      );
    } else if (empresasAsignar.length > 0) {
      if (esAdminSistema(req.usuario.rol)) {
        await client.query(
          `UPDATE usuarios_empresas
           SET activo = false,
               actualizado_en = NOW()
           WHERE usuario_id = $1
             AND NOT (empresa_id = ANY($2::int[]))`,
          [usuarioId, empresasAsignar]
        );
      } else if (Array.isArray(empresasAdministrables) && empresasAdministrables.length > 0) {
        await client.query(
          `UPDATE usuarios_empresas
           SET activo = false,
               actualizado_en = NOW()
           WHERE usuario_id = $1
             AND empresa_id = ANY($2::int[])
             AND NOT (empresa_id = ANY($3::int[]))`,
          [usuarioId, empresasAdministrables, empresasAsignar]
        );
      }

      for (const empresaAsignadaId of empresasAsignar) {
        await asignarUsuarioEmpresa(
          client,
          usuarioId,
          empresaAsignadaId,
          normalizarRolEmpresa(
            rol_empresa || (rolNormalizado === "admin_cliente" ? "admin" : "usuario")
          )
        );
      }
    } else if (esAdminSistema(req.usuario.rol)) {
      await client.query(
        `UPDATE usuarios_empresas
         SET activo = false,
             actualizado_en = NOW()
         WHERE usuario_id = $1`,
        [usuarioId]
      );
    }

    await registrarAuditoria({
      client,
      req,
      empresaId,
      modulo: "Usuarios y accesos",
      accion: "Actualizar usuario",
      detalle: `Usuario actualizado: ${emailNormalizado}`,
      tablaAfectada: "usuarios",
      registroId: usuarioId,
      datos: {
        antes: {
          nombre: usuarioObjetivo.nombre,
          email: usuarioObjetivo.email,
          rut: usuarioObjetivo.rut_normalizado || usuarioObjetivo.rut || null,
          telefono: usuarioObjetivo.telefono || null,
          rol: usuarioObjetivo.rol,
          activo: usuarioObjetivo.activo,
        },
        despues: {
          nombre: String(nombre).trim(),
          email: emailNormalizado,
          rut: rutDatos?.rut_normalizado || null,
          telefono: telefonoNormalizado || null,
          rol: rolNormalizado,
          activo: activoFinal,
          empresa_id: empresaId,
          empresas: empresasAsignar,
          rol_empresa: rol_empresa || null,
        },
      },
    });

    await client.query("COMMIT");
    transaccionIniciada = false;

    return res.json({
      mensaje: "Usuario actualizado correctamente",
      usuario: actualizado.rows[0],
    });
  } catch (error) {
    if (transaccionIniciada) {
      await client.query("ROLLBACK");
    }

    console.error("Error al actualizar usuario:", error);

    return res.status(500).json({
      error: "Error interno al actualizar usuario",
    });
  } finally {
    client.release();
  }
}

async function cambiarEstadoUsuario(req, res) {
  const client = await pool.connect();
  let transaccionIniciada = false;

  try {
    const { id } = req.params;
    const { activo } = req.body;
    const usuarioId = Number(id || 0);
    const activoFinal = Boolean(activo);

    if (usuarioId === Number(req.usuario.id) && activoFinal === false) {
      return res.status(400).json({
        error: "No puedes desactivar tu propio usuario",
      });
    }

    // Un administrador de cliente solo administra usuarios de sus propias
    // empresas, y nunca a un Administrador del Sistema.
    const alcance = await puedeAdministrarUsuarioObjetivo(
      client,
      req.usuario,
      usuarioId
    );

    if (!alcance.permitido) {
      return res.status(alcance.noEncontrado ? 404 : 403).json({
        error: alcance.motivo,
      });
    }

    const usuarioActual = await client.query(
      `SELECT id, nombre, email, rol, activo
       FROM usuarios
       WHERE id = $1
       LIMIT 1`,
      [usuarioId]
    );

    if (usuarioActual.rows.length === 0) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    if (
      usuarioActual.rows[0].activo === true &&
      activoFinal === false &&
      esRolAdminSistema(usuarioActual.rows[0].rol) &&
      (await esUltimoAdminSistemaActivo(client, usuarioId))
    ) {
      return res.status(400).json({
        error: "No se puede desactivar al ultimo Administrador del Sistema activo",
      });
    }

    await client.query("BEGIN");
    transaccionIniciada = true;

    const actualizado = await client.query(
      `UPDATE usuarios
       SET activo = $1
       WHERE id = $2
       RETURNING id, nombre, email, rol, activo`,
      [activoFinal, usuarioId]
    );

    // Desactivar la cuenta cierra sus sesiones. Sin esto, quien ya tenia el
    // token seguia operando hasta que venciera.
    if (activoFinal === false) {
      await revocarSesiones(client, usuarioId);
    }

    await registrarAuditoria({
      client,
      req,
      empresaId: null,
      modulo: "Administración",
      accion: activoFinal ? "Reactivar usuario" : "Desactivar usuario",
      detalle: `Cambio de estado usuario: ${usuarioActual.rows[0].email}`,
      tablaAfectada: "usuarios",
      registroId: usuarioId,
      datos: {
        antes: { activo: usuarioActual.rows[0].activo },
        despues: { activo: activoFinal },
      },
    });

    await client.query("COMMIT");
    transaccionIniciada = false;

    return res.json({
      mensaje: "Estado actualizado correctamente",
      usuario: actualizado.rows[0],
    });
  } catch (error) {
    if (transaccionIniciada) {
      await client.query("ROLLBACK");
    }

    console.error("Error al cambiar estado de usuario:", error);

    return res.status(500).json({
      error: "Error interno al cambiar estado de usuario",
    });
  } finally {
    client.release();
  }
}

async function resetearPasswordUsuario(req, res) {
  return res.status(403).json({
    error:
      "Por seguridad el administrador no puede definir ni conocer contrasenas. Usa el flujo de recuperacion de contrasena.",
  });
}

async function solicitarRecuperacionPasswordUsuario(req, res) {
  try {

    const usuarioId = Number(req.params?.id || 0);

    if (!usuarioId) {
      return res.status(400).json({
        error: "Usuario invalido",
      });
    }


    // Un administrador de cliente solo administra usuarios de sus propias
    // empresas, y nunca a un Administrador del Sistema.
    const alcance = await puedeAdministrarUsuarioObjetivo(
      pool,
      req.usuario,
      usuarioId
    );

    if (!alcance.permitido) {
      return res.status(alcance.noEncontrado ? 404 : 403).json({
        error: alcance.motivo,
      });
    }

    const usuarioResult = await pool.query(
      `SELECT id, nombre, email
       FROM usuarios
       WHERE id = $1
       LIMIT 1`,
      [usuarioId]
    );

    if (usuarioResult.rows.length === 0) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    const usuario = usuarioResult.rows[0];
    const tokenRecuperacion = await crearTokenRecuperacionPassword(pool, req, usuario.id);

    let resultadoCorreo;
    try {
      resultadoCorreo = await enviarCorreoRecuperacionPassword({
        nombre: usuario.nombre,
        email: usuario.email,
        resetUrl: tokenRecuperacion.resetUrl,
        minutosVigencia: tokenRecuperacion.minutosVigencia,
        modo: "recuperacion",
      });
    } catch (errorCorreo) {
      console.error("No se pudo enviar recuperacion de contrasena:", errorCorreo.message);
      resultadoCorreo = { enviado: false, motivo: "Error al enviar correo" };
    }

    await registrarAuditoria({
      req,
      empresaId: null,
      modulo: "Administración",
      accion: "Enviar recuperacion contrasena",
      detalle: `Recuperacion de contrasena solicitada para ${usuario.email}`,
      tablaAfectada: "usuarios",
      registroId: usuario.id,
      datos: {
        usuario_id: usuario.id,
        email: usuario.email,
      },
    });

    const respuesta = {
      mensaje: resultadoCorreo.enviado
        ? "Se envio la recuperacion de contrasena al correo del usuario."
        : `Recuperacion generada, pero no se envio correo: ${resultadoCorreo.motivo || "SMTP no disponible"}.`,
      correo_enviado: resultadoCorreo.enviado,
      correo_motivo: resultadoCorreo.motivo || null,
    };

    if (process.env.NODE_ENV !== "production") {
      respuesta.url_reset_desarrollo = tokenRecuperacion.resetUrl;
    }

    return res.json(respuesta);
  } catch (error) {
    console.error("Error al solicitar recuperacion de contrasena de usuario:", error);

    return res.status(500).json({
      error: "Error interno al solicitar recuperacion de contrasena",
    });
  }
}

async function solicitarRecuperacionPassword(req, res) {
  try {

    const identificador = String(req.body?.email || req.body?.rut || "").trim();
    const email = normalizarEmail(identificador);
    const rutNormalizado = pareceRut(identificador)
      ? normalizarRut(identificador).rut_normalizado
      : "";

    if (!identificador) {
      return res.status(400).json({
        error: "El correo o RUT es obligatorio",
      });
    }

    if (limiteRecuperacionExcedido(req, email || rutNormalizado)) {
      return res.json({ mensaje: MENSAJE_RECUPERACION });
    }

    const usuarioResult = await pool.query(
      `SELECT id, nombre, email
       FROM usuarios
       WHERE activo = true
         AND (
           email = $1
           OR ($2 <> '' AND rut_normalizado = $2)
         )
       LIMIT 1`,
      [email, rutNormalizado]
    );

    const respuesta = {
      mensaje: MENSAJE_RECUPERACION,
    };

    if (usuarioResult.rows.length > 0) {
      const usuario = usuarioResult.rows[0];
      const tokenRecuperacion = await crearTokenRecuperacionPassword(pool, req, usuario.id);

      try {
        const resultadoCorreo = await enviarCorreoRecuperacionPassword({
          nombre: usuario.nombre,
          email: usuario.email,
          resetUrl: tokenRecuperacion.resetUrl,
          minutosVigencia: tokenRecuperacion.minutosVigencia,
          modo: "recuperacion",
        });

        if (!resultadoCorreo.enviado) {
          console.warn(
            `Solicitud de recuperacion registrada sin correo enviado: ${resultadoCorreo.motivo || "SMTP no disponible"}`
          );
        }
      } catch (errorCorreo) {
        console.error("No se pudo enviar correo de recuperacion:", errorCorreo.message);
      }

      if (process.env.NODE_ENV !== "production") {
        respuesta.url_reset_desarrollo = tokenRecuperacion.resetUrl;
      }
    }

    return res.json(respuesta);
  } catch (error) {
    console.error("Error al solicitar recuperacion de contrasena:", error);

    return res.status(500).json({
      error: "Error interno al solicitar recuperacion de contrasena",
    });
  }
}

async function resetearPasswordConToken(req, res) {
  const client = await pool.connect();
  let transaccionIniciada = false;

  try {
    const { token, password } = req.body || {};

    if (!token) {
      return res.status(400).json({
        error: "El enlace de recuperacion no es valido",
      });
    }

    if (rechazarPasswordInvalida(res, password)) {
      return undefined;
    }

    const tokenHash = hashResetToken(token);
    const tokenResult = await client.query(
      `SELECT prt.id, prt.usuario_id
       FROM password_reset_tokens prt
       JOIN usuarios u ON u.id = prt.usuario_id
       WHERE prt.token_hash = $1
         AND prt.usado_en IS NULL
         AND prt.vence_en > NOW()
         AND u.activo = true
       LIMIT 1`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        error: "El enlace de recuperacion vencio o ya fue utilizado",
      });
    }

    const tokenDb = tokenResult.rows[0];
    const passwordHash = await bcrypt.hash(password, 10);

    await client.query("BEGIN");
    transaccionIniciada = true;

    await client.query(
      `UPDATE usuarios
       SET password_hash = $1
       WHERE id = $2`,
      [passwordHash, tokenDb.usuario_id]
    );

    // Cambiar la contrasena cierra las sesiones abiertas. Si alguien entro con
    // la clave anterior, su token deja de servir en el acto.
    await revocarSesiones(client, tokenDb.usuario_id);

    await client.query(
      `UPDATE password_reset_tokens
       SET usado_en = NOW()
       WHERE usuario_id = $1
         AND usado_en IS NULL`,
      [tokenDb.usuario_id]
    );

    await client.query("COMMIT");
    transaccionIniciada = false;

    return res.json({
      mensaje: "Contraseña actualizada correctamente. Ya puedes iniciar sesion.",
    });
  } catch (error) {
    if (transaccionIniciada) {
      await client.query("ROLLBACK");
    }

    console.error("Error al resetear contrasena con token:", error);

    return res.status(500).json({
      error: "Error interno al actualizar contrasena",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  registrarUsuario,
  loginUsuario,
  obtenerSesion,
  renovarSesion,
  listarUsuarios,
  crearUsuarioCliente,
  actualizarUsuarioCliente,
  cambiarEstadoUsuario,
  resetearPasswordUsuario,
  solicitarRecuperacionPasswordUsuario,
  solicitarRecuperacionPassword,
  resetearPasswordConToken,
};
