#!/usr/bin/env node
/**
 * Aplicar las migraciones pendientes a la base de producción.
 *
 * Existe para que autorizar esta acción sea una decisión legible. Todo lo que
 * hace está acá, en orden, y el comando que hay que permitir es uno corto y
 * fijo. No recibe cadenas de conexión por parámetro ni por variable: las
 * resuelve solo, preguntándole a Render por las del servicio de producción, de
 * modo que ninguna credencial pasa por la línea de comandos ni queda en el
 * historial.
 *
 *   node scripts/migrar-produccion.js              revisa y no toca nada
 *   node scripts/migrar-produccion.js --confirmar  aplica las migraciones
 *
 * Sin `--confirmar` solo informa. Es a propósito: el modo que escribe hay que
 * pedirlo.
 *
 * Tres guardas antes de escribir, en este orden:
 *
 *   1. La base de destino tiene que ser la que Render declara como producción.
 *   2. Tiene que existir un respaldo verificado de esa misma base, reciente. Un
 *      respaldo que nadie restauró es una suposición, así que lo que se busca es
 *      el manifiesto que deja `probar-restauracion.js`.
 *   3. Las migraciones se aplican en una sola transacción, que es el valor por
 *      omisión de node-pg-migrate. Si una falla, no queda nada a medias.
 *
 * No despliega el código. Eso es `git push upstream main`, y va inmediatamente
 * después: dejar producción con la base nueva y el código viejo es justo lo que
 * conviene que dure poco.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { Client } = require("pg");

const SERVICIO_PRODUCCION = "srv-d8ifjg5ckfvc73bosnbg";
const REGION = "oregon";
const HORAS_RESPALDO_VALIDO = 12;
const CARPETA_RESPALDOS = path.join(__dirname, "..", "..", "respaldos");
const RAIZ_BACKEND = path.join(__dirname, "..");
const CONFIRMAR = process.argv.includes("--confirmar");

function titulo(texto) {
  console.log(`\n${texto}`);
  console.log("-".repeat(texto.length));
}

function abortar(motivo) {
  console.error(`\nNo se aplicó nada. ${motivo}`);
  process.exit(1);
}

/**
 * La cadena que Render guarda en el servicio es la interna, que solo resuelve
 * dentro de su red. Desde fuera hay que usar el nombre público de la instancia,
 * el puerto y TLS.
 */
