/**
 * Bloque 9 de la revisión del 19-09-2026: el IVA de uso común llega al asiento
 * y su parte no recuperable llega a gasto.
 *
 * Dos cosas distintas:
 *
 * 1. Un defecto latente: `construirAsientoCompra` no miraba `iva_uso_comun`,
 *    que el bloque 3 agregó como columna del registro de compras. El total del
 *    documento sí lo incluye, así que una compra con uso común habría generado
 *    un asiento descuadrado por ese monto. No llegó a ocurrir —ninguna compra
 *    con uso común tenía comprobante— pero habría ocurrido con la primera
 *    importación real.
 *
 * 2. El ajuste: el IVA de uso común entra completo como crédito fiscal y la
 *    parte que la proporcionalidad deja sin recuperar tiene que salir de esa
 *    cuenta e irse a gasto.
 *
 *   DATABASE_URL=<staging o test> node --test test/bloque9.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_bloque9_no_produccion_32_carac";
process.env.COBRANZA_AUTOMATICA = "false";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");
const { __comprobanteInternals } = require("../src/helpers/comprobante.helper");

const { construirAsientoCompra } = __comprobanteInternals;

const SUFIJO = `b9${Date.now().toString().slice(-8)}`;
const CLAVE = "Bloque9-2026";
const CORREO = `${SUFIJO}@test.local`;
const PERIODO = "2038-04";
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

test.before(async () => {
  const base = (await pool.query("SELECT current_database() AS d")).rows[0].d;

  if (!/test|staging/i.test(base)) {
    throw new Error(`La base "${base}" no es de pruebas.`);
  }

  ctx.empresa = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa) VALUES ($1, $2, true) RETURNING id`,
      [`B9${SUFIJO}-1`, `Empresa bloque9 ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.caja = await cuenta("1101001", "Caja", "Activo", "Deudora");
  ctx.proveedores = await cuenta("2101001", "Proveedores", "Pasivo", "Acreedora");
  ctx.ivaCredito = await cuenta("1103001", "IVA crédito fiscal", "Activo", "Deudora");
  ctx.ivaDebito = await cuenta("2102001", "IVA débito fiscal", "Pasivo", "Acreedora");
  ctx.gasto = await cuenta("3101001", "Gastos generales", "Gasto", "Deudora");
  ctx.gastoIva = await cuenta("3101002", "IVA de uso común no recuperable", "Gasto", "Deudora");
  ctx.ventasCta = await cuenta("4101001", "Ventas", "Ingreso", "Acreedora");

  await pool.query(
    `INSERT INTO configuracion_contable
       (empresa_id, cuenta_caja_banco_id, cuenta_proveedores_id, cuenta_iva_credito_id,
        cuenta_iva_debito_id, cuenta_gasto_defecto_id, cuenta_ingreso_defecto_id,
        cuenta_iva_uso_comun_no_rec_id, facturador_electronico)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)`,
    [
      ctx.empresa,
      ctx.caja,
      ctx.proveedores,
      ctx.ivaCredito,
      ctx.ivaDebito,
      ctx.gasto,
      ctx.ventasCta,
      ctx.gastoIva,
    ]
  );

  await pool.query(
    `INSERT INTO ejercicios_contables (empresa_id, anio, estado, fecha_inicio, fecha_termino)
     VALUES ($1, 2038, 'abierto', '2038-01-01', '2038-12-31')`,
    [ctx.empresa]
  );

  // Ventas del año: 600.000 afectas y 400.000 exentas. El factor acumulado
  // queda en 0,6, así que el 40% del uso común no se recupera.
  await pool.query(
    `INSERT INTO ventas (empresa_id, periodo, fecha, tipo_documento, sii_tipo_doc, folio,
                         rut_cliente, razon_social_cliente, neto, exento, iva, total, estado)
     VALUES ($1, $2, $3, 'Factura', '33', '900', '12345678-5', 'Cliente', 600000, 400000, 114000, 1114000, 'vigente')`,
    [ctx.empresa, PERIODO, `${PERIODO}-05`]
  );

  const hash = await bcrypt.hash(CLAVE, 10);
  ctx.usuario = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Bloque9', $1, $2, 'admin_cliente', true) RETURNING id`,
      [CORREO, hash]
    )
  ).rows[0].id;
  await pool.query(
    `INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo)
     VALUES ($1, $2, 'OWNER', true)`,
    [ctx.usuario, ctx.empresa]
  );
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

test("el asiento de compra con IVA de uso común cuadra", () => {
  const configuracion = {
    cuenta_proveedores_id: 1,
    cuenta_gasto_defecto_id: 2,
    cuenta_iva_credito_id: 3,
  };

  // Este era el defecto: el total del documento incluye el uso común y el
  // debe no lo incluía, así que el asiento quedaba corto por 19.000.
  const conUsoComun = construirAsientoCompra(
    { empresa_id: 1, periodo: PERIODO, fecha: `${PERIODO}-10`, folio: "1", neto: 100000, iva_uso_comun: 19000, total: 119000 },
    configuracion
  );

  assert.equal(conUsoComun.totalDebe, 119000);
  assert.equal(conUsoComun.totalHaber, 119000);

  const debe = conUsoComun.detalles.reduce((suma, linea) => suma + Number(linea.debe || 0), 0);
  const haber = conUsoComun.detalles.reduce((suma, linea) => suma + Number(linea.haber || 0), 0);
  assert.equal(debe, haber);

  // El uso común entra a IVA crédito fiscal, junto con el crédito directo.
  const lineaIva = conUsoComun.detalles.find((linea) => linea.cuenta_id === 3);
  assert.equal(Number(lineaIva.debe), 19000);

  const mixto = construirAsientoCompra(
    { empresa_id: 1, periodo: PERIODO, fecha: `${PERIODO}-10`, folio: "2", neto: 200000, iva_credito: 19000, iva_uso_comun: 19000, total: 238000 },
    configuracion
  );
  assert.equal(mixto.totalDebe, mixto.totalHaber);
  assert.equal(
    Number(mixto.detalles.find((linea) => linea.cuenta_id === 3).debe),
    38000,
    "crédito directo más uso común"
  );

  // Una nota de crédito con uso común también cuadra, con los signos dados
  // vuelta.
  const nota = construirAsientoCompra(
    { empresa_id: 1, periodo: PERIODO, fecha: `${PERIODO}-10`, folio: "3", sii_tipo_doc: "61", neto: 100000, iva_uso_comun: 19000, total: 119000 },
    configuracion
  );
  const debeNota = nota.detalles.reduce((suma, linea) => suma + Number(linea.debe || 0), 0);
  const haberNota = nota.detalles.reduce((suma, linea) => suma + Number(linea.haber || 0), 0);
  assert.equal(debeNota, haberNota);
});

test("una compra con uso común registrada por la API genera un asiento cuadrado", async () => {
  // El alta manual no tiene campo de uso común, así que se registra la compra
  // y se le escribe la columna como lo hace la importación del registro.
  const { status, datos } = await enviar("/api/compras", {
    empresa_id: ctx.empresa,
    fecha: `${PERIODO}-10`,
    tipo_documento: "Factura",
    folio: "700",
    rut_proveedor: "76111222-8",
    razon_social_proveedor: "Proveedor de uso común",
    neto: 100000,
    iva_credito: 19000,
    total: 119000,
  });

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 300));

  const { rows } = await pool.query(
    `SELECT total_debe, total_haber,
            (SELECT COALESCE(SUM(debe), 0) FROM comprobante_detalle WHERE comprobante_id = c.id) AS debe,
            (SELECT COALESCE(SUM(haber), 0) FROM comprobante_detalle WHERE comprobante_id = c.id) AS haber
     FROM comprobantes c WHERE c.id = $1`,
    [datos.compra.comprobante_id]
  );

  assert.equal(Number(rows[0].debe), Number(rows[0].haber), "el asiento cuadra");
  assert.equal(Number(rows[0].total_debe), Number(rows[0].total_haber));

  // Y la compra con uso común para el ajuste del período.
  await pool.query(
    `INSERT INTO compras (empresa_id, periodo, fecha, tipo_documento, sii_tipo_doc, folio,
                          rut_proveedor, razon_social_proveedor, neto, iva_uso_comun, total, estado)
     VALUES ($1, $2, $3, 'Factura', '33', '701', '76111222-8', 'Proveedor de uso común', 100000, 19000, 119000, 'vigente')`,
    [ctx.empresa, PERIODO, `${PERIODO}-11`]
  );
});

test("el ajuste propone la parte no recuperable con el factor del año", async () => {
  const { status, datos } = await pedir(
    `/api/iva-uso-comun?empresa_id=${ctx.empresa}&periodo=${PERIODO}`
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));
  assert.equal(datos.iva_uso_comun, 19000);
  // 600.000 afectas de 1.000.000 totales: factor 0,6.
  assert.equal(Number(datos.proporcionalidad.factor).toFixed(2), "0.60");
  assert.equal(datos.credito_recuperable, 11400);
  assert.equal(datos.no_recuperable, 7600);
  assert.equal(datos.ajuste_registrado, null);
  assert.ok(datos.avisos.some((aviso) => /REQUIERE VALIDACI[ÓO]N CONTABLE/.test(aviso)));
});

test("contabilizar el ajuste saca la parte no recuperable del IVA crédito y la lleva a gasto", async () => {
  const { status, datos } = await enviar("/api/iva-uso-comun/contabilizar", {
    empresa_id: ctx.empresa,
    periodo: PERIODO,
  });

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 300));
  assert.equal(Number(datos.ajuste.no_recuperable), 7600);
  assert.equal(datos.comprobante.tipo, "Ajuste");
  // Al último día del mes, como el resto de los ajustes del cierre.
  assert.equal(new Date(datos.comprobante.fecha).getUTCDate(), 30);

  const { rows } = await pool.query(
    `SELECT cuenta_id, debe, haber FROM comprobante_detalle
     WHERE comprobante_id = $1 ORDER BY id`,
    [datos.comprobante.id]
  );

  assert.equal(rows.length, 2);
  assert.equal(Number(rows[0].cuenta_id), ctx.gastoIva, "el gasto se debita");
  assert.equal(Number(rows[0].debe), 7600);
  assert.equal(Number(rows[1].cuenta_id), ctx.ivaCredito, "el IVA crédito se abona");
  assert.equal(Number(rows[1].haber), 7600);

  ctx.comprobanteAjuste = datos.comprobante.id;
});

test("el ajuste de un período no se puede hacer dos veces", async () => {
  const { status, datos } = await enviar("/api/iva-uso-comun/contabilizar", {
    empresa_id: ctx.empresa,
    periodo: PERIODO,
  });

  assert.equal(status, 409, JSON.stringify(datos).slice(0, 200));

  const consulta = await pedir(`/api/iva-uso-comun?empresa_id=${ctx.empresa}&periodo=${PERIODO}`);
  assert.ok(consulta.datos.ajuste_registrado, "la consulta muestra el ajuste ya hecho");
  assert.equal(Number(consulta.datos.ajuste_registrado.no_recuperable), 7600);
});

test("anular el asiento del ajuste libera el período", async () => {
  const anulado = await enviar(
    `/api/comprobantes/${ctx.comprobanteAjuste}`,
    { empresa_id: ctx.empresa },
    "DELETE"
  );
  assert.equal(anulado.status, 200, JSON.stringify(anulado.datos).slice(0, 200));

  const { rows } = await pool.query(
    `SELECT estado FROM ajustes_iva_uso_comun WHERE comprobante_id = $1`,
    [ctx.comprobanteAjuste]
  );
  assert.equal(rows[0].estado, "anulado");

  const otraVez = await enviar("/api/iva-uso-comun/contabilizar", {
    empresa_id: ctx.empresa,
    periodo: PERIODO,
  });
  assert.equal(otraVez.status, 201, "se puede volver a ajustar");
});

test("sin cuenta configurada o sin nada que ajustar no se contabiliza", async () => {
  await pool.query(
    `UPDATE configuracion_contable SET cuenta_iva_uso_comun_no_rec_id = NULL WHERE empresa_id = $1`,
    [ctx.empresa]
  );

  const sinCuenta = await enviar("/api/iva-uso-comun/contabilizar", {
    empresa_id: ctx.empresa,
    periodo: "2038-05",
  });
  // En mayo no hay uso común: falla por eso antes que por la cuenta.
  assert.equal(sinCuenta.status, 400);
  assert.match(sinCuenta.datos.error, /no recuperable|nada que ajustar/i);

  await pool.query(
    `INSERT INTO compras (empresa_id, periodo, fecha, tipo_documento, sii_tipo_doc, folio,
                          rut_proveedor, razon_social_proveedor, neto, iva_uso_comun, total, estado)
     VALUES ($1, '2038-05', '2038-05-10', 'Factura', '33', '702', '76111222-8', 'Proveedor', 100000, 19000, 119000, 'vigente')`,
    [ctx.empresa]
  );

  const faltaCuenta = await enviar("/api/iva-uso-comun/contabilizar", {
    empresa_id: ctx.empresa,
    periodo: "2038-05",
  });
  assert.equal(faltaCuenta.status, 400);
  assert.match(faltaCuenta.datos.error, /cuenta de IVA de uso com[úu]n no recuperable/i);

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM ajustes_iva_uso_comun WHERE empresa_id = $1 AND periodo = '2038-05'`,
    [ctx.empresa]
  );
  assert.equal(rows[0].n, 0, "no quedó nada a medio registrar");
});
