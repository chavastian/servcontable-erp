/**
 * Bloque 7 de la revisión del 19-09-2026: módulo 7, activo fijo y depreciación.
 *
 * Lo que estas pruebas fijan:
 * - La depreciación lineal termina exactamente en el valor residual, sin dejar
 *   pesos sueltos por redondeo.
 * - La acelerada del artículo 31 N°5 se calcula aparte y NO se contabiliza: el
 *   asiento lleva la normal.
 * - Un bien se deprecia una sola vez por período, aunque se corra dos veces.
 * - Un bien con depreciación contabilizada no cambia de valor ni de vida útil.
 * - La baja deja de depreciar y no inventa el asiento del resultado.
 *
 *   DATABASE_URL=<staging o test> node --test test/bloque7.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_bloque7_no_produccion_32_carac";
process.env.COBRANZA_AUTOMATICA = "false";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");
const {
  calcularDepreciacion,
  cuadroDepreciacion,
  vidaUtilAcelerada,
  puedeAcelerar,
  mesesEntrePeriodos,
} = require("../src/helpers/activoFijo.helper");

const SUFIJO = `b7${Date.now().toString().slice(-8)}`;
const CLAVE = "Bloque7-2026";
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
      [`B7${SUFIJO}-1`, `Empresa bloque7 ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.maquinarias = await cuenta(ctx.empresa, "1401001", "Maquinarias", "Activo", "Deudora");
  ctx.depAcumulada = await cuenta(ctx.empresa, "1501001", "Dep. acumulada maquinarias", "Activo", "Acreedora");
  ctx.gastoDep = await cuenta(ctx.empresa, "3301001", "Depreciación del ejercicio", "Gasto", "Deudora");
  ctx.caja = await cuenta(ctx.empresa, "1101001", "Caja", "Activo", "Deudora");

  await pool.query(
    `INSERT INTO configuracion_contable
       (empresa_id, cuenta_caja_banco_id, cuenta_depreciacion_acumulada_id,
        cuenta_gasto_depreciacion_id, facturador_electronico)
     VALUES ($1, $2, $3, $4, false)`,
    [ctx.empresa, ctx.caja, ctx.depAcumulada, ctx.gastoDep]
  );

  for (const anio of [2035, 2036]) {
    await pool.query(
      `INSERT INTO ejercicios_contables (empresa_id, anio, estado, fecha_inicio, fecha_termino)
       VALUES ($1, $2, 'abierto', $3, $4)`,
      [ctx.empresa, anio, `${anio}-01-01`, `${anio}-12-31`]
    );
  }

  const hash = await bcrypt.hash(CLAVE, 10);
  ctx.usuario = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Bloque7', $1, $2, 'admin_cliente', true) RETURNING id`,
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

// ------------------------------------------------------------- el cálculo

test("la depreciación lineal cierra exactamente en el valor residual", () => {
  // 1.000.000 en 7 meses no divide exacto: 142.857 por mes y el último mes
  // absorbe los 858 que sobran. Sin eso el bien queda con pesos sueltos para
  // siempre y el valor libro nunca llega al residual.
  const activo = {
    fecha_inicio_depreciacion: "2035-01-10",
    valor_adquisicion: 1000000,
    valor_residual: 0,
    vida_util_meses: 7,
  };

  const primer = calcularDepreciacion(activo, "2035-01");
  assert.equal(primer.depreciacion_mes, 142857, "1.000.000 / 7 truncado");

  const ultimo = calcularDepreciacion(activo, "2035-07");
  assert.equal(ultimo.depreciacion_mes, 142858, "el último mes cierra la diferencia");
  assert.equal(ultimo.acumulada, 1000000);
  assert.equal(ultimo.valor_libro, 0, "queda en el valor residual, ni un peso más");

  const cuadro = cuadroDepreciacion(activo);
  assert.equal(cuadro.length, 7);
  assert.equal(
    cuadro.reduce((suma, fila) => suma + fila.depreciacion_mes, 0),
    1000000,
    "la suma del cuadro es el valor depreciable"
  );

  // Con valor residual el bien se detiene ahí, no en cero.
  const conResidual = calcularDepreciacion({ ...activo, valor_residual: 1 }, "2035-07");
  assert.equal(conResidual.valor_libro, 1);

  // Antes del inicio y después del final no se deprecia.
  assert.equal(calcularDepreciacion(activo, "2034-12").depreciacion_mes, 0);
  assert.equal(calcularDepreciacion(activo, "2035-08").depreciacion_mes, 0);
});

test("la acelerada es un tercio de la vida útil y solo aplica sobre tres años", () => {
  assert.equal(vidaUtilAcelerada(84), 28, "7 años pasan a 2 años y 4 meses");
  assert.equal(vidaUtilAcelerada(36), 12);
  assert.equal(puedeAcelerar(36), true);
  assert.equal(puedeAcelerar(35), false, "menos de tres años no acelera");
  assert.equal(mesesEntrePeriodos("2035-01", "2035-01"), 1, "el primer mes cuenta");

  const activo = {
    fecha_inicio_depreciacion: "2035-01-01",
    valor_adquisicion: 3600000,
    valor_residual: 0,
    vida_util_meses: 36,
    vida_util_acelerada_meses: 12,
    aplica_acelerada: true,
  };

  const mes = calcularDepreciacion(activo, "2035-06");
  assert.equal(mes.depreciacion_mes, 100000, "financiera: 36 meses");
  assert.equal(mes.depreciacion_mes_acelerada, 300000, "tributaria: 12 meses");
  assert.equal(mes.valor_libro, 3000000);
  assert.equal(mes.valor_libro_acelerado, 1800000);

  // Sin la bandera, la acelerada es igual a la normal: no hay diferencia que
  // ajustar en la renta líquida.
  const sinBandera = calcularDepreciacion({ ...activo, aplica_acelerada: false }, "2035-06");
  assert.equal(sinBandera.depreciacion_mes_acelerada, sinBandera.depreciacion_mes);
});

// ------------------------------------------------------------- el registro

test("la tabla de vidas útiles se entrega como sugerencia, no como dato cerrado", async () => {
  const { status, datos } = await pedir("/api/activos-fijos/vidas-utiles");

  assert.equal(status, 200);
  assert.match(datos.aviso, /REQUIERE VALIDACI[ÓO]N TRIBUTARIA/);
  assert.ok(datos.vidas_utiles.length >= 8);

  const vehiculos = datos.vidas_utiles.find((fila) => /Veh[íi]culos/.test(fila.categoria));
  assert.equal(vehiculos.meses, 84);
  assert.equal(vehiculos.meses_acelerada, 28);
});

test("registrar un bien exige vida útil y avisa que la acelerada no se contabiliza", async () => {
  const sinVida = await enviar("/api/activos-fijos", {
    empresa_id: ctx.empresa,
    codigo: "MAQ-000",
    nombre: "Sin vida útil",
    fecha_adquisicion: "2035-01-02",
    valor_adquisicion: 1000000,
    vida_util_meses: 0,
  });
  assert.equal(sinVida.status, 400);

  const { status, datos } = await enviar("/api/activos-fijos", {
    empresa_id: ctx.empresa,
    codigo: "maq-001",
    nombre: "Torno industrial",
    categoria: "Maquinarias y equipos en general",
    fecha_adquisicion: "2035-01-02",
    valor_adquisicion: 3600000,
    valor_residual: 0,
    vida_util_meses: 36,
    aplica_acelerada: true,
    cuenta_activo_id: ctx.maquinarias,
  });

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 300));
  assert.equal(datos.activo.codigo, "MAQ-001", "el código se guarda en mayúsculas");
  assert.equal(Number(datos.activo.vida_util_acelerada_meses), 12, "un tercio, calculado solo");
  assert.ok(
    datos.avisos.some((aviso) => /solo tributaria/.test(aviso)),
    "avisa que la acelerada no se contabiliza"
  );
  ctx.torno = datos.activo.id;

  const repetido = await enviar("/api/activos-fijos", {
    empresa_id: ctx.empresa,
    codigo: "MAQ-001",
    nombre: "Otro con el mismo código",
    fecha_adquisicion: "2035-01-02",
    valor_adquisicion: 100000,
    vida_util_meses: 12,
  });
  assert.equal(repetido.status, 409);
});

test("el valor residual no puede alcanzar al valor de adquisición", async () => {
  const { status } = await enviar("/api/activos-fijos", {
    empresa_id: ctx.empresa,
    codigo: "MAQ-RES",
    nombre: "Residual imposible",
    fecha_adquisicion: "2035-01-02",
    valor_adquisicion: 500000,
    valor_residual: 500000,
    vida_util_meses: 12,
  });

  assert.equal(status, 400);
});

// --------------------------------------------------------- contabilización

test("contabilizar la depreciación usa la normal y deja la acelerada aparte", async () => {
  const previo = await pedir(
    `/api/activos-fijos/depreciacion?empresa_id=${ctx.empresa}&periodo=2035-03`
  );
  assert.equal(previo.status, 200, JSON.stringify(previo.datos).slice(0, 200));
  assert.equal(previo.datos.totales.depreciacion_mes, 100000);
  assert.equal(previo.datos.totales.depreciacion_mes_acelerada, 300000);
  assert.equal(previo.datos.diferencia_acelerada, 200000, "es el ajuste de la renta líquida");

  const { status, datos } = await enviar("/api/activos-fijos/depreciacion/contabilizar", {
    empresa_id: ctx.empresa,
    periodo: "2035-03",
  });

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 300));
  assert.equal(datos.total, 100000, "el asiento lleva la depreciación normal");
  assert.equal(datos.total_acelerada, 300000);
  ctx.comprobanteDep = datos.comprobante.id;

  const { rows } = await pool.query(
    `SELECT cuenta_id, debe, haber FROM comprobante_detalle WHERE comprobante_id = $1 ORDER BY id`,
    [ctx.comprobanteDep]
  );

  assert.equal(rows.length, 2);
  assert.equal(Number(rows[0].cuenta_id), ctx.gastoDep);
  assert.equal(Number(rows[0].debe), 100000);
  assert.equal(Number(rows[1].cuenta_id), ctx.depAcumulada);
  assert.equal(Number(rows[1].haber), 100000);

  // El asiento va al último día del mes.
  const comprobante = await pool.query(`SELECT fecha, tipo FROM comprobantes WHERE id = $1`, [
    ctx.comprobanteDep,
  ]);
  assert.equal(new Date(comprobante.rows[0].fecha).getUTCDate(), 31);
  assert.equal(comprobante.rows[0].tipo, "Depreciacion");

  // Y quedó registrada la acelerada, que es lo que después usa la renta anual.
  const registro = await pool.query(
    `SELECT depreciacion_mes, depreciacion_mes_acelerada, contabilizada
     FROM depreciaciones WHERE activo_fijo_id = $1 AND periodo = '2035-03'`,
    [ctx.torno]
  );
  assert.equal(Number(registro.rows[0].depreciacion_mes), 100000);
  assert.equal(Number(registro.rows[0].depreciacion_mes_acelerada), 300000);
  assert.equal(registro.rows[0].contabilizada, true);
});

test("correr la depreciación dos veces en el mismo período no duplica el gasto", async () => {
  const { status, datos } = await enviar("/api/activos-fijos/depreciacion/contabilizar", {
    empresa_id: ctx.empresa,
    periodo: "2035-03",
  });

  assert.equal(status, 400, JSON.stringify(datos).slice(0, 200));
  assert.match(datos.error, /pendiente de contabilizar/i);

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM depreciaciones
     WHERE activo_fijo_id = $1 AND periodo = '2035-03' AND estado = 'vigente'`,
    [ctx.torno]
  );
  assert.equal(rows[0].n, 1);
});

test("un bien con depreciación contabilizada no cambia de valor ni de vida útil", async () => {
  const { status, datos } = await enviar(
    `/api/activos-fijos/${ctx.torno}`,
    { empresa_id: ctx.empresa, valor_adquisicion: 9000000 },
    "PUT"
  );

  assert.equal(status, 409, JSON.stringify(datos).slice(0, 200));
  assert.match(datos.error, /ya tiene depreciaci[óo]n contabilizada/i);

  // Lo que no altera el cálculo sí se puede corregir.
  const nombre = await enviar(
    `/api/activos-fijos/${ctx.torno}`,
    { empresa_id: ctx.empresa, nombre: "Torno industrial CNC", categoria: "Maquinarias y equipos en general" },
    "PUT"
  );
  assert.equal(nombre.status, 200, JSON.stringify(nombre.datos).slice(0, 200));
  assert.equal(nombre.datos.activo.nombre, "Torno industrial CNC");
});

test("sin cuentas configuradas la depreciación no se contabiliza a medias", async () => {
  await pool.query(
    `UPDATE configuracion_contable SET cuenta_gasto_depreciacion_id = NULL WHERE empresa_id = $1`,
    [ctx.empresa]
  );

  const { status, datos } = await enviar("/api/activos-fijos/depreciacion/contabilizar", {
    empresa_id: ctx.empresa,
    periodo: "2035-04",
  });

  assert.equal(status, 400);
  assert.match(datos.error, /cuenta de gasto por depreciaci[óo]n/i);

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM depreciaciones WHERE empresa_id = $1 AND periodo = '2035-04'`,
    [ctx.empresa]
  );
  assert.equal(rows[0].n, 0, "no quedó nada a medio registrar");

  await pool.query(
    `UPDATE configuracion_contable SET cuenta_gasto_depreciacion_id = $2 WHERE empresa_id = $1`,
    [ctx.empresa, ctx.gastoDep]
  );
});

// -------------------------------------------------------------- la baja

test("dar de baja exige motivo, deja de depreciar y no inventa el asiento", async () => {
  const sinMotivo = await enviar(
    `/api/activos-fijos/${ctx.torno}/baja`,
    { empresa_id: ctx.empresa, fecha_baja: "2035-06-30", motivo: "no" },
    "PUT"
  );
  assert.equal(sinMotivo.status, 400);

  const { status, datos } = await enviar(
    `/api/activos-fijos/${ctx.torno}/baja`,
    {
      empresa_id: ctx.empresa,
      fecha_baja: "2035-06-30",
      motivo: "Vendido a un tercero por cambio de tecnología",
      tipo: "vendido",
      valor_venta: 3000000,
    },
    "PUT"
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));
  assert.equal(datos.activo.estado, "vendido");
  // Al 2035-06 lleva 6 meses de 100.000: valor libro 3.000.000.
  assert.equal(datos.valor_libro_a_la_baja, 3000000);
  assert.equal(datos.resultado_venta, 0, "vendido justo en su valor libro");
  assert.match(datos.aviso, /REQUIERE VALIDACI[ÓO]N CONTABLE/);

  // Desde el mes siguiente a la baja ya no se deprecia.
  const despues = await pedir(
    `/api/activos-fijos/depreciacion?empresa_id=${ctx.empresa}&periodo=2035-07`
  );
  assert.equal(despues.datos.totales.depreciacion_mes, 0);

  const repetida = await enviar(
    `/api/activos-fijos/${ctx.torno}/baja`,
    { empresa_id: ctx.empresa, fecha_baja: "2035-07-01", motivo: "Intento repetido de baja" },
    "PUT"
  );
  assert.equal(repetida.status, 400);
});

test("el libro de activo fijo agrupa por categoría y dice que está a costo histórico", async () => {
  const { status, datos } = await pedir(
    `/api/activos-fijos/informe?empresa_id=${ctx.empresa}&periodo=2035-06`
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 200));
  assert.match(datos.aviso, /correcci[óo]n monetaria/i);

  const maquinarias = datos.categorias.find((grupo) =>
    /Maquinarias/.test(grupo.categoria)
  );
  assert.ok(maquinarias, "el bien aparece en su categoría");
  assert.equal(maquinarias.valor_adquisicion, 3600000);
  assert.equal(maquinarias.acumulada, 600000);
  assert.equal(maquinarias.valor_libro, 3000000);
  assert.equal(maquinarias.acumulada_acelerada, 1800000, "la tributaria va aparte");
  assert.equal(datos.totales.valor_libro, 3000000);
});

test("anular el asiento de depreciación permite volver a depreciar el período", async () => {
  // Un bien nuevo, para no chocar con el que ya se dio de baja.
  const creado = await enviar("/api/activos-fijos", {
    empresa_id: ctx.empresa,
    codigo: "MAQ-002",
    nombre: "Prensa",
    categoria: "Maquinarias y equipos en general",
    fecha_adquisicion: "2036-01-02",
    valor_adquisicion: 1200000,
    vida_util_meses: 12,
  });
  assert.equal(creado.status, 201, JSON.stringify(creado.datos).slice(0, 200));

  const contabilizada = await enviar("/api/activos-fijos/depreciacion/contabilizar", {
    empresa_id: ctx.empresa,
    periodo: "2036-02",
  });
  assert.equal(contabilizada.status, 201, JSON.stringify(contabilizada.datos).slice(0, 200));

  const comprobanteId = contabilizada.datos.comprobante.id;

  const anulado = await enviar(
    `/api/comprobantes/${comprobanteId}`,
    { empresa_id: ctx.empresa },
    "DELETE"
  );
  assert.equal(anulado.status, 200, JSON.stringify(anulado.datos).slice(0, 200));

  const { rows } = await pool.query(
    `SELECT estado, contabilizada FROM depreciaciones WHERE comprobante_id = $1`,
    [comprobanteId]
  );
  assert.equal(rows[0].estado, "anulada");
  assert.equal(rows[0].contabilizada, false);

  // Y el período vuelve a estar disponible: el índice único solo cuenta las
  // vigentes.
  const otraVez = await enviar("/api/activos-fijos/depreciacion/contabilizar", {
    empresa_id: ctx.empresa,
    periodo: "2036-02",
  });
  assert.equal(otraVez.status, 201, JSON.stringify(otraVez.datos).slice(0, 200));
  assert.equal(otraVez.datos.total, 100000);
});
