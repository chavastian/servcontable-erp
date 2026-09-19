/**
 * Bloque 4 de la revisión del 19-09-2026: cierre de ejercicio con asientos y
 * remuneraciones completas.
 *
 * - Cerrar el año genera el asiento de cierre de resultados y el de apertura;
 *   reabrir exige motivo, queda auditado y anula ambos asientos.
 * - El libro mayor parte del saldo anterior al rango.
 * - Vacaciones en días hábiles, con feriado progresivo.
 * - Finiquito calculado en el servidor: art. 161 con tope de 90 UF y
 *   sustitutiva del aviso; renuncia sin indemnización.
 * - Isapre con plan en UF: se descuenta el plan y el adicional no rebaja la
 *   base tributable.
 * - Archivo LRE con una fila por liquidación.
 *
 *   DATABASE_URL=<staging o test> node --test test/bloque4.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_bloque4_no_produccion_32_carac";
process.env.COBRANZA_AUTOMATICA = "false";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");
const {
  contarDiasHabiles,
  habilesACorridos,
  calcularVacacionesDevengadas,
  diasProgresivosPorAnio,
} = require("../src/helpers/vacaciones.helper");
const { tiempoDeServicio, reglaPorCausal } = require("../src/helpers/finiquito.helper");
const { construirCsv, COLUMNAS } = require("../src/controllers/libroRemuneracionesElectronico.controller");

const SUFIJO = `b4${Date.now().toString().slice(-8)}`;
const CLAVE = "Bloque4-2026";
const CORREO = `${SUFIJO}@test.local`;
const ANIO = 2032;
const PERIODO = "2032-05";
const UF = 40000;
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

async function asiento(fecha, lineas, numero) {
  const debe = lineas.reduce((s, l) => s + (l.debe || 0), 0);
  const haber = lineas.reduce((s, l) => s + (l.haber || 0), 0);
  const { rows } = await pool.query(
    `INSERT INTO comprobantes (empresa_id, periodo, fecha, tipo, numero, glosa, total_debe, total_haber, estado)
     VALUES ($1, $2, $3, 'Traspaso', $4, 'Prueba bloque 4', $5, $6, 'vigente') RETURNING id`,
    [ctx.empresa, fecha.slice(0, 7), fecha, numero, debe, haber]
  );

  for (const l of lineas) {
    await pool.query(
      `INSERT INTO comprobante_detalle (comprobante_id, cuenta_id, glosa, debe, haber) VALUES ($1, $2, 'l', $3, $4)`,
      [rows[0].id, l.cuenta, l.debe || 0, l.haber || 0]
    );
  }

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
      [`B4${SUFIJO}-1`, `Empresa bloque4 ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.caja = await cuenta("1101001", "Caja", "Activo", "Deudora");
  ctx.capital = await cuenta("2301001", "Capital", "Patrimonio", "Acreedora");
  ctx.resultado = await cuenta("2302001", "Resultado del ejercicio", "Patrimonio", "Acreedora");
  ctx.ventas = await cuenta("4101001", "Ventas", "Ingreso", "Acreedora");
  ctx.gastos = await cuenta("3101001", "Gastos", "Gasto", "Deudora");

  await pool.query(
    `INSERT INTO configuracion_contable (empresa_id, cuenta_caja_banco_id, cuenta_resultado_ejercicio_id, facturador_electronico)
     VALUES ($1, $2, $3, false)`,
    [ctx.empresa, ctx.caja, ctx.resultado]
  );

  ctx.ejercicio = (
    await pool.query(
      `INSERT INTO ejercicios_contables (empresa_id, anio, estado, fecha_inicio, fecha_termino)
       VALUES ($1, $2, 'abierto', $3, $4) RETURNING id`,
      [ctx.empresa, ANIO, `${ANIO}-01-01`, `${ANIO}-12-31`]
    )
  ).rows[0].id;

  // Capital 1.000.000 en caja; ventas 500.000; gastos 200.000: utilidad 300.000.
  await asiento(`${ANIO}-01-05`, [{ cuenta: ctx.caja, debe: 1000000 }, { cuenta: ctx.capital, haber: 1000000 }], 1);
  await asiento(`${ANIO}-03-10`, [{ cuenta: ctx.caja, debe: 500000 }, { cuenta: ctx.ventas, haber: 500000 }], 2);
  await asiento(`${ANIO}-06-15`, [{ cuenta: ctx.gastos, debe: 200000 }, { cuenta: ctx.caja, haber: 200000 }], 3);

  // Remuneraciones: trabajador con Isapre en UF y diez años previos cotizados.
  ctx.trabajador = (
    await pool.query(
      `INSERT INTO trabajadores (empresa_id, rut, nombres, apellidos, fecha_ingreso, estado, sueldo_base, afp, salud,
                                 tipo_contrato, plan_salud_uf, anios_cotizados_previos, seguro_cesantia)
       VALUES ($1, '16153127-8', 'Ana', 'Prueba', '2027-03-01', 'activo', 1500000, 'MODELO', 'Isapre Consalud',
               'Indefinido', 4, 10, 'SI') RETURNING id`,
      [ctx.empresa]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO configuracion_remuneraciones
       (empresa_id, periodo, valor_uf, ingreso_minimo, tope_imponible_uf, tasa_afc_trabajador, tasa_afc_empleador, tasa_mutual, indicadores_previsionales)
     VALUES ($1, $2, $3, 550000, 90, 0.6, 2.4, 0.95, '{"valor_utm": 70000}'::jsonb)`,
    [ctx.empresa, PERIODO, UF]
  );
  await pool.query(
    `INSERT INTO afp_parametros (empresa_id, periodo, nombre, tasa_afp, tasa_sis, tasa_seguro_social, activo)
     VALUES ($1, $2, 'MODELO', 10.58, 1.54, 1, true)`,
    [ctx.empresa, PERIODO]
  );

  const hash = await bcrypt.hash(CLAVE, 10);
  ctx.usuario = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES ('Bloque4', $1, $2, 'admin_cliente', true) RETURNING id`,
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

// ------------------------------------------------------------------ cierre

test("cerrar el año genera cierre de resultados y apertura del siguiente", async () => {
  const { status, datos } = await enviar(`/api/ejercicios/${ctx.ejercicio}/cerrar`, {
    empresa_id: ctx.empresa,
    observacion: "Cierre de prueba",
  }, "PUT");

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));
  assert.equal(datos.resultado_ejercicio, 300000);
  assert.ok(datos.comprobante_cierre?.id, "debe crear el asiento de cierre");
  assert.ok(datos.comprobante_apertura?.id, "debe crear el asiento de apertura");
  assert.equal(datos.ejercicio.cerrado_por, ctx.usuario);

  const cierre = await pool.query(
    `SELECT cuenta_id, debe, haber FROM comprobante_detalle WHERE comprobante_id = $1 ORDER BY id`,
    [datos.comprobante_cierre.id]
  );
  const porCuenta = Object.fromEntries(cierre.rows.map((r) => [r.cuenta_id, { debe: Number(r.debe), haber: Number(r.haber) }]));

  assert.deepEqual(porCuenta[ctx.ventas], { debe: 500000, haber: 0 });
  assert.deepEqual(porCuenta[ctx.gastos], { debe: 0, haber: 200000 });
  assert.deepEqual(porCuenta[ctx.resultado], { debe: 0, haber: 300000 });

  const apertura = await pool.query(
    `SELECT c.fecha, c.periodo, cd.cuenta_id, cd.debe, cd.haber
     FROM comprobante_detalle cd JOIN comprobantes c ON c.id = cd.comprobante_id
     WHERE cd.comprobante_id = $1 ORDER BY cd.id`,
    [datos.comprobante_apertura.id]
  );
  const ap = Object.fromEntries(apertura.rows.map((r) => [r.cuenta_id, { debe: Number(r.debe), haber: Number(r.haber) }]));

  assert.equal(apertura.rows[0].periodo, `${ANIO + 1}-01`);
  assert.deepEqual(ap[ctx.caja], { debe: 1300000, haber: 0 });
  assert.deepEqual(ap[ctx.capital], { debe: 0, haber: 1000000 });
  assert.deepEqual(ap[ctx.resultado], { debe: 0, haber: 300000 });
  assert.equal(ap[ctx.ventas], undefined, "las cuentas de resultado no se abren");

  const siguiente = await pool.query(
    `SELECT estado FROM ejercicios_contables WHERE empresa_id = $1 AND anio = $2`,
    [ctx.empresa, ANIO + 1]
  );
  assert.equal(siguiente.rows[0]?.estado, "abierto", "debe crear el año siguiente abierto");

  ctx.cierreId = datos.comprobante_cierre.id;
  ctx.aperturaId = datos.comprobante_apertura.id;
});

test("el balance del año siguiente parte con los saldos abiertos y el mayor muestra saldo inicial", async () => {
  const balance = await pedir(
    `/api/balance-8-columnas?empresa_id=${ctx.empresa}&fecha_desde=${ANIO + 1}-01-01&fecha_hasta=${ANIO + 1}-12-31`
  );
  assert.equal(balance.status, 200, JSON.stringify(balance.datos).slice(0, 200));
  const caja = (balance.datos.filas || []).find((f) => Number(f.cuenta_id) === ctx.caja);
  assert.ok(caja, "Caja debe aparecer en el balance del año siguiente");
  assert.equal(Number(caja.debitos), 1300000);

  const mayor = await pedir(
    `/api/libro-mayor?empresa_id=${ctx.empresa}&fecha_desde=${ANIO}-06-01&fecha_hasta=${ANIO}-06-30&cuenta_id=${ctx.caja}`
  );
  assert.equal(mayor.status, 200, JSON.stringify(mayor.datos).slice(0, 200));
  assert.equal(mayor.datos.saldos_iniciales[0].saldo, 1500000, "saldo de Caja antes de junio");
  assert.equal(mayor.datos.movimientos[0].saldo_inicial, 1500000);
  assert.equal(mayor.datos.movimientos[0].saldo_acumulado, 1300000);
});

test("reabrir exige motivo, anula los asientos y queda auditado", async () => {
  const sinMotivo = await enviar(`/api/ejercicios/${ctx.ejercicio}/reabrir`, { empresa_id: ctx.empresa }, "PUT");
  assert.equal(sinMotivo.status, 400);

  const { status, datos } = await enviar(
    `/api/ejercicios/${ctx.ejercicio}/reabrir`,
    { empresa_id: ctx.empresa, motivo: "Faltó una factura de diciembre" },
    "PUT"
  );
  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));
  assert.equal(datos.ejercicio.estado, "abierto");
  assert.equal(datos.ejercicio.reabierto_por, ctx.usuario);
  assert.equal(datos.ejercicio.motivo_reapertura, "Faltó una factura de diciembre");

  const estados = await pool.query(`SELECT id, estado, motivo_anulacion FROM comprobantes WHERE id = ANY($1)`, [[ctx.cierreId, ctx.aperturaId]]);
  assert.ok(estados.rows.every((r) => r.estado === "anulado"), "cierre y apertura anulados");
  assert.match(estados.rows[0].motivo_anulacion, /Reapertura/);

  const lista = await pedir(`/api/ejercicios?empresa_id=${ctx.empresa}`);
  const fila = lista.datos.ejercicios.find((e) => e.id === ctx.ejercicio);
  assert.equal(fila.reabierto_por_nombre, "Bloque4");
});

test("no se cierra sin cuenta de resultado configurada", async () => {
  await pool.query(`UPDATE configuracion_contable SET cuenta_resultado_ejercicio_id = NULL WHERE empresa_id = $1`, [ctx.empresa]);
  const { status, datos } = await enviar(`/api/ejercicios/${ctx.ejercicio}/cerrar`, { empresa_id: ctx.empresa }, "PUT");
  assert.equal(status, 400);
  assert.match(datos.error, /Resultado del Ejercicio/);
  await pool.query(`UPDATE configuracion_contable SET cuenta_resultado_ejercicio_id = $2 WHERE empresa_id = $1`, [ctx.empresa, ctx.resultado]);
});

// -------------------------------------------------------------- vacaciones

test("las vacaciones se cuentan en días hábiles con feriados y progresivo", () => {
  // Lunes 14 a viernes 25 de septiembre de 2026: dos semanas, con el 18 y 19
  // feriados (19 es sábado) = 9 hábiles.
  assert.equal(contarDiasHabiles("2026-09-14", "2026-09-25"), 9);
  // 10 hábiles desde el viernes 11-09-2026: con el 18 feriado y dos fines de
  // semana se llega al lunes 28: 17 corridos.
  assert.equal(habilesACorridos("2026-09-11", 10), 17);
  // Un año exacto: 15 días.
  assert.equal(calcularVacacionesDevengadas("2025-01-01", "2025-12-31"), 15);
  // Diez años previos + 3 en la empresa: 1 día progresivo (13 años, 3 sobre 10).
  assert.equal(diasProgresivosPorAnio("2027-03-01", "2030-03-01", 10), 1);
  assert.equal(diasProgresivosPorAnio("2027-03-01", "2029-03-01", 0), 0);
});

test("el saldo de vacaciones acepta un periodo de 30 días y usa el devengo unificado", async () => {
  const { status, datos } = await pedir(`/api/saldo-vacaciones?empresa_id=${ctx.empresa}&periodo=2032-04&trabajador_id=${ctx.trabajador}`);
  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));
  assert.equal(datos.fecha_corte, "2032-04-30");
  // Ingreso 2027-03-01, corte 2032-04-30: 62 meses; 15/12 × 62 = 77,5 más el
  // progresivo (10 previos + 5,17 = 15,17 años → 1 día/año: 62/12 = 5,17).
  assert.equal(datos.saldos[0].dias_devengados, 82.67);
});

// --------------------------------------------------------------- finiquito

test("tiempo de servicio y reglas por causal", () => {
  const t = tiempoDeServicio("2020-03-15", "2026-10-01");
  assert.equal(t.anios, 6);
  assert.equal(t.meses, 6);
  assert.equal(t.aniosReconocidos, 7, "seis meses y días cuentan como año");
  assert.equal(tiempoDeServicio("2015-01-01", "2032-01-01").aniosReconocidos, 11, "tope 11");
  assert.equal(tiempoDeServicio("2026-01-01", "2026-10-01").aniosReconocidos, 0, "menos de un año no indemniza");
  assert.equal(reglaPorCausal("Art. 161 inciso 1 - Necesidades de la empresa").pagaIndemnizacionAnios, true);
  assert.equal(reglaPorCausal("Art. 159 Nro.2 - Renuncia del trabajador").pagaIndemnizacionAnios, false);
  assert.equal(reglaPorCausal("Art. 159 Nro.5 - Conclusion del trabajo", "Obra o faena").pagaObraFaena, true);
});

test("finiquito art. 161 en el servidor: tope 90 UF, sustitutiva del aviso, AFC e impuesto", async () => {
  // Sueldo alto para gatillar el tope: 90 UF × 40.000 = 3.600.000.
  await pool.query(`UPDATE trabajadores SET sueldo_base = 5000000 WHERE id = $1`, [ctx.trabajador]);

  const { status, datos } = await enviar("/api/finiquitos/calcular", {
    empresa_id: ctx.empresa,
    trabajador_id: ctx.trabajador,
    fecha_termino: `${PERIODO}-20`,
    causal: "Art. 161 inciso 1 - Necesidades de la empresa",
    indemnizacion_voluntaria: 1000000,
    dias_trabajados_mes: 20,
  });

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));
  const c = datos.calculo;

  assert.equal(c.tope_90_uf_aplicado, true);
  assert.equal(c.base_indemnizacion, 3600000);
  // 2027-03-01 a 2032-05-20: 5 años y 2 meses → 5 años.
  assert.equal(c.anios_servicio, 5);
  assert.equal(c.indemnizacion_anios_servicio, 18000000);
  assert.equal(c.indemnizacion_aviso_previo, 3600000, "sin aviso de 30 días paga la sustitutiva");
  assert.ok(c.seguro_cesantia_descuento > 0, "descuenta el aporte del empleador a la AFC");
  assert.ok(c.impuesto_unico_finiquito > 0, "la voluntaria tributa");
  assert.equal(c.sueldo_pendiente, Math.round((5000000 / 30) * 20));
  assert.ok(c.dias_vacaciones_a_pagar > 0);
  assert.equal(c.total_finiquito, c.total_haberes - c.total_descuentos);
  assert.ok(datos.avisos.some((a) => /REQUIERE VALIDACI/.test(a)));

  const conAviso = await enviar("/api/finiquitos/calcular", {
    empresa_id: ctx.empresa,
    trabajador_id: ctx.trabajador,
    fecha_termino: `${PERIODO}-20`,
    fecha_aviso: "2032-04-10",
    causal: "Art. 161 inciso 1 - Necesidades de la empresa",
  });
  assert.equal(conAviso.datos.calculo.indemnizacion_aviso_previo, 0, "40 días de aviso: sin sustitutiva");
  assert.equal(conAviso.datos.calculo.hubo_aviso_30_dias, true);

  await pool.query(`UPDATE trabajadores SET sueldo_base = 1500000 WHERE id = $1`, [ctx.trabajador]);
});

// ---------------------------------------------------------------- isapre

test("la liquidación descuenta el plan de Isapre en UF y el adicional no rebaja la base tributable", async () => {
  const { status, datos } = await enviar("/api/liquidaciones/calcular", {
    empresa_id: ctx.empresa,
    trabajador_id: ctx.trabajador,
    periodo: PERIODO,
    dias_trabajados: 30,
  });

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));
  const c = datos.calculo;
  const legal = Math.round(c.base_afecta_descuentos * 0.07);

  assert.equal(c.descuento_salud_legal, legal);
  assert.equal(c.descuento_salud, 4 * UF, "4 UF × 40.000");
  assert.equal(c.descuento_salud_adicional, 4 * UF - legal);
  assert.equal(c.base_tributable, Math.max(0, Math.round(c.base_imponible - c.descuento_afp - legal - c.descuento_afc)));
  assert.equal(c.total_descuentos, c.descuento_afp + c.descuento_salud + c.descuento_afc + c.impuesto_unico + c.otros_descuentos);

  const guardada = await enviar("/api/liquidaciones", {
    empresa_id: ctx.empresa,
    trabajador_id: ctx.trabajador,
    periodo: PERIODO,
    dias_trabajados: 30,
  });
  assert.equal(guardada.status, 201, JSON.stringify(guardada.datos).slice(0, 300));
  assert.equal(Number(guardada.datos.liquidacion.descuento_salud_adicional), 4 * UF - legal);
  ctx.liquidacion = guardada.datos.liquidacion.id;
});

test("el trabajador guarda plan en UF y años previos por la API", async () => {
  const { status, datos } = await enviar("/api/trabajadores", {
    empresa_id: ctx.empresa,
    rut: `${SUFIJO}-9`,
    nombres: "Nuevo",
    fecha_ingreso: "2032-01-01",
    plan_salud_uf: 2.5,
    anios_cotizados_previos: 4,
  });
  assert.equal(status, 201, JSON.stringify(datos).slice(0, 200));
  assert.equal(Number(datos.trabajador.plan_salud_uf), 2.5);
  assert.equal(datos.trabajador.anios_cotizados_previos, 4);
});

// -------------------------------------------------------------------- LRE

test("el archivo LRE lleva una fila por liquidación con los códigos de la DT", async () => {
  const respuesta = await fetch(`${ctx.raiz}/api/liquidaciones/lre?empresa_id=${ctx.empresa}&periodo=${PERIODO}`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  assert.equal(respuesta.status, 200);
  assert.match(respuesta.headers.get("content-type"), /text\/csv/);

  const texto = (await respuesta.text()).replace(/^﻿/, "");
  const lineas = texto.trim().split("\r\n");

  assert.equal(lineas.length, 2);
  assert.equal(lineas[0].split(";")[0], "1101");
  assert.equal(lineas[0].split(";").length, COLUMNAS.length);

  const fila = lineas[1].split(";");
  const indice = (codigo) => COLUMNAS.findIndex((c) => c[0] === codigo);
  assert.equal(fila[indice("1101")], "16153127-8");
  assert.equal(fila[indice("1102")], "01/03/2027");
  assert.equal(Number(fila[indice("3104")]), 4 * UF - Math.round(Number((await pool.query(`SELECT base_afecta_descuentos FROM liquidaciones WHERE id = $1`, [ctx.liquidacion])).rows[0].base_afecta_descuentos) * 0.07));
  assert.equal(fila[indice("1141")], "4");

  assert.equal(construirCsv([]).trim().split(";").length, COLUMNAS.length);
});

// Va al final: guardar el finiquito deja al trabajador fuera de la nómina
// (bloque 5), y las pruebas de liquidación lo necesitan activo.
test("una renuncia no paga indemnización aunque el cliente la mande, y el guardado recalcula", async () => {
  const { status, datos } = await enviar("/api/finiquitos", {
    empresa_id: ctx.empresa,
    trabajador_id: ctx.trabajador,
    periodo: PERIODO,
    fecha_termino: `${PERIODO}-31`,
    causal: "Art. 159 Nro.2 - Renuncia del trabajador",
    indemnizacion_anios_servicio: 9999999,
    indemnizacion_aviso_previo: 9999999,
    sueldo_pendiente: 1,
  });

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 300));
  const f = datos.finiquito;

  assert.equal(Number(f.indemnizacion_anios_servicio), 0);
  assert.equal(Number(f.indemnizacion_aviso_previo), 0);
  assert.equal(Number(f.sueldo_pendiente), 1, "el sueldo pendiente digitado se respeta como supuesto");
  assert.equal(f.calculado_en_servidor, true);
  assert.equal(f.supuestos.regla, "Art. 159");
  assert.ok(Number(f.vacaciones_proporcionales) > 0);
  assert.equal(Number(f.total_finiquito), Number(f.total_haberes) - Number(f.seguro_cesantia_descuento) - Number(f.otros_descuentos) - Number(f.descuentos) - Number(f.impuesto_unico_finiquito));
});
