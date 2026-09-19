/**
 * El puente entre el esquema nuevo y el código que todavía corre en producción.
 *
 * Producción elimina una liquidación contabilizada escribiendo
 * `comprobantes.estado = 'eliminado'`. El esquema nuevo solo admite 'vigente' y
 * 'anulado', así que sin el disparador de la migración
 * `1758201600000_bloque13-compatibilidad-estado-eliminado` ese borrado fallaría
 * con un error de restricción mientras la base está migrada y el código no.
 *
 * Esta prueba reproduce exactamente esa sentencia. Si alguien revierte el
 * disparador antes de que producción corra el código nuevo, se pone roja.
 *
 *   DATABASE_URL=<staging o test> node --test test/compatibilidad-estado.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";

const pool = require("../src/database/db");

const SUFIJO = `compat${Date.now().toString().slice(-7)}`;
const ctx = {};

test.before(async () => {
  const base = (await pool.query("SELECT current_database() AS d")).rows[0].d;

  if (!/test|staging/i.test(base)) {
    throw new Error(`La base "${base}" no es de pruebas.`);
  }

  ctx.empresa = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa) VALUES ($1, $2, true) RETURNING id`,
      [`CP${SUFIJO}-9`, `Empresa compatibilidad ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.comprobante = (
    await pool.query(
      `INSERT INTO comprobantes
         (empresa_id, periodo, fecha, tipo, numero, glosa, total_debe, total_haber, estado)
       VALUES ($1, '2041-07', '2041-07-15', 'Traspaso', 9001, 'Prueba de compatibilidad', 0, 0, 'vigente')
       RETURNING id`,
      [ctx.empresa]
    )
  ).rows[0].id;
});

test.after(async () => {
  await pool.end();
});

test("existe el disparador de compatibilidad sobre comprobantes", async () => {
  const { rows } = await pool.query(
    `SELECT tgname FROM pg_trigger
     WHERE tgrelid = 'comprobantes'::regclass AND tgname = 'trg_traducir_estado_eliminado'`
  );

  assert.equal(rows.length, 1, "la migración de compatibilidad no está aplicada");
});

test("la sentencia del código de producción no falla y deja el comprobante anulado", async () => {
  // Copiada del código que hoy corre en producción, rama de `estaContabilizada`
  // de liquidaciones.controller.js.
  await pool.query(
    `UPDATE comprobantes
     SET estado = 'eliminado'
     WHERE id = $1
       AND empresa_id = $2
       AND COALESCE(estado, 'vigente') <> 'eliminado'`,
    [ctx.comprobante, ctx.empresa]
  );

  const { rows } = await pool.query(`SELECT estado FROM comprobantes WHERE id = $1`, [
    ctx.comprobante,
  ]);

  assert.equal(rows[0].estado, "anulado", "el disparador tenía que traducir el valor");
});

test("el estado que sí es válido pasa sin que nadie lo toque", async () => {
  await pool.query(`UPDATE comprobantes SET estado = 'vigente' WHERE id = $1`, [ctx.comprobante]);

  const vigente = await pool.query(`SELECT estado FROM comprobantes WHERE id = $1`, [
    ctx.comprobante,
  ]);
  assert.equal(vigente.rows[0].estado, "vigente");

  await pool.query(`UPDATE comprobantes SET estado = 'anulado' WHERE id = $1`, [ctx.comprobante]);

  const anulado = await pool.query(`SELECT estado FROM comprobantes WHERE id = $1`, [
    ctx.comprobante,
  ]);
  assert.equal(anulado.rows[0].estado, "anulado");
});

test("un estado que no existe en el dominio sigue siendo rechazado", async () => {
  // El disparador traduce un valor concreto, no abre la puerta a cualquiera.
  await assert.rejects(
    pool.query(`UPDATE comprobantes SET estado = 'inventado' WHERE id = $1`, [ctx.comprobante]),
    /violates check constraint|restricción/i
  );
});

test("también traduce al insertar, no solo al actualizar", async () => {
  const { rows } = await pool.query(
    `INSERT INTO comprobantes
       (empresa_id, periodo, fecha, tipo, numero, glosa, total_debe, total_haber, estado)
     VALUES ($1, '2041-08', '2041-08-15', 'Traspaso', 9002, 'Inserción con estado viejo', 0, 0, 'eliminado')
     RETURNING estado`,
    [ctx.empresa]
  );

  assert.equal(rows[0].estado, "anulado");
});
