/**
 * Bloque 11 de la revisión del 19-09-2026: módulo 8, corrección monetaria y
 * capital propio tributario (artículo 41 de la Ley de la Renta).
 *
 * Sin corrección monetaria no hay balance tributario y por lo tanto no hay F22.
 * Lo que faltaba era, antes que nada, el dato: la variación del IPC de cada
 * mes. Se agrega a los parámetros nacionales, que es donde vive lo que es igual
 * para todas las empresas.
 *
 * **La tabla se crea vacía a propósito.** El IPC lo publica el INE cada mes y
 * el factor de corrección lo fija el SII: sembrarlo con valores inventados es
 * exactamente lo que este proyecto no hace. Mientras no esté cargado, el
 * cálculo se niega a correr y dice qué períodos le faltan.
 *
 * REQUIERE VALIDACIÓN TRIBUTARIA: qué partidas se corrigen y con qué factor es
 * criterio del contador. El sistema propone, registra el criterio usado y deja
 * corregir cada línea.
 */

exports.shorthands = undefined;

async function existeTabla(pgm, tabla) {
  const { rows } = await pgm.db.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tabla]
  );

  return rows.length > 0;
}

async function existeColumna(pgm, tabla, columna) {
  const { rows } = await pgm.db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tabla, columna]
  );

  return rows.length > 0;
}

exports.up = async (pgm) => {
  // La variación del IPC del mes, en porcentaje. NULL es "no se sabe todavía",
  // que es distinto de cero.
  if (!(await existeColumna(pgm, "parametros_nacionales", "variacion_ipc"))) {
    await pgm.db.query(
      `ALTER TABLE parametros_nacionales ADD COLUMN variacion_ipc NUMERIC(8,4)`
    );
  }

  // Cómo se clasifica cada cuenta para la corrección: monetaria (no se
  // corrige), no monetaria, o patrimonio. Va en el plan de cuentas porque es
  // una característica de la cuenta, no del período.
  if (!(await existeColumna(pgm, "plan_cuentas", "clasificacion_correccion"))) {
    await pgm.db.query(
      `ALTER TABLE plan_cuentas ADD COLUMN clasificacion_correccion VARCHAR(20)`
    );
    await pgm.db.query(
      `ALTER TABLE plan_cuentas ADD CONSTRAINT chk_plan_cuentas_correccion
       CHECK (clasificacion_correccion IS NULL OR clasificacion_correccion IN
              ('monetaria', 'no_monetaria', 'patrimonio'))`
    );
  }

  if (!(await existeTabla(pgm, "correcciones_monetarias"))) {
    await pgm.db.query(`
      CREATE TABLE correcciones_monetarias (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresas (id) ON DELETE RESTRICT,
        anio INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2100),

        -- El factor con que se corrigió, guardado: un cálculo tributario tiene
        -- que poder explicarse años después.
        factor_anual NUMERIC(10,6),
        capital_propio_inicial NUMERIC(18,2) NOT NULL DEFAULT 0,
        correccion_capital_propio NUMERIC(18,2) NOT NULL DEFAULT 0,
        correccion_activos NUMERIC(18,2) NOT NULL DEFAULT 0,
        correccion_pasivos NUMERIC(18,2) NOT NULL DEFAULT 0,
        resultado_correccion NUMERIC(18,2) NOT NULL DEFAULT 0,

        -- Las líneas tal como quedaron, con su cuenta y su factor.
        detalle JSONB,
        -- El criterio que se usó, en palabras: lo que el contador declara.
        criterio TEXT DEFAULT '',

        comprobante_id INTEGER REFERENCES comprobantes (id) ON DELETE SET NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'vigente',

        creado_en TIMESTAMP DEFAULT now(),
        actualizado_en TIMESTAMP DEFAULT now(),
        creado_por INTEGER,
        actualizado_por INTEGER,

        CONSTRAINT chk_correcciones_estado CHECK (estado IN ('vigente', 'anulada'))
      )
    `);

    await pgm.db.query(
      `CREATE UNIQUE INDEX uq_correcciones_empresa_anio
       ON correcciones_monetarias (empresa_id, anio) WHERE estado = 'vigente'`
    );
    await pgm.db.query(
      `CREATE INDEX idx_correcciones_comprobante ON correcciones_monetarias (comprobante_id)`
    );

    await pgm.db.query(`DROP TRIGGER IF EXISTS trg_autoria_creacion ON correcciones_monetarias`);
    await pgm.db.query(
      `CREATE TRIGGER trg_autoria_creacion BEFORE INSERT ON correcciones_monetarias
       FOR EACH ROW EXECUTE FUNCTION fijar_autoria_creacion()`
    );
    await pgm.db.query(
      `DROP TRIGGER IF EXISTS trg_autoria_actualizacion ON correcciones_monetarias`
    );
    await pgm.db.query(
      `CREATE TRIGGER trg_autoria_actualizacion BEFORE UPDATE ON correcciones_monetarias
       FOR EACH ROW EXECUTE FUNCTION fijar_autoria_actualizacion()`
    );
  }

  // Cuentas del asiento de corrección monetaria.
  for (const columna of ["cuenta_correccion_monetaria_id", "cuenta_revalorizacion_capital_id"]) {
    if (!(await existeColumna(pgm, "configuracion_contable", columna))) {
      await pgm.db.query(
        `ALTER TABLE configuracion_contable
         ADD COLUMN ${columna} INTEGER REFERENCES plan_cuentas (id) ON DELETE SET NULL`
      );
    }
  }
};

exports.down = async (pgm) => {
  for (const columna of ["cuenta_revalorizacion_capital_id", "cuenta_correccion_monetaria_id"]) {
    pgm.sql(`ALTER TABLE configuracion_contable DROP COLUMN IF EXISTS ${columna}`);
  }

  pgm.sql(`DROP TABLE IF EXISTS correcciones_monetarias`);
  pgm.sql(`ALTER TABLE plan_cuentas DROP CONSTRAINT IF EXISTS chk_plan_cuentas_correccion`);
  pgm.sql(`ALTER TABLE plan_cuentas DROP COLUMN IF EXISTS clasificacion_correccion`);
  pgm.sql(`ALTER TABLE parametros_nacionales DROP COLUMN IF EXISTS variacion_ipc`);
};
