/**
 * Panel del estudio, cierre mensual, calce bancario, sugerencia de cuenta,
 * calendario tributario y flujo de caja.
 *
 * Son las seis funciones nuevas que trabajan sobre datos ya cargados. Ninguna
 * inventa cifras: todas leen lo que hay y lo ordenan. Lo que estas pruebas
 * vigilan es justo eso, que no inventen: que el cierre marque el descuadre que
 * existe, que el calce no proponga cuando hay dos candidatos iguales, que la
 * sugerencia de cuenta venga del historial de la misma empresa y que aplicarla
 * no pise una cuenta ya asignada.
 *
 *   DATABASE_URL=<staging o test> node --test test/asistentesContables.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_asistentes_no_produccion_32_car";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");

const {
  rutsEnTexto,
  elegirPropuesta,
  DIAS_CERCA,
} = require("../src/helpers/calceBancario.helper");
const {
  proximoDiaHabil,
  obligacionesDelPeriodo,
  domingoDePascua,
} = require("../src/helpers/calendarioTributario.helper");
const { agruparPorAntiguedad, proyectar } = require("../src/helpers/flujoCaja.helper");

const SUFIJO = `asi${Date.now().toString().slice(-8)}`;
const CLAVE = "Asistentes-2026";
const CORREO = `${SUFIJO}@test.local`;

// Un período fijo y pasado, para que las pruebas no cambien de resultado según
// el día en que se corran.
const PERIODO = "2026-04";
const RUT_PROVEEDOR = "76111222-3";
const RUT_CLIENTE = "77333444-5";

const ctx = {};

async function pedir(ruta) {
  const respuesta = await fetch(`${ctx.raiz}${ruta}`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });

  return { status: respuesta.status, datos: await respuesta.json().catch(() => ({})) };
}

async function enviar(ruta, cuerpo, metodo = "POST") {
  const respuesta = await fetch(`${ctx.raiz}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cuerpo),
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
      `INSERT INTO empresas (rut, razon_social, activa)
       VALUES ($1, $2, true) RETURNING id`,
      [`A${SUFIJO}-1`, `Empresa asistentes ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.caja = await cuenta("1101010", "Caja", "Activo", "Deudora");
  ctx.capital = await cuenta("3101010", "Capital", "Patrimonio", "Acreedora");
  ctx.luz = await cuenta("5101010", "Electricidad", "Gasto", "Deudora");
  ctx.arriendo = await cuenta("5101020", "Arriendos", "Gasto", "Deudora");
  ctx.ingresos = await cuenta("4101010", "Ventas", "Ingreso", "Acreedora");

  // Historial del proveedor: tres facturas ya clasificadas en Electricidad. Es
  // la decisión que la empresa tomó y que la sugerencia debe repetir.
  for (const [folio, dia] of [["100", "05"], ["101", "12"], ["102", "20"]]) {
    await pool.query(
      `INSERT INTO compras (empresa_id, periodo, fecha, tipo_documento, folio,
                            rut_proveedor, razon_social_proveedor, neto, iva_credito,
                            total, cuenta_gasto_id, estado)
       VALUES ($1, '2026-03', $2, 'Factura', $3, $4, 'Electrica del Sur', 50000, 9500, 59500, $5, 'vigente')`,
      [ctx.empresa, `2026-03-${dia}`, folio, RUT_PROVEEDOR, ctx.luz]
    );
  }

  // Una factura del mismo proveedor sin clasificar, en el período que se revisa.
  ctx.compraSinCuenta = (
    await pool.query(
      `INSERT INTO compras (empresa_id, periodo, fecha, tipo_documento, folio,
                            rut_proveedor, razon_social_proveedor, neto, iva_credito,
                            total, cuenta_gasto_id, estado)
       VALUES ($1, $2, '2026-04-08', 'Factura', '210', $3, 'Electrica del Sur',
               100000, 19000, 119000, NULL, 'vigente')
       RETURNING id`,
      [ctx.empresa, PERIODO, RUT_PROVEEDOR]
    )
  ).rows[0].id;

  // Una venta cobrable, para el calce bancario y el flujo de caja.
  ctx.venta = (
    await pool.query(
      `INSERT INTO ventas (empresa_id, periodo, fecha, tipo_documento, folio,
                           rut_cliente, razon_social_cliente, neto, iva, total,
                           cuenta_ingreso_id, estado)
       VALUES ($1, $2, '2026-04-10', 'Factura', '500', $3, 'Comercial Norte',
               200000, 38000, 238000, $4, 'vigente')
       RETURNING id`,
      [ctx.empresa, PERIODO, RUT_CLIENTE, ctx.ingresos]
    )
  ).rows[0].id;

  // Un abono en la cartola por el monto exacto de esa venta y con el RUT del
  // cliente escrito en la descripción, como lo escriben los bancos.
  ctx.movimiento = (
    await pool.query(
      `INSERT INTO conciliacion_bancaria_movimientos
         (empresa_id, periodo, fecha, descripcion, documento, cargo, abono, monto, estado)
       VALUES ($1, $2, '2026-04-12', 'TRANSFERENCIA DE 77.333.444-5 COMERCIAL NORTE',
               '', 0, 238000, 238000, 'pendiente')
       RETURNING id`,
      [ctx.empresa, PERIODO]
    )
  ).rows[0].id;

  // Un asiento descuadrado: el error que el cierre mensual tiene que encontrar.
  ctx.comprobanteMalo = (
    await pool.query(
      `INSERT INTO comprobantes (empresa_id, periodo, fecha, tipo, numero, glosa, estado)
       VALUES ($1, $2, '2026-04-15', 'Traspaso', 9001, 'Asiento descuadrado de prueba', 'vigente')
       RETURNING id`,
      [ctx.empresa, PERIODO]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO comprobante_detalle (comprobante_id, cuenta_id, debe, haber)
     VALUES ($1, $2, 1000, 0), ($1, $3, 0, 900)`,
    [ctx.comprobanteMalo, ctx.caja, ctx.capital]
  );

  const hash = await bcrypt.hash(CLAVE, 10);
  ctx.usuario = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Asistentes', $1, $2, 'admin_cliente', true) RETURNING id`,
      [CORREO, hash]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo)
     VALUES ($1, $2, 'OWNER', true)`,
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
  assert.ok(ctx.token, "el login de la prueba debe devolver token");
});

test.after(async () => {
  if (ctx.server) await detenerServidor(ctx.server);
});

// ---------------------------------------------------------------------------
// Panel del estudio
// ---------------------------------------------------------------------------

test("el panel del estudio muestra la empresa y la marca en rojo por el descuadre", async () => {
  const { status, datos } = await pedir(`/api/panel-estudio?periodo=${PERIODO}`);

  assert.equal(status, 200);

  const fila = datos.empresas.find((e) => e.empresa_id === ctx.empresa);

  assert.ok(fila, "la empresa del usuario debe aparecer en el panel");
  assert.equal(fila.estado, "error", "un asiento descuadrado es un error, no un aviso");
  assert.equal(fila.pendientes.asientos_descuadrados, 1);
  assert.equal(fila.pendientes.documentos_sin_cuenta, 1);
  assert.equal(fila.pendientes.movimientos_banco_sin_conciliar, 1);
  assert.equal(fila.iva.debito, 38000);
  assert.equal(fila.iva.credito, 19000);
  assert.equal(fila.iva.determinado, 19000);
  assert.equal(fila.iva.a_pagar, 19000);
  assert.equal(fila.iva.remanente, 0);
});

test("el panel ordena primero las empresas con problemas", async () => {
  const { datos } = await pedir(`/api/panel-estudio?periodo=${PERIODO}`);

  const orden = { error: 0, aviso: 1, ok: 2 };
  const valores = datos.empresas.map((e) => orden[e.estado]);

  for (let i = 1; i < valores.length; i += 1) {
    assert.ok(
      valores[i - 1] <= valores[i],
      "las empresas con errores deben ir antes que las que están al día"
    );
  }
});

test("el panel rechaza un periodo con formato invalido", async () => {
  const { status } = await pedir("/api/panel-estudio?periodo=abril");

  assert.equal(status, 400);
});

test("el panel de un usuario sin empresas no filtra datos de otros", async () => {
  const correoAjeno = `otro${SUFIJO}@test.local`;
  const hash = await bcrypt.hash(CLAVE, 10);

  const ajeno = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Ajeno', $1, $2, 'admin_cliente', true) RETURNING id`,
      [correoAjeno, hash]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_id, status, billing_cycle, price,
                                currency, starts_at, expires_at, auto_renew, grace_days)
     SELECT $1, sp.id, 'ACTIVE', 'monthly', sp.monthly_price, 'CLP',
            CURRENT_DATE, CURRENT_DATE + 365, true, 5
     FROM subscription_plans sp WHERE sp.active = true ORDER BY sp.id LIMIT 1`,
    [ajeno]
  );

  const login = await fetch(`${ctx.raiz}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: correoAjeno, password: CLAVE }),
  });

  const token = (await login.json()).token;

  const respuesta = await fetch(`${ctx.raiz}/api/panel-estudio?periodo=${PERIODO}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const datos = await respuesta.json();

  assert.equal(respuesta.status, 200);
  assert.equal(datos.total_empresas, 0);
  assert.deepEqual(datos.empresas, []);
});

// ---------------------------------------------------------------------------
// Cierre mensual
// ---------------------------------------------------------------------------

test("el cierre mensual encuentra el descuadre y dice que no se puede declarar", async () => {
  const { status, datos } = await pedir(
    `/api/cierre-mensual?empresa_id=${ctx.empresa}&periodo=${PERIODO}`
  );

  assert.equal(status, 200);
  assert.equal(datos.resumen.listo_para_declarar, false);
  assert.match(datos.mensaje, /antes de presentar|no cuadr/i);

  const descuadre = datos.revisiones.find((r) => r.codigo === "asientos_descuadrados");

  assert.equal(descuadre.estado, "error");
  assert.equal(descuadre.cantidad, 1);
  assert.equal(descuadre.afectados[0].diferencia, 100);
});

test("el cierre mensual informa el documento sin cuenta asignada", async () => {
  const { datos } = await pedir(
    `/api/cierre-mensual?empresa_id=${ctx.empresa}&periodo=${PERIODO}`
  );

  const sinCuenta = datos.revisiones.find((r) => r.codigo === "documentos_sin_cuenta");

  assert.equal(sinCuenta.estado, "error");
  assert.ok(sinCuenta.cantidad >= 1);
});

test("el cierre mensual exige el periodo y la empresa", async () => {
  const sinPeriodo = await pedir(`/api/cierre-mensual?empresa_id=${ctx.empresa}`);
  assert.equal(sinPeriodo.status, 400);

  const sinEmpresa = await pedir(`/api/cierre-mensual?periodo=${PERIODO}`);
  assert.equal(sinEmpresa.status, 400);
});

test("el cierre mensual no deja mirar la empresa de otro", async () => {
  const otra = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa)
       VALUES ($1, $2, true) RETURNING id`,
      [`X${SUFIJO}-2`, `Empresa ajena ${SUFIJO}`]
    )
  ).rows[0].id;

  const { status } = await pedir(
    `/api/cierre-mensual?empresa_id=${otra}&periodo=${PERIODO}`
  );

  assert.equal(status, 403);
});

test("el estado del periodo devuelve el semaforo sin las listas", async () => {
  const { status, datos } = await pedir(
    `/api/cierre-mensual/estado?empresa_id=${ctx.empresa}&periodo=${PERIODO}`
  );

  assert.equal(status, 200);
  assert.equal(datos.estado, "error");
  assert.ok(datos.errores >= 1);
  assert.equal(datos.listo_para_declarar, false);
  assert.equal(datos.revisiones, undefined);
});

// ---------------------------------------------------------------------------
// Calce bancario
// ---------------------------------------------------------------------------

test("el calce propone la venta que coincide en monto, fecha y RUT", async () => {
  const { status, datos } = await pedir(
    `/api/conciliacion-bancaria/sugerencias?empresa_id=${ctx.empresa}&periodo=${PERIODO}`
  );

  assert.equal(status, 200);

  const propuesta = datos.propuestas.find((p) => p.movimiento_id === ctx.movimiento);

  assert.ok(propuesta, "el abono debe tener propuesta");
  assert.equal(propuesta.confianza, "alta");
  assert.equal(propuesta.calza_con.origen, "venta");
  assert.equal(propuesta.calza_con.id, ctx.venta);
  assert.equal(propuesta.calza_con.monto, 238000);
});

test("el calce no aplica nada por su cuenta", async () => {
  await pedir(
    `/api/conciliacion-bancaria/sugerencias?empresa_id=${ctx.empresa}&periodo=${PERIODO}`
  );

  const { rows } = await pool.query(
    `SELECT estado, comprobante_id FROM conciliacion_bancaria_movimientos WHERE id = $1`,
    [ctx.movimiento]
  );

  assert.equal(rows[0].estado, "pendiente", "pedir sugerencias no debe conciliar nada");
  assert.equal(rows[0].comprobante_id, null);
});

test("confirmar un calce concilia el movimiento y anota contra que", async () => {
  const movimiento = (
    await pool.query(
      `INSERT INTO conciliacion_bancaria_movimientos
         (empresa_id, periodo, fecha, descripcion, documento, cargo, abono, monto, estado)
       VALUES ($1, $2, '2026-04-18', 'ABONO PARA CONFIRMAR', '', 0, 55000, 55000, 'pendiente')
       RETURNING id`,
      [ctx.empresa, PERIODO]
    )
  ).rows[0].id;

  const { status } = await enviar(
    `/api/conciliacion-bancaria/${movimiento}/estado`,
    {
      empresa_id: ctx.empresa,
      estado: "conciliado",
      comprobante_id: ctx.comprobanteMalo,
    },
    "PUT"
  );

  assert.equal(status, 200);

  const { rows } = await pool.query(
    `SELECT estado, comprobante_id FROM conciliacion_bancaria_movimientos WHERE id = $1`,
    [movimiento]
  );

  assert.equal(rows[0].estado, "conciliado");
  assert.equal(Number(rows[0].comprobante_id), ctx.comprobanteMalo);
});

test("no se puede conciliar el movimiento de otra empresa", async () => {
  const otra = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa)
       VALUES ($1, $2, true) RETURNING id`,
      [`C${SUFIJO}-6`, `Empresa banco ajeno ${SUFIJO}`]
    )
  ).rows[0].id;

  const ajeno = (
    await pool.query(
      `INSERT INTO conciliacion_bancaria_movimientos
         (empresa_id, periodo, fecha, descripcion, documento, cargo, abono, monto, estado)
       VALUES ($1, $2, '2026-04-18', 'MOVIMIENTO AJENO', '', 1000, 0, 1000, 'pendiente')
       RETURNING id`,
      [otra, PERIODO]
    )
  ).rows[0].id;

  const { status } = await enviar(
    `/api/conciliacion-bancaria/${ajeno}/estado`,
    { empresa_id: otra, estado: "conciliado" },
    "PUT"
  );

  assert.equal(status, 403, "la membresia en la empresa tiene que comprobarse");

  const { rows } = await pool.query(
    `SELECT estado FROM conciliacion_bancaria_movimientos WHERE id = $1`,
    [ajeno]
  );

  assert.equal(rows[0].estado, "pendiente", "el movimiento ajeno no debe cambiar");
});

test("no se puede conciliar contra el comprobante de otra empresa", async () => {
  const otra = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa)
       VALUES ($1, $2, true) RETURNING id`,
      [`D${SUFIJO}-7`, `Empresa comprobante ajeno ${SUFIJO}`]
    )
  ).rows[0].id;

  const comprobanteAjeno = (
    await pool.query(
      `INSERT INTO comprobantes (empresa_id, periodo, fecha, tipo, numero, glosa, estado)
       VALUES ($1, $2, '2026-04-15', 'Traspaso', 9500, 'Asiento de otra empresa', 'vigente')
       RETURNING id`,
      [otra, PERIODO]
    )
  ).rows[0].id;

  const movimiento = (
    await pool.query(
      `INSERT INTO conciliacion_bancaria_movimientos
         (empresa_id, periodo, fecha, descripcion, documento, cargo, abono, monto, estado)
       VALUES ($1, $2, '2026-04-19', 'ABONO PROPIO', '', 0, 7000, 7000, 'pendiente')
       RETURNING id`,
      [ctx.empresa, PERIODO]
    )
  ).rows[0].id;

  const { status } = await enviar(
    `/api/conciliacion-bancaria/${movimiento}/estado`,
    { empresa_id: ctx.empresa, estado: "conciliado", comprobante_id: comprobanteAjeno },
    "PUT"
  );

  assert.equal(status, 404);

  const { rows } = await pool.query(
    `SELECT estado, comprobante_id FROM conciliacion_bancaria_movimientos WHERE id = $1`,
    [movimiento]
  );

  assert.equal(rows[0].estado, "pendiente");
  assert.equal(rows[0].comprobante_id, null);
});

test("el calce se calla cuando hay dos documentos igual de buenos", () => {
  const movimiento = {
    fecha: "2026-04-12",
    descripcion: "PAGO PROVEEDORES",
    cargo: 50000,
    abono: 0,
  };

  const candidatos = [
    { id: 1, origen: "compra", fecha: "2026-04-11", rut: "11111111-1", monto: 50000 },
    { id: 2, origen: "compra", fecha: "2026-04-13", rut: "22222222-2", monto: 50000 },
  ];

  const decision = elegirPropuesta(movimiento, candidatos);

  assert.equal(decision.propuesta, null);
  assert.equal(decision.motivo, "varios_candidatos");
  assert.equal(decision.candidatos.length, 2);
});

test("el calce lee el RUT escrito de cualquier forma", () => {
  assert.deepEqual(rutsEnTexto("TRANSFERENCIA 76.111.222-3"), ["76111222-3"]);
  assert.deepEqual(rutsEnTexto("ABONO 761112223"), ["76111222-3"]);
  assert.deepEqual(rutsEnTexto("PAGO 9.876.543-K"), ["9876543-K"]);
  assert.deepEqual(rutsEnTexto("SIN RUT AQUI"), []);
});

test("un candidato lejano en fecha baja de confianza pero se propone si es unico", () => {
  const decision = elegirPropuesta(
    { fecha: "2026-04-30", descripcion: "PAGO", cargo: 1000, abono: 0 },
    [{ id: 7, origen: "compra", fecha: "2026-04-05", rut: "11111111-1", monto: 1000 }]
  );

  assert.equal(decision.propuesta.id, 7);
  assert.equal(decision.confianza, "baja");
  assert.ok(DIAS_CERCA < 25, "el margen cercano debe ser mas estrecho que la distancia usada");
});

// ---------------------------------------------------------------------------
// Sugerencia de cuenta por historial
// ---------------------------------------------------------------------------

test("la sugerencia de cuenta viene del historial del mismo RUT", async () => {
  const { status, datos } = await pedir(
    `/api/sugerencias-cuenta?empresa_id=${ctx.empresa}&periodo=${PERIODO}`
  );

  assert.equal(status, 200);

  const documento = datos.documentos.find(
    (d) => d.libro === "compras" && d.id === ctx.compraSinCuenta
  );

  assert.ok(documento, "la factura sin cuenta debe aparecer");
  assert.equal(documento.sugerencia.cuenta_id, ctx.luz);
  assert.equal(documento.sugerencia.basada_en, 3);
});

test("la sugerencia por RUT sirve al formulario de carga manual", async () => {
  const { status, datos } = await pedir(
    `/api/sugerencias-cuenta/por-rut?empresa_id=${ctx.empresa}&rut=${RUT_PROVEEDOR}&libro=compras`
  );

  assert.equal(status, 200);
  assert.equal(datos.sugerencia.cuenta_id, ctx.luz);
  assert.equal(datos.sugerencia.codigo, "5101010");
});

test("un RUT sin historial no recibe sugerencia inventada", async () => {
  const { datos } = await pedir(
    `/api/sugerencias-cuenta/por-rut?empresa_id=${ctx.empresa}&rut=99888777-6`
  );

  assert.equal(datos.sugerencia, null);
  assert.match(datos.detalle, /no hay documentos anteriores/i);
});

test("aplicar una sugerencia asigna la cuenta y no pisa las ya asignadas", async () => {
  const primera = await enviar("/api/sugerencias-cuenta/aplicar", {
    empresa_id: ctx.empresa,
    documentos: [{ libro: "compras", id: ctx.compraSinCuenta, cuenta_id: ctx.luz }],
  });

  assert.equal(primera.status, 200);
  assert.equal(primera.datos.aplicados, 1);

  const { rows } = await pool.query(`SELECT cuenta_gasto_id FROM compras WHERE id = $1`, [
    ctx.compraSinCuenta,
  ]);

  assert.equal(Number(rows[0].cuenta_gasto_id), ctx.luz);

  // Segundo intento, ahora con otra cuenta: no debe sobrescribir.
  const segunda = await enviar("/api/sugerencias-cuenta/aplicar", {
    empresa_id: ctx.empresa,
    documentos: [{ libro: "compras", id: ctx.compraSinCuenta, cuenta_id: ctx.arriendo }],
  });

  assert.equal(segunda.datos.aplicados, 0);
  assert.equal(segunda.datos.rechazados, 1);
  assert.match(segunda.datos.detalle.rechazados[0].motivo, /ya tiene cuenta/i);

  const despues = await pool.query(`SELECT cuenta_gasto_id FROM compras WHERE id = $1`, [
    ctx.compraSinCuenta,
  ]);

  assert.equal(Number(despues.rows[0].cuenta_gasto_id), ctx.luz);
});

test("no se puede asignar una cuenta del plan de otra empresa", async () => {
  const otra = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa)
       VALUES ($1, $2, true) RETURNING id`,
      [`Y${SUFIJO}-3`, `Empresa con plan ajeno ${SUFIJO}`]
    )
  ).rows[0].id;

  const cuentaAjena = (
    await pool.query(
      `INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, naturaleza, nivel, activo)
       VALUES ($1, '5109999', 'Gasto ajeno', 'Gasto', 'Deudora', 4, true) RETURNING id`,
      [otra]
    )
  ).rows[0].id;

  const compra = (
    await pool.query(
      `INSERT INTO compras (empresa_id, periodo, fecha, tipo_documento, folio,
                            rut_proveedor, razon_social_proveedor, total, estado)
       VALUES ($1, $2, '2026-04-09', 'Factura', '777', '80111222-3', 'Otro proveedor',
               10000, 'vigente')
       RETURNING id`,
      [ctx.empresa, PERIODO]
    )
  ).rows[0].id;

  const { datos } = await enviar("/api/sugerencias-cuenta/aplicar", {
    empresa_id: ctx.empresa,
    documentos: [{ libro: "compras", id: compra, cuenta_id: cuentaAjena }],
  });

  assert.equal(datos.aplicados, 0);
  assert.match(datos.detalle.rechazados[0].motivo, /no pertenece a esta empresa/i);

  const { rows } = await pool.query(`SELECT cuenta_gasto_id FROM compras WHERE id = $1`, [
    compra,
  ]);

  assert.equal(rows[0].cuenta_gasto_id, null);
});

// ---------------------------------------------------------------------------
// Calendario tributario
// ---------------------------------------------------------------------------

test("el calendario pone el F29 al 20 para el facturador electronico y al 12 si no", () => {
  const conElectronica = obligacionesDelPeriodo("2026-04", {
    facturadorElectronico: true,
    hoy: "2026-05-01",
  });
  const sinElectronica = obligacionesDelPeriodo("2026-04", {
    facturadorElectronico: false,
    hoy: "2026-05-01",
  });

  const f29Con = conElectronica.obligaciones.find((o) => o.codigo === "f29");
  const f29Sin = sinElectronica.obligaciones.find((o) => o.codigo === "f29");

  assert.equal(f29Con.vence_nominal, "2026-05-20");
  assert.equal(f29Sin.vence_nominal, "2026-05-12");
});

test("el calendario corre el vencimiento que cae en fin de semana", () => {
  // El 12 de julio de 2026 es domingo.
  const domingo = proximoDiaHabil("2026-07-12");

  assert.equal(domingo.fecha, "2026-07-13");
  assert.equal(domingo.movida, true);

  const habil = proximoDiaHabil("2026-07-14");

  assert.equal(habil.fecha, "2026-07-14");
  assert.equal(habil.movida, false);
});

test("el calendario salta el feriado del 21 de mayo", () => {
  const resultado = proximoDiaHabil("2026-05-21");

  assert.equal(resultado.movida, true);
  assert.equal(resultado.fecha, "2026-05-22");
});

test("la Pascua se calcula bien, que es de donde salen Viernes y Sabado Santo", () => {
  assert.equal(domingoDePascua(2026).toISOString().slice(0, 10), "2026-04-05");
  assert.equal(domingoDePascua(2027).toISOString().slice(0, 10), "2027-03-28");
});

test("toda fecha del calendario viaja marcada para validar", async () => {
  const { status, datos } = await pedir(`/api/calendario-tributario?periodo=${PERIODO}`);

  assert.equal(status, 200);
  assert.ok(datos.obligaciones.length >= 3);
  assert.ok(datos.obligaciones.every((o) => o.requiere_validacion === true));
  assert.match(datos.aviso, /confirmar/i);
});

test("el calendario de una empresa concreta respeta la membresia", async () => {
  const otra = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa)
       VALUES ($1, $2, true) RETURNING id`,
      [`Z${SUFIJO}-4`, `Empresa sin acceso ${SUFIJO}`]
    )
  ).rows[0].id;

  const { status } = await pedir(
    `/api/calendario-tributario?empresa_id=${otra}&periodo=${PERIODO}`
  );

  assert.equal(status, 403);
});

// ---------------------------------------------------------------------------
// Flujo de caja
// ---------------------------------------------------------------------------

test("el flujo de caja informa la venta pendiente de cobro", async () => {
  const { status, datos } = await pedir(
    `/api/flujo-caja?empresa_id=${ctx.empresa}&plazo_dias=30`
  );

  assert.equal(status, 200);
  assert.equal(datos.plazo_dias, 30);
  assert.ok(datos.por_cobrar.total >= 238000);
  assert.ok(datos.por_cobrar.detalle.some((d) => d.id === ctx.venta));
  assert.equal(datos.proyeccion.es_estimacion, true);
  assert.ok(datos.proyeccion.supuestos.length >= 3);
});

test("la antiguedad reparte los saldos en los tramos correctos", () => {
  const documentos = [
    { id: 1, fecha: "2026-04-01", total: 1000, pagado: 0, saldo: 1000 },
    { id: 2, fecha: "2026-03-01", total: 2000, pagado: 0, saldo: 2000 },
    { id: 3, fecha: "2025-10-01", total: 3000, pagado: 0, saldo: 3000 },
  ];

  const resultado = agruparPorAntiguedad(documentos, {
    hoy: "2026-05-15",
    plazoDias: 30,
  });

  assert.equal(resultado.total, 6000);

  const tramo = (codigo) => resultado.tramos.find((t) => t.codigo === codigo);

  // Vence 2026-05-01: 14 días vencido.
  assert.equal(tramo("1_30").monto, 1000);
  // Vence 2026-03-31: 45 días vencido.
  assert.equal(tramo("31_60").monto, 2000);
  // Vence 2025-10-31: muy vencido.
  assert.equal(tramo("mas_90").monto, 3000);
});

test("un documento por vencer no se cuenta como vencido", () => {
  const resultado = agruparPorAntiguedad(
    [{ id: 1, fecha: "2026-05-10", total: 500, pagado: 0, saldo: 500 }],
    { hoy: "2026-05-15", plazoDias: 30 }
  );

  const alDia = resultado.tramos.find((t) => t.codigo === "al_dia");

  assert.equal(alDia.monto, 500);
  assert.equal(resultado.detalle[0].dias_vencido < 0, true);
});

test("la proyeccion deja lo ya vencido aparte en lugar de diluirlo", () => {
  const proyeccion = proyectar(
    [{ fecha: "2025-01-01", saldo: 900000 }],
    // Vence 2026-05-20 (fecha + 30 dias), que cae en la primera semana.
    [{ fecha: "2026-04-20", saldo: 100000 }],
    { hoy: "2026-05-15", plazoDias: 30, semanas: 4 }
  );

  assert.equal(proyeccion.vencido.ingresos, 900000);
  assert.equal(proyeccion.resumen.ingresos_proyectados, 0);
  assert.equal(proyeccion.semanas.length, 4);
  assert.equal(proyeccion.semanas[0].egresos, 100000);
  assert.equal(proyeccion.resumen.primera_semana_negativa, 1);
});

test("el flujo de caja no deja consultar otra empresa", async () => {
  const otra = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa)
       VALUES ($1, $2, true) RETURNING id`,
      [`W${SUFIJO}-5`, `Empresa flujo ajeno ${SUFIJO}`]
    )
  ).rows[0].id;

  const { status } = await pedir(`/api/flujo-caja?empresa_id=${otra}`);

  assert.equal(status, 403);
});
