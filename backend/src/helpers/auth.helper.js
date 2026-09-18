const bcrypt = require("bcryptjs");

const ROLES_ADMIN_SISTEMA = ["superadmin", "super_admin", "admin", "administrador_sistema"];
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
     ORDER BY e.razon_social ASC`,
    [usuario.id]
  );

  return resultado.rows;
}

async function usuarioPuedeAccederEmpresa(client, usuario, empresaId) {
  // Sin empresa indicada no hay nada que autorizar: la ruta decide si la exige.
  if (empresaId === undefined || empresaId === null || empresaId === "") {
    return true;
  }

  const id = Number(empresaId);

  // Un valor presente pero invalido se niega. Antes NaN caia en la rama de
  // "sin empresa" por ser falso y devolvia true, saltandose la membresia.
  if (!Number.isInteger(id) || id <= 0) {
    return false;
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
    [usuario?.id, id]
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

/**
 * Decide si quien pide puede administrar al usuario objetivo.
 *
 * El administrador del sistema puede con cualquiera. Un administrador de
 * cliente solo con usuarios de sus propias empresas, y nunca con un
 * administrador del sistema.
 *
 * Sin esta comprobacion, cualquier administrador de cliente podia resetear la
 * contrasena del superadministrador indicando su identificador, que es un
 * entero consecutivo, y quedarse con el sistema completo.
 *
 * Devuelve { permitido, motivo }.
 */
async function puedeAdministrarUsuarioObjetivo(client, solicitante, usuarioObjetivoId) {
  const objetivoId = Number(usuarioObjetivoId);

  if (!Number.isInteger(objetivoId) || objetivoId <= 0) {
    return { permitido: false, motivo: "Usuario no valido" };
  }

  if (esAdminSistema(solicitante?.rol)) {
    return { permitido: true };
  }

  if (!esAdminCliente(solicitante?.rol)) {
    return { permitido: false, motivo: "No tienes permisos para administrar usuarios" };
  }

  const objetivo = await client.query(
    "SELECT id, rol FROM usuarios WHERE id = $1 LIMIT 1",
    [objetivoId]
  );

  if (objetivo.rows.length === 0) {
    return { permitido: false, motivo: "Usuario no encontrado", noEncontrado: true };
  }

  if (esAdminSistema(objetivo.rows[0].rol)) {
    return {
      permitido: false,
      motivo: "No puedes administrar a un Administrador del Sistema",
    };
  }

  // Tiene que existir al menos una empresa donde quien pide sea administrador y
  // el usuario objetivo sea miembro.
  const compartida = await client.query(
    `SELECT 1
     FROM usuarios_empresas propio
     JOIN usuarios_empresas ajeno ON ajeno.empresa_id = propio.empresa_id
     WHERE propio.usuario_id = $1
       AND propio.activo = true
       AND LOWER(propio.rol_empresa) IN ('admin', 'administrador')
       AND ajeno.usuario_id = $2
       AND ajeno.activo = true
     LIMIT 1`,
    [Number(solicitante?.id), objetivoId]
  );

  if (compartida.rows.length === 0) {
    return {
      permitido: false,
      motivo: "El usuario no pertenece a una empresa que administres",
    };
  }

  return { permitido: true };
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
  inicializarAuth,
  obtenerEmpresasPermitidas,
  usuarioPuedeAccederEmpresa,
  usuarioPuedeAdministrarEmpresa,
  puedeAdministrarUsuarioObjetivo,
  asignarUsuarioEmpresa,
};
