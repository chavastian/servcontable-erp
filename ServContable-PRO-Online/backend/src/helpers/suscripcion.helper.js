async function asegurarEsquemaSuscripcion(client) {
  await client.query(`
    ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS suscripcion_estado VARCHAR(50) DEFAULT 'activa',
      ADD COLUMN IF NOT EXISTS suscripcion_plan VARCHAR(50),
      ADD COLUMN IF NOT EXISTS suscripcion_inicio DATE,
      ADD COLUMN IF NOT EXISTS suscripcion_vence DATE,
      ADD COLUMN IF NOT EXISTS suscripcion_usuarios_adicionales INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS suscripcion_actualizada_en TIMESTAMP WITHOUT TIME ZONE
  `);
}

module.exports = {
  asegurarEsquemaSuscripcion,
};
