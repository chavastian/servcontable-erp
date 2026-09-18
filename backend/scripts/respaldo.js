#!/usr/bin/env node
/**
 * Respaldo logico completo de la base apuntada por DATABASE_URL.
 *
 * Produce dos archivos:
 *   <salida>/respaldo-<marca>.sql           esquema + datos, restaurable
 *   <salida>/respaldo-<marca>.manifest.json conteo y huella por tabla
 *
 * El manifiesto es lo que permite verificar una restauracion: se compara
 * tabla por tabla el numero de filas y la huella MD5 del contenido.
 *
 *   node scripts/respaldo.js [directorio-de-salida]
 *
 * No requiere pg_dump. Pensado para bases chicas (la de produccion pesa 12 MB).
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client, types } = require("pg");

const SALIDA = process.argv[2] || path.join(__dirname, "..", "..", "respaldos");

// Fechas y horas se leen como texto crudo, tal como las guarda PostgreSQL.
//
// Por defecto el driver convierte "timestamp without time zone" a un Date de
// JavaScript interpretado en la zona horaria de la maquina; al volver a
// escribirlo como ISO se desplaza por el desfase local. En Chile eso corria
// cada marca de tiempo 3 o 4 horas. Un respaldo no puede alterar los datos.
const TIPOS_FECHA_HORA = {
  DATE: 1082,
  TIME: 1083,
  TIMESTAMP: 1114,
  TIMESTAMPTZ: 1184,
  TIMETZ: 1266,
};

Object.values(TIPOS_FECHA_HORA).forEach((oid) => {
  types.setTypeParser(oid, (valor) => valor);
});

function marcaTiempo() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/**
 * Convierte un valor a literal SQL en UNA sola linea.
 *
 * Que cada INSERT ocupe exactamente una linea es lo que hace que el archivo se
 * pueda volver a leer sin ambiguedad: un texto con saltos de linea o con punto
 * y coma reventaria cualquier division por sentencias. Los saltos, tabulaciones
 * y contrabarras se escapan con la sintaxis E'...' de PostgreSQL.
 */
