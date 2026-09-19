#!/usr/bin/env node
/**
 * Prueba de restauración de extremo a extremo.
 *
 * Un respaldo que nunca se restauró es una suposición, no un respaldo. Este
 * script lo comprueba de verdad:
 *
 *   1. Toma un respaldo de la base indicada en ORIGEN_DATABASE_URL.
 *   2. Crea una base nueva y descartable.
 *   3. Aplica las migraciones y restaura el respaldo.
 *   4. Compara tabla por tabla el número de filas y una huella MD5 del
 *      contenido contra el manifiesto.
 *   5. Arranca la API contra esa base y recorre los endpoints principales.
 *   6. Borra la base de prueba.
 *
 * Si algo no coincide, termina con código 1 y dice qué falló.
 *
 *   ORIGEN_DATABASE_URL=<produccion> node scripts/probar-restauracion.js
 *
 * No escribe nada en la base de origen: la lee con la transacción en modo de
 * solo lectura.
 */

require("dotenv").config();

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ORIGEN = process.env.ORIGEN_DATABASE_URL || process.env.DATABASE_URL;
// El nombre lleva "test" a proposito: restaurar.js y smoke-api.js se niegan a
// correr contra una base cuyo nombre no lo diga, y esa guarda tiene que seguir
// valiendo. Que este script tenga que cumplirla es la prueba de que sirve.
const NOMBRE_PRUEBA = `servcontable_test_restauracion_${Date.now().toString().slice(-6)}`;
const CARPETA = path.join(__dirname, "..", "..", "respaldos");
const RAIZ_BACKEND = path.join(__dirname, "..");

function paso(numero, texto) {
  console.log(`\n[${numero}] ${texto}`);
}

