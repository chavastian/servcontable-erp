/**
 * Migración base: esquema existente en producción al 2026-09-18.
 *
 * Es idempotente y no destructiva: contra la base de producción, que ya tiene
 * estas tablas, no cambia nada. Contra una base vacía crea el esquema completo
 * y permite que una instalación limpia arranque (hallazgo C7 de la auditoría).
 *
 * El contenido proviene de database/schema.sql, generado por introspección.
 */

const fs = require("fs");
const path = require("path");

const RUTA_ESQUEMA = path.join(__dirname, "..", "schema.sql");

exports.up = async (pgm) => {
  const sql = fs.readFileSync(RUTA_ESQUEMA, "utf8");

  // schema.sql trae su propio BEGIN/COMMIT; node-pg-migrate ya envuelve en
  // transacción, así que se quitan para no anidar.
  const cuerpo = sql
    .replace(/^\s*BEGIN;\s*$/m, "")
    .replace(/^\s*COMMIT;\s*$/m, "");

  pgm.sql(cuerpo);
};

exports.down = () => {
  throw new Error(
    "La migración base no se revierte: eliminaría todo el esquema. " +
      "Para volver atrás, restaurar un respaldo de la base."
  );
};
