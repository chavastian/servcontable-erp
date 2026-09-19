/**
 * Bloque 6 de la revisión del 19-09-2026: los dos catálogos.
 *
 * - Terceros (módulo 12): proveedores y clientes como entidades, con condición
 *   de pago y cuenta habitual. Registrar un documento resuelve o crea el
 *   tercero y toma de él el vencimiento y la cuenta.
 * - Centros de costo (módulo 14): catálogo con código, enlace en las líneas de
 *   asiento y resultado por centro.
 *
 *   DATABASE_URL=<staging o test> node --test test/bloque6.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_bloque6_no_produccion_32_carac";
process.env.COBRANZA_AUTOMATICA = "false";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");
const { vencimientoSegunCondicion, claveRut } = require("../src/helpers/terceros.helper");

const SUFIJO = `b6${Date.now().toString().slice(-8)}`;
const CLAVE = "Bloque6-2026";
const CORREO = `${SUFIJO}@test.local`;
const PERIODO = "2034-03";
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

async function cuenta(empresaId, codigo, nombre, tipo, naturaleza) {
  const { rows } = await pool.query(
    `INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, naturaleza, nivel, activo)
     VALUES ($1, $2, $3, $4, $5, 4, true) RETURNING id`,
    [empresaId, codigo, nombre, tipo, naturaleza]
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
      [`B6${SUFIJO}-1`, `Empresa bloque6 ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.otraEmpresa = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa) VALUES ($1, $2, true) RETURNING id`,
      [`B6${SUFIJO}-2`, `Empresa ajena ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.caja = await cuenta(ctx.empresa, "1101001", "Caja", "Activo", "Deudora");
  ctx.proveedores = await cuenta(ctx.empresa, "2101001", "Proveedores", "Pasivo", "Acreedora");
  ctx.clientes = await cuenta(ctx.empresa, "1102001", "Clientes", "Activo", "Deudora");
  ctx.ivaCredito = await cuenta(ctx.empresa, "1103001", "IVA crédito", "Activo", "Deudora");
  ctx.ivaDebito = await cuenta(ctx.empresa, "2102001", "IVA débito", "Pasivo", "Acreedora");
  ctx.arriendo = await cuenta(ctx.empresa, "3101001", "Arriendos", "Gasto", "Deudora");
  ctx.sueldos = await cuenta(ctx.empresa, "3101002", "Sueldos", "Gasto", "Deudora");
  ctx.ventasCta = await cuenta(ctx.empresa, "4101001", "Ventas", "Ingreso", "Acreedora");
  ctx.gastoDefecto = await cuenta(ctx.empresa, "3109999", "Gastos varios", "Gasto", "Deudora");
  ctx.centroAjeno = null;

  await pool.query(
    `INSERT INTO configuracion_contable
       (empresa_id, cuenta_caja_banco_id, cuenta_proveedores_id, cuenta_clientes_id,
        cuenta_iva_credito_id, cuenta_iva_debito_id, cuenta_gasto_defecto_id,
        cuenta_ingreso_defecto_id, facturador_electronico)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)`,
    [
      ctx.empresa,
      ctx.caja,
      ctx.proveedores,
      ctx.clientes,
      ctx.ivaCredito,
      ctx.ivaDebito,
      ctx.gastoDefecto,
      ctx.ventasCta,
    ]
  );

  await pool.query(
    `INSERT INTO ejercicios_contables (empresa_id, anio, estado, fecha_inicio, fecha_termino)
     VALUES ($1, 2034, 'abierto', '2034-01-01', '2034-12-31')`,
    [ctx.empresa]
  );

  const hash = await bcrypt.hash(CLAVE, 10);
  ctx.usuario = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Bloque6', $1, $2, 'admin_cliente', true) RETURNING id`,
      [CORREO, hash]
    )
  ).rows[0].id;

  for (const empresa of [ctx.empresa, ctx.otraEmpresa]) {
    await pool.query(
      `INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo)
       VALUES ($1, $2, 'OWNER', true)`,
      [ctx.usuario, empresa]
    );
  }

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

// ------------------------------------------------------------- terceros

test("el vencimiento sale de la condición de pago, y en blanco no se inventa", () => {
  assert.equal(vencimientoSegunCondicion("2034-03-10", 30), "2034-04-09");
  assert.equal(vencimientoSegunCondicion("2034-03-10", 0), "2034-03-10");
  assert.equal(vencimientoSegunCondicion("2034-03-10", null), null);
  assert.equal(vencimientoSegunCondicion("2034-03-10", ""), null);
  assert.equal(vencimientoSegunCondicion(null, 30), null);
  assert.equal(claveRut("76.111.222-8"), "76111222-8");
});

test("crear un tercero valida el RUT y no admite dos veces el mismo", async () => {
  const malo = await enviar("/api/terceros", {
    empresa_id: ctx.empresa,
    rut: "76111222-9",
    razon_social: "RUT con dígito malo",
  });
  assert.equal(malo.status, 400);
  assert.match(malo.datos.error, /d[íi]gito verificador/i);

  const { status, datos } = await enviar("/api/terceros", {
    empresa_id: ctx.empresa,
    rut: "76.111.222-8",
    razon_social: "Arrendadora del Sur SpA",
    giro: "Arriendo de inmuebles",
    email: "pagos@arrendadora.cl",
    condicion_pago_dias: 30,
    cuenta_gasto_id: ctx.arriendo,
  });

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 300));
  assert.equal(datos.tercero.rut, "76.111.222-8", "se guarda con formato");
  assert.equal(datos.tercero.es_proveedor, true);
  assert.equal(datos.tercero.es_cliente, false);
  assert.equal(datos.tercero.condicion_pago_dias, 30);
  ctx.proveedor = datos.tercero.id;

  const repetido = await enviar("/api/terceros", {
    empresa_id: ctx.empresa,
    // El mismo RUT escrito distinto: el catálogo no admite duplicados.
    rut: "76111222-8",
    razon_social: "Otra vez la misma",
  });
  assert.equal(repetido.status, 409);
});

test("una cuenta de otra empresa no se puede asignar a un tercero", async () => {
  const ajena = await cuenta(ctx.otraEmpresa, "3101001", "Gasto ajeno", "Gasto", "Deudora");

  const { status } = await enviar("/api/terceros", {
    empresa_id: ctx.empresa,
    rut: "77123456-9",
    razon_social: "Con cuenta ajena",
    cuenta_gasto_id: ajena,
  });

  assert.equal(status, 403);
});

test("una compra toma del catálogo la cuenta y el vencimiento", async () => {
  const { status, datos } = await enviar("/api/compras", {
    empresa_id: ctx.empresa,
    fecha: `${PERIODO}-10`,
    tipo_documento: "Factura",
    folio: "500",
    rut_proveedor: "76111222-8",
    razon_social_proveedor: "Arrendadora del Sur SpA",
    neto: 100000,
    iva_credito: 19000,
    total: 119000,
  });

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 300));
  const compra = datos.compra;

  assert.equal(compra.tercero_id, ctx.proveedor, "queda enlazada al catálogo");
  assert.equal(
    Number(compra.cuenta_gasto_id),
    ctx.arriendo,
    "usa la cuenta del proveedor, no la cuenta por defecto"
  );
  assert.equal(
    String(compra.fecha_vencimiento).slice(0, 10),
    "2034-04-09",
    "30 días desde la fecha del documento"
  );

  // El asiento automático también quedó con la cuenta del catálogo.
  const { rows } = await pool.query(
    `SELECT cuenta_id, debe FROM comprobante_detalle
     WHERE comprobante_id = $1 AND debe > 0 ORDER BY id`,
    [compra.comprobante_id]
  );
  assert.ok(
    rows.some((linea) => Number(linea.cuenta_id) === ctx.arriendo),
    "el asiento imputa la cuenta del proveedor"
  );
});

test("un proveedor nuevo se da de alta solo al registrar la compra", async () => {
  const { status, datos } = await enviar("/api/compras", {
    empresa_id: ctx.empresa,
    fecha: `${PERIODO}-11`,
    tipo_documento: "Factura",
    folio: "501",
    rut_proveedor: "77.555.666-8",
    razon_social_proveedor: "Ferretería Nueva Limitada",
    neto: 50000,
    iva_credito: 9500,
    total: 59500,
  });

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 300));
  assert.ok(datos.compra.tercero_id, "se creó el tercero");
  // Sin condición de pago pactada no se inventa un vencimiento.
  assert.equal(datos.compra.fecha_vencimiento, null);
  // En el alta manual la cuenta la elige el usuario: si no la indicó y el
  // catálogo no tiene una, el documento queda sin cuenta y el asiento usa la
  // cuenta por defecto de la empresa.
  assert.equal(datos.compra.cuenta_gasto_id, null);

  const { rows } = await pool.query(
    `SELECT cuenta_id FROM comprobante_detalle WHERE comprobante_id = $1 AND debe > 0`,
    [datos.compra.comprobante_id]
  );
  assert.ok(
    rows.some((linea) => Number(linea.cuenta_id) === ctx.gastoDefecto),
    "el asiento cae en la cuenta por defecto"
  );

  const lista = await pedir(`/api/terceros?empresa_id=${ctx.empresa}&tipo=proveedor&buscar=ferreteria`);
  assert.equal(lista.status, 200);
  assert.equal(lista.datos.terceros.length, 1);
  assert.equal(lista.datos.terceros[0].razon_social, "Ferretería Nueva Limitada");
});

test("el mismo RUT que compra y vende queda con las dos banderas", async () => {
  const venta = await enviar("/api/ventas", {
    empresa_id: ctx.empresa,
    fecha: `${PERIODO}-12`,
    tipo_documento: "Factura",
    folio: "900",
    rut_cliente: "76111222-8",
    razon_social_cliente: "Arrendadora del Sur SpA",
    neto: 200000,
    iva: 38000,
    total: 238000,
  });

  assert.equal(venta.status, 201, JSON.stringify(venta.datos).slice(0, 300));
  assert.equal(venta.datos.venta.tercero_id, ctx.proveedor, "es el mismo tercero");

  const ficha = await pedir(`/api/terceros/${ctx.proveedor}?empresa_id=${ctx.empresa}`);
  assert.equal(ficha.status, 200);
  assert.equal(ficha.datos.tercero.es_proveedor, true);
  assert.equal(ficha.datos.tercero.es_cliente, true);
  assert.equal(Number(ficha.datos.resumen.compras.documentos), 1);
  assert.equal(Number(ficha.datos.resumen.ventas.documentos), 1);
  assert.equal(Number(ficha.datos.resumen.ventas.total), 238000);
});

test("editar un tercero no cambia su RUT, e inactivarlo no borra nada", async () => {
  const { status, datos } = await enviar(
    `/api/terceros/${ctx.proveedor}`,
    {
      empresa_id: ctx.empresa,
      rut: "11111111-1",
      razon_social: "Arrendadora del Sur SpA (corregida)",
      condicion_pago_dias: 60,
    },
    "PUT"
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));
  assert.equal(datos.tercero.rut, "76.111.222-8", "el RUT no se toca");
  assert.equal(datos.tercero.razon_social, "Arrendadora del Sur SpA (corregida)");
  assert.equal(datos.tercero.condicion_pago_dias, 60);

  const inactivo = await enviar(
    `/api/terceros/${ctx.proveedor}/estado`,
    { empresa_id: ctx.empresa, estado: "inactivo" },
    "PUT"
  );
  assert.equal(inactivo.status, 200);
  assert.equal(inactivo.datos.tercero.estado, "inactivo");

  // Sus documentos siguen ahí y siguen mostrando el nombre con que se emitieron.
  const { rows } = await pool.query(
    `SELECT razon_social_proveedor FROM compras WHERE empresa_id = $1 AND folio = '500'`,
    [ctx.empresa]
  );
  assert.equal(rows[0].razon_social_proveedor, "Arrendadora del Sur SpA");

  await enviar(
    `/api/terceros/${ctx.proveedor}/estado`,
    { empresa_id: ctx.empresa, estado: "vigente" },
    "PUT"
  );
});

// ------------------------------------------------------ centros de costo

test("los centros de costo son un catálogo con código único", async () => {
  const uno = await enviar("/api/centros-costo", {
    empresa_id: ctx.empresa,
    codigo: "local1",
    nombre: "Local Centro",
  });
  assert.equal(uno.status, 201, JSON.stringify(uno.datos).slice(0, 200));
  assert.equal(uno.datos.centro.codigo, "LOCAL1", "el código se guarda en mayúsculas");
  ctx.centro1 = uno.datos.centro.id;

  const dos = await enviar("/api/centros-costo", {
    empresa_id: ctx.empresa,
    codigo: "LOCAL2",
    nombre: "Local Norte",
  });
  assert.equal(dos.status, 201);
  ctx.centro2 = dos.datos.centro.id;

  const repetido = await enviar("/api/centros-costo", {
    empresa_id: ctx.empresa,
    codigo: "LOCAL1",
    nombre: "Otro con el mismo código",
  });
  assert.equal(repetido.status, 409);

  const lista = await pedir(`/api/centros-costo?empresa_id=${ctx.empresa}`);
  assert.equal(lista.status, 200);
  assert.equal(lista.datos.centros.length, 2);
});

test("una línea de asiento se enlaza al centro por id o por nombre", async () => {
  const { status, datos } = await enviar("/api/comprobantes", {
    empresa_id: ctx.empresa,
    fecha: `${PERIODO}-15`,
    tipo: "Traspaso",
    glosa: "Gastos de los dos locales",
    detalles: [
      { cuenta_id: ctx.sueldos, glosa: "Sueldos local centro", debe: 600000, haber: 0, centro_costo_id: ctx.centro1 },
      { cuenta_id: ctx.sueldos, glosa: "Sueldos local norte", debe: 400000, haber: 0, centro_costo: "Local Norte" },
      { cuenta_id: ctx.caja, glosa: "Pago", debe: 0, haber: 1000000 },
    ],
  });

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 300));

  const { rows } = await pool.query(
    `SELECT centro_costo_id, debe FROM comprobante_detalle
     WHERE comprobante_id = $1 ORDER BY id`,
    [datos.comprobante.id]
  );

  assert.equal(Number(rows[0].centro_costo_id), ctx.centro1, "por id");
  assert.equal(Number(rows[1].centro_costo_id), ctx.centro2, "por nombre");
  assert.equal(rows[2].centro_costo_id, null, "la contrapartida no lleva centro");
});

test("un centro de costo de otra empresa no entra en un asiento", async () => {
  const ajeno = await pool.query(
    `INSERT INTO centros_costo (empresa_id, codigo, nombre) VALUES ($1, 'AJENO', 'Centro ajeno') RETURNING id`,
    [ctx.otraEmpresa]
  );

  const { status, datos } = await enviar("/api/comprobantes", {
    empresa_id: ctx.empresa,
    fecha: `${PERIODO}-16`,
    tipo: "Traspaso",
    glosa: "Con centro ajeno",
    detalles: [
      { cuenta_id: ctx.sueldos, debe: 1000, haber: 0, centro_costo_id: ajeno.rows[0].id },
      { cuenta_id: ctx.caja, debe: 0, haber: 1000 },
    ],
  });

  assert.equal(status, 400, JSON.stringify(datos).slice(0, 200));
  assert.match(datos.error, /centro de costo/i);
});

test("el informe reparte el resultado por centro y separa lo que no tiene centro", async () => {
  const { status, datos } = await pedir(
    `/api/centros-costo/informe?empresa_id=${ctx.empresa}&fecha_desde=2034-01-01&fecha_hasta=2034-12-31`
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));

  const centro1 = datos.centros.find((c) => c.centro_id === ctx.centro1);
  const centro2 = datos.centros.find((c) => c.centro_id === ctx.centro2);
  const sinCentro = datos.centros.find((c) => c.centro_id === null);

  assert.equal(centro1.gastos, 600000);
  assert.equal(centro1.resultado, -600000);
  assert.equal(centro2.gastos, 400000);

  // Las compras y la venta del catálogo no llevan centro: quedan aparte en
  // lugar de repartirse, porque repartirlas es criterio del contador.
  assert.ok(sinCentro, "lo sin centro se informa por separado");
  assert.equal(datos.hay_sin_centro, true);
  assert.equal(sinCentro.ingresos, 200000, "la venta de 200.000 neto");

  // El total del informe es el resultado de todas las cuentas de resultado.
  const suma = datos.centros.reduce((acc, c) => acc + c.resultado, 0);
  assert.equal(datos.totales.resultado, suma);
});

test("el centro de costo del trabajador sale del catálogo y no admite uno ajeno", async () => {
  const { status, datos } = await enviar("/api/trabajadores", {
    empresa_id: ctx.empresa,
    rut: "16153127-8",
    nombres: "Marta",
    apellidos: "Prueba",
    fecha_ingreso: "2034-01-02",
    sueldo_base: 800000,
    centro_costo_id: ctx.centro1,
  });

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 300));
  assert.equal(Number(datos.trabajador.centro_costo_id), ctx.centro1);

  const ajeno = await pool.query(
    `SELECT id FROM centros_costo WHERE empresa_id = $1 LIMIT 1`,
    [ctx.otraEmpresa]
  );

  const conAjeno = await enviar("/api/trabajadores", {
    empresa_id: ctx.empresa,
    rut: "17111222-2",
    nombres: "Con centro ajeno",
    fecha_ingreso: "2034-01-02",
    centro_costo_id: ajeno.rows[0].id,
  });

  assert.equal(conAjeno.status, 403);
});
