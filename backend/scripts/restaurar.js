#!/usr/bin/env node
/**
 * Restaura un respaldo hecho con scripts/respaldo.js en la base apuntada por
 * DATABASE_URL, y verifica el resultado contra el manifiesto: numero de filas
 * y huella MD5 por tabla. Si algo no coincide, falla.
 *
 *   node scripts/restaurar.js ../respaldos/respaldo-<marca>.sql [--vaciar]
 *
 * --vaciar borra el contenido de las tablas antes de insertar (TRUNCATE en
 * cascada). Se niega a correr contra una base cuyo nombre no contenga
 * "test" o "staging", salvo que se pase --forzar.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const RUTA_SQL = process.argv[2];
const VACIAR = process.argv.includes("--vaciar");
const FORZAR = process.argv.includes("--forzar");

async function main() {
  if (!RUTA_SQL) {
    throw new Error("Falta la ruta del respaldo .sql");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL");
  }

  const rutaManifiesto = RUTA_SQL.replace(/\.sql$/, ".manifest.json");

  if (!fs.existsSync(RUTA_SQL)) {
    throw new Error(`No existe ${RUTA_SQL}`);
  }

  const manifiesto = fs.existsSync(rutaManifiesto)
    ? JSON.parse(fs.readFileSync(rutaManifiesto, "utf8"))
    : null;

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === "false"
        ? undefined
        : { rejectUnauthorized: false },
  });

  await client.connect();

  const base = (await client.query("SELECT current_database() AS d")).rows[0].d;

  if (!FORZAR && !/test|staging/i.test(base)) {
    throw new Error(
      `La base "${base}" no parece de pruebas. Usar --forzar solo con intencion explicita.`
    );
  }

  console.log(`Restaurando ${path.basename(RUTA_SQL)} en ${base}`);

  const tablas = (
    await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         AND table_name <> 'pgmigrations'
       ORDER BY table_name`
    )
  ).rows.map((f) => f.table_name);

  if (tablas.length === 0) {
    throw new Error("La base destino no tiene esquema. Correr npm run migrate primero.");
  }

  if (VACIAR) {
    const lista = tablas.map((t) => `"${t}"`).join(", ");
    await client.query(`TRUNCATE ${lista} RESTART IDENTITY CASCADE`);
    console.log(`  tablas vaciadas: ${tablas.length}`);
  }

  // El respaldo garantiza una sentencia por linea, asi que se lee por lineas:
  // no hay que interpretar SQL ni adivinar donde termina cada sentencia.
  const sentencias = fs
    .readFileSync(RUTA_SQL, "utf8")
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(
      (linea) =>
        linea &&
        !linea.startsWith("--") &&
        !/^(BEGIN|COMMIT);?$/i.test(linea)
    );

  const insertadas = sentencias.filter((s) => s.startsWith("INSERT")).length;
  console.log(`  sentencias en el archivo: ${sentencias.length} (${insertadas} INSERT)`);

  // En lotes: una ida y vuelta por cada fila hace la restauracion diez veces
  // mas lenta contra una base remota.
  const TAMANO_LOTE = 250;
  await client.query("BEGIN");

  let aplicadas = 0;

  try {
    for (let i = 0; i < sentencias.length; i += TAMANO_LOTE) {
      const lote = sentencias.slice(i, i + TAMANO_LOTE);
      await client.query(lote.join("\n"));
      aplicadas += lote.length;
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`\nFallo en el lote que empieza en la sentencia ${aplicadas + 1}:`);
    console.error(`  ${error.message}`);

    // Reintento fila por fila solo en el lote que fallo, para senalar la culpable.
    const inicio = aplicadas;
    const lote = sentencias.slice(inicio, inicio + TAMANO_LOTE);
    await client.query("BEGIN");

    for (const sentencia of lote) {
      try {
        await client.query(sentencia);
      } catch (e) {
        console.error(`  sentencia culpable: ${sentencia.slice(0, 160)}`);
        console.error(`  motivo: ${e.message}`);
        break;
      }
    }

    await client.query("ROLLBACK");
    await client.end();
    process.exit(1);
  }

  console.log(`  sentencias aplicadas: ${aplicadas}`);

  if (!manifiesto) {
    console.log("Sin manifiesto: no se puede verificar.");
    await client.end();
    return;
  }

  console.log("\nVerificacion contra el manifiesto:");
  const fallos = [];

  for (const [tabla, esperado] of Object.entries(manifiesto.tablas)) {
    const filas = (await client.query(`SELECT COUNT(*)::int AS n FROM "${tabla}"`)).rows[0].n;
    const huella = (
      await client.query(
        `SELECT COALESCE(MD5(STRING_AGG(t::text, '|' ORDER BY t::text)), 'vacia') AS h
         FROM "${tabla}" t`
      )
    ).rows[0].h;

    const okFilas = filas === esperado.filas;
    const okHuella = huella === esperado.huella;

    if (!okFilas || !okHuella) {
      fallos.push(
        `${tabla}: filas ${filas}/${esperado.filas}${okHuella ? "" : " | huella distinta"}`
      );
    }
  }

  if (fallos.length > 0) {
    console.error(`  ${fallos.length} tablas no coinciden:`);
    fallos.forEach((f) => console.error("    " + f));
    await client.end();
    process.exit(1);
  }

  console.log(
    `  OK: ${Object.keys(manifiesto.tablas).length} tablas, ${manifiesto.total_filas} filas, huellas identicas.`
  );

  await client.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
