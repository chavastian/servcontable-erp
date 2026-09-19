/**
 * Autoría en las tablas contables y auditoría que no se puede alterar.
 *
 * Dos huecos del esquema heredado:
 *
 * 1. Ninguna tabla contable registra quién creó ni quién modificó cada fila.
 *    Ante una discrepancia no hay forma de saber de dónde salió un asiento.
 *    `auditoria_movimientos` cubre parte, pero es un registro aparte que no
 *    siempre se escribe y que no acompaña al dato.
 *
 * 2. La tabla de auditoría admite `UPDATE` y `DELETE`, así que el propio
 *    sistema podría reescribir su historia. Una auditoría que se puede editar
 *    no sirve como prueba.
 */

exports.shorthands = undefined;

// Tablas donde importa saber quién escribió.
const TABLAS = [
  "comprobantes",
  "comprobante_detalle",
  "ventas",
  "compras",
  "honorarios",
  "pagos_cobros",
  "liquidaciones",
  "finiquitos",
  "pagos_remuneraciones",
  "conciliacion_bancaria_movimientos",
  "ejercicios_contables",
  "plan_cuentas",
];

exports.up = async (pgm) => {
  for (const tabla of TABLAS) {
    const { rows } = await pgm.db.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1`,
      [tabla]
    );

    if (rows.length === 0) {
      continue;
    }

    // Sin clave foránea a propósito: si algún día se borra un usuario, el rastro
    // de quién hizo el movimiento debe sobrevivir.
    pgm.sql(`
      ALTER TABLE ${tabla}
        ADD COLUMN IF NOT EXISTS creado_por INTEGER,
        ADD COLUMN IF NOT EXISTS actualizado_por INTEGER,
        ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMP
    `);
  }

  // La auditoría solo admite agregar. Se bloquea con una regla, no con permisos,
  // porque la aplicación se conecta con el usuario dueño de la base.
  pgm.sql(`
    CREATE OR REPLACE FUNCTION auditoria_solo_agregar()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION
        'auditoria_movimientos es de solo lectura: no admite % de filas existentes',
        TG_OP;
    END;
    $$ LANGUAGE plpgsql
  `);

  pgm.sql("DROP TRIGGER IF EXISTS trg_auditoria_solo_agregar ON auditoria_movimientos");

  pgm.sql(`
    CREATE TRIGGER trg_auditoria_solo_agregar
    BEFORE UPDATE OR DELETE ON auditoria_movimientos
    FOR EACH ROW EXECUTE FUNCTION auditoria_solo_agregar()
  `);
};

exports.down = (pgm) => {
  pgm.sql("DROP TRIGGER IF EXISTS trg_auditoria_solo_agregar ON auditoria_movimientos");
  pgm.sql("DROP FUNCTION IF EXISTS auditoria_solo_agregar()");

  for (const tabla of TABLAS) {
    pgm.sql(`
      ALTER TABLE IF EXISTS ${tabla}
        DROP COLUMN IF EXISTS creado_por,
        DROP COLUMN IF EXISTS actualizado_por,
        DROP COLUMN IF EXISTS actualizado_en
    `);
  }
};
