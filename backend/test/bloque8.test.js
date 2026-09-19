/**
 * Bloque 8 de la revisión del 19-09-2026: módulo 10, declaraciones juradas.
 *
 * Lo que fijan estas pruebas:
 * - La 1879 va por fecha de pago, no de emisión, y avisa de las boletas sin
 *   fecha de pago en lugar de declararlas en silencio.
 * - La 1887 suma las liquidaciones emitidas del año y separa las rentas no
 *   gravadas de la renta imponible.
 * - El certificado cuadra al peso con la declaración: no pueden diferir.
 * - Los dos avisan que el formato del SII cambia cada año.
 *
 *   DATABASE_URL=<staging o test> node --test test/bloque8.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_bloque8_no_produccion_32_carac";
process.env.COBRANZA_AUTOMATICA = "false";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");

const SUFIJO = `b8${Date.now().toString().slice(-8)}`;
const CLAVE = "Bloque8-2026";
const CORREO = `${SUFIJO}@test.local`;
const ANIO = 2037;
const ctx = {};

async function pedir(ruta) {
  const respuesta = await fetch(`${ctx.raiz}${ruta}`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });

  return { status: respuesta.status, datos: await respuesta.json().catch(() => ({})) };
}

test.before(async () => {
  const base = (await pool.query("SELECT current_database() AS d")).rows[0].d;

  if (!/test|staging/i.test(base)) {
    throw new Error(`La base "${base}" no es de pruebas.`);
  }

  ctx.empresa = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, giro, activa)
       VALUES ($1, $2, 'Servicios', true) RETURNING id`,
      [`B8${SUFIJO}-1`, `Empresa bloque8 ${SUFIJO}`]
    )
  ).rows[0].id;

  // Honorarios: uno pagado en el año, uno emitido en el año pero pagado al
  // siguiente, y uno sin fecha de pago.
  await pool.query(
    `INSERT INTO honorarios
       (empresa_id, periodo, fecha_emision, fecha_pago, tipo_documento, folio,
        rut_prestador, nombre_prestador, bruto, tasa_retencion, retencion, liquido, estado)
     VALUES
       ($1, $2, $3, $4, 'Boleta de Honorarios', '10', '11111111-1', 'Ana Prestadora', 1000000, 15.25, 152500, 847500, 'vigente'),
       ($1, $2, $5, $6, 'Boleta de Honorarios', '11', '11111111-1', 'Ana Prestadora', 500000, 15.25, 76250, 423750, 'vigente'),
       ($1, $2, $3, NULL, 'Boleta de Honorarios', '12', '22222222-2', 'Luis Consultor', 200000, 15.25, 30500, 169500, 'vigente'),
       ($1, $2, $3, $4, 'Boleta de Honorarios', '13', '33333333-3', 'Anulada', 900000, 15.25, 137250, 762750, 'anulado')`,
    [
      ctx.empresa,
      `${ANIO}-03`,
      `${ANIO}-03-10`,
      `${ANIO}-03-20`,
      `${ANIO}-12-20`,
      `${ANIO + 1}-01-15`,
    ]
  );

  ctx.trabajador = (
    await pool.query(
      `INSERT INTO trabajadores (empresa_id, rut, nombres, apellidos, fecha_ingreso, estado, sueldo_base)
       VALUES ($1, '16153127-8', 'Marta', 'Ejemplo', '2036-01-02', 'activo', 1500000) RETURNING id`,
      [ctx.empresa]
    )
  ).rows[0].id;

  // Doce liquidaciones emitidas, una eliminada (no debe contarse) y una del
  // año siguiente (tampoco).
  for (let mes = 1; mes <= 12; mes += 1) {
    await pool.query(
      `INSERT INTO liquidaciones
         (empresa_id, trabajador_id, periodo, dias_trabajados, sueldo_base,
          total_haberes_imponibles, total_haberes_no_imponibles, total_haberes,
          base_tributable, impuesto_unico, descuento_afp, descuento_salud, descuento_afc,
          total_descuentos, liquido_pagar, estado)
       VALUES ($1, $2, $3, 30, 1500000, 1500000, 50000, 1550000, 1300000, 40000,
               158700, 105000, 9000, 312700, 1237300, 'emitida')`,
      [ctx.empresa, ctx.trabajador, `${ANIO}-${String(mes).padStart(2, "0")}`]
    );
  }

  await pool.query(
    `INSERT INTO liquidaciones
       (empresa_id, trabajador_id, periodo, total_haberes_imponibles, base_tributable,
        impuesto_unico, total_haberes_no_imponibles, estado)
     VALUES ($1, $2, $3, 9999999, 9999999, 9999999, 0, 'eliminada'),
            ($1, $2, $4, 8888888, 8888888, 8888888, 0, 'emitida')`,
    [ctx.empresa, ctx.trabajador, `${ANIO}-06`, `${ANIO + 1}-01`]
  );

  const hash = await bcrypt.hash(CLAVE, 10);
  ctx.usuario = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Bloque8', $1, $2, 'admin_cliente', true) RETURNING id`,
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

test("la 1879 declara por fecha de pago y avisa de las boletas sin fecha", async () => {
  const { status, datos } = await pedir(
    `/api/declaraciones-juradas/1879?empresa_id=${ctx.empresa}&anio=${ANIO}`
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));
  assert.equal(datos.anio_tributario, ANIO + 1, "el AT es el año siguiente al comercial");

  const ana = datos.detalle.find((fila) => fila.rut === "11111111-1");
  // La boleta 11 se pagó en enero del año siguiente: no va en esta declaración.
  assert.equal(ana.documentos, 1, "solo la boleta pagada dentro del año");
  assert.equal(ana.honorarios_brutos, 1000000);
  assert.equal(ana.retencion, 152500);

  const luis = datos.detalle.find((fila) => fila.rut === "22222222-2");
  assert.equal(luis.sin_fecha_pago, 1, "la boleta sin fecha de pago se cuenta por emisión");

  assert.equal(
    datos.detalle.find((fila) => fila.rut === "33333333-3"),
    undefined,
    "la boleta anulada no se declara"
  );

  assert.equal(datos.totales.prestadores, 2);
  assert.equal(datos.totales.retencion, 152500 + 30500);
  assert.ok(datos.avisos.some((aviso) => /sin fecha de pago/.test(aviso)));
  assert.ok(datos.avisos.some((aviso) => /cambia el formato/.test(aviso)));
});

test("la 1887 suma el año y separa las rentas no gravadas de la imponible", async () => {
  const { status, datos } = await pedir(
    `/api/declaraciones-juradas/1887?empresa_id=${ctx.empresa}&anio=${ANIO}`
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));

  const marta = datos.detalle.find((fila) => fila.rut === "16153127-8");
  assert.equal(marta.meses, 12, "doce liquidaciones emitidas; la eliminada no cuenta");
  assert.equal(marta.renta_imponible, 12 * 1500000);
  assert.equal(marta.renta_tributable, 12 * 1300000);
  assert.equal(marta.impuesto_unico, 12 * 40000);
  assert.equal(marta.rentas_no_gravadas, 12 * 50000, "no se suman a la imponible");
  assert.equal(marta.cotizaciones_previsionales, 12 * (158700 + 105000 + 9000));
  assert.equal(marta.detalle_mensual.length, 12);
  assert.equal(marta.detalle_mensual[0].mes, 1);

  // La liquidación del año siguiente no entra: todos los períodos son del año.
  assert.ok(
    marta.detalle_mensual.every((mes) => mes.periodo.startsWith(String(ANIO))),
    "no arrastra períodos de otro año"
  );
  assert.equal(marta.renta_imponible, 12 * 1500000, "y por eso el total es exacto");

  assert.equal(datos.totales.trabajadores, 1);
  assert.ok(datos.avisos.some((aviso) => /reajuste/i.test(aviso)));
});

test("el archivo de carga trae una fila por contribuyente y avisa del formato", async () => {
  const respuesta = await fetch(
    `${ctx.raiz}/api/declaraciones-juradas/exportar?empresa_id=${ctx.empresa}&anio=${ANIO}&tipo=1879`,
    { headers: { Authorization: `Bearer ${ctx.token}` } }
  );

  assert.equal(respuesta.status, 200);
  assert.match(respuesta.headers.get("content-type"), /text\/csv/);
  assert.match(respuesta.headers.get("x-dj-aviso"), /validacion tributaria/i);

  const texto = (await respuesta.text()).replace(/^﻿/, "");
  const lineas = texto.trim().split("\r\n");

  assert.equal(lineas.length, 3, "cabecera y dos prestadores");
  assert.equal(lineas[0].split(";")[0], "RUT_RECEPTOR");

  const fila = lineas.find((linea) => linea.startsWith("11111111-1")).split(";");
  assert.equal(fila[2], "1000000");
  assert.equal(fila[3], "152500");

  const sueldos = await fetch(
    `${ctx.raiz}/api/declaraciones-juradas/exportar?empresa_id=${ctx.empresa}&anio=${ANIO}&tipo=1887`,
    { headers: { Authorization: `Bearer ${ctx.token}` } }
  );
  assert.equal(sueldos.status, 200);
  const lineasSueldos = (await sueldos.text()).replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lineasSueldos.length, 2);
  assert.equal(lineasSueldos[0].split(";")[0], "RUT_TRABAJADOR");

  // Un año sin datos no entrega un archivo vacío que parezca válido.
  const vacio = await fetch(
    `${ctx.raiz}/api/declaraciones-juradas/exportar?empresa_id=${ctx.empresa}&anio=2001&tipo=1879`,
    { headers: { Authorization: `Bearer ${ctx.token}` } }
  );
  assert.equal(vacio.status, 404);
});

test("el certificado de honorarios cuadra al peso con la declaración", async () => {
  const declaracion = await pedir(
    `/api/declaraciones-juradas/1879?empresa_id=${ctx.empresa}&anio=${ANIO}`
  );
  const enDeclaracion = declaracion.datos.detalle.find((fila) => fila.rut === "11111111-1");

  const { status, datos } = await pedir(
    `/api/declaraciones-juradas/certificado?empresa_id=${ctx.empresa}&anio=${ANIO}&tipo=honorarios&rut=11.111.111-1`
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));
  assert.equal(datos.totales.honorarios_brutos, enDeclaracion.honorarios_brutos);
  assert.equal(datos.totales.retencion, enDeclaracion.retencion);
  assert.equal(datos.totales.liquido, enDeclaracion.honorarios_brutos - enDeclaracion.retencion);
  assert.equal(datos.documentos.length, 1, "solo el documento del año");
  assert.equal(datos.empresa.razon_social, `Empresa bloque8 ${SUFIJO}`);
  assert.ok(datos.avisos.some((aviso) => /reajust/i.test(aviso)));

  const desconocido = await pedir(
    `/api/declaraciones-juradas/certificado?empresa_id=${ctx.empresa}&anio=${ANIO}&tipo=honorarios&rut=99999999-9`
  );
  assert.equal(desconocido.status, 404);
});

test("el certificado de sueldos lleva el detalle mes a mes", async () => {
  const { status, datos } = await pedir(
    `/api/declaraciones-juradas/certificado?empresa_id=${ctx.empresa}&anio=${ANIO}&tipo=sueldos&rut=16153127-8`
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));
  assert.equal(datos.detalle_mensual.length, 12);
  assert.equal(datos.totales.impuesto_unico, 12 * 40000);
  assert.equal(
    datos.detalle_mensual.reduce((suma, mes) => suma + mes.impuesto_unico, 0),
    datos.totales.impuesto_unico,
    "el detalle mensual suma el total del certificado"
  );
});

test("sin año o con tipo desconocido no se entrega nada", async () => {
  const sinAnio = await pedir(`/api/declaraciones-juradas/1879?empresa_id=${ctx.empresa}`);
  assert.equal(sinAnio.status, 400);

  const tipoMalo = await pedir(
    `/api/declaraciones-juradas/exportar?empresa_id=${ctx.empresa}&anio=${ANIO}&tipo=1234`
  );
  assert.equal(tipoMalo.status, 400);
});