function textoLiteral(texto) {
  const necesitaEscape = /[\n\r\t\\]/.test(texto);
  const escapado = texto.replace(/'/g, "''");

  if (!necesitaEscape) {
    return `'${escapado}'`;
  }

  return `E'${escapado
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")}'`;
}

function literal(valor, tipo) {
  if (valor === null || valor === undefined) {
    return "NULL";
  }

  if (typeof valor === "boolean") {
    return valor ? "true" : "false";
  }

  if (typeof valor === "number") {
    return Number.isFinite(valor) ? String(valor) : "NULL";
  }

  if (valor instanceof Date) {
    throw new Error(
      "Llego un Date al respaldo: falta registrar el parser de ese tipo en TIPOS_FECHA_HORA."
    );
  }

  if (Buffer.isBuffer(valor)) {
    return `'\\x${valor.toString("hex")}'`;
  }

  if (typeof valor === "object") {
    // jsonb / json / arreglos
    const json = textoLiteral(JSON.stringify(valor));
    return `${json}::${tipo === "ARRAY" ? "text[]" : "jsonb"}`;
  }

  return textoLiteral(String(valor));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL");
  }

  fs.mkdirSync(SALIDA, { recursive: true });

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === "false"
        ? undefined
        : { rejectUnauthorized: false },
  });

  await client.connect();
  await client.query("SET default_transaction_read_only = on");

  const consulta = async (sql, params) => (await client.query(sql, params)).rows;

  const base = (await consulta("SELECT current_database() AS d"))[0].d;
  const version = (await consulta("SELECT version() AS v"))[0].v;

  const tablas = (
    await consulta(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    )
  ).map((fila) => fila.table_name);

  // Orden de insercion: primero las tablas sin dependencias.
  const foraneas = await consulta(
    `SELECT tc.table_name, ccu.table_name AS ref_table
     FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`
  );

  const dependencias = {};
  tablas.forEach((tabla) => {
    dependencias[tabla] = new Set();
  });
  foraneas.forEach((fk) => {
    if (fk.table_name !== fk.ref_table && dependencias[fk.table_name]) {
      dependencias[fk.table_name].add(fk.ref_table);
    }
  });

  const pendientes = new Set(tablas);
  const orden = [];

  while (pendientes.size > 0) {
    const listas = [...pendientes]
      .filter((tabla) => ![...dependencias[tabla]].some((ref) => pendientes.has(ref)))
      .sort();
    const siguientes = listas.length > 0 ? listas : [...pendientes].sort();
    siguientes.forEach((tabla) => {
      orden.push(tabla);
      pendientes.delete(tabla);
    });
  }

  const marca = marcaTiempo();
  const rutaSql = path.join(SALIDA, `respaldo-${marca}.sql`);
  const rutaManifiesto = path.join(SALIDA, `respaldo-${marca}.manifest.json`);
  const salida = fs.createWriteStream(rutaSql, { encoding: "utf8" });
  const escribir = (texto) =>
    new Promise((resolve) => {
      if (!salida.write(texto)) salida.once("drain", resolve);
      else resolve();
    });

  await escribir(`-- Respaldo logico de ${base}\n`);
  await escribir(`-- Fecha: ${new Date().toISOString()}\n`);
  await escribir(`-- Servidor: ${version}\n`);
  await escribir(`-- Tablas: ${orden.length}\n`);
  await escribir("--\n-- Restaurar sobre una base VACIA que ya tenga el esquema aplicado\n");
  await escribir("-- (npm run migrate), o usar scripts/restaurar.js.\n\n");
  await escribir("BEGIN;\n\n");

  const manifiesto = { base, generado_en: new Date().toISOString(), version, tablas: {} };
  let totalFilas = 0;

  for (const tabla of orden) {
    const columnas = (
      await consulta(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [tabla]
      )
    );

    const nombres = columnas.map((c) => c.column_name);
    const tipos = Object.fromEntries(columnas.map((c) => [c.column_name, c.data_type]));

    const filas = await consulta(`SELECT * FROM "${tabla}" ORDER BY 1`);
    const huella = (
      await consulta(
        `SELECT COALESCE(MD5(STRING_AGG(t::text, '|' ORDER BY t::text)), 'vacia') AS huella
         FROM "${tabla}" t`
      )
    )[0].huella;

    manifiesto.tablas[tabla] = { filas: filas.length, huella };
    totalFilas += filas.length;

    await escribir(`-- ${tabla}: ${filas.length} filas\n`);

    if (filas.length > 0) {
      const lista = nombres.map((n) => `"${n}"`).join(", ");

      for (const fila of filas) {
        const valores = nombres.map((n) => literal(fila[n], tipos[n])).join(", ");
        await escribir(`INSERT INTO "${tabla}" (${lista}) VALUES (${valores});\n`);
      }
    }

    await escribir("\n");
  }

  // Dejar las secuencias donde corresponde, si no el primer INSERT nuevo choca.
  await escribir("-- Secuencias\n");
  const secuencias = await consulta(
    `SELECT c.relname AS secuencia, t.relname AS tabla, a.attname AS columna
     FROM pg_class c
     JOIN pg_depend d ON d.objid = c.oid
     JOIN pg_class t ON t.oid = d.refobjid
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'S' AND n.nspname = 'public'
     ORDER BY c.relname`
  );

  for (const s of secuencias) {
    await escribir(
      `SELECT setval('${s.secuencia}', COALESCE((SELECT MAX("${s.columna}") FROM "${s.tabla}"), 1), true);\n`
    );
  }

  await escribir("\nCOMMIT;\n");
  await new Promise((resolve) => salida.end(resolve));

  manifiesto.total_filas = totalFilas;
  manifiesto.secuencias = secuencias.length;
  manifiesto.archivo_sql = path.basename(rutaSql);
  manifiesto.bytes_sql = fs.statSync(rutaSql).size;

  fs.writeFileSync(rutaManifiesto, `${JSON.stringify(manifiesto, null, 1)}\n`, "utf8");

  console.log(`Respaldo: ${rutaSql}`);
  console.log(
    `  ${orden.length} tablas | ${totalFilas} filas | ${secuencias.length} secuencias | ${(
      manifiesto.bytes_sql / 1024
    ).toFixed(0)} KB`
  );
  console.log(`Manifiesto: ${rutaManifiesto}`);

  await client.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
