const { asignarUsuarioEmpresa } = require("./auth.helper");
const { asegurarEsquemaSuscripcion } = require("./suscripcion.helper");

function diasDemo() {
  const dias = Number(process.env.DEMO_DIAS || 30);
  return Number.isFinite(dias) && dias > 0 ? Math.min(Math.round(dias), 90) : 30;
}

function normalizarEmailDemo(email) {
  return String(email || "").trim().toLowerCase();
}

function formatoFechaDemo(fecha) {
  if (!fecha) return "";
  const valor = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(valor.getTime())) return String(fecha).slice(0, 10);
  return valor.toISOString().slice(0, 10);
}

async function asegurarEsquemaDemo(client) {
  await asegurarEsquemaSuscripcion(client);

  await client.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS demo_activo BOOLEAN NOT NULL DEFAULT false;
  `);

  await client.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS demo_inicio DATE;
  `);

  await client.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS demo_vence DATE;
  `);

  await client.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS demo_empresa_limite INTEGER NOT NULL DEFAULT 1;
  `);

  await client.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS demo_solicitud_id INTEGER;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_usuarios_demo_email
    ON usuarios (email, demo_activo, demo_vence);
  `);
}

async function asegurarEmpresaDemo(client, usuario, solicitud = {}) {
  const usuarioId = Number(usuario?.id || usuario);

  if (!usuarioId) {
    throw new Error("Usuario demo invalido para crear empresa demo.");
  }

  const empresaAsignada = await client.query(
    `
    SELECT e.*
    FROM usuarios_empresas ue
    INNER JOIN empresas e ON e.id = ue.empresa_id
    WHERE ue.usuario_id = $1
      AND ue.activo = true
      AND e.activa = true
    ORDER BY e.id ASC
    LIMIT 1
    `,
    [usuarioId]
  );

  if (empresaAsignada.rows.length > 0) {
    return empresaAsignada.rows[0];
  }

  const rutDemo = `DEMO-${usuarioId}`;
  const razonSocial =
    String(solicitud.empresa || "").trim() ||
    `Empresa demo ${String(solicitud.nombre || usuario?.nombre || "cliente").trim()}`;

  const existente = await client.query(
    "SELECT * FROM empresas WHERE rut = $1 LIMIT 1",
    [rutDemo]
  );

  const empresa =
    existente.rows.length > 0
      ? await client.query(
          `UPDATE empresas
           SET razon_social = $1,
               giro = COALESCE(NULLIF(giro, ''), 'Servicios demo'),
               direccion = COALESCE(NULLIF(direccion, ''), 'Direccion demo'),
               comuna = COALESCE(NULLIF(comuna, ''), 'Santiago'),
               ciudad = COALESCE(NULLIF(ciudad, ''), 'Santiago'),
               regimen_tributario = COALESCE(NULLIF(regimen_tributario, ''), '14D3 Pro Pyme General'),
               activa = true
           WHERE rut = $2
           RETURNING *`,
          [razonSocial, rutDemo]
        )
      : await client.query(
          `INSERT INTO empresas
           (rut, razon_social, giro, direccion, comuna, ciudad, regimen_tributario, activa)
           VALUES ($1, $2, 'Servicios demo', 'Direccion demo', 'Santiago', 'Santiago', '14D3 Pro Pyme General', true)
           RETURNING *`,
          [rutDemo, razonSocial]
        );

  await asignarUsuarioEmpresa(client, usuarioId, empresa.rows[0].id, "admin");

  return empresa.rows[0];
}

function construirDemoPublica(usuario = {}) {
  const demo = Boolean(usuario.demo_activo || usuario.demo === true);

  if (!demo) return null;

  return {
    activo: Boolean(usuario.demo_activo ?? true),
    inicio: formatoFechaDemo(usuario.demo_inicio),
    vence: formatoFechaDemo(usuario.demo_vence),
    dias_restantes: Number(usuario.demo_dias_restantes || 0),
    empresa_limite: Number(usuario.demo_empresa_limite || 1),
  };
}

module.exports = {
  diasDemo,
  normalizarEmailDemo,
  formatoFechaDemo,
  asegurarEsquemaDemo,
  asegurarEmpresaDemo,
  construirDemoPublica,
};
