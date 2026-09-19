/**
 * Bloque 7 de la revisión del 19-09-2026: módulo 7, activo fijo y depreciación.
 *
 * Hasta ahora solo existían las cuentas contables. Un estudio que lleva una
 * empresa con maquinaria tenía que mantener el registro de bienes y el cálculo
 * de la depreciación en una planilla aparte, y transcribir el asiento cada mes.
 *
 * Dos vidas útiles por bien, y no una: la depreciación **normal** es la que se
 * contabiliza, y la **acelerada** del artículo 31 N°5 de la Ley de la Renta
 * existe solo para efectos tributarios (reduce la vida útil a un tercio y no
 * afecta el balance financiero). Guardar las dos es lo que permite después
 * armar la renta líquida imponible sin volver a calcular nada.
 *
 * REQUIERE VALIDACIÓN TRIBUTARIA: la vida útil de cada bien la fija el
 * contador. El sistema propone la tabla de la Resolución Exenta SII N°43 de
 * 2002 como sugerencia, nunca como dato cerrado.
 */

exports.shorthands = undefined;

async function existeTabla(pgm, tabla) {
  const { rows } = await pgm.db.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tabla]
  );

  return rows.length > 0;
}

exports.up = async (pgm) => {
  if (!(await existeTabla(pgm, "activos_fijos"))) {
    await pgm.db.query(`
      CREATE TABLE activos_fijos (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresas (id) ON DELETE RESTRICT,
        codigo VARCHAR(40) NOT NULL,
        nombre VARCHAR(200) NOT NULL,
        descripcion TEXT DEFAULT '',
        categoria VARCHAR(100) DEFAULT '',

        fecha_adquisicion DATE NOT NULL,
        -- La depreciación puede empezar después de la compra: un bien que se
        -- instala en marzo y se compró en enero no se deprecia dos meses.
        -- REQUIERE VALIDACIÓN CONTABLE del criterio de inicio.
        fecha_inicio_depreciacion DATE NOT NULL,

        -- De dónde salió el bien, para poder volver al documento.
        compra_id INTEGER REFERENCES compras (id) ON DELETE SET NULL,
        tercero_id INTEGER REFERENCES terceros (id) ON DELETE SET NULL,
        documento VARCHAR(120) DEFAULT '',

        valor_adquisicion NUMERIC(18,2) NOT NULL,
        -- Los bienes totalmente depreciados suelen quedar en un peso.
        valor_residual NUMERIC(18,2) NOT NULL DEFAULT 0,

        vida_util_meses INTEGER NOT NULL,
        -- Un tercio de la normal (artículo 31 N°5). Se guarda calculada para
        -- que el contador pueda corregirla en un bien puntual.
        vida_util_acelerada_meses INTEGER,
        aplica_acelerada BOOLEAN NOT NULL DEFAULT false,

        cuenta_activo_id INTEGER REFERENCES plan_cuentas (id) ON DELETE SET NULL,
        cuenta_depreciacion_acumulada_id INTEGER REFERENCES plan_cuentas (id) ON DELETE SET NULL,
        cuenta_gasto_depreciacion_id INTEGER REFERENCES plan_cuentas (id) ON DELETE SET NULL,
        centro_costo_id INTEGER REFERENCES centros_costo (id) ON DELETE SET NULL,

        estado VARCHAR(20) NOT NULL DEFAULT 'vigente',
        fecha_baja DATE,
        motivo_baja TEXT,
        valor_venta NUMERIC(18,2),

        observacion TEXT DEFAULT '',
        creado_en TIMESTAMP DEFAULT now(),
        actualizado_en TIMESTAMP DEFAULT now(),
        creado_por INTEGER,
        actualizado_por INTEGER,

        CONSTRAINT chk_activos_fijos_estado CHECK (estado IN ('vigente', 'baja', 'vendido')),
        CONSTRAINT chk_activos_fijos_vida CHECK (vida_util_meses > 0),
        CONSTRAINT chk_activos_fijos_valor CHECK (valor_adquisicion >= 0 AND valor_residual >= 0)
      )
    `);

    await pgm.db.query(
      `CREATE UNIQUE INDEX uq_activos_fijos_codigo ON activos_fijos (empresa_id, UPPER(TRIM(codigo)))`
    );
    await pgm.db.query(`CREATE INDEX idx_activos_fijos_empresa_estado ON activos_fijos (empresa_id, estado)`);
    await pgm.db.query(`CREATE INDEX idx_activos_fijos_categoria ON activos_fijos (empresa_id, categoria)`);
    await pgm.db.query(`CREATE INDEX idx_activos_fijos_compra ON activos_fijos (compra_id)`);
  }

  if (!(await existeTabla(pgm, "depreciaciones"))) {
    await pgm.db.query(`
      CREATE TABLE depreciaciones (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresas (id) ON DELETE RESTRICT,
        activo_fijo_id INTEGER NOT NULL REFERENCES activos_fijos (id) ON DELETE RESTRICT,
        periodo VARCHAR(7) NOT NULL CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),

        -- Financiera: es la que se contabiliza.
        depreciacion_mes NUMERIC(18,2) NOT NULL DEFAULT 0,
        acumulada NUMERIC(18,2) NOT NULL DEFAULT 0,
        valor_libro NUMERIC(18,2) NOT NULL DEFAULT 0,

        -- Tributaria (artículo 31 N°5): no toca el balance, alimenta la RLI.
        depreciacion_mes_acelerada NUMERIC(18,2) NOT NULL DEFAULT 0,
        acumulada_acelerada NUMERIC(18,2) NOT NULL DEFAULT 0,
        valor_libro_acelerado NUMERIC(18,2) NOT NULL DEFAULT 0,

        comprobante_id INTEGER REFERENCES comprobantes (id) ON DELETE SET NULL,
        contabilizada BOOLEAN NOT NULL DEFAULT false,
        estado VARCHAR(20) NOT NULL DEFAULT 'vigente',

        creado_en TIMESTAMP DEFAULT now(),
        actualizado_en TIMESTAMP DEFAULT now(),
        creado_por INTEGER,
        actualizado_por INTEGER,

        CONSTRAINT chk_depreciaciones_estado CHECK (estado IN ('vigente', 'anulada'))
      )
    `);

    // Un bien se deprecia una vez por período: sin esto, correr el cálculo dos
    // veces duplicaba el gasto.
    await pgm.db.query(
      `CREATE UNIQUE INDEX uq_depreciaciones_activo_periodo
       ON depreciaciones (activo_fijo_id, periodo) WHERE estado = 'vigente'`
    );
    await pgm.db.query(
      `CREATE INDEX idx_depreciaciones_empresa_periodo ON depreciaciones (empresa_id, periodo)`
    );
    await pgm.db.query(`CREATE INDEX idx_depreciaciones_comprobante ON depreciaciones (comprobante_id)`);
  }

  // Cuentas por defecto para el asiento mensual, como ya se hace con el resto.
  for (const columna of [
    "cuenta_activo_fijo_id",
    "cuenta_depreciacion_acumulada_id",
    "cuenta_gasto_depreciacion_id",
  ]) {
    const { rows } = await pgm.db.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'configuracion_contable' AND column_name = $1`,
      [columna]
    );

    if (rows.length === 0) {
      await pgm.db.query(
        `ALTER TABLE configuracion_contable
         ADD COLUMN ${columna} INTEGER REFERENCES plan_cuentas (id) ON DELETE SET NULL`
      );
    }
  }

  for (const tabla of ["activos_fijos", "depreciaciones"]) {
    await pgm.db.query(`DROP TRIGGER IF EXISTS trg_autoria_creacion ON ${tabla}`);
    await pgm.db.query(
      `CREATE TRIGGER trg_autoria_creacion BEFORE INSERT ON ${tabla}
       FOR EACH ROW EXECUTE FUNCTION fijar_autoria_creacion()`
    );
    await pgm.db.query(`DROP TRIGGER IF EXISTS trg_autoria_actualizacion ON ${tabla}`);
    await pgm.db.query(
      `CREATE TRIGGER trg_autoria_actualizacion BEFORE UPDATE ON ${tabla}
       FOR EACH ROW EXECUTE FUNCTION fijar_autoria_actualizacion()`
    );
  }
};

exports.down = async (pgm) => {
  for (const columna of [
    "cuenta_gasto_depreciacion_id",
    "cuenta_depreciacion_acumulada_id",
    "cuenta_activo_fijo_id",
  ]) {
    pgm.sql(`ALTER TABLE configuracion_contable DROP COLUMN IF EXISTS ${columna}`);
  }

  pgm.sql(`DROP TABLE IF EXISTS depreciaciones`);
  pgm.sql(`DROP TABLE IF EXISTS activos_fijos`);
};
