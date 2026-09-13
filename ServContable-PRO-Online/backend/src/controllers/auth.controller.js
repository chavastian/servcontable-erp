const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../database/db");
const { obtenerJwtSecret } = require("../config/env");
const {
  normalizarRol,
  esAdminSistema,
  usuarioPuedeAdministrarEmpresa,
  obtenerEmpresasPermitidas,
  asignarUsuarioEmpresa,
} = require("../helpers/auth.helper");
const { registrarAuditoria } = require("../helpers/auditoria.helper");

function registroPublicoHabilitado() {
  return process.env.ALLOW_PUBLIC_REGISTRATION === "true";
}

function valorEnvBooleano(valor) {
  const normalizado = String(valor || "").trim().toLowerCase();

  if (["true", "1", "si", "sí", "yes"].includes(normalizado)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalizado)) {
    return false;
  }

  return null;
}

function demoHabilitada(req) {
  const demoModo = valorEnvBooleano(process.env.DEMO_MODE);

  if (demoModo !== null) {
    return demoModo;
  }

  const contextoLocal = [
    req?.hostname,
    req?.headers?.host,
    req?.headers?.origin,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    process.env.NODE_ENV !== "production" &&
    /(localhost|127\.0\.0\.1|\[::1\]|::1)/.test(contextoLocal)
  );
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

function fechaISO(valor) {
  if (!valor) {
    return null;
  }

  if (valor instanceof Date) {
    return valor.toISOString().slice(0, 10);
  }

  return String(valor).slice(0, 10);
}

function demoEstaVigente(usuario = {}) {
  if (!usuario.demo_activo || !usuario.demo_vence) {
    return false;
  }

  const venceTexto = fechaISO(usuario.demo_vence);
  const vence = new Date(`${venceTexto}T23:59:59`);

  if (Number.isNaN(vence.getTime())) {
    return false;
  }

  return vence >= new Date();
}

function datosDemoPublico(usuario = {}) {
  return {
    activo: Boolean(usuario.demo_activo),
    inicio: fechaISO(usuario.demo_inicio),
    vence: fechaISO(usuario.demo_vence),
    empresa_limite: Number(usuario.demo_empresa_limite || 1),
    dias_restantes: Number(usuario.demo_dias_restantes || 0),
  };
}

async function asegurarColumnasDemoAuth(conexion = pool) {
  await conexion.query(`
    ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS demo_activo BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS demo_inicio DATE,
      ADD COLUMN IF NOT EXISTS demo_vence DATE,
      ADD COLUMN IF NOT EXISTS demo_empresa_limite INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS demo_origen VARCHAR(80)
  `);
}

async function desvincularEmpresasDemoAutomaticas(conexion, usuarioId) {
  if (!usuarioId) {
    return;
  }

  await conexion.query(
    `
    UPDATE usuarios_empresas ue
    SET activo = false,
        actualizado_en = NOW()
    FROM empresas e
    WHERE ue.empresa_id = e.id
      AND ue.usuario_id = $1
      AND ue.activo = true
      AND (
        UPPER(COALESCE(e.rut, '')) LIKE 'DEMO-%'
        OR e.razon_social ILIKE 'Empresa demo %'
        OR e.razon_social ILIKE 'EMPRESA DEMO SERVCONTABLE%'
      )
    `,
    [usuarioId]
  );
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

function datosDemo() {
  return {
    email: (process.env.DEMO_EMAIL || "demo@servcontable.cl").trim().toLowerCase(),
    nombre: (process.env.DEMO_NOMBRE || "Usuario Demo ServContable").trim(),
    password: process.env.DEMO_PASSWORD || "demo-servcontable",
    empresaRut: (process.env.DEMO_EMPRESA_RUT || "76.543.210-9").trim(),
    empresaRazonSocial: (
      process.env.DEMO_EMPRESA_RAZON_SOCIAL || "EMPRESA DEMO SERVCONTABLE SpA"
    ).trim(),
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

    const totalUsuarios = await pool.query("SELECT COUNT(*)::int AS total FROM usuarios");
    const esPrimerUsuario = Number(totalUsuarios.rows[0]?.total || 0) === 0;

    if (!esPrimerUsuario && !registroPublicoHabilitado()) {
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
    const rol = esPrimerUsuario ? "superadmin" : "admin_cliente";

    const nuevoUsuario = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, nombre, email, rol, activo, creado_en`,
      [nombre, emailNormalizado, passwordHash, rol]
    );

    return res.status(201).json({
      mensaje: esPrimerUsuario
        ? "Administrador principal creado correctamente"
        : "Usuario registrado correctamente",
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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email y contrasena son obligatorios",
      });
    }

    const emailNormalizado = String(email).trim().toLowerCase();

    await asegurarColumnasDemoAuth(pool);

    const resultado = await pool.query(
      `SELECT
         u.*,
         CASE
           WHEN u.demo_vence IS NULL THEN 0
           ELSE GREATEST((u.demo_vence - CURRENT_DATE), 0)::int
         END AS demo_dias_restantes
       FROM usuarios u
       WHERE u.email = $1 AND u.activo = true`,
      [emailNormalizado]
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

    const esDemo = Boolean(usuario.demo_activo);

    if (esDemo && !demoEstaVigente(usuario)) {
      return res.status(403).json({
        error:
          "Demo vencida o no autorizada. Solicita activacion al administrador.",
      });
    }

    const usuarioToken = {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      demo: esDemo,
      demo_vence: esDemo ? fechaISO(usuario.demo_vence) : null,
      demo_empresa_limite: esDemo
        ? Number(usuario.demo_empresa_limite || 1)
        : null,
    };

    if (esDemo) {
      await desvincularEmpresasDemoAutomaticas(pool, usuario.id);
    }

    const empresas = await obtenerEmpresasPermitidas(pool, usuarioToken);

    const token = jwt.sign(usuarioToken, obtenerJwtSecret(), {
      expiresIn: esDemo ? "4h" : "8h",
    });

    return res.json({
      mensaje: "Login correcto",
      token,
      usuario: {
        ...datosUsuarioPublico(usuario, empresas),
        demo: esDemo,
        demo_info: esDemo ? datosDemoPublico(usuario) : null,
      },
    });
  } catch (error) {
    console.error("Error al iniciar sesion:", error);

    return res.status(500).json({
      error: "Error interno al iniciar sesion",
    });
  }
}

async function loginDemo(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Correo y contrasena son obligatorios para ingresar a la demo.",
      });
    }

    const emailNormalizado = normalizarEmail(email);

    await asegurarColumnasDemoAuth(pool);

    const resultado = await pool.query(
      `SELECT
         u.*,
         CASE
           WHEN u.demo_vence IS NULL THEN 0
           ELSE GREATEST((u.demo_vence - CURRENT_DATE), 0)::int
         END AS demo_dias_restantes
       FROM usuarios u
       WHERE u.email = $1
         AND u.activo = true
         AND u.demo_activo = true
       LIMIT 1`,
      [emailNormalizado]
    );

    if (resultado.rows.length === 0) {
      return res.status(403).json({
        error:
          "Demo no autorizada. Solicita activacion al administrador del sistema.",
      });
    }

    const usuario = resultado.rows[0];

    if (!demoEstaVigente(usuario)) {
      return res.status(403).json({
        error: "Demo vencida. Solicita renovacion o contratacion del plan.",
      });
    }

    const passwordCorrecta = await bcrypt.compare(
      password,
      usuario.password_hash
    );

    if (!passwordCorrecta) {
      return res.status(401).json({
        error: "Credenciales demo incorrectas.",
      });
    }

    const usuarioToken = {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      demo: true,
      demo_vence: fechaISO(usuario.demo_vence),
      demo_empresa_limite: Number(usuario.demo_empresa_limite || 1),
    };

    await desvincularEmpresasDemoAutomaticas(pool, usuario.id);

    const empresas = await obtenerEmpresasPermitidas(pool, usuarioToken);
    const token = jwt.sign(usuarioToken, obtenerJwtSecret(), {
      expiresIn: "4h",
    });

    return res.json({
      mensaje: "Demo iniciada correctamente",
      token,
      usuario: {
        ...datosUsuarioPublico(usuario, empresas),
        demo: true,
        demo_info: datosDemoPublico(usuario),
      },
    });
  } catch (error) {
    console.error("Error al iniciar demo:", error);

    return res.status(500).json({
      error: "Error interno al iniciar demo",
    });
  }
}

async function obtenerSesion(req, res) {
  try {
    await asegurarColumnasDemoAuth(pool);

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
    const esDemo = req.usuario?.demo === true || Boolean(usuario.demo_activo);

    if (esDemo && !demoEstaVigente(usuario)) {
      return res.status(403).json({
        error: "Demo vencida. Solicita renovacion o contratacion del plan.",
      });
    }

    const usuarioToken = {
      ...req.usuario,
      demo: esDemo,
      demo_vence: esDemo ? fechaISO(usuario.demo_vence) : null,
      demo_empresa_limite: esDemo
        ? Number(usuario.demo_empresa_limite || 1)
        : null,
    };

    if (esDemo) {
      await desvincularEmpresasDemoAutomaticas(pool, usuario.id);
    }

    const empresas = await obtenerEmpresasPermitidas(pool, usuarioToken);

    return res.json({
      usuario: {
        ...datosUsuarioPublico(usuario, empresas),
        demo: esDemo,
        demo_info: esDemo ? datosDemoPublico(usuario) : null,
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
        u.rol,
        u.activo,
        u.creado_en,
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

  try {
    const { nombre, email, password, rol, empresa_id, rol_empresa } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({
        error: "Nombre, email y contrasena son obligatorios",
      });
    }

    const rolNormalizado = normalizarRol(rol || "usuario_cliente");
    const empresaId = Number(empresa_id || 0) || null;

    if (!esAdminSistema(req.usuario.rol) && rolNormalizado === "superadmin") {
      return res.status(403).json({
        error: "Solo el administrador del sistema puede crear super administradores",
      });
    }

    if (
      rolNormalizado !== "superadmin" &&
      !empresaId &&
      !esAdminSistema(req.usuario.rol)
    ) {
      return res.status(400).json({
        error: "Debe seleccionar la empresa del cliente",
      });
    }

    if (empresaId) {
      const puedeAdministrar = await usuarioPuedeAdministrarEmpresa(
        client,
        req.usuario,
        empresaId
      );

      if (!puedeAdministrar) {
        return res.status(403).json({
          error: "No puedes administrar usuarios de esta empresa",
        });
      }
    }

    const emailNormalizado = String(email).trim().toLowerCase();

    const existe = await client.query("SELECT id FROM usuarios WHERE email = $1", [
      emailNormalizado,
    ]);

    if (existe.rows.length > 0) {
      return res.status(400).json({
        error: "Ya existe un usuario con ese correo",
      });
    }

    await client.query("BEGIN");
    transaccionIniciada = true;

    const passwordHash = await bcrypt.hash(password, 10);
    const usuario = await client.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, nombre, email, rol, activo, creado_en`,
      [nombre, emailNormalizado, passwordHash, rolNormalizado]
    );

    if (empresaId) {
      await asignarUsuarioEmpresa(
        client,
        usuario.rows[0].id,
        empresaId,
        rol_empresa || (rolNormalizado === "admin_cliente" ? "admin" : "usuario")
      );
    }

    await client.query("COMMIT");
    transaccionIniciada = false;

    return res.status(201).json({
      mensaje: "Usuario creado correctamente",
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
    const { nombre, email, rol, empresa_id, rol_empresa, activo } = req.body;
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

    const usuarioObjetivo = usuarioActual.rows[0];
    const rolNormalizado = normalizarRol(rol || usuarioObjetivo.rol);
    const emailNormalizado = normalizarEmail(email);
    const empresaId = Number(empresa_id || 0) || null;
    const activoFinal = normalizarActivo(activo, usuarioObjetivo.activo);

    if (!emailNormalizado) {
      return res.status(400).json({
        error: "Correo invalido",
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

    if (empresaId) {
      const puedeAdministrar = await usuarioPuedeAdministrarEmpresa(
        client,
        req.usuario,
        empresaId
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
           activo = $4
       WHERE id = $5
       RETURNING id, nombre, email, rol, activo, creado_en`,
      [String(nombre).trim(), emailNormalizado, rolNormalizado, activoFinal, usuarioId]
    );

    if (rolNormalizado === "superadmin") {
      await client.query(
        `UPDATE usuarios_empresas
         SET activo = false,
             actualizado_en = NOW()
         WHERE usuario_id = $1`,
        [usuarioId]
      );
    } else if (empresaId) {
      if (esAdminSistema(req.usuario.rol)) {
        await client.query(
          `UPDATE usuarios_empresas
           SET activo = false,
               actualizado_en = NOW()
           WHERE usuario_id = $1
             AND empresa_id <> $2`,
          [usuarioId, empresaId]
        );
      } else if (Array.isArray(empresasAdministrables) && empresasAdministrables.length > 0) {
        await client.query(
          `UPDATE usuarios_empresas
           SET activo = false,
               actualizado_en = NOW()
           WHERE usuario_id = $1
             AND empresa_id = ANY($2::int[])
             AND empresa_id <> $3`,
          [usuarioId, empresasAdministrables, empresaId]
        );
      }

      await asignarUsuarioEmpresa(
        client,
        usuarioId,
        empresaId,
        normalizarRolEmpresa(
          rol_empresa || (rolNormalizado === "admin_cliente" ? "admin" : "usuario")
        )
      );
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
          rol: usuarioObjetivo.rol,
          activo: usuarioObjetivo.activo,
        },
        despues: {
          nombre: String(nombre).trim(),
          email: emailNormalizado,
          rol: rolNormalizado,
          activo: activoFinal,
          empresa_id: empresaId,
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
  try {
    const { id } = req.params;
    const { activo } = req.body;

    if (Number(id) === Number(req.usuario.id) && activo === false) {
      return res.status(400).json({
        error: "No puedes desactivar tu propio usuario",
      });
    }

    const actualizado = await pool.query(
      `UPDATE usuarios
       SET activo = $1
       WHERE id = $2
       RETURNING id, nombre, email, rol, activo`,
      [Boolean(activo), id]
    );

    if (actualizado.rows.length === 0) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    return res.json({
      mensaje: "Estado actualizado correctamente",
      usuario: actualizado.rows[0],
    });
  } catch (error) {
    console.error("Error al cambiar estado de usuario:", error);

    return res.status(500).json({
      error: "Error interno al cambiar estado de usuario",
    });
  }
}

async function resetearPasswordUsuario(req, res) {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || String(password).length < 6) {
      return res.status(400).json({
        error: "La nueva contrasena debe tener al menos 6 caracteres",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const actualizado = await pool.query(
      `UPDATE usuarios
       SET password_hash = $1
       WHERE id = $2
       RETURNING id, nombre, email, rol, activo`,
      [passwordHash, id]
    );

    if (actualizado.rows.length === 0) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    return res.json({
      mensaje: "Contraseña actualizada correctamente",
      usuario: actualizado.rows[0],
    });
  } catch (error) {
    console.error("Error al resetear contrasena:", error);

    return res.status(500).json({
      error: "Error interno al resetear contrasena",
    });
  }
}

async function solicitarRecuperacionPassword(req, res) {
  try {
    const email = normalizarEmail(req.body?.email);

    if (!email) {
      return res.status(400).json({
        error: "El correo electrónico es obligatorio",
      });
    }

    if (limiteRecuperacionExcedido(req, email)) {
      return res.json({ mensaje: MENSAJE_RECUPERACION });
    }

    const usuarioResult = await pool.query(
      `SELECT id, nombre, email
       FROM usuarios
       WHERE email = $1
         AND activo = true
       LIMIT 1`,
      [email]
    );

    const respuesta = {
      mensaje: MENSAJE_RECUPERACION,
    };

    if (usuarioResult.rows.length > 0) {
      const usuario = usuarioResult.rows[0];
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashResetToken(token);
      const minutosVigencia = Number(process.env.PASSWORD_RESET_MINUTES || 30);
      const resetUrl = construirUrlReset(req, token);

      await pool.query(
        `UPDATE password_reset_tokens
         SET usado_en = NOW()
         WHERE usuario_id = $1
           AND usado_en IS NULL`,
        [usuario.id]
      );

      await pool.query(
        `INSERT INTO password_reset_tokens
         (usuario_id, token_hash, vence_en, ip_solicitud, user_agent)
         VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 minute'), $4, $5)`,
        [
          usuario.id,
          tokenHash,
          minutosVigencia,
          req.ip || req.headers["x-forwarded-for"] || null,
          req.headers["user-agent"] || null,
        ]
      );

      console.log(
        `Solicitud de recuperacion de contrasena para ${usuario.email}. URL: ${resetUrl}`
      );

      if (process.env.NODE_ENV !== "production") {
        respuesta.url_reset_desarrollo = resetUrl;
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

    if (!password || String(password).length < 8) {
      return res.status(400).json({
        error: "La nueva contrasena debe tener al menos 8 caracteres",
      });
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
  loginDemo,
  obtenerSesion,
  listarUsuarios,
  crearUsuarioCliente,
  actualizarUsuarioCliente,
  cambiarEstadoUsuario,
  resetearPasswordUsuario,
  solicitarRecuperacionPassword,
  resetearPasswordConToken,
};