function aExterna(interna) {
  const url = new URL(interna);
  const base = url.pathname.replace(/^\//, "");

  return {
    base,
    cadena: `postgresql://${url.username}:${url.password}@${url.hostname}.${REGION}-postgres.render.com:5432/${base}?sslmode=no-verify`,
  };
}

async function cadenaDeProduccion() {
  const clave = process.env.RENDER_API_KEY;

  if (!clave) {
    abortar("Falta RENDER_API_KEY en el entorno: sin eso no se puede saber cuál es la base de producción.");
  }

  const respuesta = await fetch(
    `https://api.render.com/v1/services/${SERVICIO_PRODUCCION}/env-vars?limit=100`,
    { headers: { Authorization: `Bearer ${clave}`, Accept: "application/json" } }
  );

  if (!respuesta.ok) {
    abortar(`Render respondió ${respuesta.status} al pedir las variables del servicio de producción.`);
  }

  const variables = await respuesta.json();
  const fila = variables.find((v) => v.envVar && v.envVar.key === "DATABASE_URL");

  if (!fila) {
    abortar("El servicio de producción no tiene DATABASE_URL entre sus variables.");
  }

  return aExterna(fila.envVar.value);
}

/**
 * Busca el manifiesto de un respaldo de esta misma base, tomado hace poco. El
 * manifiesto es lo que deja la prueba de restauración, y es la única evidencia
 * de que el respaldo sirve.
 */
function respaldoReciente(nombreBase) {
  if (!fs.existsSync(CARPETA_RESPALDOS)) return null;

  const limite = Date.now() - HORAS_RESPALDO_VALIDO * 3600 * 1000;
  let mejor = null;

  for (const archivo of fs.readdirSync(CARPETA_RESPALDOS)) {
    if (!archivo.endsWith(".manifest.json")) continue;

    try {
      const manifiesto = JSON.parse(
        fs.readFileSync(path.join(CARPETA_RESPALDOS, archivo), "utf8")
      );

      if (manifiesto.base !== nombreBase) continue;

      const momento = Date.parse(manifiesto.generado_en);

      if (!Number.isFinite(momento) || momento < limite) continue;
      if (!mejor || momento > mejor.momento) {
        mejor = { archivo, momento, manifiesto };
      }
    } catch {
      // Un manifiesto ilegible simplemente no cuenta como respaldo.
    }
  }

  return mejor;
}

async function estado(cadena) {
  const cliente = new Client({ connectionString: cadena, ssl: { rejectUnauthorized: false } });
  await cliente.connect();

  const base = (await cliente.query("SELECT current_database() AS d")).rows[0].d;

  const hayTabla = await cliente.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'pgmigrations'`
  );

  const aplicadas =
    hayTabla.rows.length === 0
      ? []
      : (await cliente.query(`SELECT name FROM pgmigrations ORDER BY id`)).rows.map((f) => f.name);

  const estados = (
    await cliente.query(
      `SELECT COALESCE(estado, '(nulo)') AS estado, COUNT(*)::int AS n
       FROM comprobantes GROUP BY 1 ORDER BY n DESC`
    )
  ).rows;

  await cliente.end();

  const archivos = fs
    .readdirSync(path.join(__dirname, "..", "..", "database", "migrations"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => f.replace(/\.js$/, ""))
    .sort();

  return {
    base,
    archivos,
    aplicadas,
    pendientes: archivos.filter((a) => !aplicadas.includes(a)),
    estados,
  };
}

async function main() {
  titulo("1. Localizando la base de producción");

  const { base, cadena } = await cadenaDeProduccion();
  console.log(`   Render declara como producción la base: ${base}`);

  const antes = await estado(cadena);

  if (antes.base !== base) {
    abortar(`La conexión abrió "${antes.base}" y Render declara "${base}".`);
  }

  console.log(`   Conectado y verificado: ${antes.base}`);

  titulo("2. Migraciones");
  console.log(`   archivos: ${antes.archivos.length}`);
  console.log(`   aplicadas: ${antes.aplicadas.length}`);
  console.log(`   pendientes: ${antes.pendientes.length}`);
  for (const p of antes.pendientes) console.log(`     - ${p}`);

  if (antes.pendientes.length === 0) {
    console.log("\nNo hay nada pendiente. Producción ya está al día.");
    return;
  }

  titulo("3. Respaldo verificado");

  const respaldo = respaldoReciente(base);

  if (!respaldo) {
    abortar(
      `No hay un respaldo verificado de "${base}" de las últimas ${HORAS_RESPALDO_VALIDO} horas.\n` +
        `Tómalo y verifícalo primero:\n` +
        `  ORIGEN_DATABASE_URL=<produccion> node scripts/probar-restauracion.js`
    );
  }

  const horas = ((Date.now() - respaldo.momento) / 3600000).toFixed(1);
  console.log(`   ${respaldo.manifiesto.archivo_sql}`);
  console.log(`   tomado hace ${horas} h, ${respaldo.manifiesto.total_filas} filas`);

  titulo("4. Lo que va a cambiar en los datos");

  const eliminados = antes.estados.find((e) => e.estado === "eliminado");
  console.log(`   estados en comprobantes: ${antes.estados.map((e) => `${e.estado}=${e.n}`).join(", ")}`);

  if (eliminados) {
    console.log(
      `   ${eliminados.n} comprobante(s) en 'eliminado' pasan a 'anulado': el esquema nuevo\n` +
        `   tiene un solo dominio de estados y un comprobante que no está vigente está anulado.`
    );
  }

  if (!CONFIRMAR) {
    console.log(
      "\nRevisión terminada. No se aplicó nada.\n" +
        "Para aplicar: node scripts/migrar-produccion.js --confirmar"
    );
    return;
  }

  titulo("5. Aplicando las migraciones");

  try {
    const salida = execFileSync(
      "npx",
      ["node-pg-migrate", "--config-file", ".migraterc.json", "up"],
      {
        cwd: RAIZ_BACKEND,
        env: { ...process.env, DATABASE_URL: cadena },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      }
    );

    for (const linea of salida.split("\n")) {
      if (/MIGRATION|Migrations complete|ADVERTENCIA|no cumple/i.test(linea)) {
        console.log(`   ${linea.trim()}`);
      }
    }
  } catch (error) {
    console.error(error.stdout || "");
    console.error(error.stderr || "");
    abortar(
      "La migración falló. Corre en una sola transacción, así que la base quedó como estaba.\n" +
        "Compruébalo con: npm run migrate:status"
    );
  }

  titulo("6. Estado después");

  const despues = await estado(cadena);
  console.log(`   aplicadas: ${despues.aplicadas.length} de ${despues.archivos.length}`);
  console.log(`   pendientes: ${despues.pendientes.length}`);
  console.log(`   estados en comprobantes: ${despues.estados.map((e) => `${e.estado}=${e.n}`).join(", ")}`);

  if (despues.pendientes.length > 0) {
    abortar(`Quedaron ${despues.pendientes.length} migraciones sin aplicar.`);
  }

  console.log(
    "\nBASE DE PRODUCCIÓN AL DÍA.\n" +
      "Ahora el código, y sin dejar pasar tiempo:\n" +
      "  git push upstream main\n" +
      "Después: curl https://api.servcontablepro.cl/api/salud"
  );
}

main().catch((error) => {
  console.error(`\nFalló: ${error.message}`);
  process.exit(1);
});
