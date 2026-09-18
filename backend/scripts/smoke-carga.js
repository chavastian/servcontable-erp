#!/usr/bin/env node
/**
 * Carga todos los modulos del backend para detectar referencias rotas,
 * importaciones inexistentes y errores de sintaxis. No abre conexiones:
 * el pool de pg es perezoso, asi que basta con un DATABASE_URL cualquiera.
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://smoke:smoke@127.0.0.1:5432/smoke";

const fs = require("fs");
const path = require("path");

const DIRECTORIOS = [
  "src/config",
  "src/database",
  "src/helpers",
  "src/middleware",
  "src/controllers",
  "src/routes",
];

const raiz = path.join(__dirname, "..");
let cargados = 0;
const fallas = [];

for (const directorio of DIRECTORIOS) {
  const ruta = path.join(raiz, directorio);

  if (!fs.existsSync(ruta)) {
    continue;
  }

  for (const archivo of fs.readdirSync(ruta).filter((n) => n.endsWith(".js"))) {
    const completo = path.join(ruta, archivo);

    try {
      require(completo);
      cargados += 1;
    } catch (error) {
      fallas.push(`${directorio}/${archivo}: ${error.message.split("\n")[0]}`);
    }
  }
}

try {
  require(path.join(raiz, "src", "app.js"));
  cargados += 1;
} catch (error) {
  fallas.push(`src/app.js: ${error.message.split("\n")[0]}`);
}

fallas.forEach((falla) => console.error(`FALLA ${falla}`));
console.log(`Modulos cargados: ${cargados} | fallas: ${fallas.length}`);
process.exit(fallas.length > 0 ? 1 : 0);
