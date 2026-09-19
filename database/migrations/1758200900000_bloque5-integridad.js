/**
 * Bloque 5 de la revisión del 19-09-2026: integridad que la base no exigía.
 *
 * - Nueve columnas de estado aceptaban cualquier texto. Una consulta buscaba
 *   un estado que nada escribía y un valor mal tipeado desaparecía de todos
 *   los listados. Ahora cada tabla tiene su lista cerrada.
 * - El período era texto libre en 17 tablas; se exige AAAA-MM.
 * - Cinco cuentas de la configuración no tenían clave foránea al plan.
 * - Índices para las consultas que recorren tablas completas: calce bancario
 *   por monto, finiquitos y conciliación por período, plan por tipo.
 * - `liquidaciones.asignacion_familiar` para guardar el haber por cargas.
 *
 * Las restricciones se agregan solo si los datos actuales las cumplen: en una
 * base con valores fuera de lista la migración avisa y sigue, para no dejar
 * producción a medio migrar.
 */

exports.shorthands = undefined;

const ESTADOS = {
  liquidaciones: ["borrador", "emitida", "eliminada", "anulada"],
  finiquitos: ["vigente", "anulado", "eliminado"],
  vacaciones_ausencias: ["vigente", "anulado", "eliminado"],
  haberes_descuentos_remuneraciones: ["vigente", "anulado", "eliminado"],
  trabajadores: ["activo", "inactivo", "eliminado", "finiquitado"],
  conciliacion_bancaria_movimientos: ["pendiente", "conciliado", "descartado"],
  ejercicios_contables: ["abierto", "cerrado"],
  pagos_remuneraciones: ["vigente", "anulado"],
};

const CON_PERIODO = [
  "compras",
  "ventas",
  "honorarios",
  "comprobantes",
  "liquidaciones",
  "finiquitos",
  "haberes_descuentos_remuneraciones",
  "vacaciones_ausencias",
  "pagos_remuneraciones",
  "pagos_cobros",
  "conciliacion_bancaria_movimientos",
  "configuracion_remuneraciones",
  "afp_parametros",
  "impuesto_unico_tramos",
  "remanente_iva",
];

const CLAVES_FORANEAS = [
  ["configuracion_remuneraciones", "cuenta_sis_empleador_id"],
  ["configuracion_remuneraciones", "cuenta_afc_empleador_id"],
  ["configuracion_remuneraciones", "cuenta_mutual_empleador_id"],
  ["configuracion_remuneraciones", "cuenta_otros_descuentos_id"],
  ["configuracion_contable", "cuenta_otros_impuestos_id"],
];

const INDICES = [
  ["idx_compras_empresa_total", "compras (empresa_id, total)"],
  ["idx_ventas_empresa_total", "ventas (empresa_id, total)"],
  ["idx_honorarios_empresa_liquido", "honorarios (empresa_id, liquido)"],
  ["idx_pagos_cobros_empresa_monto", "pagos_cobros (empresa_id, monto)"],
  ["idx_finiquitos_empresa_periodo", "finiquitos (empresa_id, periodo)"],
  ["idx_finiquitos_comprobante", "finiquitos (comprobante_id)"],
  ["idx_pagos_remuneraciones_comprobante", "pagos_remuneraciones (comprobante_id)"],
  ["idx_conciliacion_empresa_periodo_estado", "conciliacion_bancaria_movimientos (empresa_id, periodo, estado)"],
  ["idx_conciliacion_comprobante", "conciliacion_bancaria_movimientos (comprobante_id)"],
  ["idx_plan_cuentas_empresa_tipo", "plan_cuentas (empresa_id, tipo)"],
  ["idx_trabajadores_empresa_estado", "trabajadores (empresa_id, estado)"],
  ["idx_vacaciones_empresa_trabajador_estado", "vacaciones_ausencias (empresa_id, trabajador_id, estado)"],
  ["idx_haberes_empresa_trabajador_periodo", "haberes_descuentos_remuneraciones (empresa_id, trabajador_id, periodo)"],
];

