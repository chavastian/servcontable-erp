/**
 * Bloque 4 de la revisión del 19-09-2026: cierre de ejercicio con asientos y
 * remuneraciones completas.
 *
 * 1. Cerrar un ejercicio solo cambiaba un estado: sin asiento de cierre de
 *    resultados, sin apertura del año siguiente, y una reapertura sin autor ni
 *    motivo. El balance del segundo año arrancaba sin saldos.
 *
 * 2. Salud fija en 7%: no existía plan de Isapre en UF. Un trabajador con
 *    plan de 4 UF cotizaba 7% y Previred rechazaba el archivo.
 *
 * 3. Feriado progresivo: un día más por cada tres años después de diez de
 *    cotizaciones (artículo 68 del Código del Trabajo). Se necesita saber
 *    cuántos años trajo el trabajador de antes.
 *
 * 4. Finiquito calculado en el servidor: tope de 90 UF, impuesto único sobre
 *    lo que excede lo legal, descuento del seguro de cesantía.
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
  // ------------------------------------------------------------- ejercicio
  await agregar(pgm, "ejercicios_contables", "cerrado_por", "INTEGER");
  await agregar(pgm, "ejercicios_contables", "reabierto_por", "INTEGER");
  await agregar(pgm, "ejercicios_contables", "reabierto_en", "TIMESTAMP");
  await agregar(pgm, "ejercicios_contables", "motivo_reapertura", "TEXT");
  await agregar(pgm, "ejercicios_contables", "comprobante_cierre_id", "INTEGER REFERENCES comprobantes (id)");
  await agregar(pgm, "ejercicios_contables", "comprobante_apertura_id", "INTEGER REFERENCES comprobantes (id)");
  await agregar(pgm, "configuracion_contable", "cuenta_resultado_ejercicio_id", "INTEGER REFERENCES plan_cuentas (id)");

  // ------------------------------------------------------- remuneraciones
  await agregar(pgm, "trabajadores", "plan_salud_uf", "NUMERIC(10,4) NOT NULL DEFAULT 0");
  await agregar(pgm, "trabajadores", "anios_cotizados_previos", "INTEGER NOT NULL DEFAULT 0");
  await agregar(pgm, "liquidaciones", "descuento_salud_adicional", "NUMERIC(18,2) NOT NULL DEFAULT 0");

  await agregar(pgm, "finiquitos", "impuesto_unico_finiquito", "NUMERIC(18,2) NOT NULL DEFAULT 0");
  await agregar(pgm, "finiquitos", "tope_90_uf_aplicado", "BOOLEAN NOT NULL DEFAULT false");
  await agregar(pgm, "finiquitos", "valor_uf", "NUMERIC(14,2)");
  await agregar(pgm, "finiquitos", "calculado_en_servidor", "BOOLEAN NOT NULL DEFAULT false");
  await agregar(pgm, "finiquitos", "supuestos", "JSONB");
};

exports.down = async (pgm) => {
  for (const columna of ["impuesto_unico_finiquito", "tope_90_uf_aplicado", "valor_uf", "calculado_en_servidor", "supuestos"]) {
    pgm.sql(`ALTER TABLE finiquitos DROP COLUMN IF EXISTS ${columna}`);
  }

  pgm.sql(`ALTER TABLE liquidaciones DROP COLUMN IF EXISTS descuento_salud_adicional`);
  pgm.sql(`ALTER TABLE trabajadores DROP COLUMN IF EXISTS anios_cotizados_previos`);
  pgm.sql(`ALTER TABLE trabajadores DROP COLUMN IF EXISTS plan_salud_uf`);
  pgm.sql(`ALTER TABLE configuracion_contable DROP COLUMN IF EXISTS cuenta_resultado_ejercicio_id`);

  for (const columna of [
    "comprobante_apertura_id",
    "comprobante_cierre_id",
    "motivo_reapertura",
    "reabierto_en",
    "reabierto_por",
    "cerrado_por",
  ]) {
    pgm.sql(`ALTER TABLE ejercicios_contables DROP COLUMN IF EXISTS ${columna}`);
  }
};
