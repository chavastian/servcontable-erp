/**
 * Bloque 3 de la revisión del 19-09-2026: F29 completo y parámetros nacionales.
 *
 * - Remanente en UTM, encadenado desde el período anterior.
 * - PPM sobre ingresos brutos con la tasa guardada en la empresa.
 * - IVA retenido de facturas de compra, crédito proporcional del uso común.
 * - Registro del F29 presentado y su cruce en el cierre mensual y el panel.
 * - Impuesto único por la tabla legal en UTM cuando la empresa no cargó tramos.
 *
 *   DATABASE_URL=<staging o test> node --test test/bloque3.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_bloque3_no_produccion_32_carac";
process.env.COBRANZA_AUTOMATICA = "false";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");
const { calcularImpuestoUnicoLegal } = require("../src/helpers/impuestoUnicoLegal.helper");

const SUFIJO = `b3${Date.now().toString().slice(-8)}`;
const CLAVE = "Bloque3-2026";
const CORREO = `${SUFIJO}@test.local`;
// Períodos lejanos en el pasado, para no chocar con parámetros nacionales de otros.
const P1 = "2031-03";
const P2 = "2031-04";
const UTM1 = 70000;
const UTM2 = 71000;
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

async function ventaSql(periodo, folio, neto, exento, iva, tipo = "33") {
  await pool.query(
    `INSERT INTO ventas (empresa_id, periodo, fecha, tipo_documento, sii_tipo_doc, folio, rut_cliente,
                         razon_social_cliente, neto, exento, iva, total, estado)
     VALUES ($1, $2, $3, 'Factura', $4, $5, '12345678-5', 'Cliente', $6, $7, $8, $9, 'vigente')`,
    [ctx.empresa, periodo, `${periodo}-10`, tipo, folio, neto, exento, iva, neto + exento + iva]
  );
}

async function compraSql(periodo, folio, campos = {}) {
  const c = {
    neto: 0, exento: 0, iva_credito: 0, iva_uso_comun: 0, tipo: "33", fecha: `${periodo}-05`, ...campos,
  };
  const total = c.neto + c.exento + c.iva_credito + c.iva_uso_comun;

  await pool.query(
    `INSERT INTO compras (empresa_id, periodo, fecha, tipo_documento, sii_tipo_doc, folio, rut_proveedor,
                          razon_social_proveedor, neto, exento, iva_credito, iva_uso_comun, total, estado)
     VALUES ($1, $2, $3, 'Factura', $4, $5, '76111222-8', 'Proveedor', $6, $7, $8, $9, $10, 'vigente')`,
    [ctx.empresa, periodo, c.fecha, c.tipo, folio, c.neto, c.exento, c.iva_credito, c.iva_uso_comun, total]
  );
}

test.before(async () => {
  const base = (await pool.query("SELECT current_database() AS d")).rows[0].d;

  if (!/test|staging/i.test(base)) {
    throw new Error(`La base "${base}" no es de pruebas.`);
  }

  ctx.empresa = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa) VALUES ($1, $2, true) RETURNING id`,
      [`B3${SUFIJO}-1`, `Empresa bloque3 ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.caja = await cuenta("1101001", "Caja", "Activo", "Deudora");
  ctx.gasto = await cuenta("3101001", "Gastos", "Pérdida", "Deudora");

  await pool.query(
    `INSERT INTO configuracion_contable (empresa_id, cuenta_caja_banco_id, cuenta_gasto_defecto_id, tasa_ppm, facturador_electronico)
     VALUES ($1, $2, $3, 0.25, false)`,
    [ctx.empresa, ctx.caja, ctx.gasto]
  );

  // Parámetros nacionales de los dos períodos, con UTM distinta para ver el reajuste.
  await pool.query(
    `INSERT INTO parametros_nacionales (periodo, valor_uf, valor_utm, ingreso_minimo, tope_imponible_afp_uf, tope_afc_uf, tasa_sis, tasa_seguro_social_empleador, fuente)
     VALUES ($1, 40000, $2, 550000, 90, 136, 1.5, 1.0, 'prueba'),
            ($3, 40100, $4, 550000, 90, 136, 1.5, 1.0, 'prueba')
     ON CONFLICT (periodo) DO UPDATE SET valor_utm = EXCLUDED.valor_utm`,
    [P1, UTM1, P2, UTM2]
  );

  // Período 1: mucho crédito, poco débito: queda remanente.
  await ventaSql(P1, "1", 100000, 50000, 19000);
  await compraSql(P1, "10", { neto: 500000, iva_credito: 95000 });
  await compraSql(P1, "11", { neto: 100000, iva_uso_comun: 19000 });
  await compraSql(P1, "12", { neto: 200000, iva_credito: 38000, tipo: "46" });

  // Período 2: débito grande, sin compras.
  await ventaSql(P2, "2", 1000000, 0, 190000);

  await pool.query(
    `INSERT INTO honorarios (empresa_id, periodo, fecha_emision, fecha_pago, tipo_documento, folio, rut_prestador,
                             nombre_prestador, bruto, tasa_retencion, retencion, liquido, estado)
     VALUES ($1, $2, $3, $4, 'Boleta de Honorarios', '7', '11111111-1', 'Prestador', 100000, 15.25, 15250, 84750, 'vigente'),
            ($1, $2, $3, NULL, 'Boleta de Honorarios', '8', '11111111-1', 'Prestador', 200000, 15.25, 30500, 169500, 'vigente')`,
    [ctx.empresa, P1, `${P1}-15`, `${P1}-20`]
  );

  const hash = await bcrypt.hash(CLAVE, 10);
  ctx.usuario = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES ('Bloque3', $1, $2, 'admin_cliente', true) RETURNING id`,
      [CORREO, hash]
    )
  ).rows[0].id;
  await pool.query(`INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo) VALUES ($1, $2, 'OWNER', true)`, [ctx.usuario, ctx.empresa]);
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_id, status, billing_cycle, price, currency, starts_at, expires_at, auto_renew, grace_days)
     SELECT $1, sp.id, 'ACTIVE', 'monthly', sp.monthly_price, 'CLP', CURRENT_DATE, CURRENT_DATE + 365, true, 5
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

test("la tabla legal de impuesto unico calcula por UTM", () => {
  // 1.000.000 con UTM 69.751 son 14,34 UTM: tramo del 4% con rebaja de 0,54 UTM.
  const r = calcularImpuestoUnicoLegal(1000000, 69751);
  assert.equal(r.impuesto, Math.round(1000000 * 0.04 - Math.round(0.54 * 69751)));
  assert.equal(r.tramo.factor, 0.04);

  // Bajo 13,5 UTM: exento.
  assert.equal(calcularImpuestoUnicoLegal(900000, 69751).impuesto, 0);
  // Sobre 310 UTM: 40%.
  assert.equal(calcularImpuestoUnicoLegal(30000000, 69751).tramo.factor, 0.4);
});

test("el F29 del periodo 1 lleva PPM sobre ingresos brutos, IVA retenido y uso comun proporcional", async () => {
  const { status, datos } = await pedir(`/api/f29?empresa_id=${ctx.empresa}&periodo=${P1}`);
  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));

  assert.equal(datos.valor_utm, UTM1);
  assert.equal(datos.tasa_ppm, 0.25, "la tasa sale de la configuracion contable");
  // Ingresos brutos: 100.000 afecto + 50.000 exento.
  assert.equal(datos.ppm.base_ppm, 150000);
  assert.equal(datos.ppm.monto_ppm, Math.round(150000 * 0.0025));

  // Factor de proporcionalidad: 100.000 / 150.000.
  assert.equal(datos.proporcionalidad.factor, Number((100000 / 150000).toFixed(4)));
  assert.equal(datos.compras.credito_uso_comun, Math.round(19000 * (100000 / 150000)));
  assert.equal(datos.compras.uso_comun_no_recuperable, 19000 - Math.round(19000 * (100000 / 150000)));

  // IVA retenido de la factura de compra tipo 46.
  assert.equal(datos.iva.iva_retenido, 38000);
  // Credito: 95.000 + 38.000 directos + uso comun proporcional.
  assert.equal(datos.iva.iva_credito, 95000 + 38000 + datos.compras.credito_uso_comun);
  assert.equal(datos.iva.remanente_anterior, 0);
  assert.ok(datos.iva.remanente_siguiente > 0, "queda remanente");
  assert.equal(datos.iva.remanente_siguiente_utm, Number((datos.iva.remanente_siguiente / UTM1).toFixed(4)));

  // Honorarios: la pagada en el mes y la sin fecha de pago (por emision, con aviso).
  assert.equal(datos.honorarios.retencion, 15250 + 30500);
  assert.equal(datos.honorarios.sin_fecha_pago, 1);
  assert.ok(datos.avisos.some((a) => /fecha de pago/i.test(a)));

  assert.equal(datos.presentada, null);
  ctx.remanenteUtmP1 = datos.iva.remanente_siguiente_utm;
  ctx.totalP1 = datos.total_f29_estimado;
});

test("registrar el F29 presentado fija el remanente y no se puede repetir sin rectificar", async () => {
  const { status, datos } = await enviar("/api/f29/presentada", {
    empresa_id: ctx.empresa,
    periodo: P1,
    folio_sii: "123456",
    // En el pasado real: asi una compra creada hoy cuenta como posterior a la
    // presentacion, que es lo que la revision tiene que detectar.
    fecha_presentacion: "2026-01-15",
  });
  assert.equal(status, 201, JSON.stringify(datos).slice(0, 300));
  assert.equal(Number(datos.declaracion.total_pagado), ctx.totalP1);

  const { rows } = await pool.query(`SELECT remanente_siguiente_utm, valor_utm FROM remanente_iva WHERE empresa_id = $1 AND periodo = $2`, [ctx.empresa, P1]);
  assert.equal(Number(rows[0].remanente_siguiente_utm), ctx.remanenteUtmP1);
  assert.equal(Number(rows[0].valor_utm), UTM1);

  const repetido = await enviar("/api/f29/presentada", {
    empresa_id: ctx.empresa, periodo: P1, folio_sii: "999", fecha_presentacion: "2026-01-16",
  });
  assert.equal(repetido.status, 409);

  const rectificado = await enviar("/api/f29/presentada", {
    empresa_id: ctx.empresa, periodo: P1, folio_sii: "999", fecha_presentacion: "2026-01-16", rectifica: true,
  });
  assert.equal(rectificado.status, 201);

  const decl = await pool.query(`SELECT estado FROM declaraciones_f29 WHERE empresa_id = $1 AND periodo = $2 ORDER BY id`, [ctx.empresa, P1]);
  assert.deepEqual(decl.rows.map((r) => r.estado), ["rectificada", "vigente"]);
});

test("el periodo 2 arrastra el remanente en UTM reajustado con la UTM nueva", async () => {
  const { datos } = await pedir(`/api/f29?empresa_id=${ctx.empresa}&periodo=${P2}`);

  assert.equal(datos.iva.remanente_anterior_utm, ctx.remanenteUtmP1);
  assert.equal(datos.iva.remanente_anterior, Math.round(ctx.remanenteUtmP1 * UTM2), "reconvertido con la UTM de abril, no la de marzo");
  assert.equal(datos.iva.iva_pagar, Math.max(0, 190000 - datos.iva.remanente_anterior));
});

test("el control de remanente no deja digitar el anterior cuando ya hay cadena", async () => {
  const { status, datos } = await enviar("/api/remanente-iva", { empresa_id: ctx.empresa, periodo: P2, remanente_anterior: 999999 });
  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));
  assert.notEqual(Number(datos.control.remanente_anterior), 999999);
  assert.ok(datos.avisos.some((a) => /no se puede digitar/i.test(a)));
});

test("el cierre mensual y el panel cruzan lo presentado y detectan lo posterior", async () => {
  // Los documentos de la fixture se crearon hoy: se retrodatan para que solo
  // la compra nueva quede despues de la presentacion del 15-01-2026.
  await pool.query(`UPDATE compras SET creado_en = '2026-01-01' WHERE empresa_id = $1 AND periodo = $2`, [ctx.empresa, P1]);
  await pool.query(`UPDATE ventas SET creado_en = '2026-01-01' WHERE empresa_id = $1 AND periodo = $2`, [ctx.empresa, P1]);
  await compraSql(P1, "13", { neto: 10000, iva_credito: 1900 });

  const cierre = await pedir(`/api/cierre-mensual?empresa_id=${ctx.empresa}&periodo=${P1}`);
  const revision = cierre.datos.revisiones.find((r) => r.codigo === "f29_presentado");
  assert.ok(revision, "existe la revision del F29");
  assert.equal(revision.estado, "aviso");
  assert.match(revision.detalle, /despues de la presentacion/i);

  const sinPago = cierre.datos.revisiones.find((r) => r.codigo === "honorarios_fecha_pago");
  assert.equal(sinPago.estado, "aviso");
  assert.equal(sinPago.cantidad, 1);

  const f46 = cierre.datos.revisiones.find((r) => r.codigo === "facturas_compra");
  assert.equal(f46.estado, "aviso");

  const panel = await pedir(`/api/panel-estudio?periodo=${P1}`);
  const fila = panel.datos.empresas.find((e) => e.empresa_id === ctx.empresa);
  assert.equal(fila.estado, cierre.datos.resumen.estado, "panel y cierre coinciden");
  assert.equal(fila.pendientes.documentos_posteriores_al_f29, 1);
  assert.equal(fila.pendientes.honorarios_sin_fecha_pago, 1);
  assert.equal(fila.pendientes.facturas_de_compra, 1);
});

test("una compra declarada mas de dos periodos despues de su fecha es un error", async () => {
  await compraSql(P2, "14", { neto: 5000, iva_credito: 950, fecha: "2030-11-20" });

  const cierre = await pedir(`/api/cierre-mensual?empresa_id=${ctx.empresa}&periodo=${P2}`);
  const rezagados = cierre.datos.revisiones.find((r) => r.codigo === "documentos_rezagados");
  assert.equal(rezagados.estado, "error");
  assert.equal(rezagados.cantidad, 1);

  const panel = await pedir(`/api/panel-estudio?periodo=${P2}`);
  const fila = panel.datos.empresas.find((e) => e.empresa_id === ctx.empresa);
  assert.equal(fila.pendientes.compras_fuera_de_plazo, 1);
  assert.equal(fila.estado, "error");
});

test("el calendario toma el plazo del F29 de la configuracion de la empresa", async () => {
  const { datos } = await pedir(`/api/calendario-tributario?empresa_id=${ctx.empresa}&periodo=2026-04`);
  const f29 = datos.obligaciones.find((o) => o.codigo === "f29");
  assert.equal(f29.vence_nominal, "2026-05-12", "facturador_electronico=false en la empresa: al 12");
});

test("sin tramos de la empresa, la liquidacion usa la tabla legal en UTM del parametro nacional", async () => {
  await pool.query(
    `INSERT INTO configuracion_remuneraciones (empresa_id, periodo, valor_uf, tope_imponible_uf, tasa_afc_trabajador, tasa_afc_empleador, tasa_mutual, ingreso_minimo)
     VALUES ($1, $2, 40000, 90, 0.6, 2.4, 0.95, 550000)`,
    [ctx.empresa, P1]
  );
  await pool.query(
    `INSERT INTO afp_parametros (empresa_id, periodo, nombre, tasa_afp, tasa_sis, tasa_seguro_social, activo)
     VALUES ($1, $2, 'MODELO', 10.58, 1.54, 5, true)`,
    [ctx.empresa, P1]
  );
  const trabajador = (
    await pool.query(
      `INSERT INTO trabajadores (empresa_id, rut, nombres, apellidos, fecha_ingreso, estado, sueldo_base, afp, salud, tipo_contrato)
       VALUES ($1, '33333333-3', 'Alto', 'Sueldo', '2024-01-02', 'activo', 3000000, 'MODELO', 'FONASA', 'Indefinido') RETURNING id`,
      [ctx.empresa]
    )
  ).rows[0].id;

  const { status, datos } = await enviar("/api/liquidaciones/calcular", {
    empresa_id: ctx.empresa, trabajador_id: trabajador, periodo: P1, dias_trabajados: 30,
  });
  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));

  const c = datos.calculo;
  assert.ok(Number(c.impuesto_unico) > 0, "con UTM conocida el impuesto se calcula por la tabla legal");
  assert.ok(JSON.stringify(datos).includes("tabla legal"));
  // La tasa de la reforma sale del parametro nacional (1.0), no de la fila de AFP (5).
  assert.equal(Number(c.tasa_seguro_social), 1);
});
