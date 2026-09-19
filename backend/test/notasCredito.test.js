/**
 * Signo tributario de las notas de crédito.
 *
 * REQUIERE VALIDACIÓN CONTABLE/TRIBUTARIA.
 *
 * Los montos de todos los documentos se guardan en positivo. Los resúmenes de
 * IVA, el F29 y el remanente sumaban con `SUM(iva)`, de modo que una nota de
 * crédito aumentaba el débito fiscal en lugar de rebajarlo. En la base de
 * producción existe una nota de crédito de compra guardada así, por lo que el
 * efecto sobre lo declarado es real.
 *
 * Estas pruebas fijan el tratamiento: el código 61 resta, el 56 suma, y el
 * resumen informa aparte cuánto rebajaron las notas de crédito.
 *
 *   DATABASE_URL=<staging o test> node --test test/notasCredito.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_notas_credito_no_prod_32_carac";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");
const {
  signoDocumento,
} = require("../src/helpers/documentoTributario.helper");

const SUFIJO = `ncr${Date.now().toString().slice(-8)}`;
const CLAVE = "NotasCredito-2026";
const CORREO = `${SUFIJO}@test.local`;
const PERIODO = "2026-03";

const ctx = {};

async function pedir(ruta) {
  const respuesta = await fetch(`${ctx.raiz}${ruta}`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });

  return { status: respuesta.status, datos: await respuesta.json().catch(() => ({})) };
}

async function venta({ folio, tipo, neto, iva, total }) {
  await pool.query(
    `INSERT INTO ventas (empresa_id, periodo, fecha, tipo_documento, sii_tipo_doc,
                         folio, rut_cliente, neto, exento, iva, total, estado)
     VALUES ($1, $2, '2026-03-10', $3, $4, $5, '11111111-1', $6, 0, $7, $8, 'vigente')`,
    [
      ctx.empresa,
      PERIODO,
      tipo === "61" ? "Nota de crédito" : "Factura afecta",
      tipo,
      folio,
      neto,
      iva,
      total,
    ]
  );
}

async function compra({ folio, tipo, neto, ivaCredito, total }) {
  await pool.query(
    `INSERT INTO compras (empresa_id, periodo, fecha, tipo_documento, sii_tipo_doc,
                          folio, rut_proveedor, neto, exento, iva_credito,
                          iva_no_recuperable, total, estado)
     VALUES ($1, $2, '2026-03-12', $3, $4, $5, '76123456-0', $6, 0, $7, 0, $8, 'vigente')`,
    [
      ctx.empresa,
      PERIODO,
      tipo === "61" ? "Nota de crédito" : "Factura afecta",
      tipo,
      folio,
      neto,
      ivaCredito,
      total,
    ]
  );
}

test.before(async () => {
  const base = (await pool.query("SELECT current_database() AS d")).rows[0].d;

  if (!/test|staging/i.test(base)) {
    throw new Error(`La base "${base}" no es de pruebas.`);
  }

  ctx.empresa = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa)
       VALUES ($1, $2, true) RETURNING id`,
      [`N${SUFIJO}-5`, `Empresa notas credito ${SUFIJO}`]
    )
  ).rows[0].id;

  const hash = await bcrypt.hash(CLAVE, 10);
  const usuarioId = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Notas', $1, $2, 'admin_cliente', true) RETURNING id`,
      [CORREO, hash]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo)
     VALUES ($1, $2, 'admin', true)`,
    [usuarioId, ctx.empresa]
  );

  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_id, status, billing_cycle, price,
                                currency, starts_at, expires_at, auto_renew, grace_days)
     SELECT $1, sp.id, 'ACTIVE', 'monthly', sp.monthly_price, 'CLP',
            CURRENT_DATE, CURRENT_DATE + 365, true, 5
     FROM subscription_plans sp WHERE sp.active = true ORDER BY sp.id LIMIT 1`,
    [usuarioId]
  );

  // Ventas: una factura de 1.000.000 + 190.000 y una nota de credito que rebaja
  // 100.000 + 19.000. El debito fiscal del periodo debe quedar en 171.000.
  await venta({ folio: "1001", tipo: "33", neto: 1000000, iva: 190000, total: 1190000 });
  await venta({ folio: "1002", tipo: "61", neto: 100000, iva: 19000, total: 119000 });

  // Compras: una factura de 500.000 + 95.000 y una nota de credito de
  // 50.000 + 9.500. El credito fiscal debe quedar en 85.500.
  await compra({ folio: "2001", tipo: "33", neto: 500000, ivaCredito: 95000, total: 595000 });
  await compra({ folio: "2002", tipo: "61", neto: 50000, ivaCredito: 9500, total: 59500 });

  const iniciado = await iniciarServidor({ host: "127.0.0.1", port: 0 });
  ctx.server = iniciado.server;
  ctx.raiz = `http://127.0.0.1:${iniciado.port}`;

  const login = await fetch(`${ctx.raiz}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: CORREO, password: CLAVE }),
  });

  ctx.token = (await login.json()).token;
  assert.ok(ctx.token);
});

test.after(async () => {
  if (ctx.server) await detenerServidor(ctx.server);
});

test("el signo se decide por el codigo del SII", () => {
  assert.equal(signoDocumento({ sii_tipo_doc: "33" }), 1, "factura afecta suma");
  assert.equal(signoDocumento({ sii_tipo_doc: "34" }), 1, "factura exenta suma");
  assert.equal(signoDocumento({ sii_tipo_doc: "39" }), 1, "boleta suma");
  assert.equal(signoDocumento({ sii_tipo_doc: "56" }), 1, "nota de debito suma");
  assert.equal(signoDocumento({ sii_tipo_doc: "61" }), -1, "nota de credito resta");
  assert.equal(signoDocumento({ sii_tipo_doc: "112" }), -1, "nota de credito de exportacion resta");
});

test("sin codigo del SII se mira el texto del tipo de documento", () => {
  // Los documentos creados a mano no siempre traen el codigo.
  assert.equal(signoDocumento({ tipo_documento: "Nota de crédito" }), -1);
  assert.equal(signoDocumento({ tipo_documento: "Nota de credito" }), -1);
  assert.equal(signoDocumento({ tipo_documento: "NOTA DE CRÉDITO" }), -1);
  assert.equal(signoDocumento({ tipo_documento: "Factura afecta" }), 1);
  assert.equal(signoDocumento({ tipo_documento: "Nota de débito" }), 1);
  assert.equal(signoDocumento({}), 1, "sin datos, suma");
});

test("el resumen de IVA resta las notas de credito", async () => {
  const { status, datos } = await pedir(
    `/api/resumen-iva?empresa_id=${ctx.empresa}&periodo=${PERIODO}`
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));

  assert.equal(Number(datos.ventas.iva_debito), 171000, "190.000 menos 19.000");
  assert.equal(Number(datos.ventas.neto), 900000, "1.000.000 menos 100.000");
  assert.equal(Number(datos.compras.iva_credito), 85500, "95.000 menos 9.500");
  assert.equal(Number(datos.compras.neto), 450000, "500.000 menos 50.000");

  // IVA determinado: 171.000 - 85.500
  assert.equal(Number(datos.resumen.iva_determinado), 85500);
  assert.equal(Number(datos.resumen.iva_pagar), 85500);
});

test("el resumen informa aparte el efecto de las notas de credito", async () => {
  // Para que un contador pueda revisar la rebaja de un vistazo.
  const { datos } = await pedir(
    `/api/resumen-iva?empresa_id=${ctx.empresa}&periodo=${PERIODO}`
  );

  assert.equal(Number(datos.ventas.notas_credito.iva), 19000);
  assert.equal(Number(datos.ventas.notas_credito.neto), 100000);
  assert.equal(Number(datos.compras.notas_credito.iva), 9500);
  assert.equal(datos.resumen.notas_credito_aplicadas, true);
});

test("el F29 usa las mismas cifras que el resumen de IVA", async () => {
  const iva = await pedir(`/api/resumen-iva?empresa_id=${ctx.empresa}&periodo=${PERIODO}`);
  const f29 = await pedir(`/api/resumen-f29?empresa_id=${ctx.empresa}&periodo=${PERIODO}`);

  assert.equal(f29.status, 200, JSON.stringify(f29.datos).slice(0, 200));

  const debitoF29 = Number(
    f29.datos?.ventas?.iva_debito ?? f29.datos?.resumen?.iva_debito ?? NaN
  );

  assert.equal(
    debitoF29,
    Number(iva.datos.ventas.iva_debito),
    "el F29 y el resumen de IVA no pueden discrepar"
  );
});

test("el remanente de IVA tambien resta las notas de credito", async () => {
  const { status, datos } = await pedir(
    `/api/remanente-iva?empresa_id=${ctx.empresa}&periodo=${PERIODO}`
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));

  const texto = JSON.stringify(datos);

  assert.ok(
    !texto.includes("190000"),
    "no debe aparecer el debito sin rebajar: " + texto.slice(0, 200)
  );
});

test("una nota de debito suma, no resta", async () => {
  await venta({ folio: "1003", tipo: "56", neto: 200000, iva: 38000, total: 238000 });

  const { datos } = await pedir(
    `/api/resumen-iva?empresa_id=${ctx.empresa}&periodo=${PERIODO}`
  );

  // 190.000 - 19.000 + 38.000
  assert.equal(Number(datos.ventas.iva_debito), 209000);
});
