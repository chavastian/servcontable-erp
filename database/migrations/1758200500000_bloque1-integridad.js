/**
 * Bloque 1 de la revisión del 19-09-2026: integridad que la base tiene que
 * garantizar por sí misma.
 *
 * 1. Compras: el folio lo asigna el proveedor, así que la unicidad es por
 *    RUT emisor, tipo y folio. El índice anterior no incluía el RUT: dos
 *    proveedores con factura 33 N° 100 se pisaban al importar. Además el alta
 *    manual dejaba sii_tipo_doc vacío y dos vacíos no chocan en un índice
 *    único: la misma factura entraba dos veces a mano. Se rellena el código
 *    desde el texto del tipo y se reemplaza el índice.
 *
 * 2. Tipo de cuenta: ocho valores cerrados. Los informes clasificaban por
 *    palabras del nombre y los paneles comparaban contra valores que el plan
 *    base no usa; el resultado del panel salía en cero.
 *
 * 3. Borrar una empresa a mano borraba en cascada su contabilidad completa
 *    sin pasar por auditoría; borrar un usuario borraba los pagos recibidos
 *    por ServContable. Las cascadas contables pasan a RESTRICT y las de pagos
 *    a SET NULL. La baja de empresa sigue siendo activa = false.
 *
 * 4. Autoría por disparador: creado_por y actualizado_por se llenan desde
 *    app.usuario_id, que la capa de base de datos fija en cada escritura. De
 *    147 compras creadas desde que existía la columna, ninguna tenía autor.
 *
 * 5. Índice para el correlativo de comprobantes.
 *
 * Todo verificado contra la copia de producción: cero choques en el índice
 * nuevo de compras, y los ocho tipos de cuenta cubren todas las filas.
 */

exports.shorthands = undefined;

const TIPOS_CUENTA = [
  "Activo",
  "Pasivo",
  "Patrimonio",
  "Ingreso",
  "Ganancia",
  "Costo",
  "Gasto",
  "Pérdida",
];

// Cascadas contables que pasan a RESTRICT.
const FK_RESTRICT = [
  ["comprobantes", "comprobantes_empresa_id_fkey"],
  ["ventas", "ventas_empresa_id_fkey"],
  ["compras", "compras_empresa_id_fkey"],
  ["plan_cuentas", "plan_cuentas_empresa_id_fkey"],
  ["ejercicios_contables", "ejercicios_contables_empresa_id_fkey"],
  ["remanente_iva", "remanente_iva_empresa_id_fkey"],
  ["configuracion_contable", "configuracion_contable_empresa_id_fkey"],
];

// Tablas con creado_por / actualizado_por (migración de autoría).
const TABLAS_AUTORIA = [
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

async function existeColumna(pgm, tabla, columna) {
  const { rows } = await pgm.db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tabla, columna]
  );

  return rows.length > 0;
}

async function existeConstraint(pgm, nombre) {
  const { rows } = await pgm.db.query(
    `SELECT 1 FROM pg_constraint WHERE conname = $1`,
    [nombre]
  );

  return rows.length > 0;
}

