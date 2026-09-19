/**
 * Bloque 1 de la revisión del 19-09-2026: lo que declaraba mal.
 *
 * - Las notas de crédito se contabilizaban con el signo de una factura.
 * - La retención de honorarios estaba fija en 14,5% y la mandaba el navegador.
 * - La gratificación mensual no tenía el tope de 4,75 ingresos mínimos.
 * - Las ausencias se descontaban dos veces y no rebajaban la base imponible.
 * - Sin tramos de impuesto único la liquidación se guardaba con impuesto cero.
 * - Los paneles comparaban contra tipos de cuenta que el plan base no usa.
 * - Dos proveedores con el mismo folio se pisaban; la misma factura manual
 *   entraba dos veces.
 * - El número del comprobante lo mandaba el navegador.
 * - La autoría se escribía en dos de doce tablas.
 *
 *   DATABASE_URL=<staging o test> node --test test/bloque1.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_bloque1_no_produccion_32_carac";
process.env.COBRANZA_AUTOMATICA = "false";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");
const { tasaRetencionVigente } = require("../src/helpers/retencionHonorarios.helper");
const { columnaBalancePorTipo, categoriaResultadoPorTipo } = require("../src/helpers/tipoCuenta.helper");

const SUFIJO = `b1${Date.now().toString().slice(-8)}`;
const CLAVE = "Bloque1-2026";
const CORREO = `${SUFIJO}@test.local`;
const PERIODO = "2026-05";
const ctx = {};

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

async function lineasDe(comprobanteId) {
  const { rows } = await pool.query(
    `SELECT cuenta_id, debe::numeric AS debe, haber::numeric AS haber
     FROM comprobante_detalle WHERE comprobante_id = $1 ORDER BY id`,
    [comprobanteId]
  );

  return rows.map((f) => ({ cuenta_id: f.cuenta_id, debe: Number(f.debe), haber: Number(f.haber) }));
}

test.before(async () => {
  const base = (await pool.query("SELECT current_database() AS d")).rows[0].d;

  if (!/test|staging/i.test(base)) {
    throw new Error(`La base "${base}" no es de pruebas.`);
  }

  ctx.empresa = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa) VALUES ($1, $2, true) RETURNING id`,
      [`B1${SUFIJO}-1`, `Empresa bloque1 ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.caja = await cuenta("1101001", "Caja", "Activo", "Deudora");
  ctx.clientes = await cuenta("1103001", "Clientes", "Activo", "Deudora");
  ctx.ivaCredito = await cuenta("1300901", "IVA credito fiscal", "Activo", "Deudora");
  ctx.proveedores = await cuenta("2101005", "Proveedores", "Pasivo", "Acreedora");
  ctx.ivaDebito = await cuenta("2101031", "IVA debito fiscal", "Pasivo", "Acreedora");
  ctx.capital = await cuenta("2301001", "Capital", "Patrimonio", "Acreedora");
  ctx.gasto = await cuenta("3101001", "Gastos generales", "Pérdida", "Deudora");
  ctx.ventas = await cuenta("4101001", "Ventas", "Ganancia", "Acreedora");

  await pool.query(
    `INSERT INTO configuracion_contable
       (empresa_id, cuenta_clientes_id, cuenta_proveedores_id, cuenta_caja_banco_id,
        cuenta_iva_debito_id, cuenta_iva_credito_id, cuenta_ingreso_defecto_id,
        cuenta_gasto_defecto_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [ctx.empresa, ctx.clientes, ctx.proveedores, ctx.caja, ctx.ivaDebito, ctx.ivaCredito, ctx.ventas, ctx.gasto]
  );

  // Remuneraciones: parametros del periodo con ingreso minimo y tope AFC.
  await pool.query(
    `INSERT INTO configuracion_remuneraciones
       (empresa_id, periodo, valor_uf, tope_imponible_uf, tasa_afc_trabajador,
        tasa_afc_empleador, tasa_mutual, ingreso_minimo, indicadores_previsionales)
     VALUES ($1, $2, 39000, 89.9, 0.6, 2.4, 0.95, 539000,
             '{"valor_utm": 69751, "renta_tope_seguro_cesantia_uf": 135.1}'::jsonb)`,
    [ctx.empresa, PERIODO]
  );

  await pool.query(
    `INSERT INTO afp_parametros (empresa_id, periodo, nombre, tasa_afp, tasa_sis,
                                 tasa_seguro_social, activo)
     VALUES ($1, $2, 'MODELO', 10.58, 1.54, 1, true)`,
    [ctx.empresa, PERIODO]
  );

  // Tramos hasta 2.000.000: el trabajador de 3.000.000 queda sin tramo a
  // proposito, para probar que no se puede liquidar con impuesto cero.
  await pool.query(
    `INSERT INTO impuesto_unico_tramos (empresa_id, periodo, desde, hasta, factor, rebaja, activo)
     VALUES ($1, $2, 0, 941638, 0, 0, true),
            ($1, $2, 941639, 2000000, 0.04, 37666, true)`,
    [ctx.empresa, PERIODO]
  );

  async function trabajador(rut, sueldo, contrato, ingreso) {
    return (
      await pool.query(
        `INSERT INTO trabajadores (empresa_id, rut, nombres, apellidos, fecha_ingreso,
                                   estado, sueldo_base, afp, salud, tipo_contrato)
         VALUES ($1, $2, 'Persona', 'Prueba', $3, 'activo', $4, 'MODELO', 'FONASA', $5)
         RETURNING id`,
        [ctx.empresa, rut, ingreso, sueldo, contrato]
      )
    ).rows[0].id;
  }

  ctx.trabAlto = await trabajador("11111111-1", 1500000, "Indefinido", "2024-01-02");
  ctx.trabAusente = await trabajador("12345678-5", 600000, "Indefinido", "2024-01-02");
  ctx.trabObra = await trabajador("76111222-8", 700000, "Obra o faena", "2025-06-01");
  ctx.trabViejo = await trabajador("22222222-2", 800000, "Indefinido", "2010-03-01");
  ctx.trabRico = await trabajador("33333333-3", 3000000, "Indefinido", "2024-01-02");

  const hash = await bcrypt.hash(CLAVE, 10);
  ctx.usuario = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Bloque1', $1, $2, 'admin_cliente', true) RETURNING id`,
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
  assert.ok(ctx.token);
});

test.after(async () => {
  if (ctx.server) await detenerServidor(ctx.server);
});

// ---------------------------------------------------------------------------
// C-04 notas de credito
// ---------------------------------------------------------------------------

function compra(extra = {}) {
  return {
    empresa_id: ctx.empresa,
    fecha: "2026-05-10",
    tipo_documento: "Factura afecta",
    folio: "100",
    rut_proveedor: "76111222-8",
    razon_social_proveedor: "Proveedor Uno",
    neto: 100000,
    exento: 0,
    iva_credito: 19000,
    total: 119000,
    cuenta_gasto_id: ctx.gasto,
    generar_comprobante: true,
    ...extra,
  };
}

test("una factura de compra debita gasto e IVA y abona proveedores", async () => {
  const { status, datos } = await enviar("/api/compras", compra());
  assert.equal(status, 201, JSON.stringify(datos).slice(0, 200));

  ctx.compraFactura = datos.compra?.id || datos.id;
  const comprobanteId = datos.compra?.comprobante_id || datos.comprobante?.id;
  const lineas = await lineasDe(comprobanteId);

  const gasto = lineas.find((l) => l.cuenta_id === ctx.gasto);
  const prov = lineas.find((l) => l.cuenta_id === ctx.proveedores);

  assert.equal(gasto.debe, 100000);
  assert.equal(prov.haber, 119000);
});

test("una nota de credito de compra genera el asiento inverso", async () => {
  const { status, datos } = await enviar(
    "/api/compras",
    compra({ tipo_documento: "Nota de crédito", folio: "7" })
  );
  assert.equal(status, 201, JSON.stringify(datos).slice(0, 200));

  ctx.compraNC = datos.compra?.id || datos.id;
  const comprobanteId = datos.compra?.comprobante_id || datos.comprobante?.id;
  const lineas = await lineasDe(comprobanteId);

  const gasto = lineas.find((l) => l.cuenta_id === ctx.gasto);
  const iva = lineas.find((l) => l.cuenta_id === ctx.ivaCredito);
  const prov = lineas.find((l) => l.cuenta_id === ctx.proveedores);

  assert.equal(gasto.haber, 100000, "la NC abona el gasto");
  assert.equal(gasto.debe, 0);
  assert.equal(iva.haber, 19000, "la NC abona el IVA credito");
  assert.equal(prov.debe, 119000, "la NC debita al proveedor");

  const { rows } = await pool.query(`SELECT sii_tipo_doc FROM compras WHERE id = $1`, [ctx.compraNC]);
  assert.equal(rows[0].sii_tipo_doc, "61", "el alta manual deriva el codigo SII");
});

test("una nota de credito no aparece como documento por pagar", async () => {
  const { status, datos } = await pedir(
    `/api/pagos-cobros/documentos-pendientes?empresa_id=${ctx.empresa}&tipo=PagoCompra`
  );

  assert.equal(status, 200);
  const ids = JSON.stringify(datos);
  assert.ok(ids.includes(`"id":${ctx.compraFactura}`), "la factura si esta pendiente");
  assert.ok(!ids.includes(`"id":${ctx.compraNC}`), "la NC no es un documento por pagar");
});

// ---------------------------------------------------------------------------
// C-11 duplicados
// ---------------------------------------------------------------------------

test("la misma factura manual no entra dos veces", async () => {
  const { status } = await enviar("/api/compras", compra({ folio: "100" }));
  assert.ok([400, 409].includes(status), `deberia rechazarse, respondio ${status}`);
});

test("el mismo folio de otro proveedor si es otro documento", async () => {
  const { status } = await enviar(
    "/api/compras",
    compra({ folio: "100", rut_proveedor: "12345678-5", razon_social_proveedor: "Proveedor Dos" })
  );
  assert.equal(status, 201);
});

// ---------------------------------------------------------------------------
// A-22 autoria
// ---------------------------------------------------------------------------

test("las compras creadas por la API llevan autor", async () => {
  const { rows } = await pool.query(`SELECT creado_por FROM compras WHERE id = $1`, [
    ctx.compraFactura,
  ]);

  assert.equal(Number(rows[0].creado_por), ctx.usuario);
});

// ---------------------------------------------------------------------------
// C-05 honorarios
// ---------------------------------------------------------------------------

test("la tasa de retencion sale de la fecha de emision", () => {
  assert.equal(tasaRetencionVigente("2024-06-01"), 13.75);
  assert.equal(tasaRetencionVigente("2025-06-01"), 14.5);
  assert.equal(tasaRetencionVigente("2026-06-01"), 15.25);
  assert.equal(tasaRetencionVigente("2027-01-01"), 16);
  assert.equal(tasaRetencionVigente("2028-01-01"), 17);
  assert.equal(tasaRetencionVigente("2035-01-01"), 17);
});

test("una boleta de honorarios de 2026 retiene 15,25% aunque el cliente mande 14,5", async () => {
  const { status, datos } = await enviar("/api/honorarios", {
    empresa_id: ctx.empresa,
    fecha_emision: "2026-05-05",
    tipo_documento: "Boleta de Honorarios",
    folio: "55",
    rut_prestador: "11111111-1",
    nombre_prestador: "Prestador Prueba",
    bruto: 100000,
    tasa_retencion: 14.5,
  });

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 200));
  const h = datos.honorario || datos;
  assert.equal(Number(h.tasa_retencion), 15.25);
  assert.equal(Number(h.retencion), 15250);
  assert.equal(Number(h.liquido), 84750);
  assert.ok(datos.aviso, "avisa que reemplazo la tasa");
});

// ---------------------------------------------------------------------------
// C-06 C-07 A-13 A-09 liquidaciones
// ---------------------------------------------------------------------------

function liquidacion(trabajadorId, extra = {}) {
  return { empresa_id: ctx.empresa, trabajador_id: trabajadorId, periodo: PERIODO, dias_trabajados: 30, ...extra };
}

test("la gratificacion mensual se topa en 4,75 ingresos minimos al ano", async () => {
  const { status, datos } = await enviar("/api/liquidaciones/calcular", liquidacion(ctx.trabAlto));
  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));

  const c = datos.calculo;
  // 25% de 1.500.000 seria 375.000; el tope es 4,75 x 539.000 / 12 = 213.354.
  assert.equal(Number(c.gratificacion), 213354);
  assert.ok(JSON.stringify(datos).includes("tope legal"), "avisa que aplico el tope");
});

test("una ausencia rebaja los dias devengados y no se descuenta dos veces", async () => {
  await pool.query(
    `INSERT INTO vacaciones_ausencias
       (empresa_id, trabajador_id, periodo, tipo, fecha_inicio, fecha_termino, dias,
        afecta_remuneracion, descuenta_vacaciones, estado)
     VALUES ($1, $2, $3, 'Ausencia', '2026-05-04', '2026-05-06', 3, true, false, 'vigente')`,
    [ctx.empresa, ctx.trabAusente, PERIODO]
  );

  const { status, datos } = await enviar("/api/liquidaciones/calcular", liquidacion(ctx.trabAusente));
  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));

  const c = datos.calculo;
  // 600.000 / 30 x 27 dias efectivos.
  assert.equal(Number(c.sueldo_proporcional), 540000);
  assert.equal(Number(c.dias_ausencia), 3);

  const descuentosPrevisionales =
    Number(c.descuento_afp) + Number(c.descuento_salud) + Number(c.descuento_afc) + Number(c.impuesto_unico);
  assert.equal(
    Number(c.total_descuentos),
    descuentosPrevisionales + Number(c.otros_descuentos || 0),
    "las ausencias no van en los descuentos: ya rebajaron el devengo"
  );
  assert.equal(Number(c.liquido_pagar), Number(c.total_haberes) - Number(c.total_descuentos));
});

test("con 27 dias informados y 3 ausencias registradas se descuenta una sola vez", async () => {
  const { datos } = await enviar(
    "/api/liquidaciones/calcular",
    liquidacion(ctx.trabAusente, { dias_trabajados: 27 })
  );

  assert.equal(Number(datos.calculo.sueldo_proporcional), 540000);
});

test("obra o faena cotiza seguro de cesantia 3% empleador y 0% trabajador", async () => {
  const { datos } = await enviar("/api/liquidaciones/calcular", liquidacion(ctx.trabObra));
  const c = datos.calculo;

  assert.equal(Number(c.tasa_afc_trabajador), 0);
  assert.equal(Number(c.tasa_afc_empleador), 3);
});

test("mas de once anos de contrato indefinido: solo 0,8% del empleador", async () => {
  const { datos } = await enviar("/api/liquidaciones/calcular", liquidacion(ctx.trabViejo));
  const c = datos.calculo;

  assert.equal(Number(c.tasa_afc_trabajador), 0);
  assert.equal(Number(c.tasa_afc_empleador), 0.8);
});

test("sin tramos de impuesto unico, un sueldo sobre 13,5 UTM no se puede liquidar", async () => {
  const { status, datos } = await enviar("/api/liquidaciones/calcular", liquidacion(ctx.trabRico));

  assert.equal(status, 409, JSON.stringify(datos).slice(0, 200));
  assert.match(datos.error, /tramos/i);
});

// ---------------------------------------------------------------------------
// A-08 tipos de cuenta
// ---------------------------------------------------------------------------

test("el tipo declarado clasifica la cuenta, no el texto del nombre", () => {
  assert.equal(columnaBalancePorTipo("Pérdida"), "perdida");
  assert.equal(columnaBalancePorTipo("perdida"), "perdida");
  assert.equal(columnaBalancePorTipo("Ganancia"), "ganancia");
  assert.equal(columnaBalancePorTipo("Patrimonio"), "pasivo");
  assert.equal(columnaBalancePorTipo("otra cosa"), null);
  assert.equal(categoriaResultadoPorTipo("Ganancia"), "ingreso");
  assert.equal(categoriaResultadoPorTipo("Costo"), "costo");
  assert.equal(categoriaResultadoPorTipo("Activo"), null);
  assert.equal(categoriaResultadoPorTipo("rara"), undefined);
});

test("el panel contable ve el resultado de un plan con Ganancia y Perdida", async () => {
  const { status, datos } = await pedir(
    `/api/dashboard-contable?empresa_id=${ctx.empresa}&periodo=${PERIODO}`
  );

  assert.equal(status, 200);
  // La factura de compra debito 100.000 de gasto y la NC lo abono: neto 0 de
  // gasto en Perdida... salvo la segunda factura del proveedor dos: 100.000.
  assert.equal(Number(datos.resultado.gastos), 100000);
});

test("el balance pone una perdida llamada 'activo fijo' en perdidas", async () => {
  const cuentaRara = await cuenta("3301016", "PERDIDA POR VENTA ACTIVO FIJO", "Pérdida", "Deudora");

  const { rows } = await pool.query(
    `INSERT INTO comprobantes (empresa_id, periodo, fecha, tipo, numero, glosa, estado)
     VALUES ($1, $2, '2026-05-20', 'Traspaso', 9900, 'Perdida activo fijo', 'vigente') RETURNING id`,
    [ctx.empresa, PERIODO]
  );
  await pool.query(
    `INSERT INTO comprobante_detalle (comprobante_id, cuenta_id, debe, haber)
     VALUES ($1, $2, 5000, 0), ($1, $3, 0, 5000)`,
    [rows[0].id, cuentaRara, ctx.caja]
  );

  const { datos } = await pedir(
    `/api/balance-8-columnas?empresa_id=${ctx.empresa}&fecha_desde=2026-01-01&fecha_hasta=2026-12-31`
  );
  const fila = datos.filas.find((f) => f.cuenta_id === cuentaRara);

  assert.equal(fila.perdidas, 5000);
  assert.equal(fila.activo, 0);
});

test("la base no admite un tipo de cuenta fuera de los ocho", async () => {
  await assert.rejects(
    pool.query(
      `INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, naturaleza, nivel, activo)
       VALUES ($1, '9999999', 'Rara', 'Cualquiera', 'Deudora', 4, true)`,
      [ctx.empresa]
    ),
    /chk_plan_cuentas_tipo/
  );
});

// ---------------------------------------------------------------------------
// A-18 numeracion
// ---------------------------------------------------------------------------

test("el numero del comprobante lo asigna el servidor aunque el cliente mande otro", async () => {
  const { status, datos } = await enviar("/api/comprobantes", {
    empresa_id: ctx.empresa,
    fecha: "2026-05-15",
    tipo: "Traspaso",
    numero: 5000,
    glosa: "Numeracion",
    detalles: [
      { cuenta_id: ctx.caja, debe: 1000, haber: 0 },
      { cuenta_id: ctx.capital, debe: 0, haber: 1000 },
    ],
  });

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 200));
  // La prueba del balance inserto el 9900 a mano: el siguiente correlativo es
  // 9901, no el 5000 que mando el cliente.
  const numero = Number(datos.comprobante?.numero);
  assert.notEqual(numero, 5000);
  assert.equal(numero, 9901);
});
