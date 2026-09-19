/**
 * Bloque 3 de la revisión del 19-09-2026: F29 completo y parámetros nacionales.
 *
 * 1. parametros_nacionales: UF, UTM, UTA, ingreso mínimo, topes y tasas por
 *    período, una sola vez para todo el país. Hoy cada empresa carga lo suyo
 *    cada mes en configuracion_remuneraciones: 127 filas de AFP para 15
 *    empresas, y dos empresas pueden liquidar el mismo mes con tablas
 *    distintas. Se siembra con lo que las empresas ya cargaron.
 *
 * 2. remanente_iva en UTM: el artículo 26 del DL 825 exige convertir el
 *    remanente a UTM del mes en que se determina y reconvertirlo con la UTM
 *    del mes en que se imputa. Arrastrado en pesos, difiere del que calcula
 *    el SII.
 *
 * 3. declaraciones_f29: no había dónde registrar el F29 presentado (folio,
 *    fecha, monto). Sin eso el cierre mensual no puede cruzar lo calculado con
 *    lo declarado.
 *
 * 4. configuracion_contable: tasa de PPM y las dos condiciones que mueven los
 *    plazos (facturador electrónico, pago en Previred). La tasa de PPM llegaba
 *    en la consulta y no se guardaba.
 *
 * 5. compras: las columnas del registro de compras del SII que definen el
 *    tratamiento del IVA (tipo de compra, código de IVA no recuperable, uso
 *    común, activo fijo, IVA no retenido, otros impuestos).
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

async function agregar(pgm, tabla, columna, tipo) {
  if (!(await existeColumna(pgm, tabla, columna))) {
    pgm.sql(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
  }
}

exports.up = async (pgm) => {
  // ------------------------------------------------- 1. parámetros nacionales
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS parametros_nacionales (
      periodo VARCHAR(7) PRIMARY KEY CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
      valor_uf NUMERIC(14,2),
      valor_utm NUMERIC(14,2),
      valor_uta NUMERIC(14,2),
      ingreso_minimo NUMERIC(14,2),
      tope_imponible_afp_uf NUMERIC(10,2),
      tope_afc_uf NUMERIC(10,2),
      tope_ips_uf NUMERIC(10,2),
      tasa_sis NUMERIC(6,3),
      -- Ley 21.735: cotización del empleador, con gradualidad anual.
      -- REQUIERE VALIDACIÓN TRIBUTARIA de cada escalón.
      tasa_seguro_social_empleador NUMERIC(6,3),
      tasa_seguro_social_cuenta_individual NUMERIC(6,3),
      fuente TEXT,
      creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
      actualizado_en TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Semilla: lo que las empresas ya cargaron, tomando por período el valor
  // más informado. Es un punto de partida, no la fuente oficial.
  pgm.sql(`
    INSERT INTO parametros_nacionales
      (periodo, valor_uf, valor_utm, valor_uta, ingreso_minimo, tope_imponible_afp_uf,
       tope_afc_uf, tope_ips_uf, tasa_sis, tasa_seguro_social_empleador,
       tasa_seguro_social_cuenta_individual, fuente)
    SELECT
      c.periodo,
      MAX(NULLIF(c.valor_uf, 0)),
      MAX(NULLIF((c.indicadores_previsionales::jsonb ->> 'valor_utm')::numeric, 0)),
      MAX(NULLIF((c.indicadores_previsionales::jsonb ->> 'valor_uta')::numeric, 0)),
      MAX(NULLIF(c.ingreso_minimo, 0)),
      MAX(NULLIF(c.tope_imponible_uf, 0)),
      MAX(NULLIF((c.indicadores_previsionales::jsonb ->> 'renta_tope_seguro_cesantia_uf')::numeric, 0)),
      MAX(NULLIF((c.indicadores_previsionales::jsonb ->> 'renta_tope_ips_uf')::numeric, 0)),
      MAX(NULLIF(c.tasa_sis, 0)),
      CASE WHEN c.periodo >= '2025-08' THEN 1.0 ELSE NULL END,
      CASE WHEN c.periodo >= '2025-08' THEN 0.1 ELSE NULL END,
      'Copiado de configuracion_remuneraciones al migrar. REQUIERE VALIDACIÓN.'
    FROM configuracion_remuneraciones c
    WHERE c.periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    GROUP BY c.periodo
    ON CONFLICT (periodo) DO NOTHING
  `);

  // ----------------------------------------------------- 2. remanente en UTM
  await agregar(pgm, "remanente_iva", "remanente_anterior_utm", "NUMERIC(14,4)");
  await agregar(pgm, "remanente_iva", "remanente_siguiente_utm", "NUMERIC(14,4)");
  await agregar(pgm, "remanente_iva", "valor_utm", "NUMERIC(14,2)");
  await agregar(pgm, "remanente_iva", "ppm", "NUMERIC(14,2) DEFAULT 0");
  await agregar(pgm, "remanente_iva", "retenciones_honorarios", "NUMERIC(14,2) DEFAULT 0");
  await agregar(pgm, "remanente_iva", "iva_retenido", "NUMERIC(14,2) DEFAULT 0");
  await agregar(pgm, "remanente_iva", "total_f29", "NUMERIC(14,2) DEFAULT 0");

  // ---------------------------------------------------- 3. F29 presentado
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS declaraciones_f29 (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES empresas (id) ON DELETE RESTRICT,
      periodo VARCHAR(7) NOT NULL CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
      folio_sii VARCHAR(40),
      fecha_presentacion DATE NOT NULL,
      iva_determinado NUMERIC(14,2) DEFAULT 0,
      remanente_utilizado NUMERIC(14,2) DEFAULT 0,
      ppm NUMERIC(14,2) DEFAULT 0,
      retenciones_honorarios NUMERIC(14,2) DEFAULT 0,
      iva_retenido NUMERIC(14,2) DEFAULT 0,
      total_pagado NUMERIC(14,2) DEFAULT 0,
      estado VARCHAR(20) NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'rectificada')),
      rectifica_a_id INTEGER REFERENCES declaraciones_f29 (id),
      observacion TEXT,
      creado_por INTEGER,
      creado_en TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_declaraciones_f29_vigente
      ON declaraciones_f29 (empresa_id, periodo) WHERE estado = 'vigente'
  `);
  pgm.sql(`DROP TRIGGER IF EXISTS trg_autoria_creacion ON declaraciones_f29`);
  pgm.sql(`
    CREATE TRIGGER trg_autoria_creacion
      BEFORE INSERT ON declaraciones_f29
      FOR EACH ROW EXECUTE FUNCTION fijar_autoria_creacion()
  `);

  // ------------------------------------------- 4. configuración contable
  await agregar(pgm, "configuracion_contable", "tasa_ppm", "NUMERIC(6,3) NOT NULL DEFAULT 0");
  await agregar(pgm, "configuracion_contable", "facturador_electronico", "BOOLEAN NOT NULL DEFAULT true");
  await agregar(pgm, "configuracion_contable", "previred_electronico", "BOOLEAN NOT NULL DEFAULT true");

  // --------------------------------------------- 5. columnas del RCV
  await agregar(pgm, "compras", "tipo_compra", "VARCHAR(40)");
  await agregar(pgm, "compras", "codigo_iva_no_rec", "SMALLINT");
  await agregar(pgm, "compras", "iva_uso_comun", "NUMERIC(14,2) NOT NULL DEFAULT 0");
  await agregar(pgm, "compras", "neto_activo_fijo", "NUMERIC(14,2) NOT NULL DEFAULT 0");
  await agregar(pgm, "compras", "iva_activo_fijo", "NUMERIC(14,2) NOT NULL DEFAULT 0");
  await agregar(pgm, "compras", "iva_no_retenido", "NUMERIC(14,2) NOT NULL DEFAULT 0");
  await agregar(pgm, "compras", "codigo_otro_impuesto", "VARCHAR(20)");
  await agregar(pgm, "compras", "tasa_otro_impuesto", "NUMERIC(6,2)");
};

exports.down = async (pgm) => {
  for (const columna of [
    "tipo_compra",
    "codigo_iva_no_rec",
    "iva_uso_comun",
    "neto_activo_fijo",
    "iva_activo_fijo",
    "iva_no_retenido",
    "codigo_otro_impuesto",
    "tasa_otro_impuesto",
  ]) {
    pgm.sql(`ALTER TABLE compras DROP COLUMN IF EXISTS ${columna}`);
  }

  for (const columna of ["tasa_ppm", "facturador_electronico", "previred_electronico"]) {
    pgm.sql(`ALTER TABLE configuracion_contable DROP COLUMN IF EXISTS ${columna}`);
  }

  pgm.sql(`DROP TABLE IF EXISTS declaraciones_f29`);

  for (const columna of [
    "remanente_anterior_utm",
    "remanente_siguiente_utm",
    "valor_utm",
    "ppm",
    "retenciones_honorarios",
    "iva_retenido",
    "total_f29",
  ]) {
    pgm.sql(`ALTER TABLE remanente_iva DROP COLUMN IF EXISTS ${columna}`);
  }

  pgm.sql(`DROP TABLE IF EXISTS parametros_nacionales`);
};
