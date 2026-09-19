/**
 * Bloque 6 de la revisión del 19-09-2026: módulos 12 y 14, los dos catálogos.
 *
 * 1. Proveedores y clientes vivían como texto repetido en cada documento:
 *    `rut_proveedor` y `razon_social_proveedor` en compras, lo mismo en
 *    ventas. Con 29 proveedores y 8 clientes en la copia eso todavía se
 *    aguanta, pero no hay dónde guardar la condición de pago (y por eso el
 *    flujo de caja estima el vencimiento), ni el giro, ni la cuenta habitual
 *    del tercero, ni cómo contactarlo. Un RUT puede ser proveedor y cliente a
 *    la vez, así que es una sola tabla con dos banderas.
 *
 * 2. El centro de costo era texto libre en dos tablas: escribir "Local 1" y
 *    "local 1" daba dos centros, y no había forma de sacar un resultado por
 *    local, que es justamente para lo que se usa.
 *
 * Las columnas de texto se conservan en los documentos a propósito: una
 * factura registra el nombre con que fue emitida, y ese dato no cambia porque
 * después el proveedor se cambie de razón social.
 */

exports.shorthands = undefined;

// La misma expresión que ya usan los índices de compras y ventas.
const RUT_NORM = (columna) => `UPPER(REPLACE(REPLACE(COALESCE(${columna}, ''), '.', ''), ' ', ''))`;

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

