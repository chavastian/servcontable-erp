/**
 * Bloque 12 de la revisión del 19-09-2026: módulo 9, renta anual.
 *
 * La renta líquida imponible parte del resultado según balance y le suma o
 * resta partidas. Tres de esas partidas el sistema las conoce con exactitud
 * porque las calculó él mismo:
 *
 * - La diferencia entre depreciación acelerada y normal (bloque 7), que es el
 *   registro DDAN.
 * - El resultado por corrección monetaria (bloque 11).
 * - Los gastos que alguien marcó como rechazados.
 *
 * El resto —gastos rechazados que nadie marcó, ingresos no renta, rentas
 * exentas, créditos— son criterio y se ingresan como líneas.
 *
 * Por eso la tabla guarda las líneas en JSONB y no en columnas fijas: la RLI de
 * una empresa no tiene las mismas partidas que la de otra, y una lista cerrada
 * de columnas obligaría a inventar.
 *
 * REQUIERE VALIDACIÓN TRIBUTARIA de extremo a extremo: el régimen, cada
 * agregado y deducción, y los saldos iniciales de los registros empresariales.
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
  // El régimen tributario de la empresa decide cómo se determina la RLI y qué
  // registros lleva. Hoy `regimen_tributario` es texto libre en `empresas`.
  if (!(await existeColumna(pgm, "empresas", "regimen_lir"))) {
    await pgm.db.query(`ALTER TABLE empresas ADD COLUMN regimen_lir VARCHAR(20)`);
    await pgm.db.query(
      `ALTER TABLE empresas ADD CONSTRAINT chk_empresas_regimen_lir
       CHECK (regimen_lir IS NULL OR regimen_lir IN
              ('14A', '14D3', '14D8', 'renta_presunta', 'otro'))`
    );
  }

  if (!(await existeTabla(pgm, "rentas_anuales"))) {
    await pgm.db.query(`
      CREATE TABLE rentas_anuales (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresas (id) ON DELETE RESTRICT,
        anio INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
        regimen VARCHAR(20),

        resultado_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
        total_agregados NUMERIC(18,2) NOT NULL DEFAULT 0,
        total_deducciones NUMERIC(18,2) NOT NULL DEFAULT 0,
        renta_liquida_imponible NUMERIC(18,2) NOT NULL DEFAULT 0,

        -- Las partidas, cada una con su origen: calculada por el sistema o
        -- ingresada por una persona.
        lineas JSONB NOT NULL DEFAULT '[]'::jsonb,
        -- Los registros empresariales del articulo 14, con sus saldos.
        registros JSONB NOT NULL DEFAULT '{}'::jsonb,

        criterio TEXT DEFAULT '',
        estado VARCHAR(20) NOT NULL DEFAULT 'borrador',

        creado_en TIMESTAMP DEFAULT now(),
        actualizado_en TIMESTAMP DEFAULT now(),
        creado_por INTEGER,
        actualizado_por INTEGER,

        CONSTRAINT chk_rentas_anuales_estado CHECK (estado IN ('borrador', 'cerrada', 'anulada'))
      )
    `);

    await pgm.db.query(
      `CREATE UNIQUE INDEX uq_rentas_anuales_empresa_anio
       ON rentas_anuales (empresa_id, anio) WHERE estado <> 'anulada'`
    );

    await pgm.db.query(`DROP TRIGGER IF EXISTS trg_autoria_creacion ON rentas_anuales`);
    await pgm.db.query(
      `CREATE TRIGGER trg_autoria_creacion BEFORE INSERT ON rentas_anuales
       FOR EACH ROW EXECUTE FUNCTION fijar_autoria_creacion()`
    );
    await pgm.db.query(`DROP TRIGGER IF EXISTS trg_autoria_actualizacion ON rentas_anuales`);
    await pgm.db.query(
      `CREATE TRIGGER trg_autoria_actualizacion BEFORE UPDATE ON rentas_anuales
       FOR EACH ROW EXECUTE FUNCTION fijar_autoria_actualizacion()`
    );
  }

  // Una cuenta puede estar marcada como gasto rechazado: eso el sistema lo
  // puede saber si alguien lo declara una vez.
  if (!(await existeColumna(pgm, "plan_cuentas", "gasto_rechazado"))) {
    await pgm.db.query(
      `ALTER TABLE plan_cuentas ADD COLUMN gasto_rechazado BOOLEAN NOT NULL DEFAULT false`
    );
  }
};

exports.down = async (pgm) => {
  pgm.sql(`ALTER TABLE plan_cuentas DROP COLUMN IF EXISTS gasto_rechazado`);
  pgm.sql(`DROP TABLE IF EXISTS rentas_anuales`);
  pgm.sql(`ALTER TABLE empresas DROP CONSTRAINT IF EXISTS chk_empresas_regimen_lir`);
  pgm.sql(`ALTER TABLE empresas DROP COLUMN IF EXISTS regimen_lir`);
};
