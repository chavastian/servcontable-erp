/**
 * Bloque 9 de la revisión del 19-09-2026: el IVA de uso común no recuperable
 * se contabiliza.
 *
 * El bloque 3 dejó el cálculo: el factor de proporcionalidad acumulado del año
 * reparte el IVA de uso común entre crédito recuperable y no recuperable
 * (artículo 43 del reglamento del DL 825). Pero eso solo se informaba en el
 * F29: contablemente el IVA de uso común quedaba entero como crédito fiscal,
 * y la parte que la empresa no puede recuperar nunca llegaba a gasto.
 *
 * Acá se agrega dónde imputar esa parte y el registro de lo ya ajustado, para
 * que el ajuste de un período no se pueda hacer dos veces.
 *
 * REQUIERE VALIDACIÓN CONTABLE: el momento y la forma del ajuste (mensual con
 * el factor acumulado, o una sola vez en diciembre con el factor definitivo)
 * es criterio del contador. El sistema no lo hace solo: lo propone y alguien
 * lo confirma.
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
  if (!(await existeColumna(pgm, "configuracion_contable", "cuenta_iva_uso_comun_no_rec_id"))) {
    await pgm.db.query(
      `ALTER TABLE configuracion_contable
       ADD COLUMN cuenta_iva_uso_comun_no_rec_id INTEGER REFERENCES plan_cuentas (id) ON DELETE SET NULL`
    );
  }

  if (!(await existeTabla(pgm, "ajustes_iva_uso_comun"))) {
    await pgm.db.query(`
      CREATE TABLE ajustes_iva_uso_comun (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresas (id) ON DELETE RESTRICT,
        periodo VARCHAR(7) NOT NULL CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),

        iva_uso_comun NUMERIC(18,2) NOT NULL DEFAULT 0,
        -- El factor con que se calculó, guardado: si después cambian las
        -- ventas del año, el ajuste ya hecho queda explicado por su factor.
        factor NUMERIC(10,6) NOT NULL DEFAULT 0,
        credito_recuperable NUMERIC(18,2) NOT NULL DEFAULT 0,
        no_recuperable NUMERIC(18,2) NOT NULL DEFAULT 0,

        comprobante_id INTEGER REFERENCES comprobantes (id) ON DELETE SET NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'vigente',
        observacion TEXT DEFAULT '',

        creado_en TIMESTAMP DEFAULT now(),
        actualizado_en TIMESTAMP DEFAULT now(),
        creado_por INTEGER,
        actualizado_por INTEGER,

        CONSTRAINT chk_ajustes_iva_uso_comun_estado CHECK (estado IN ('vigente', 'anulado'))
      )
    `);

    // Un período se ajusta una sola vez.
    await pgm.db.query(
      `CREATE UNIQUE INDEX uq_ajustes_iva_uso_comun_periodo
       ON ajustes_iva_uso_comun (empresa_id, periodo) WHERE estado = 'vigente'`
    );
    await pgm.db.query(
      `CREATE INDEX idx_ajustes_iva_uso_comun_comprobante ON ajustes_iva_uso_comun (comprobante_id)`
    );

    await pgm.db.query(`DROP TRIGGER IF EXISTS trg_autoria_creacion ON ajustes_iva_uso_comun`);
    await pgm.db.query(
      `CREATE TRIGGER trg_autoria_creacion BEFORE INSERT ON ajustes_iva_uso_comun
       FOR EACH ROW EXECUTE FUNCTION fijar_autoria_creacion()`
    );
    await pgm.db.query(`DROP TRIGGER IF EXISTS trg_autoria_actualizacion ON ajustes_iva_uso_comun`);
    await pgm.db.query(
      `CREATE TRIGGER trg_autoria_actualizacion BEFORE UPDATE ON ajustes_iva_uso_comun
       FOR EACH ROW EXECUTE FUNCTION fijar_autoria_actualizacion()`
    );
  }
};

exports.down = async (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS ajustes_iva_uso_comun`);
  pgm.sql(`ALTER TABLE configuracion_contable DROP COLUMN IF EXISTS cuenta_iva_uso_comun_no_rec_id`);
};
