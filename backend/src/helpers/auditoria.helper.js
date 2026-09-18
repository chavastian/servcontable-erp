const pool = require("../database/db");

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
  registrarAuditoria,
};