async function agregar(pgm, tabla, columna, tipo) {
  if (!(await existeColumna(pgm, tabla, columna))) {
    await pgm.db.query(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
  }
}

exports.up = async (pgm) => {
  // ------------------------------------------------------------- terceros
  if (!(await existeTabla(pgm, "terceros"))) {
    await pgm.db.query(`
      CREATE TABLE terceros (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresas (id) ON DELETE RESTRICT,
        rut VARCHAR(20) NOT NULL,
        razon_social VARCHAR(200) NOT NULL,
        nombre_fantasia VARCHAR(200) DEFAULT '',
        giro TEXT DEFAULT '',
        direccion TEXT DEFAULT '',
        comuna VARCHAR(120) DEFAULT '',
        ciudad VARCHAR(120) DEFAULT '',
        email VARCHAR(150) DEFAULT '',
        telefono VARCHAR(50) DEFAULT '',
        contacto VARCHAR(150) DEFAULT '',
        es_proveedor BOOLEAN NOT NULL DEFAULT false,
        es_cliente BOOLEAN NOT NULL DEFAULT false,
        -- NULL es "no se sabe": el flujo de caja sigue usando su plazo
        -- convencional. 0 es contado, y eso sí es un dato.
        condicion_pago_dias INTEGER,
        cuenta_gasto_id INTEGER REFERENCES plan_cuentas (id) ON DELETE SET NULL,
        cuenta_ingreso_id INTEGER REFERENCES plan_cuentas (id) ON DELETE SET NULL,
        observacion TEXT DEFAULT '',
        estado VARCHAR(20) NOT NULL DEFAULT 'vigente',
        creado_en TIMESTAMP DEFAULT now(),
        actualizado_en TIMESTAMP DEFAULT now(),
        creado_por INTEGER,
        actualizado_por INTEGER,
        CONSTRAINT chk_terceros_estado CHECK (estado IN ('vigente', 'inactivo'))
      )
    `);

    await pgm.db.query(
      `CREATE UNIQUE INDEX uq_terceros_empresa_rut ON terceros (empresa_id, ${RUT_NORM("rut")})`
    );
    await pgm.db.query(`CREATE INDEX idx_terceros_empresa_estado ON terceros (empresa_id, estado)`);
    await pgm.db.query(`CREATE INDEX idx_terceros_razon_social ON terceros (empresa_id, razon_social)`);
  }

  // --------------------------------------------------------- centros de costo
  if (!(await existeTabla(pgm, "centros_costo"))) {
    await pgm.db.query(`
      CREATE TABLE centros_costo (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresas (id) ON DELETE RESTRICT,
        codigo VARCHAR(30) NOT NULL,
        nombre VARCHAR(150) NOT NULL,
        descripcion TEXT DEFAULT '',
        estado VARCHAR(20) NOT NULL DEFAULT 'vigente',
        creado_en TIMESTAMP DEFAULT now(),
        actualizado_en TIMESTAMP DEFAULT now(),
        creado_por INTEGER,
        actualizado_por INTEGER,
        CONSTRAINT chk_centros_costo_estado CHECK (estado IN ('vigente', 'inactivo'))
      )
    `);

    await pgm.db.query(
      `CREATE UNIQUE INDEX uq_centros_costo_empresa_codigo ON centros_costo (empresa_id, UPPER(TRIM(codigo)))`
    );
    await pgm.db.query(`CREATE INDEX idx_centros_costo_empresa_estado ON centros_costo (empresa_id, estado)`);
  }

  // ------------------------------------------------------------- enlaces
  await agregar(pgm, "compras", "tercero_id", "INTEGER REFERENCES terceros (id) ON DELETE SET NULL");
  await agregar(pgm, "ventas", "tercero_id", "INTEGER REFERENCES terceros (id) ON DELETE SET NULL");
  await agregar(pgm, "honorarios", "tercero_id", "INTEGER REFERENCES terceros (id) ON DELETE SET NULL");
  await agregar(pgm, "comprobante_detalle", "centro_costo_id", "INTEGER REFERENCES centros_costo (id) ON DELETE SET NULL");
  await agregar(pgm, "trabajadores", "centro_costo_id", "INTEGER REFERENCES centros_costo (id) ON DELETE SET NULL");

  // ------------------------------------------------------------- traspaso
  // Un tercero por RUT y empresa, con la razón social del documento más
  // reciente: es la que el usuario reconoce.
  await pgm.db.query(`
    INSERT INTO terceros (empresa_id, rut, razon_social, es_proveedor, es_cliente)
    SELECT empresa_id, rut, razon_social,
           bool_or(es_proveedor) AS es_proveedor,
           bool_or(es_cliente) AS es_cliente
    FROM (
      SELECT DISTINCT ON (empresa_id, ${RUT_NORM("rut")})
             empresa_id, ${RUT_NORM("rut")} AS rut, razon_social, es_proveedor, es_cliente
      FROM (
        SELECT empresa_id, rut_proveedor AS rut,
               COALESCE(NULLIF(TRIM(razon_social_proveedor), ''), rut_proveedor) AS razon_social,
               true AS es_proveedor, false AS es_cliente, fecha
        FROM compras
        WHERE COALESCE(TRIM(rut_proveedor), '') <> ''
        UNION ALL
        SELECT empresa_id, rut_cliente,
               COALESCE(NULLIF(TRIM(razon_social_cliente), ''), rut_cliente),
               false, true, fecha
        FROM ventas
        WHERE COALESCE(TRIM(rut_cliente), '') <> ''
        UNION ALL
        -- El prestador de una boleta de honorarios también es un tercero: es
        -- a quien hay que emitir el certificado de la declaración jurada 1879.
        SELECT empresa_id, rut_prestador,
               COALESCE(NULLIF(TRIM(nombre_prestador), ''), rut_prestador),
               true, false, fecha_emision
        FROM honorarios
        WHERE COALESCE(TRIM(rut_prestador), '') <> ''
      ) documentos
      ORDER BY empresa_id, ${RUT_NORM("rut")}, fecha DESC
    ) ultimos
    GROUP BY empresa_id, rut, razon_social
    ON CONFLICT DO NOTHING
  `);

  // La bandera de la otra cara: un RUT que aparece en compras y en ventas.
  await pgm.db.query(`
    UPDATE terceros t SET es_proveedor = true
    WHERE es_proveedor = false
      AND EXISTS (
        SELECT 1 FROM compras c
        WHERE c.empresa_id = t.empresa_id
          AND ${RUT_NORM("c.rut_proveedor")} = ${RUT_NORM("t.rut")}
      )
  `);
  await pgm.db.query(`
    UPDATE terceros t SET es_cliente = true
    WHERE es_cliente = false
      AND EXISTS (
        SELECT 1 FROM ventas v
        WHERE v.empresa_id = t.empresa_id
          AND ${RUT_NORM("v.rut_cliente")} = ${RUT_NORM("t.rut")}
      )
  `);

  await pgm.db.query(`
    UPDATE compras c SET tercero_id = t.id
    FROM terceros t
    WHERE c.tercero_id IS NULL
      AND t.empresa_id = c.empresa_id
      AND ${RUT_NORM("t.rut")} = ${RUT_NORM("c.rut_proveedor")}
  `);
  await pgm.db.query(`
    UPDATE ventas v SET tercero_id = t.id
    FROM terceros t
    WHERE v.tercero_id IS NULL
      AND t.empresa_id = v.empresa_id
      AND ${RUT_NORM("t.rut")} = ${RUT_NORM("v.rut_cliente")}
  `);
  await pgm.db.query(`
    UPDATE honorarios h SET tercero_id = t.id
    FROM terceros t
    WHERE h.tercero_id IS NULL
      AND t.empresa_id = h.empresa_id
      AND ${RUT_NORM("t.rut")} = ${RUT_NORM("h.rut_prestador")}
  `);

  // Centros de costo: el texto que ya existe, con código derivado del nombre.
  await pgm.db.query(`
    INSERT INTO centros_costo (empresa_id, codigo, nombre)
    SELECT empresa_id,
           UPPER(SUBSTRING(REGEXP_REPLACE(nombre, '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 30)) AS codigo,
           nombre
    FROM (
      SELECT DISTINCT c.empresa_id, TRIM(cd.centro_costo) AS nombre
      FROM comprobante_detalle cd
      JOIN comprobantes c ON c.id = cd.comprobante_id
      WHERE COALESCE(TRIM(cd.centro_costo), '') <> ''
      UNION
      SELECT DISTINCT empresa_id, TRIM(centro_costo)
      FROM trabajadores
      WHERE COALESCE(TRIM(centro_costo), '') <> ''
    ) textos
    WHERE REGEXP_REPLACE(nombre, '[^a-zA-Z0-9]', '', 'g') <> ''
    ON CONFLICT DO NOTHING
  `);

  await pgm.db.query(`
    UPDATE comprobante_detalle cd SET centro_costo_id = cc.id
    FROM comprobantes c, centros_costo cc
    WHERE cd.comprobante_id = c.id
      AND cd.centro_costo_id IS NULL
      AND cc.empresa_id = c.empresa_id
      AND UPPER(TRIM(cc.nombre)) = UPPER(TRIM(cd.centro_costo))
  `);
  await pgm.db.query(`
    UPDATE trabajadores t SET centro_costo_id = cc.id
    FROM centros_costo cc
    WHERE t.centro_costo_id IS NULL
      AND cc.empresa_id = t.empresa_id
      AND UPPER(TRIM(cc.nombre)) = UPPER(TRIM(t.centro_costo))
  `);

  await pgm.db.query(`CREATE INDEX IF NOT EXISTS idx_compras_tercero ON compras (tercero_id)`);
  await pgm.db.query(`CREATE INDEX IF NOT EXISTS idx_ventas_tercero ON ventas (tercero_id)`);
  await pgm.db.query(`CREATE INDEX IF NOT EXISTS idx_honorarios_tercero ON honorarios (tercero_id)`);
  await pgm.db.query(
    `CREATE INDEX IF NOT EXISTS idx_comprobante_detalle_centro ON comprobante_detalle (centro_costo_id)`
  );

  // Autoría, con los mismos nombres de disparador que el bloque 1.
  for (const tabla of ["terceros", "centros_costo"]) {
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
  pgm.sql(`DROP INDEX IF EXISTS idx_comprobante_detalle_centro`);
  pgm.sql(`DROP INDEX IF EXISTS idx_honorarios_tercero`);
  pgm.sql(`DROP INDEX IF EXISTS idx_ventas_tercero`);
  pgm.sql(`DROP INDEX IF EXISTS idx_compras_tercero`);

  pgm.sql(`ALTER TABLE trabajadores DROP COLUMN IF EXISTS centro_costo_id`);
  pgm.sql(`ALTER TABLE comprobante_detalle DROP COLUMN IF EXISTS centro_costo_id`);
  pgm.sql(`ALTER TABLE honorarios DROP COLUMN IF EXISTS tercero_id`);
  pgm.sql(`ALTER TABLE ventas DROP COLUMN IF EXISTS tercero_id`);
  pgm.sql(`ALTER TABLE compras DROP COLUMN IF EXISTS tercero_id`);

  pgm.sql(`DROP TABLE IF EXISTS centros_costo`);
  pgm.sql(`DROP TABLE IF EXISTS terceros`);
};
