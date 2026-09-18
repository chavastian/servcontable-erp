/**
 * Importaciones del SII contra una base real.
 *
 * Lo que verifica, en orden de importancia:
 *
 * 1. Una fila con error no se lleva consigo a las filas buenas. Antes el primer
 *    error abortaba la transaccion en PostgreSQL, el COMMIT final se volvia un
 *    ROLLBACK y la respuesta informaba filas insertadas que nunca existieron.
 * 2. Reimportar el mismo archivo no duplica documentos.
 * 3. Reimportar no pisa lo que el usuario corrigio a mano.
 * 4. Un documento anulado no revive ni recibe un asiento nuevo.
 *
 *   DATABASE_URL=<staging o test> node --test test/importacion.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_importacion_no_produccion_32_ca";

const bcrypt = require("bcryptjs");
const { normalizarRut } = require("../src/helpers/rut.helper");
const pool = require("../src/database/db");

// El RUT del archivo tiene que ser valido: el importador rechaza la fila si el
// digito verificador no cuadra, y eso enmascararia lo que se quiere probar.
const RUT_PROVEEDOR = "76123456-0";

if (!normalizarRut(RUT_PROVEEDOR).valido) {
  throw new Error(`El RUT de prueba ${RUT_PROVEEDOR} no es valido`);
}
const { iniciarServidor, detenerServidor } = require("../src/start");

const SUFIJO = `imp${Date.now().toString().slice(-8)}`;
const CLAVE = "Importacion-2026";
const CORREO = `${SUFIJO}@test.local`;

const ctx = { raiz: null, server: null, empresa: null, token: null };

function libroCompras(filas) {
  const cabecera =
    "Nro;Tipo Doc;RUT Proveedor;Razon Social;Folio;Fecha Docto;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto Iva No Recuperable;Monto Total";

  return [cabecera, ...filas].join("\n");
}

function filaCompra({
  nro = 1,
  tipo = "33",
  rut = RUT_PROVEEDOR,
  razon = "PROVEEDOR PRUEBA",
  folio,
  fecha = "15/01/2026",
  exento = "0",
  neto = "1000000",
  iva = "190000",
  ivaNo = "0",
  total = "1190000",
}) {
  return [nro, tipo, rut, razon, folio, fecha, exento, neto, iva, ivaNo, total].join(";");
}

async function importar(csv, { generarComprobante = false } = {}) {
  const formulario = new FormData();
  formulario.append("empresa_id", String(ctx.empresa));
  formulario.append("periodo", "2026-01");
  formulario.append("generar_comprobante", generarComprobante ? "true" : "false");
  formulario.append("archivo", new Blob([csv], { type: "text/csv" }), "compras.csv");

  const respuesta = await fetch(`${ctx.raiz}/api/compras/importar-sii`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.token}` },
    body: formulario,
  });

  const datos = await respuesta.json().catch(() => ({}));
  return { status: respuesta.status, datos };
}

async function contarCompras() {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM compras WHERE empresa_id = $1",
    [ctx.empresa]
  );

  return rows[0].n;
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
      [`I${SUFIJO}-9`, `Empresa importacion ${SUFIJO}`]
    )
  ).rows[0].id;

  const hash = await bcrypt.hash(CLAVE, 10);
  const usuarioId = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Importador', $1, $2, 'admin_cliente', true) RETURNING id`,
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

  const iniciado = await iniciarServidor({ host: "127.0.0.1", port: 0 });
  ctx.server = iniciado.server;
  ctx.raiz = `http://127.0.0.1:${iniciado.port}`;

  const login = await fetch(`${ctx.raiz}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: CORREO, password: CLAVE }),
  });

  const datos = await login.json();
  ctx.token = datos.token;
  assert.ok(ctx.token, "debe autenticarse");
});

test.after(async () => {
  if (ctx.server) await detenerServidor(ctx.server);
});

test("una fila con fecha invalida no impide guardar las demas", async () => {
  // Este es el caso que hacia perder importaciones completas.
  const csv = libroCompras([
    filaCompra({ nro: 1, folio: "5001" }),
    filaCompra({ nro: 2, folio: "5002" }),
    filaCompra({ nro: 3, folio: "5003", fecha: "no-es-fecha" }),
    filaCompra({ nro: 4, folio: "5004" }),
    filaCompra({ nro: 5, folio: "5005" }),
  ]);

  const { status, datos } = await importar(csv);

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));
  assert.equal(datos.insertadas, 4, "deben guardarse las cuatro filas validas");
  assert.equal(datos.con_error, 1, "una fila debe informar error");
  assert.equal(datos.resultado, "parcial");

  const guardadas = await contarCompras();
  assert.equal(guardadas, 4, "la base debe tener exactamente lo informado");

  const folios = (
    await pool.query(
      "SELECT folio FROM compras WHERE empresa_id = $1 ORDER BY folio",
      [ctx.empresa]
    )
  ).rows.map((f) => f.folio);

  assert.deepEqual(folios, ["5001", "5002", "5004", "5005"]);
});

test("lo que informa la respuesta es lo que quedo en la base", async () => {
  const antes = await contarCompras();

  const csv = libroCompras([
    filaCompra({ nro: 1, folio: "6001" }),
    filaCompra({ nro: 2, folio: "6002", fecha: "" }),
    filaCompra({ nro: 3, folio: "6003" }),
  ]);

  const { datos } = await importar(csv);
  const despues = await contarCompras();

  assert.equal(
    despues - antes,
    datos.insertadas,
    `informo ${datos.insertadas} insertadas y la base cambio en ${despues - antes}`
  );
});

test("reimportar el mismo archivo no duplica documentos", async () => {
  const csv = libroCompras([
    filaCompra({ nro: 1, folio: "7001" }),
    filaCompra({ nro: 2, folio: "7002" }),
  ]);

  await importar(csv);
  const despuesPrimera = await contarCompras();

  const segunda = await importar(csv);
  const despuesSegunda = await contarCompras();

  assert.equal(
    despuesSegunda,
    despuesPrimera,
    "la segunda importacion no debe agregar filas"
  );
  assert.equal(segunda.datos.insertadas, 0);
});

test("reimportar no pisa la razon social corregida a mano", async () => {
  const csv = libroCompras([filaCompra({ nro: 1, folio: "8001", razon: "NOMBRE DEL SII" })]);
  await importar(csv);

  await pool.query(
    `UPDATE compras
     SET razon_social_proveedor = 'Nombre corregido por el contador'
     WHERE empresa_id = $1 AND folio = '8001'`,
    [ctx.empresa]
  );

  // Mismo archivo, montos identicos: no hay razon para tocar la fila.
  await importar(csv);

  const { rows } = await pool.query(
    "SELECT razon_social_proveedor FROM compras WHERE empresa_id = $1 AND folio = '8001'",
    [ctx.empresa]
  );

  assert.equal(
    rows[0].razon_social_proveedor,
    "Nombre corregido por el contador",
    "la correccion manual debe sobrevivir a una reimportacion identica"
  );
});

test("un documento anulado no revive al reimportar", async () => {
  const csv = libroCompras([filaCompra({ nro: 1, folio: "9001" })]);
  await importar(csv);

  await pool.query(
    "UPDATE compras SET estado = 'anulado' WHERE empresa_id = $1 AND folio = '9001'",
    [ctx.empresa]
  );

  await importar(csv, { generarComprobante: false });

  const { rows } = await pool.query(
    "SELECT estado, comprobante_id FROM compras WHERE empresa_id = $1 AND folio = '9001'",
    [ctx.empresa]
  );

  assert.equal(rows[0].estado, "anulado", "debe seguir anulado");
  assert.equal(rows[0].comprobante_id, null, "no debe recibir un asiento nuevo");
});

test("un archivo sin cabeceras reconocibles no rompe el servicio", async () => {
  const { status, datos } = await importar("esto;no;es;un;libro\n1;2;3;4;5");

  assert.ok(status < 500, `no debe dar error de servidor y dio ${status}`);
  assert.ok(
    !JSON.stringify(datos).includes("relation"),
    "no debe filtrar mensajes de PostgreSQL"
  );
});
