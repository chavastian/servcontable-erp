/**
 * La revisión que faltaba: un documento cuyo monto no dice lo mismo que su
 * propio asiento.
 *
 * Reproduce el caso real de la factura 79386404 de ESTRUCTURAS JYJ. Entró en
 * cero junto con su asiento el 14-09-2026, y al día siguiente alguien corrigió
 * el asiento a mano con los 177.248 de la factura sin corregir el documento.
 * Durante meses el libro de compras mostró cero mientras el balance cargaba los
 * 177.248. Ninguna de las catorce revisiones comparaba las dos cosas, así que
 * nadie lo vio.
 *
 *   DATABASE_URL=<staging o test> node --test test/revision-documento-asiento.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";

const pool = require("../src/database/db");
const {
  documentosContraAsiento,
  revisarPeriodo,
  ESTADOS,
} = require("../src/helpers/revisiones.helper");

const SUFIJO = `rda${Date.now().toString().slice(-7)}`;
const RANGO = { desde: "2042-01-01", hasta: "2042-01-31" };
const ctx = {};

async function comprobante(numero, totalDebe) {
  const { rows } = await pool.query(
    `INSERT INTO comprobantes
       (empresa_id, periodo, fecha, tipo, numero, glosa, total_debe, total_haber, estado)
     VALUES ($1, '2042-01', '2042-01-15', 'Compra', $2, 'Prueba revision', $3, $3, 'vigente')
     RETURNING id`,
    [ctx.empresa, numero, totalDebe]
  );

  return rows[0].id;
}

async function compra(folio, total, comprobanteId) {
  const { rows } = await pool.query(
    `INSERT INTO compras
       (empresa_id, periodo, fecha, tipo_documento, folio, rut_proveedor,
        razon_social_proveedor, neto, exento, iva_credito, total, estado,
        comprobante_id, sii_tipo_doc)
     VALUES ($1, '2042-01', '2042-01-15', 'Factura afecta', $2, '76134941-4',
             'PROVEEDOR DE PRUEBA', 0, 0, 0, $3, 'vigente', $4, '33')
     RETURNING id`,
    [ctx.empresa, folio, total, comprobanteId]
  );

  return rows[0].id;
}

test.before(async () => {
  const base = (await pool.query("SELECT current_database() AS d")).rows[0].d;

  if (!/test|staging/i.test(base)) {
    throw new Error(`La base "${base}" no es de pruebas.`);
  }

  ctx.empresa = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa) VALUES ($1, $2, true) RETURNING id`,
      [`RA${SUFIJO}-3`, `Empresa revision ${SUFIJO}`]
    )
  ).rows[0].id;
});

test.after(async () => {
  await pool.end();
});

test("sin documentos el período está correcto", async () => {
  const r = await documentosContraAsiento(pool, ctx.empresa, RANGO);

  assert.equal(r.estado, ESTADOS.OK);
  assert.equal(r.cantidad, 0);
});

test("un documento que coincide con su asiento no se marca", async () => {
  const comp = await comprobante(9101, 177248);
  await compra("1001", 177248, comp);

  const r = await documentosContraAsiento(pool, ctx.empresa, RANGO);

  assert.equal(r.estado, ESTADOS.OK, JSON.stringify(r.afectados));
});

test("un peso de diferencia es redondeo y se tolera", async () => {
  const comp = await comprobante(9102, 10000);
  await compra("1002", 10001, comp);

  const r = await documentosContraAsiento(pool, ctx.empresa, RANGO);

  assert.equal(r.estado, ESTADOS.OK, "un peso no es un error de captura");
});

test("el caso de la factura 79386404: documento en cero, asiento con el monto", async () => {
  const comp = await comprobante(9103, 177248);
  const id = await compra("79386404", 0, comp);

  const r = await documentosContraAsiento(pool, ctx.empresa, RANGO);

  assert.equal(r.estado, ESTADOS.ERROR, "tiene que ser error, no aviso");
  assert.equal(r.cantidad, 1);

  const afectado = r.afectados.find((a) => a.id === id);
  assert.ok(afectado, "aparece el documento exacto");
  assert.equal(afectado.folio, "79386404");
  assert.equal(afectado.total_documento, 0);
  assert.equal(afectado.total_asiento, 177248);
  assert.equal(afectado.diferencia, 177248);
  assert.equal(afectado.origen, "compra");
  assert.equal(afectado.comprobante, 9103, "dice qué asiento revisar");
});

test("un documento anulado deja de contar", async () => {
  const antes = await documentosContraAsiento(pool, ctx.empresa, RANGO);
  assert.equal(antes.cantidad, 1);

  await pool.query(
    `UPDATE compras SET estado = 'anulado' WHERE empresa_id = $1 AND folio = '79386404'`,
    [ctx.empresa]
  );

  const despues = await documentosContraAsiento(pool, ctx.empresa, RANGO);
  assert.equal(despues.estado, ESTADOS.OK, "lo anulado ya no descuadra nada");
});

test("la revisión entra en el cierre mensual y bloquea el período", async () => {
  // Se vuelve a dejar el descuadre para ver el efecto sobre el resumen.
  await pool.query(
    `UPDATE compras SET estado = 'vigente' WHERE empresa_id = $1 AND folio = '79386404'`,
    [ctx.empresa]
  );

  const periodo = await revisarPeriodo(pool, ctx.empresa, "2042-01");
  const revision = periodo.revisiones.find((r) => r.codigo === "documentos_contra_asiento");

  assert.ok(revision, "la revisión forma parte del cierre mensual");
  assert.equal(revision.estado, ESTADOS.ERROR);
  assert.equal(
    periodo.resumen.listo_para_declarar,
    false,
    "un período con esto no se declara tranquilo"
  );
});
