#!/usr/bin/env node
/**
 * Regenera database/schema.sql por introspeccion de la base apuntada por
 * DATABASE_URL. Es una foto del esquema para revision y para instalaciones
 * limpias; los cambios se hacen siempre con migraciones.
 *
 *   node scripts/dump-schema.js [ruta-de-salida]
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const SALIDA =
  process.argv[2] || path.join(__dirname, "..", "..", "database", "schema.sql");

const TIPOS = {
  integer: "INTEGER",
  bigint: "BIGINT",
  smallint: "SMALLINT",
  boolean: "BOOLEAN",
  text: "TEXT",
  date: "DATE",
  "timestamp without time zone": "TIMESTAMP",
  "timestamp with time zone": "TIMESTAMPTZ",
  "time without time zone": "TIME",
  "double precision": "DOUBLE PRECISION",
  real: "REAL",
  jsonb: "JSONB",
  json: "JSON",
};

function tipoColumna(columna) {
  const tipo = columna.data_type;

  if (tipo === "character varying") {
    return columna.character_maximum_length
      ? `VARCHAR(${columna.character_maximum_length})`
      : "VARCHAR";
  }

  if (tipo === "character") {
    return `CHAR(${columna.character_maximum_length})`;
  }

  if (tipo === "numeric") {
    return columna.numeric_precision
      ? `NUMERIC(${columna.numeric_precision},${columna.numeric_scale})`
      : "NUMERIC";
  }

  return TIPOS[tipo] || tipo.toUpperCase();
}

function agrupar(filas, clave) {
  return filas.reduce((acumulado, fila) => {
    const valor = fila[clave];
    acumulado[valor] = acumulado[valor] || [];
    acumulado[valor].push(fila);
    return acumulado;
  }, {});
}

function ordenarPorDependencias(tablas, clavesPorTabla) {
  const pendientes = new Set(tablas);
  const orden = [];

  while (pendientes.size > 0) {
    const listas = [...pendientes]
      .filter((tabla) =>
        (clavesPorTabla[tabla] || [])
          .filter((fk) => fk.ref_table !== tabla)
          .every((fk) => !pendientes.has(fk.ref_table))
      )
      .sort();

    const siguientes = listas.length > 0 ? listas : [...pendientes].sort();

    siguientes.forEach((tabla) => {
      orden.push(tabla);
      pendientes.delete(tabla);
    });
  }

  return orden;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL");
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === "false"
        ? undefined
        : { rejectUnauthorized: false },
  });

  await client.connect();

  const consulta = async (sql, params) => (await client.query(sql, params)).rows;

  const tablas = (
    await consulta(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         AND table_name <> 'pgmigrations'
       ORDER BY table_name`
    )
  ).map((fila) => fila.table_name);

  const columnas = agrupar(
    await consulta(
      `SELECT table_name, column_name, data_type, character_maximum_length,
              numeric_precision, numeric_scale, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`
    ),
    "table_name"
  );

  const primarias = agrupar(
    await consulta(
      `SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
        AND kcu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
       ORDER BY tc.table_name, kcu.ordinal_position`
    ),
    "table_name"
  );

  const foraneas = agrupar(
    await consulta(
      `SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_table,
              ccu.column_name AS ref_column, tc.constraint_name, rc.delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
       ORDER BY tc.table_name, kcu.column_name`
    ),
    "table_name"
  );

  const restricciones = agrupar(
    await consulta(
      `SELECT rel.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS def
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = rel.relnamespace
       WHERE n.nspname = 'public' AND con.contype IN ('c', 'u')
       ORDER BY rel.relname, con.conname`
    ),
    "table_name"
  );

  const indices = await consulta(
    `SELECT tablename, indexname, indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND tablename <> 'pgmigrations'
     ORDER BY tablename, indexname`
  );

  const conteos = {};

  for (const tabla of tablas) {
    const filas = await consulta(`SELECT COUNT(*)::int AS total FROM "${tabla}"`);
    conteos[tabla] = filas[0].total;
  }

  const orden = ordenarPorDependencias(tablas, foraneas);
  const totalForaneas = Object.values(foraneas).flat().length;
  const lineas = [];
  const guion = "-".repeat(72);
  const igual = "=".repeat(72);

  lineas.push("-- Esquema base de ServContable PRO");
  lineas.push("-- Generado por scripts/dump-schema.js (introspeccion de la base real).");
  lineas.push("-- NO editar a mano para cambiar la base: todo cambio va en database/migrations/.");
  lineas.push("-- Es el punto de partida de una instalacion limpia y la referencia del esquema.");
  lineas.push(
    `-- Tablas: ${orden.length} | claves foraneas: ${totalForaneas} | indices: ${indices.length}`
  );
  lineas.push("");
  lineas.push("BEGIN;");
  lineas.push("");

  for (const tabla of orden) {
    lineas.push(`-- ${guion}`);
    lineas.push(`-- ${tabla}   (${conteos[tabla]} filas al generar)`);
    lineas.push(`-- ${guion}`);
    lineas.push(`CREATE TABLE IF NOT EXISTS ${tabla} (`);

    const cuerpo = [];

    for (const columna of columnas[tabla] || []) {
      let tipo;
      let porDefecto = columna.column_default;

      if (porDefecto && String(porDefecto).includes("nextval")) {
        tipo = columna.data_type === "bigint" ? "BIGSERIAL" : "SERIAL";
        porDefecto = null;
      } else {
        tipo = tipoColumna(columna);
      }

      let linea = `  ${columna.column_name} ${tipo}`;

      if (columna.is_nullable === "NO") {
        linea += " NOT NULL";
      }

      if (porDefecto) {
        linea += ` DEFAULT ${porDefecto}`;
      }

      cuerpo.push(linea);
    }

    const pk = (primarias[tabla] || []).map((fila) => fila.column_name);

    if (pk.length > 0) {
      cuerpo.push(`  PRIMARY KEY (${pk.join(", ")})`);
    }

    for (const fk of foraneas[tabla] || []) {
      const borrado =
        fk.delete_rule && fk.delete_rule !== "NO ACTION"
          ? ` ON DELETE ${fk.delete_rule}`
          : "";

      cuerpo.push(
        `  CONSTRAINT ${fk.constraint_name} FOREIGN KEY (${fk.column_name}) REFERENCES ${fk.ref_table} (${fk.ref_column})${borrado}`
      );
    }

    for (const restriccion of restricciones[tabla] || []) {
      if (restriccion.conname.endsWith("_not_null")) {
        continue;
      }

      cuerpo.push(`  CONSTRAINT ${restriccion.conname} ${restriccion.def}`);
    }

    lineas.push(cuerpo.join(",\n"));
    lineas.push(");");
    lineas.push("");
  }

  lineas.push(`-- ${igual}`);
  lineas.push("-- Indices");
  lineas.push(`-- ${igual}`);

  for (const indice of indices) {
    if (indice.indexname.endsWith("_pkey")) {
      continue;
    }

    let definicion = indice.indexdef;

    if (!definicion.includes(" IF NOT EXISTS ")) {
      definicion = definicion
        .replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ")
        .replace("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ");
    }

    lineas.push(`${definicion};`);
  }

  lineas.push("");
  lineas.push("COMMIT;");

  fs.writeFileSync(SALIDA, `${lineas.join("\n")}\n`, "utf8");
  console.log(
    `Esquema escrito en ${SALIDA} (${orden.length} tablas, ${indices.length} indices).`
  );

  await client.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
