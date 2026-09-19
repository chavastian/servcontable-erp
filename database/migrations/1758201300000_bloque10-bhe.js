/**
 * Bloque 10 de la revisión del 19-09-2026: módulo 11, boletas de honorarios
 * electrónicas desde el SII.
 *
 * Dos datos que faltaban en `honorarios`:
 *
 * - `origen`: si la boleta se digitó a mano o vino del archivo del SII. Sin
 *   esto no se puede cruzar lo registrado contra lo que el SII tiene, que es
 *   justamente para lo que sirve importar.
 * - `emisor_retiene`: hay boletas en que la retención es de cargo del propio
 *   emisor. En esas la empresa no retiene nada y no hay retención que declarar
 *   en el F29 ni en la declaración jurada 1879. Antes el sistema asumía siempre
 *   que retenía el pagador.
 */

exports.shorthands = undefined;

async function existeColumna(pgm, tabla, columna) {
  const { rows } = await pgm.db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tabla, columna]
  );

  return rows.length > 0;
}

exports.up = async (pgm) => {
  if (!(await existeColumna(pgm, "honorarios", "origen"))) {
    await pgm.db.query(
      `ALTER TABLE honorarios ADD COLUMN origen VARCHAR(20) NOT NULL DEFAULT 'manual'`
    );
    await pgm.db.query(
      `ALTER TABLE honorarios ADD CONSTRAINT chk_honorarios_origen
       CHECK (origen IN ('manual', 'sii'))`
    );
  }

  if (!(await existeColumna(pgm, "honorarios", "emisor_retiene"))) {
    await pgm.db.query(
      `ALTER TABLE honorarios ADD COLUMN emisor_retiene BOOLEAN NOT NULL DEFAULT false`
    );
  }

  // El cruce busca por RUT y folio: el índice que ya existe es solo de las
  // vigentes, y el cruce necesita ver también las anuladas.
  await pgm.db.query(
    `CREATE INDEX IF NOT EXISTS idx_honorarios_rut_folio
     ON honorarios (empresa_id, UPPER(REPLACE(REPLACE(COALESCE(rut_prestador, ''), '.', ''), ' ', '')), folio)`
  );
};

exports.down = async (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_honorarios_rut_folio`);
  pgm.sql(`ALTER TABLE honorarios DROP CONSTRAINT IF EXISTS chk_honorarios_origen`);
  pgm.sql(`ALTER TABLE honorarios DROP COLUMN IF EXISTS emisor_retiene`);
  pgm.sql(`ALTER TABLE honorarios DROP COLUMN IF EXISTS origen`);
};
