/**
 * Qué migraciones están aplicadas en la base a la que apunta DATABASE_URL.
 *
 * Existe porque `npm run migrate:status` no sirve para esto y es peligroso
 * creerle. Es `node-pg-migrate --dry-run up`, y `--dry-run` solo evita ejecutar
 * las sentencias que las migraciones **encolan** con `pgm.sql()`. Las
 * migraciones de este proyecto hacen buena parte de su trabajo con
 * `pgm.db.query()`, que corre de inmediato: comprobar si una columna existe,
 * crear disparadores, mirar los datos antes de poner una restricción. Con
 * `--dry-run` esas sentencias se ejecutan igual. El 19-09-2026 un
 * `migrate:status` contra producción llegó hasta el bloque 6 y falló ahí.
 *
 * Este script solo lee: `SELECT`, nada más. Se puede correr contra producción
 * sin pensarlo dos veces, que es justamente lo que se necesitaba.
 *
 *   DATABASE_URL=<base> node scripts/estado-migraciones.js
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DIRECTORIO_MIGRACIONES = path.join(__dirname, "..", "..", "database", "migrations");

// Piezas que crean las migraciones de la revisión de septiembre de 2026. Si
// alguna existe sin que su migración esté registrada, algo quedó a medias.
const PIEZAS = [
  ["función", "fijar_autoria_creacion", `SELECT 1 FROM pg_proc WHERE proname = 'fijar_autoria_creacion'`],
  ["tabla", "parametros_nacionales", `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'parametros_nacionales'`],
  ["tabla", "terceros", `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'terceros'`],
  ["tabla", "centros_costo", `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'centros_costo'`],
  ["tabla", "activos_fijos", `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activos_fijos'`],
  ["tabla", "correcciones_monetarias", `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'correcciones_monetarias'`],
  ["tabla", "rentas_anuales", `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rentas_anuales'`],
  ["restricción", "chk_comprobantes_estado", `SELECT 1 FROM pg_constraint WHERE conname = 'chk_comprobantes_estado'`],
  ["columna", "usuarios.token_version", `SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'token_version'`],
  ["disparador", "trg_traducir_estado_eliminado", `SELECT 1 FROM pg_trigger WHERE tgname = 'trg_traducir_estado_eliminado'`],
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL.");
    process.exit(1);
  }

  const cliente = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await cliente.connect();

  const base = (await cliente.query("SELECT current_database() AS d")).rows[0].d;
  console.log(`Base: ${base}\n`);

  const archivos = fs
    .readdirSync(DIRECTORIO_MIGRACIONES)
    .filter((f) => f.endsWith(".js"))
    .map((f) => f.replace(/\.js$/, ""))
    .sort();

  const existeTabla = await cliente.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'pgmigrations'`
  );

  let aplicadas = [];

  if (existeTabla.rows.length === 0) {
    console.log("La tabla pgmigrations no existe: ninguna migración registrada.\n");
  } else {
    const { rows } = await cliente.query(`SELECT name, run_on FROM pgmigrations ORDER BY id`);
    aplicadas = rows.map((f) => f.name);
  }

  const registradas = new Set(aplicadas);

  console.log("Migraciones:");
  for (const archivo of archivos) {
    console.log(`  ${registradas.has(archivo) ? "aplicada " : "PENDIENTE"}  ${archivo}`);
  }

  const huerfanas = aplicadas.filter((n) => !archivos.includes(n));

  if (huerfanas.length > 0) {
    console.log("\nRegistradas en la base y sin archivo en el repositorio:");
    for (const n of huerfanas) console.log(`  ${n}`);
  }

  console.log(`\nTotal: ${archivos.length} archivos, ${aplicadas.length} aplicadas, ${archivos.length - registradas.size} pendientes.`);

  console.log("\nPiezas del esquema (para detectar una migración a medias):");
  for (const [tipo, nombre, sql] of PIEZAS) {
    const r = await cliente.query(sql);
    console.log(`  ${r.rows.length > 0 ? "existe    " : "no existe "}  ${tipo} ${nombre}`);
  }

  const estados = await cliente.query(
    `SELECT COALESCE(estado, '(nulo)') AS estado, COUNT(*)::int AS n
     FROM comprobantes GROUP BY 1 ORDER BY n DESC`
  );

  console.log("\nEstados presentes en comprobantes:");
  for (const f of estados.rows) console.log(`  ${f.estado}: ${f.n}`);

  await cliente.end();
}

main().catch((error) => {
  console.error("No se pudo leer el estado:", error.message);
  process.exit(1);
});
