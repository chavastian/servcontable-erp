/**
 * Bloque 5 de la revisión del 19-09-2026: deuda técnica del backend.
 *
 * - Anular un comprobante descontabiliza liquidaciones, finiquitos, pagos de
 *   remuneraciones y conciliación.
 * - Feriados reales: solsticio, traslados al lunes y al viernes, 17 y 20 de
 *   septiembre.
 * - Licencia médica con y sin tilde.
 * - Libros de compra y venta con notas de crédito restando.
 * - Calce bancario con una consulta por sentido, no una por movimiento.
 * - Un finiquito saca al trabajador de la nómina.
 * - Asignación familiar por tramo y cargas; asiento de nómina a fin de mes.
 * - La base rechaza estados y períodos fuera de formato.
 *
 *   DATABASE_URL=<staging o test> node --test test/bloque5.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_bloque5_no_produccion_32_carac";
process.env.COBRANZA_AUTOMATICA = "false";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");
const { feriadosDelAnio } = require("../src/helpers/calendarioTributario.helper");
const { describirErrorFila } = require("../src/helpers/importacion.helper");
const { candidatosPorMonto } = require("../src/helpers/calceBancario.helper");

const SUFIJO = `b5${Date.now().toString().slice(-8)}`;
const CLAVE = "Bloque5-2026";
const CORREO = `${SUFIJO}@test.local`;
const PERIODO = "2033-02";
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
      [`B5${SUFIJO}-1`, `Empresa bloque5 ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.caja = await cuenta("1101001", "Caja", "Activo", "Deudora");
  ctx.sueldos = await cuenta("3101001", "Sueldos", "Gasto", "Deudora");
  ctx.porPagar = await cuenta("2101001", "Sueldos por pagar", "Pasivo", "Acreedora");
  ctx.afp = await cuenta("2101002", "AFP por pagar", "Pasivo", "Acreedora");
  ctx.salud = await cuenta("2101003", "Salud por pagar", "Pasivo", "Acreedora");
  ctx.afc = await cuenta("2101004", "AFC por pagar", "Pasivo", "Acreedora");
  ctx.mutual = await cuenta("2101005", "Mutual por pagar", "Pasivo", "Acreedora");
  ctx.impuesto = await cuenta("2101006", "Impuesto único por pagar", "Pasivo", "Acreedora");
  ctx.otros = await cuenta("2101007", "Otros descuentos por pagar", "Pasivo", "Acreedora");
  ctx.ventasCta = await cuenta("4101001", "Ventas", "Ingreso", "Acreedora");

  await pool.query(
    `INSERT INTO configuracion_contable (empresa_id, cuenta_caja_banco_id, cuenta_ingreso_defecto_id, facturador_electronico)
     VALUES ($1, $2, $3, false)`,
    [ctx.empresa, ctx.caja, ctx.ventasCta]
  );

  ctx.trabajador = (
    await pool.query(
      `INSERT INTO trabajadores (empresa_id, rut, nombres, apellidos, fecha_ingreso, estado, sueldo_base, afp, salud,
                                 tipo_contrato, tramo_asignacion, cargas)
       VALUES ($1, '16153127-8', 'Luis', 'Prueba', '2030-01-01', 'activo', 600000, 'MODELO', 'FONASA', 'Indefinido', 'A', 2)
       RETURNING id`,
      [ctx.empresa]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO configuracion_remuneraciones
       (empresa_id, periodo, valor_uf, ingreso_minimo, tope_imponible_uf, tasa_afc_trabajador, tasa_afc_empleador, tasa_mutual,
        tramo_asignacion_a, tramo_asignacion_b, tramo_asignacion_c,
        cuenta_sueldos_id, cuenta_afp_id, cuenta_salud_id, cuenta_afc_id, cuenta_mutual_id, cuenta_sueldos_por_pagar_id,
        cuenta_impuesto_unico_id, cuenta_otros_descuentos_id, cuenta_sis_empleador_id, cuenta_afc_empleador_id, cuenta_mutual_empleador_id,
        indicadores_previsionales)
     VALUES ($1, $2, 40000, 550000, 90, 0.6, 2.4, 0.95, 22007, 13505, 4267,
             $3, $4, $5, $6, $7, $8, $9, $10, $3, $3, $3, '{"valor_utm": 70000}'::jsonb)`,
    [ctx.empresa, PERIODO, ctx.sueldos, ctx.afp, ctx.salud, ctx.afc, ctx.mutual, ctx.porPagar, ctx.impuesto, ctx.otros]
  );
  await pool.query(
    `INSERT INTO afp_parametros (empresa_id, periodo, nombre, tasa_afp, tasa_sis, tasa_seguro_social, activo)
     VALUES ($1, $2, 'MODELO', 10.58, 1.54, 1, true)`,
    [ctx.empresa, PERIODO]
  );

  // Una venta y su nota de crédito, para el libro.
  await pool.query(
    `INSERT INTO ventas (empresa_id, periodo, fecha, tipo_documento, sii_tipo_doc, folio, rut_cliente, razon_social_cliente, neto, exento, iva, total, estado)
     VALUES ($1, $2, $3, 'Factura', '33', '100', '12345678-5', 'Cliente', 100000, 0, 19000, 119000, 'vigente'),
            ($1, $2, $3, 'Nota de Crédito', '61', '7', '12345678-5', 'Cliente', 40000, 0, 7600, 47600, 'vigente')`,
    [ctx.empresa, PERIODO, `${PERIODO}-10`]
  );

  // Movimiento bancario que calza con la venta.
  await pool.query(
    `INSERT INTO conciliacion_bancaria_movimientos (empresa_id, periodo, fecha, descripcion, cargo, abono, monto, saldo, estado)
     VALUES ($1, $2, $3, 'Transferencia 12345678-5', 0, 119000, 119000, 0, 'pendiente')`,
    [ctx.empresa, PERIODO, `${PERIODO}-12`]
  );

  const hash = await bcrypt.hash(CLAVE, 10);
  ctx.usuario = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES ('Bloque5', $1, $2, 'admin_cliente', true) RETURNING id`,
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

test("los feriados reales: solsticio, traslados al lunes y al viernes, 17 y 20 de septiembre", () => {
  const f2023 = feriadosDelAnio(2023);
  assert.ok(f2023.has("2023-06-26"), "San Pedro y San Pablo 2023 cae jueves y se corre al lunes 26");
  assert.ok(!f2023.has("2023-06-29"));
  assert.ok(f2023.has("2023-10-09"), "12 de octubre 2023 jueves → lunes 9");
  assert.ok(f2023.has("2023-10-27"), "31 de octubre 2023 martes → viernes 27");
  assert.ok(f2023.has("2023-06-21"), "solsticio 2023");

  const f2024 = feriadosDelAnio(2024);
  assert.ok(f2024.has("2024-06-20"), "solsticio 2024");
  assert.ok(f2024.has("2024-09-20"), "18 en miércoles: el viernes 20 es feriado");
  assert.ok(f2024.has("2024-06-29"), "sábado no se traslada");

  const f2026 = feriadosDelAnio(2026);
  assert.ok(f2026.has("2026-06-21"), "solsticio 2026");
  assert.ok(!f2026.has("2026-06-20"));
  assert.ok(f2026.has("2026-06-29") && f2026.has("2026-10-12"), "lunes se quedan");

  const f2018 = feriadosDelAnio(2018);
  assert.ok(f2018.has("2018-07-02"), "29 de junio 2018 viernes → lunes 2 de julio");
  assert.ok(f2018.has("2018-11-02"), "31 de octubre 2018 miércoles → viernes 2 de noviembre");
  assert.ok(f2018.has("2018-09-17"), "18 en martes: el lunes 17 es feriado");
});

test("el error de una fila importada no revela el mensaje de PostgreSQL", () => {
  assert.equal(describirErrorFila({ code: "23505", message: 'duplicate key value violates unique constraint "uq_x"' }), "documento duplicado");
  assert.equal(describirErrorFila(new Error("column x does not exist")), "no se pudo guardar la fila");
  assert.equal(describirErrorFila(Object.assign(new Error("Falta la fecha"), { statusCode: 400 })), "Falta la fecha");
});

test("el libro de ventas resta las notas de crédito en totales y resumen por tipo", async () => {
  const { status, datos } = await pedir(
    `/api/libros-tributarios/ventas?empresa_id=${ctx.empresa}&fecha_desde=${PERIODO}-01&fecha_hasta=${PERIODO}-28`
  );
  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));
  assert.equal(Number(datos.totales.neto), 60000);
  assert.equal(Number(datos.totales.iva), 11400);
  assert.equal(Number(datos.totales.total), 71400);
  const nc = (datos.resumen_tipo_documento || []).find((r) => String(r.tipo_doc) === "61");
  assert.ok(nc, "la NC aparece en el resumen");
  assert.equal(Number(nc.total), -47600);
});

test("el calce bancario trae los candidatos de todos los montos en una consulta", async () => {
  const porMonto = await candidatosPorMonto(pool, ctx.empresa, [119000, 5], true);
  assert.equal(porMonto.get(119000).length, 1);
  assert.equal(porMonto.get(119000)[0].origen, "venta");
  assert.equal(porMonto.get(5), undefined);

  const { status, datos } = await pedir(
    `/api/conciliacion-bancaria/sugerencias?empresa_id=${ctx.empresa}&periodo=${PERIODO}`
  );
  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));
  const propuestas = datos.propuestas || datos.calces?.propuestas || [];
  assert.equal(propuestas.length, 1);
  assert.equal(propuestas[0].calza_con.origen, "venta");
  assert.equal(propuestas[0].confianza, "alta");
});

test("licencia médica cuenta con y sin tilde", async () => {
  await pool.query(
    `INSERT INTO vacaciones_ausencias (empresa_id, trabajador_id, periodo, tipo, fecha_inicio, fecha_termino, dias, estado)
     VALUES ($1, $2, $3, 'Licencia medica', $4, $5, 3, 'vigente'),
            ($1, $2, $3, 'Licencia médica', $4, $5, 2, 'vigente')`,
    [ctx.empresa, ctx.trabajador, PERIODO, `${PERIODO}-03`, `${PERIODO}-05`]
  );

  const { status, datos } = await pedir(
    `/api/vacaciones-ausencias/resumen-trabajador?empresa_id=${ctx.empresa}&trabajador_id=${ctx.trabajador}`
  );
  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));
  const texto = JSON.stringify(datos);
  assert.match(texto, /"dias_licencias":"?5/);
});

test("la liquidación paga asignación familiar por tramo y cargas, y la nómina se centraliza a fin de mes", async () => {
  const { status, datos } = await enviar("/api/liquidaciones", {
    empresa_id: ctx.empresa,
    trabajador_id: ctx.trabajador,
    periodo: PERIODO,
    dias_trabajados: 30,
  });
  assert.equal(status, 201, JSON.stringify(datos).slice(0, 300));
  const l = datos.liquidacion;
  assert.equal(Number(l.asignacion_familiar), 2 * 22007);
  assert.equal(Number(l.total_haberes_no_imponibles), 2 * 22007);
  ctx.liquidacion = l.id;

  const cont = await enviar("/api/liquidaciones/contabilizar", { empresa_id: ctx.empresa, periodo: PERIODO });
  assert.equal(cont.status, 200, JSON.stringify(cont.datos).slice(0, 300));
  const comprobante = await pool.query(`SELECT c.id, c.fecha FROM liquidaciones l JOIN comprobantes c ON c.id = l.comprobante_id WHERE l.id = $1`, [ctx.liquidacion]);
  assert.ok(comprobante.rows[0], "queda contabilizada");
  assert.equal(new Date(comprobante.rows[0].fecha).getUTCDate(), 28, "febrero de 2033 termina el 28");
  ctx.comprobanteNomina = comprobante.rows[0].id;
});

test("anular el comprobante de nómina descontabiliza la liquidación", async () => {
  const { status, datos } = await enviar(`/api/comprobantes/${ctx.comprobanteNomina}`, { empresa_id: ctx.empresa }, "DELETE");
  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));

  const { rows } = await pool.query(`SELECT contabilizada, comprobante_id FROM liquidaciones WHERE id = $1`, [ctx.liquidacion]);
  assert.equal(rows[0].contabilizada, false);
  assert.equal(rows[0].comprobante_id, null);
});

test("un finiquito saca al trabajador de la nómina", async () => {
  const { status, datos } = await enviar("/api/finiquitos", {
    empresa_id: ctx.empresa,
    trabajador_id: ctx.trabajador,
    fecha_termino: `${PERIODO}-28`,
    causal: "Art. 159 Nro.2 - Renuncia del trabajador",
  });
  assert.equal(status, 201, JSON.stringify(datos).slice(0, 300));

  const { rows } = await pool.query(`SELECT estado, fecha_termino FROM trabajadores WHERE id = $1`, [ctx.trabajador]);
  assert.equal(rows[0].estado, "finiquitado");
  assert.equal(new Date(rows[0].fecha_termino).getUTCDate(), 28);
});

test("la base rechaza estados y períodos fuera de formato", async () => {
  await assert.rejects(
    pool.query(`UPDATE trabajadores SET estado = 'cualquiera' WHERE id = $1`, [ctx.trabajador]),
    /chk_trabajadores_estado/
  );
  await assert.rejects(
    pool.query(`UPDATE liquidaciones SET periodo = '2033-2' WHERE id = $1`, [ctx.liquidacion]),
    /chk_liquidaciones_periodo/
  );
});

test("la importación de indicadores exige la empresa después del archivo", async () => {
  const respuesta = await fetch(`${ctx.raiz}/api/configuracion-remuneraciones/importar-indicadores`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.token}` },
    body: new FormData(),
  });
  assert.equal(respuesta.status, 400);
});

test("la validación por esquema rechaza cuerpos malformados y los listados paginan", async () => {
  const malo = await enviar("/api/trabajadores", { empresa_id: ctx.empresa, rut: "1-9", nombres: "X", fecha_ingreso: "31/12/2030" });
  assert.equal(malo.status, 400);
  assert.match(malo.datos.error, /fecha_ingreso/);

  const sinMotivo = await enviar("/api/ejercicios/1/reabrir", { empresa_id: ctx.empresa, motivo: "no" }, "PUT");
  assert.equal(sinMotivo.status, 400);
  assert.match(sinMotivo.datos.error, /motivo/);

  await pool.query(
    `INSERT INTO ventas (empresa_id, periodo, fecha, tipo_documento, sii_tipo_doc, folio, rut_cliente, razon_social_cliente, neto, exento, iva, total, estado)
     VALUES ($1, $2, $3, 'Factura', '33', '101', '12345678-5', 'Cliente', 1000, 0, 190, 1190, 'vigente')`,
    [ctx.empresa, PERIODO, `${PERIODO}-11`]
  );
  const pagina1 = await pedir(`/api/ventas?empresa_id=${ctx.empresa}&periodo=${PERIODO}&limite=2&pagina=1`);
  assert.equal(pagina1.status, 200, JSON.stringify(pagina1.datos).slice(0, 200));
  assert.equal(pagina1.datos.ventas.length, 2);
  assert.equal(pagina1.datos.paginacion.hay_mas, true);
  const pagina2 = await pedir(`/api/ventas?empresa_id=${ctx.empresa}&periodo=${PERIODO}&limite=2&pagina=2`);
  assert.equal(pagina2.datos.ventas.length, 1);
  assert.equal(pagina2.datos.paginacion.hay_mas, false);
  const todo = await pedir(`/api/ventas?empresa_id=${ctx.empresa}&periodo=${PERIODO}`);
  assert.equal(todo.datos.ventas.length, 3);
  assert.equal(todo.datos.paginacion, null);
});