exports.up = async (pgm) => {
  // ------------------------------------------------------------- 1. compras
  // Código SII para las compras manuales, desde el texto del tipo.
  pgm.sql(`
    UPDATE compras
    SET sii_tipo_doc = CASE
      WHEN sii_tipo_doc IS NOT NULL AND sii_tipo_doc <> '' THEN sii_tipo_doc
      WHEN tipo_documento ~ '^[0-9]+$' THEN tipo_documento
      WHEN LOWER(tipo_documento) LIKE '%exenta%' THEN '34'
      WHEN LOWER(tipo_documento) LIKE '%nota de d%' OR LOWER(tipo_documento) LIKE 'nd%' THEN '56'
      WHEN LOWER(tipo_documento) LIKE '%nota de cr%' OR LOWER(tipo_documento) LIKE 'nc%' THEN '61'
      WHEN LOWER(tipo_documento) LIKE '%factura de compra%' THEN '46'
      WHEN LOWER(tipo_documento) LIKE '%boleta%exenta%' THEN '41'
      WHEN LOWER(tipo_documento) LIKE '%boleta%' THEN '39'
      WHEN LOWER(tipo_documento) LIKE '%factura%' THEN '33'
      ELSE sii_tipo_doc
    END
    WHERE sii_tipo_doc IS NULL OR sii_tipo_doc = ''
  `);

  pgm.sql(`DROP INDEX IF EXISTS idx_compras_sii_unicas`);

  // Antes de crear el índice, un choque haría fallar la migración completa.
  // Es a propósito: mejor saberlo que dejarlo pasar.
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_compras_documento
      ON compras (
        empresa_id,
        (UPPER(REPLACE(REPLACE(COALESCE(rut_proveedor, ''), '.', ''), ' ', ''))),
        sii_tipo_doc,
        folio
      )
      WHERE folio IS NOT NULL AND folio <> ''
        AND sii_tipo_doc IS NOT NULL AND sii_tipo_doc <> ''
        AND estado = 'vigente'
  `);

  // El RUT normalizado también sirve para la sugerencia de cuenta por historial.
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_compras_empresa_rut_norm
      ON compras (empresa_id, (UPPER(REPLACE(REPLACE(COALESCE(rut_proveedor, ''), '.', ''), ' ', ''))))
  `);
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_ventas_empresa_rut_norm
      ON ventas (empresa_id, (UPPER(REPLACE(REPLACE(COALESCE(rut_cliente, ''), '.', ''), ' ', ''))))
  `);

  // ------------------------------------------------------- 2. tipo de cuenta
  pgm.sql(`
    UPDATE plan_cuentas
    SET tipo = CASE translate(lower(trim(tipo)), 'áéíóú', 'aeiou')
      WHEN 'activo' THEN 'Activo'
      WHEN 'pasivo' THEN 'Pasivo'
      WHEN 'patrimonio' THEN 'Patrimonio'
      WHEN 'ingreso' THEN 'Ingreso'
      WHEN 'ingresos' THEN 'Ingreso'
      WHEN 'ganancia' THEN 'Ganancia'
      WHEN 'ganancias' THEN 'Ganancia'
      WHEN 'costo' THEN 'Costo'
      WHEN 'costos' THEN 'Costo'
      WHEN 'gasto' THEN 'Gasto'
      WHEN 'gastos' THEN 'Gasto'
      WHEN 'perdida' THEN 'Pérdida'
      WHEN 'perdidas' THEN 'Pérdida'
      ELSE tipo
    END
  `);

  const desconocidos = await pgm.db.query(
    `SELECT DISTINCT tipo FROM plan_cuentas WHERE tipo <> ALL($1::text[])`,
    [TIPOS_CUENTA]
  );

  if (desconocidos.rows.length > 0) {
    throw new Error(
      `plan_cuentas.tipo tiene valores fuera del dominio: ${desconocidos.rows
        .map((f) => JSON.stringify(f.tipo))
        .join(", ")}. Corregirlos antes de migrar.`
    );
  }

  if (!(await existeConstraint(pgm, "chk_plan_cuentas_tipo"))) {
    pgm.sql(`
      ALTER TABLE plan_cuentas
        ADD CONSTRAINT chk_plan_cuentas_tipo
        CHECK (tipo IN (${TIPOS_CUENTA.map((t) => `'${t}'`).join(", ")}))
    `);
  }

  // ------------------------------------------------------------- 3. cascadas
  for (const [tabla, constraint] of FK_RESTRICT) {
    if (await existeConstraint(pgm, constraint)) {
      pgm.sql(`
        ALTER TABLE ${tabla}
          DROP CONSTRAINT ${constraint},
          ADD CONSTRAINT ${constraint}
            FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE RESTRICT
      `);
    }
  }

  for (const [tabla, constraint] of [
    ["subscription_payments", "subscription_payments_user_id_fkey"],
    ["subscription_history", "subscription_history_user_id_fkey"],
  ]) {
    if (await existeConstraint(pgm, constraint)) {
      pgm.sql(`ALTER TABLE ${tabla} ALTER COLUMN user_id DROP NOT NULL`);
      pgm.sql(`
        ALTER TABLE ${tabla}
          DROP CONSTRAINT ${constraint},
          ADD CONSTRAINT ${constraint}
            FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE SET NULL
      `);
    }
  }

  // -------------------------------------------------------------- 4. autoría
  pgm.sql(`
    CREATE OR REPLACE FUNCTION fijar_autoria_creacion() RETURNS trigger AS $$
    DECLARE usuario integer;
    BEGIN
      BEGIN
        usuario := NULLIF(current_setting('app.usuario_id', true), '')::integer;
      EXCEPTION WHEN others THEN
        usuario := NULL;
      END;

      IF NEW.creado_por IS NULL THEN
        NEW.creado_por := usuario;
      END IF;

      RETURN NEW;
    END
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION fijar_autoria_actualizacion() RETURNS trigger AS $$
    DECLARE usuario integer;
    BEGIN
      BEGIN
        usuario := NULLIF(current_setting('app.usuario_id', true), '')::integer;
      EXCEPTION WHEN others THEN
        usuario := NULL;
      END;

      IF usuario IS NOT NULL THEN
        NEW.actualizado_por := usuario;
      END IF;

      RETURN NEW;
    END
    $$ LANGUAGE plpgsql;
  `);

  for (const tabla of TABLAS_AUTORIA) {
    if (await existeColumna(pgm, tabla, "creado_por")) {
      pgm.sql(`DROP TRIGGER IF EXISTS trg_autoria_creacion ON ${tabla}`);
      pgm.sql(`
        CREATE TRIGGER trg_autoria_creacion
          BEFORE INSERT ON ${tabla}
          FOR EACH ROW EXECUTE FUNCTION fijar_autoria_creacion()
      `);
    }

    if (await existeColumna(pgm, tabla, "actualizado_por")) {
      pgm.sql(`DROP TRIGGER IF EXISTS trg_autoria_actualizacion ON ${tabla}`);
      pgm.sql(`
        CREATE TRIGGER trg_autoria_actualizacion
          BEFORE UPDATE ON ${tabla}
          FOR EACH ROW EXECUTE FUNCTION fijar_autoria_actualizacion()
      `);
    }
  }

  // -------------------------------------------------------- 5. correlativo
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_comprobantes_empresa_numero_desc
      ON comprobantes (empresa_id, numero DESC)
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_comprobantes_empresa_numero_desc`);

  for (const tabla of TABLAS_AUTORIA) {
    pgm.sql(`DROP TRIGGER IF EXISTS trg_autoria_creacion ON ${tabla}`);
    pgm.sql(`DROP TRIGGER IF EXISTS trg_autoria_actualizacion ON ${tabla}`);
  }

  pgm.sql(`DROP FUNCTION IF EXISTS fijar_autoria_creacion()`);
  pgm.sql(`DROP FUNCTION IF EXISTS fijar_autoria_actualizacion()`);

  for (const [tabla, constraint] of FK_RESTRICT) {
    pgm.sql(`
      ALTER TABLE ${tabla}
        DROP CONSTRAINT IF EXISTS ${constraint},
        ADD CONSTRAINT ${constraint}
          FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE
    `);
  }

  pgm.sql(`ALTER TABLE plan_cuentas DROP CONSTRAINT IF EXISTS chk_plan_cuentas_tipo`);

  pgm.sql(`DROP INDEX IF EXISTS idx_ventas_empresa_rut_norm`);
  pgm.sql(`DROP INDEX IF EXISTS idx_compras_empresa_rut_norm`);
  pgm.sql(`DROP INDEX IF EXISTS uq_compras_documento`);
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_compras_sii_unicas
      ON compras (empresa_id, sii_tipo_doc, folio)
      WHERE folio IS NOT NULL AND folio <> ''
  `);
};
