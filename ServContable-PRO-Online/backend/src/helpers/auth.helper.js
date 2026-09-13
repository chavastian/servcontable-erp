const bcrypt = require("bcryptjs");

const ROLES_ADMIN_SISTEMA = ["superadmin", "admin", "administrador_sistema"];
const ROLES_ADMIN_CLIENTE = ["admin_cliente", "cliente_admin"];
const ROLES_USUARIO_CLIENTE = ["usuario_cliente", "cliente_usuario", "usuario"];

function normalizarRol(rol = "") {
  const valor = String(rol || "").trim().toLowerCase();

  if (ROLES_ADMIN_SISTEMA.includes(valor)) return "superadmin";
  if (ROLES_ADMIN_CLIENTE.includes(valor)) return "admin_cliente";
  if (ROLES_USUARIO_CLIENTE.includes(valor)) return "usuario_cliente";

  return "usuario_cliente";
}

function esAdminSistema(rol = "") {
  return ROLES_ADMIN_SISTEMA.includes(String(rol || "").trim().toLowerCase());
}

function esAdminCliente(rol = "") {
  return ROLES_ADMIN_CLIENTE.includes(String(rol || "").trim().toLowerCase());
}

function puedeAdministrarUsuarios(rol = "") {
  return esAdminSistema(rol) || esAdminCliente(rol);
}

function esEmpresaDemoSistemaCondicion(alias = "e") {
  return `NOT (
    UPPER(COALESCE(${alias}.rut, '')) LIKE 'DEMO-%'
    OR ${alias}.razon_social ILIKE 'Empresa demo %'
    OR ${alias}.razon_social ILIKE 'EMPRESA DEMO SERVCONTABLE%'
  )`;
}

async function asegurarEsquemaAuth(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS usuarios_empresas (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      rol_empresa VARCHAR(50) NOT NULL DEFAULT 'usuario',
      activo BOOLEAN NOT NULL DEFAULT true,
      creado_en TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      actualizado_en TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE (usuario_id, empresa_id)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_usuario
    ON usuarios_empresas (usuario_id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_empresa
    ON usuarios_empresas (empresa_id)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      vence_en TIMESTAMP WITHOUT TIME ZONE NOT NULL,
      usado_en TIMESTAMP WITHOUT TIME ZONE,
      solicitado_en TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      ip_solicitud VARCHAR(120),
      user_agent TEXT
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_usuario
    ON password_reset_tokens (usuario_id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_vigencia
    ON password_reset_tokens (token_hash, vence_en, usado_en)
  `);
}

async function asegurarAdministradorInicial(client) {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const nombre = (process.env.ADMIN_NOMBRE || "Administrador ServContable").trim();

  if (!email || !password) {
    return;
  }

  const existe = await client.query("SELECT id FROM usuarios WHERE email = $1", [
    email,
  ]);

  const passwordHash = await bcrypt.hash(password, 10);

  if (existe.rows.length > 0) {
    await client.query(
      `UPDATE usuarios
       SET nombre = COALESCE(NULLIF($2, ''), nombre),
           password_hash = $3,
           rol = 'superadmin',
           activo = true
       WHERE email = $1`,
      [email, nombre, passwordHash]
    );
    return;
  }

  await client.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
     VALUES ($1, $2, $3, 'superadmin', true)`,
    [nombre, email, passwordHash]
  );
}

async function obtenerEmpresasPermitidas(client, usuario) {
  if (!usuario?.id) {
    return [];
  }

  if (esAdminSistema(usuario.rol)) {
    const resultado = await client.query(
      `SELECT e.*, 'admin_sistema' AS rol_empresa
       FROM empresas e
       WHERE e.activa = true
       ORDER BY e.razon_social ASC`
    );

    return resultado.rows;
  }

  const resultado = await client.query(
    `SELECT e.*, ue.rol_empresa
     FROM usuarios_empresas ue
     JOIN empresas e ON e.id = ue.empresa_id
     WHERE ue.usuario_id = $1
       AND ue.activo = true
       AND e.activa = true
       ${usuario.demo === true ? `AND ${esEmpresaDemoSistemaCondicion("e")}` : ""}
     ORDER BY e.razon_social ASC`,
    [usuario.id]
  );

  return resultado.rows;
}

async function usuarioPuedeAccederEmpresa(client, usuario, empresaId) {
  if (!empresaId) {
    return true;
  }

  if (esAdminSistema(usuario?.rol)) {
    return true;
  }

  const resultado = await client.query(
    `SELECT 1
     FROM usuarios_empresas
     WHERE usuario_id = $1
       AND empresa_id = $2
       AND activo = true
     LIMIT 1`,
    [usuario?.id, empresaId]
  );

  return resultado.rows.length > 0;
}

async function usuarioPuedeAdministrarEmpresa(client, usuario, empresaId) {
  if (esAdminSistema(usuario?.rol)) {
    return true;
  }

  if (!esAdminCliente(usuario?.rol)) {
    return false;
  }

  const resultado = await client.query(
    `SELECT 1
     FROM usuarios_empresas
     WHERE usuario_id = $1
       AND empresa_id = $2
       AND activo = true
       AND rol_empresa IN ('admin', 'administrador')
     LIMIT 1`,
    [usuario?.id, empresaId]
  );

  return resultado.rows.length > 0;
}

async function asignarUsuarioEmpresa(
  client,
  usuarioId,
  empresaId,
  rolEmpresa = "usuario"
) {
  await client.query(
    `INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (usuario_id, empresa_id)
     DO UPDATE SET rol_empresa = EXCLUDED.rol_empresa,
                   activo = true,
                   actualizado_en = NOW()`,
    [usuarioId, empresaId, rolEmpresa]
  );
}

async function inicializarAuth(pool) {
  const client = await pool.connect();

  try {
    await asegurarEsquemaAuth(client);
    await asegurarAdministradorInicial(client);
  } finally {
    client.release();
  }
}

module.exports = {
  normalizarRol,
  esAdminSistema,
  esAdminCliente,
  puedeAdministrarUsuarios,
  asegurarEsquemaAuth,
  inicializarAuth,
  obtenerEmpresasPermitidas,
  usuarioPuedeAccederEmpresa,
  usuarioPuedeAdministrarEmpresa,
  asignarUsuarioEmpresa,
};
