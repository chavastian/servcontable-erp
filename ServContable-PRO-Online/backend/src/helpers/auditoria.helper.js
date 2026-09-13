const pool = require("../database/db");

async function asegurarTablaAuditoria(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS auditoria_movimientos (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER,
      usuario_id INTEGER,
      usuario_email TEXT,
      modulo VARCHAR(120) NOT NULL,
      accion VARCHAR(120) NOT NULL,
      detalle TEXT NOT NULL DEFAULT '',
      tabla_afectada VARCHAR(120),
      registro_id INTEGER,
      datos JSONB NOT NULL DEFAULT '{}'::jsonb,
      creado_en TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);
}

async function registrarAuditoria({
  client = null,
  req = null,
  empresaId = null,
  modulo = "Sistema",
  accion = "Accion",
  detalle = "",
  tablaAfectada = null,
  registroId = null,
  datos = {},
}) {
  const queryClient = client || (await pool.connect());
  const requiereRelease = !client;

  try {
    await asegurarTablaAuditoria(queryClient);

    const usuarioId = Number(req?.usuario?.id || 0) || null;
    const usuarioEmail = req?.usuario?.email || "";

    await queryClient.query(
      `
      INSERT INTO auditoria_movimientos
      (empresa_id, usuario_id, usuario_email, modulo, accion, detalle, tabla_afectada, registro_id, datos)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
      `,
      [
        Number(empresaId || 0) || null,
        usuarioId,
        usuarioEmail,
        modulo,
        accion,
        detalle || "",
        tablaAfectada,
        Number(registroId || 0) || null,
        JSON.stringify(datos || {}),
      ]
    );
  } catch (error) {
    console.error("Error al registrar auditoria:", error.message);
  } finally {
    if (requiereRelease) {
      queryClient.release();
    }
  }
}

module.exports = {
  asegurarTablaAuditoria,
  registrarAuditoria,
};
