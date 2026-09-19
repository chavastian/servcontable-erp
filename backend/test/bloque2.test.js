/**
 * Bloque 2 de la revisión del 19-09-2026: anular y editar documentos.
 *
 * No existía forma de anular ni corregir una compra o una venta. Una factura
 * mal digitada solo se "arreglaba" anulando su asiento, y el documento seguía
 * sumando en libros, resumen de IVA y F29.
 *
 *   DATABASE_URL=<staging o test> node --test test/bloque2.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_bloque2_no_produccion_32_carac";
process.env.COBRANZA_AUTOMATICA = "false";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");

const SUFIJO = `b2${Date.now().toString().slice(-8)}`;
const CLAVE = "Bloque2-2026";
const CORREO = `${SUFIJO}@test.local`;
const ctx = {};

async function enviar(ruta, cuerpo, metodo = "POST") {
  const respuesta = await fetch(`${ctx.raiz}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });

  return { status: respuesta.status, datos: await respuesta.json().catch(() => ({})) };
}

async function pedir(ruta) {
  const respuesta = await fetch(`${ctx.raiz}${ruta}`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });

  return { status: respuesta.status, datos: await respuesta.json().catch(() => ({})) };
}

async function cuenta(codigo, nombre, tipo, naturaleza) {
  const { rows } = await pool.query(
    `INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, naturaleza, nivel, activo)
     VALUES ($1, $2, $3, $4, $5, 4, true) RETURNING id`,
    [ctx.empresa, codigo, nombre, tipo, naturaleza]
  );

  return rows[0].id;
}

function compra(extra = {}) {
  return {
    empresa_id: ctx.empresa,
    fecha: "2026-06-10",
    tipo_documento: "Factura afecta",
    folio: "500",
    rut_proveedor: "76111222-8",
    razon_social_proveedor: "Proveedor Uno",
    neto: 100000,
    exento: 0,
    iva_credito: 19000,
    total: 119000,
    cuenta_gasto_id: ctx.gasto,
    generar_comprobante: true,
    fecha_vencimiento: "2026-07-10",
    ...extra,
  };
}

function venta(extra = {}) {
  return {
    empresa_id: ctx.empresa,
    fecha: "2026-06-12",
    tipo_documento: "Factura afecta",
    folio: "80",
    rut_cliente: "12345678-5",
    razon_social_cliente: "Cliente Uno",
    neto: 200000,
    exento: 0,
    iva: 38000,
    total: 238000,
    cuenta_ingreso_id: ctx.ventas,
    generar_comprobante: true,
    ...extra,
  };
}

async function estadoComprobante(id) {
  const { rows } = await pool.query(`SELECT estado, motivo_anulacion FROM comprobantes WHERE id = $1`, [id]);
  return rows[0];
}

test.before(async () => {
  const base = (await pool.query("SELECT current_database() AS d")).rows[0].d;

  if (!/test|staging/i.test(base)) {
    throw new Error(`La base "${base}" no es de pruebas.`);
  }

  ctx.empresa = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa) VALUES ($1, $2, true) RETURNING id`,
      [`B2${SUFIJO}-1`, `Empresa bloque2 ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.caja = await cuenta("1101001", "Caja", "Activo", "Deudora");
  ctx.clientes = await cuenta("1103001", "Clientes", "Activo", "Deudora");
  ctx.ivaCredito = await cuenta("1300901", "IVA credito", "Activo", "Deudora");
  ctx.proveedores = await cuenta("2101005", "Proveedores", "Pasivo", "Acreedora");
  ctx.ivaDebito = await cuenta("2101031", "IVA debito", "Pasivo", "Acreedora");
  ctx.gasto = await cuenta("3101001", "Gastos", "Pérdida", "Deudora");
  ctx.arriendo = await cuenta("3101020", "Arriendos", "Pérdida", "Deudora");
  ctx.ventas = await cuenta("4101001", "Ventas", "Ganancia", "Acreedora");

  await pool.query(
    `INSERT INTO configuracion_contable
       (empresa_id, cuenta_clientes_id, cuenta_proveedores_id, cuenta_caja_banco_id,
        cuenta_iva_debito_id, cuenta_iva_credito_id, cuenta_ingreso_defecto_id, cuenta_gasto_defecto_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [ctx.empresa, ctx.clientes, ctx.proveedores, ctx.caja, ctx.ivaDebito, ctx.ivaCredito, ctx.ventas, ctx.gasto]
  );

  // Ejercicio 2024 cerrado, para probar el bloqueo.
  await pool.query(
    `INSERT INTO ejercicios_contables (empresa_id, anio, estado, fecha_inicio, fecha_termino)
     VALUES ($1, 2024, 'cerrado', '2024-01-01', '2024-12-31')`,
    [ctx.empresa]
  );

  const hash = await bcrypt.hash(CLAVE, 10);
  ctx.usuario = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Bloque2', $1, $2, 'admin_cliente', true) RETURNING id`,
      [CORREO, hash]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo) VALUES ($1, $2, 'OWNER', true)`,
    [ctx.usuario, ctx.empresa]
  );

  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_id, status, billing_cycle, price,
                                currency, starts_at, expires_at, auto_renew, grace_days)
     SELECT $1, sp.id, 'ACTIVE', 'monthly', sp.monthly_price, 'CLP',
            CURRENT_DATE, CURRENT_DATE + 365, true, 5
     FROM subscription_plans sp WHERE sp.active = true ORDER BY sp.id LIMIT 1`,
    [ctx.usuario]
  );

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

test("crear una compra guarda la fecha de vencimiento", async () => {
  const { status, datos } = await enviar("/api/compras", compra());
  assert.equal(status, 201, JSON.stringify(datos).slice(0, 200));

  ctx.compra = datos.compra;
  assert.equal(String(ctx.compra.fecha_vencimiento).slice(0, 10), "2026-07-10");
  assert.ok(ctx.compra.comprobante_id);
});

test("anular una compra pide motivo, la deja anulada con rastro y anula su asiento", async () => {
  const sinMotivo = await enviar(`/api/compras/${ctx.compra.id}/anular`, { empresa_id: ctx.empresa }, "PUT");
  assert.equal(sinMotivo.status, 400);

  const { status, datos } = await enviar(
    `/api/compras/${ctx.compra.id}/anular`,
    { empresa_id: ctx.empresa, motivo: "Factura duplicada" },
    "PUT"
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));

  const { rows } = await pool.query(
    `SELECT estado, anulado_por, anulado_en, motivo_anulacion, comprobante_id FROM compras WHERE id = $1`,
    [ctx.compra.id]
  );

  assert.equal(rows[0].estado, "anulado");
  assert.equal(Number(rows[0].anulado_por), ctx.usuario);
  assert.ok(rows[0].anulado_en);
  assert.equal(rows[0].motivo_anulacion, "Factura duplicada");
  assert.equal(Number(rows[0].comprobante_id), Number(ctx.compra.comprobante_id), "el enlace al asiento se conserva");

  const asiento = await estadoComprobante(ctx.compra.comprobante_id);
  assert.equal(asiento.estado, "anulado");
  assert.match(asiento.motivo_anulacion, /Factura duplicada/);
});

test("una compra anulada no suma en el resumen de IVA", async () => {
  const { datos } = await pedir(`/api/resumen-iva?empresa_id=${ctx.empresa}&periodo=2026-06`);
  assert.equal(Number(datos.compras.iva_credito), 0);
});

test("anular dos veces responde 409 y editar una anulada tambien", async () => {
  const otraVez = await enviar(
    `/api/compras/${ctx.compra.id}/anular`,
    { empresa_id: ctx.empresa, motivo: "de nuevo" },
    "PUT"
  );
  assert.equal(otraVez.status, 409);

  const editar = await enviar(`/api/compras/${ctx.compra.id}`, { empresa_id: ctx.empresa, neto: 1 }, "PUT");
  assert.equal(editar.status, 409);
});

test("editar una compra cambia el documento, anula el asiento viejo y genera uno nuevo", async () => {
  const creada = await enviar("/api/compras", compra({ folio: "501" }));
  assert.equal(creada.status, 201);
  const original = creada.datos.compra;

  const { status, datos } = await enviar(
    `/api/compras/${original.id}`,
    { empresa_id: ctx.empresa, neto: 150000, iva_credito: 28500, total: 178500, cuenta_gasto_id: ctx.arriendo },
    "PUT"
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));
  assert.equal(Number(datos.documento.total), 178500);
  assert.equal(Number(datos.documento.cuenta_gasto_id), ctx.arriendo);
  assert.notEqual(Number(datos.documento.comprobante_id), Number(original.comprobante_id));

  const viejo = await estadoComprobante(original.comprobante_id);
  assert.equal(viejo.estado, "anulado");
  assert.match(viejo.motivo_anulacion, /edici/);

  const { rows } = await pool.query(
    `SELECT cuenta_id, debe::numeric AS debe FROM comprobante_detalle WHERE comprobante_id = $1 AND cuenta_id = $2`,
    [datos.documento.comprobante_id, ctx.arriendo]
  );
  assert.equal(Number(rows[0].debe), 150000, "el asiento nuevo usa la cuenta y el monto nuevos");
});

test("con un pago vigente no se puede anular ni cambiar el monto", async () => {
  const creada = await enviar("/api/compras", compra({ folio: "502" }));
  const doc = creada.datos.compra;

  await pool.query(
    `INSERT INTO pagos_cobros (empresa_id, tipo_movimiento, tipo_documento, documento_id, fecha, periodo,
                               rut_tercero, nombre_tercero, monto, estado)
     VALUES ($1, 'Pago', 'Compra', $2, '2026-06-20', '2026-06', '76111222-8', 'Proveedor Uno', 50000, 'vigente')`,
    [ctx.empresa, doc.id]
  );

  const anular = await enviar(`/api/compras/${doc.id}/anular`, { empresa_id: ctx.empresa, motivo: "prueba" }, "PUT");
  assert.equal(anular.status, 409);
  assert.match(anular.datos.error, /pago/i);

  const editar = await enviar(`/api/compras/${doc.id}`, { empresa_id: ctx.empresa, total: 1 }, "PUT");
  assert.equal(editar.status, 409);

  // Cambiar algo que no es monto si se puede.
  const glosa = await enviar(`/api/compras/${doc.id}`, { empresa_id: ctx.empresa, fecha_vencimiento: "2026-08-01" }, "PUT");
  assert.equal(glosa.status, 200, JSON.stringify(glosa.datos).slice(0, 200));
});

test("no se anula un documento de un ejercicio cerrado", async () => {
  const { rows } = await pool.query(
    `INSERT INTO compras (empresa_id, periodo, fecha, tipo_documento, sii_tipo_doc, folio, rut_proveedor,
                          razon_social_proveedor, neto, iva_credito, total, estado)
     VALUES ($1, '2024-03', '2024-03-05', 'Factura afecta', '33', '9', '76111222-8', 'Viejo', 1000, 190, 1190, 'vigente')
     RETURNING id`,
    [ctx.empresa]
  );

  const { status } = await enviar(`/api/compras/${rows[0].id}/anular`, { empresa_id: ctx.empresa, motivo: "cerrado" }, "PUT");
  assert.equal(status, 409);
});

test("anular y editar ventas funciona igual", async () => {
  const creada = await enviar("/api/ventas", venta());
  assert.equal(creada.status, 201, JSON.stringify(creada.datos).slice(0, 200));
  const doc = creada.datos.venta;
  assert.equal(doc.sii_tipo_doc, "33");

  const editada = await enviar(
    `/api/ventas/${doc.id}`,
    { empresa_id: ctx.empresa, neto: 300000, iva: 57000, total: 357000 },
    "PUT"
  );
  assert.equal(editada.status, 200, JSON.stringify(editada.datos).slice(0, 200));
  assert.equal(Number(editada.datos.documento.total), 357000);

  const anulada = await enviar(`/api/ventas/${doc.id}/anular`, { empresa_id: ctx.empresa, motivo: "Cliente rechazo" }, "PUT");
  assert.equal(anulada.status, 200);

  const iva = await pedir(`/api/resumen-iva?empresa_id=${ctx.empresa}&periodo=2026-06`);
  assert.equal(Number(iva.datos.ventas.iva_debito), 0);
});

test("un rol CONSULTA no puede anular", async () => {
  const correo = `consulta${SUFIJO}@test.local`;
  const hash = await bcrypt.hash(CLAVE, 10);
  const id = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES ('c', $1, $2, 'usuario', true) RETURNING id`,
      [correo, hash]
    )
  ).rows[0].id;
  await pool.query(`INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo) VALUES ($1, $2, 'CONSULTA', true)`, [id, ctx.empresa]);
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_id, status, billing_cycle, price, currency, starts_at, expires_at, auto_renew, grace_days)
     SELECT $1, sp.id, 'ACTIVE', 'monthly', sp.monthly_price, 'CLP', CURRENT_DATE, CURRENT_DATE + 365, true, 5
     FROM subscription_plans sp WHERE sp.active = true ORDER BY sp.id LIMIT 1`,
    [id]
  );
  const login = await fetch(`${ctx.raiz}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: correo, password: CLAVE }),
  });
  const token = (await login.json()).token;

  const creada = await enviar("/api/compras", compra({ folio: "503" }));
  const respuesta = await fetch(`${ctx.raiz}/api/compras/${creada.datos.compra.id}/anular`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ empresa_id: ctx.empresa, motivo: "no deberia" }),
  });

  assert.equal(respuesta.status, 403);
});

test("el flujo de caja usa la fecha de vencimiento real cuando existe", async () => {
  const { status, datos } = await pedir(`/api/flujo-caja?empresa_id=${ctx.empresa}&plazo_dias=30`);
  assert.equal(status, 200);

  const conVencimiento = datos.por_pagar.detalle.find((d) => d.folio === "501");
  assert.ok(conVencimiento, "la compra editada sigue pendiente");
  assert.equal(conVencimiento.vencimiento_estimado, "2026-07-10");
  assert.equal(conVencimiento.vencimiento_real, true);
});