async function existeConstraint(pgm, nombre) {
  const { rows } = await pgm.db.query(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [nombre]);

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
  // ---------------------------------------------------------------- estados
  for (const [tabla, valores] of Object.entries(ESTADOS)) {
    const nombre = `chk_${tabla}_estado`;

    if (await existeConstraint(pgm, nombre)) continue;

    const lista = valores.map((v) => `'${v}'`).join(", ");
    const { rows } = await pgm.db.query(
      `SELECT COUNT(*)::int AS n FROM ${tabla} WHERE estado IS NOT NULL AND estado NOT IN (${lista})`
    );

    if (rows[0].n > 0) {
      console.warn(`[bloque5] ${tabla}: ${rows[0].n} fila(s) con estado fuera de lista; no se agrega ${nombre}.`);
      continue;
    }

    await pgm.db.query(`ALTER TABLE ${tabla} ADD CONSTRAINT ${nombre} CHECK (estado IS NULL OR estado IN (${lista}))`);
  }

  // ---------------------------------------------------------------- período
  for (const tabla of CON_PERIODO) {
    const nombre = `chk_${tabla}_periodo`;

    if (await existeConstraint(pgm, nombre)) continue;
    if (!(await existeColumna(pgm, tabla, "periodo"))) continue;

    const { rows } = await pgm.db.query(
      `SELECT COUNT(*)::int AS n FROM ${tabla} WHERE periodo IS NOT NULL AND periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`
    );

    if (rows[0].n > 0) {
      console.warn(`[bloque5] ${tabla}: ${rows[0].n} fila(s) con período inválido; no se agrega ${nombre}.`);
      continue;
    }

    await pgm.db.query(
      `ALTER TABLE ${tabla} ADD CONSTRAINT ${nombre} CHECK (periodo IS NULL OR periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')`
    );
  }

  // ---------------------------------------------------------- claves foráneas
  for (const [tabla, columna] of CLAVES_FORANEAS) {
    const nombre = `fk_${tabla}_${columna}`;

    if (await existeConstraint(pgm, nombre)) continue;
    if (!(await existeColumna(pgm, tabla, columna))) continue;

    // Una cuenta borrada a mano dejaría la referencia colgando: se limpia.
    await pgm.db.query(
      `UPDATE ${tabla} x SET ${columna} = NULL
       WHERE ${columna} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM plan_cuentas p WHERE p.id = x.${columna})`
    );
    await pgm.db.query(
      `ALTER TABLE ${tabla} ADD CONSTRAINT ${nombre} FOREIGN KEY (${columna}) REFERENCES plan_cuentas (id) ON DELETE SET NULL`
    );
  }

  // ----------------------------------------------------------------- índices
  for (const [nombre, definicion] of INDICES) {
    pgm.sql(`CREATE INDEX IF NOT EXISTS ${nombre} ON ${definicion}`);
  }

  // ------------------------------------------------------ asignación familiar
  if (!(await existeColumna(pgm, "liquidaciones", "asignacion_familiar"))) {
    pgm.sql(`ALTER TABLE liquidaciones ADD COLUMN asignacion_familiar NUMERIC(18,2) NOT NULL DEFAULT 0`);
  }
};

exports.down = async (pgm) => {
  pgm.sql(`ALTER TABLE liquidaciones DROP COLUMN IF EXISTS asignacion_familiar`);

  for (const [nombre] of INDICES) {
    pgm.sql(`DROP INDEX IF EXISTS ${nombre}`);
  }

  for (const [tabla, columna] of CLAVES_FORANEAS) {
    pgm.sql(`ALTER TABLE ${tabla} DROP CONSTRAINT IF EXISTS fk_${tabla}_${columna}`);
  }

  for (const tabla of CON_PERIODO) {
    pgm.sql(`ALTER TABLE ${tabla} DROP CONSTRAINT IF EXISTS chk_${tabla}_periodo`);
  }

  for (const tabla of Object.keys(ESTADOS)) {
    pgm.sql(`ALTER TABLE ${tabla} DROP CONSTRAINT IF EXISTS chk_${tabla}_estado`);
  }
};
