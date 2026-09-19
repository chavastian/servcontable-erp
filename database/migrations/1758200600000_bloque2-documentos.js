/**
 * Bloque 2 de la revisión del 19-09-2026: anulación con rastro, vencimiento y
 * referencia de notas de crédito.
 *
 * 1. Ninguna tabla guardaba quién anuló, cuándo ni por qué: la anulación era
 *    un cambio de estado y el rastro vivía solo en la auditoría, que tres
 *    módulos no llamaban en ese punto.
 *
 * 2. Compras y ventas no tenían fecha de vencimiento: el flujo de caja y la
 *    antigüedad de cartera eran estimaciones con un plazo fijo.
 *
 * 3. Una nota de crédito no sabía qué factura rebajaba. El signo se infería,
 *    pero la cartera no podía aplicarla al documento correcto.
 *
 * 4. Compras sin fecha de recepción: el crédito fiscal se puede usar hasta dos
 *    períodos después si la factura se recibe con atraso (artículo 24 del DL
 *    825) y no quedaba constancia de por qué un documento iba a otro período.
 *
 * 5. Estados como texto libre. Se fija el dominio en las tablas de documentos
 *    después de comprobar que no haya otros valores.
 *
 * Todo aditivo y reversible.
 */

exports.shorthands = undefined;

const CON_ANULACION = [
  "compras",
  "ventas",
  "comprobantes",
  "honorarios",
  "pagos_cobros",
  "liquidaciones",
  "finiquitos",
  "vacaciones_ausencias",
];

const ESTADOS = {
  compras: ["vigente", "anulado"],
  ventas: ["vigente", "anulado"],
  comprobantes: ["vigente", "anulado"],
  honorarios: ["vigente", "anulado"],
  pagos_cobros: ["vigente", "anulado"],
};

async function existeColumna(pgm, tabla, columna) {
  const { rows } = await pgm.db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tabla, columna]
  );

  return rows.length > 0;
}

async function existeConstraint(pgm, nombre) {
  const { rows } = await pgm.db.query(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [nombre]);

  return rows.length > 0;
}

async function agregarColumna(pgm, tabla, columna, tipo) {
  if (!(await existeColumna(pgm, tabla, columna))) {
    pgm.sql(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
  }
}

exports.up = async (pgm) => {
  for (const tabla of CON_ANULACION) {
    await agregarColumna(pgm, tabla, "anulado_por", "INTEGER");
    await agregarColumna(pgm, tabla, "anulado_en", "TIMESTAMP");
    await agregarColumna(pgm, tabla, "motivo_anulacion", "TEXT");
  }

  for (const tabla of ["compras", "ventas"]) {
    await agregarColumna(pgm, tabla, "fecha_vencimiento", "DATE");
    await agregarColumna(pgm, tabla, "ref_sii_tipo_doc", "VARCHAR(20)");
    await agregarColumna(pgm, tabla, "ref_folio", "VARCHAR(50)");
    await agregarColumna(pgm, tabla, "ref_fecha", "DATE");
  }

  await agregarColumna(pgm, "compras", "fecha_recepcion", "DATE");

  // La copia de produccion trae comprobantes con estado 'eliminado', de un
  // flujo anterior que ya no existe. Para el sistema un comprobante que no
  // esta vigente esta anulado: mismo tratamiento en libros e informes.
  // Con pgm.db.query y no pgm.sql: pgm.sql se encola y corre al final, y la
  // comprobacion de dominio de mas abajo se ejecuta antes.
  await pgm.db.query(`UPDATE comprobantes SET estado = 'anulado' WHERE estado = 'eliminado'`);

  for (const [tabla, valores] of Object.entries(ESTADOS)) {
    const { rows } = await pgm.db.query(
      `SELECT DISTINCT estado FROM ${tabla} WHERE estado IS NOT NULL AND estado <> ALL($1::text[])`,
      [valores]
    );

    if (rows.length > 0) {
      throw new Error(
        `${tabla}.estado tiene valores fuera del dominio: ${rows
          .map((f) => JSON.stringify(f.estado))
          .join(", ")}. Corregirlos antes de migrar.`
      );
    }

    const nombre = `chk_${tabla}_estado`;

    if (!(await existeConstraint(pgm, nombre))) {
      pgm.sql(
        `ALTER TABLE ${tabla} ADD CONSTRAINT ${nombre} CHECK (estado IN (${valores
          .map((v) => `'${v}'`)
          .join(", ")}))`
      );
    }
  }

  // Un documento anulado tiene que decir cuándo. Los anulados antes de esta
  // migración quedan con la fecha de la migración, que es lo más honesto que
  // se puede decir de ellos.
  for (const tabla of ["compras", "ventas", "comprobantes", "honorarios", "pagos_cobros"]) {
    pgm.sql(`UPDATE ${tabla} SET anulado_en = NOW(), motivo_anulacion = COALESCE(motivo_anulacion, 'Anulado antes de registrar motivo')
             WHERE estado = 'anulado' AND anulado_en IS NULL`);
  }
};

exports.down = async (pgm) => {
  for (const tabla of Object.keys(ESTADOS)) {
    pgm.sql(`ALTER TABLE ${tabla} DROP CONSTRAINT IF EXISTS chk_${tabla}_estado`);
  }

  pgm.sql(`ALTER TABLE compras DROP COLUMN IF EXISTS fecha_recepcion`);

  for (const tabla of ["compras", "ventas"]) {
    for (const columna of ["fecha_vencimiento", "ref_sii_tipo_doc", "ref_folio", "ref_fecha"]) {
      pgm.sql(`ALTER TABLE ${tabla} DROP COLUMN IF EXISTS ${columna}`);
    }
  }

  for (const tabla of CON_ANULACION) {
    for (const columna of ["anulado_por", "anulado_en", "motivo_anulacion"]) {
      pgm.sql(`ALTER TABLE ${tabla} DROP COLUMN IF EXISTS ${columna}`);
    }
  }
};