function correr(comando, argumentos, entorno = {}) {
  return execFileSync(comando, argumentos, {
    cwd: RAIZ_BACKEND,
    env: { ...process.env, ...entorno },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
}

function urlConBase(url, nombre) {
  return url.replace(/\/[^/?]+(\?|$)/, `/${nombre}$1`);
}

async function conectar(url) {
  const cliente = new Client({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false },
  });

  await cliente.connect();
  return cliente;
}

async function main() {
  if (!ORIGEN) {
    throw new Error("Falta ORIGEN_DATABASE_URL");
  }

  const urlPrueba = urlConBase(ORIGEN, NOMBRE_PRUEBA);
  let baseCreada = false;

  try {
    paso(1, "Tomando respaldo del origen");

    const salida = correr("node", ["scripts/respaldo.js"], { DATABASE_URL: ORIGEN });
    const rutaSql = (salida.match(/Respaldo: (.+\.sql)/) || [])[1];

    if (!rutaSql || !fs.existsSync(rutaSql.trim())) {
      throw new Error(`No se encontro el archivo del respaldo:\n${salida}`);
    }

    const archivo = rutaSql.trim();
    const manifiesto = JSON.parse(
      fs.readFileSync(archivo.replace(/\.sql$/, ".manifest.json"), "utf8")
    );

    console.log(
      `    ${Object.keys(manifiesto.tablas).length} tablas, ${manifiesto.total_filas} filas`
    );

    paso(2, `Creando base descartable ${NOMBRE_PRUEBA}`);

    const administrador = await conectar(ORIGEN);
    await administrador.query(`CREATE DATABASE ${NOMBRE_PRUEBA}`);
    await administrador.end();
    baseCreada = true;

    // El esquema se lleva exactamente al punto en que estaba la base de origen
    // cuando se tomó el respaldo, no al último.
    //
    // Los datos corresponden a ese esquema. Cargarlos sobre migraciones
    // posteriores puede chocar con una restricción que entonces no existía: el
    // respaldo de producción trae los roles de empresa en el formato anterior,
    // y la migración de roles agrega una restricción que los rechaza. Una
    // recuperación real habría fallado justo cuando más se necesita.
    const hasta = Number(manifiesto.migraciones_aplicadas ?? 0);

    if (hasta > 0) {
      paso(3, `Llevando el esquema a la migración ${hasta}, la del respaldo`);
      correr(
        "npx",
        ["node-pg-migrate", "--config-file", ".migraterc.json", "up", String(hasta)],
        { DATABASE_URL: `${urlPrueba}?sslmode=no-verify` }
      );
    } else {
      // Un respaldo anterior a las migraciones: se usa el esquema base.
      paso(3, "El respaldo no registra migraciones: se aplica solo el esquema base");
      correr("npx", ["node-pg-migrate", "--config-file", ".migraterc.json", "up", "1"], {
        DATABASE_URL: `${urlPrueba}?sslmode=no-verify`,
      });
    }

    paso(4, "Restaurando y verificando contra el manifiesto");

    const restauracion = correr("node", ["scripts/restaurar.js", archivo], {
      DATABASE_URL: urlPrueba,
    });

    console.log(
      restauracion
        .split("\n")
        .filter((linea) => linea.trim())
        .map((linea) => `    ${linea.trim()}`)
        .join("\n")
    );

    if (!/OK: \d+ tablas/.test(restauracion)) {
      throw new Error("La verificacion contra el manifiesto no dio OK");
    }

    paso(5, "Aplicando las migraciones que faltaban, ya con los datos dentro");

    // Este paso es el que de verdad se prueba: una recuperación real termina con
    // el esquema al día, y una migración que transforma datos tiene que poder
    // con los datos reales, no con una base vacía.
    correr("npx", ["node-pg-migrate", "--config-file", ".migraterc.json", "up"], {
      DATABASE_URL: `${urlPrueba}?sslmode=no-verify`,
    });

    const posteriores = await conectar(urlPrueba);
    const { rows: aplicadas } = await posteriores.query(
      "SELECT COUNT(*)::int AS n FROM pgmigrations"
    );
    const { rows: rolesTraducidos } = await posteriores.query(
      `SELECT rol_empresa, COUNT(*)::int AS n
       FROM usuarios_empresas GROUP BY 1 ORDER BY 1`
    );
    await posteriores.end();

    console.log(`    migraciones al día: ${aplicadas[0].n}`);
    console.log(
      `    roles tras migrar: ${rolesTraducidos
        .map((f) => `${f.rol_empresa}=${f.n}`)
        .join(", ")}`
    );

    paso(6, "Arrancando la API contra la base restaurada");

    const humo = correr("node", ["scripts/smoke-api.js"], {
      DATABASE_URL: urlPrueba,
      DATABASE_SSL: "true",
      NODE_ENV: "test",
      COBRANZA_AUTOMATICA: "false",
    });

    const resumen = (humo.match(/Total: (\d+) ok, (\d+) fallas/) || []).slice(1);

    if (resumen.length !== 2) {
      throw new Error(`La prueba de humo no informo resultado:\n${humo.slice(-500)}`);
    }

    console.log(`    ${resumen[0]} endpoints responden, ${resumen[1]} fallas`);

    if (Number(resumen[1]) > 0) {
      throw new Error(`${resumen[1]} endpoints fallaron sobre la base restaurada`);
    }

    console.log("\nRESTAURACION VERIFICADA");
    console.log(`  respaldo: ${path.basename(archivo)}`);
    console.log(`  filas comprobadas: ${manifiesto.total_filas}`);
    console.log(`  endpoints comprobados: ${resumen[0]}`);
  } finally {
    if (baseCreada) {
      paso(7, "Borrando la base de prueba");

      try {
        const administrador = await conectar(ORIGEN);
        await administrador.query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
          [NOMBRE_PRUEBA]
        );
        await administrador.query(`DROP DATABASE IF EXISTS ${NOMBRE_PRUEBA}`);
        await administrador.end();
        console.log("    borrada");
      } catch (error) {
        console.error(
          `    no se pudo borrar ${NOMBRE_PRUEBA}: ${error.message}. Hay que borrarla a mano.`
        );
      }
    }
  }
}

main().catch((error) => {
  console.error(`\nLA PRUEBA DE RESTAURACION FALLO: ${error.message}`);
  process.exit(1);
});
