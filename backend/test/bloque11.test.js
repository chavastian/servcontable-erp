/**
 * Bloques 11 y 12 de la revisión del 19-09-2026: módulos 8 y 9, corrección
 * monetaria y renta anual.
 *
 * Estos dos son los que el informe marcaba como imposibles sin definir criterio
 * tributario. Lo que estas pruebas fijan es justamente dónde está el límite:
 *
 * - **Sin IPC cargado no hay cálculo.** No se interpola, no se asume cero: se
 *   dice qué meses faltan.
 * - **Sin clasificación confirmada no se contabiliza.** Una propuesta del
 *   sistema no basta para tocar la contabilidad.
 * - **Sin criterio escrito no se contabiliza.** Una corrección monetaria que no
 *   se puede explicar no se puede defender.
 * - La RLI calcula solo lo que deriva de datos propios (diferencia de
 *   depreciación, corrección monetaria, gastos rechazados marcados) y suma las
 *   líneas que una persona agregó.
 * - Sin régimen definido la renta no se cierra.
 *
 *   DATABASE_URL=<staging o test> node --test test/bloque11.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_bloque11_no_produccion_32_cara";
process.env.COBRANZA_AUTOMATICA = "false";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");
const {
  clasificacionSugerida,
  factoresDelAnio,
  factorParaFecha,
} = require("../src/helpers/correccionMonetaria.helper");
const { REGIMENES } = require("../src/helpers/rentaAnual.helper");

const SUFIJO = `b11${Date.now().toString().slice(-7)}`;
const CLAVE = "Bloque11-2026";
const CORREO = `${SUFIJO}@test.local`;
const ANIO = 2041;
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

async function asiento(fecha, tipo, lineas, numero) {
  const debe = lineas.reduce((s, l) => s + (l.debe || 0), 0);
  const haber = lineas.reduce((s, l) => s + (l.haber || 0), 0);
  const { rows } = await pool.query(
    `INSERT INTO comprobantes (empresa_id, periodo, fecha, tipo, numero, glosa, total_debe, total_haber, estado)
     VALUES ($1, $2, $3, $4, $5, 'Prueba bloque 11', $6, $7, 'vigente') RETURNING id`,
    [ctx.empresa, fecha.slice(0, 7), fecha, tipo, numero, debe, haber]
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

  // El IPC vive en una tabla nacional compartida. Se limpia al empezar y no solo
  // al terminar: si una corrida anterior se cortó, el año quedaría con IPC y la
  // prueba de "sin IPC no se calcula" pasaría a verde por el motivo equivocado.
  await pool.query(
    `UPDATE parametros_nacionales SET variacion_ipc = NULL WHERE periodo LIKE $1`,
    [`${ANIO}-%`]
  );

  ctx.empresa = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa) VALUES ($1, $2, true) RETURNING id`,
      [`BB${SUFIJO}-1`, `Empresa bloque11 ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.caja = await cuenta("1101001", "Caja", "Activo", "Deudora");
  ctx.maquinarias = await cuenta("1401001", "Maquinarias", "Activo", "Deudora");
  ctx.capital = await cuenta("2301001", "Capital", "Patrimonio", "Acreedora");
  ctx.revalorizacion = await cuenta("2301002", "Revalorización del capital propio", "Patrimonio", "Acreedora");
  ctx.correccion = await cuenta("3301001", "Corrección monetaria", "Gasto", "Deudora");
  ctx.multas = await cuenta("3301002", "Multas e intereses fiscales", "Gasto", "Deudora");
  ctx.ventasCta = await cuenta("4101001", "Ventas", "Ingreso", "Acreedora");
  ctx.gastos = await cuenta("3101001", "Gastos generales", "Gasto", "Deudora");

  await pool.query(
    `INSERT INTO configuracion_contable
       (empresa_id, cuenta_caja_banco_id, cuenta_correccion_monetaria_id,
        cuenta_revalorizacion_capital_id, facturador_electronico)
     VALUES ($1, $2, $3, $4, false)`,
    [ctx.empresa, ctx.caja, ctx.correccion, ctx.revalorizacion]
  );

  for (const anio of [ANIO - 1, ANIO]) {
    await pool.query(
      `INSERT INTO ejercicios_contables (empresa_id, anio, estado, fecha_inicio, fecha_termino)
       VALUES ($1, $2, 'abierto', $3, $4)`,
      [ctx.empresa, anio, `${anio}-01-01`, `${anio}-12-31`]
    );
  }

  // Situación al cierre del año anterior: capital 10.000.000 aportado en caja,
  // de los que 4.000.000 están en maquinarias (no monetarias).
  await asiento(`${ANIO - 1}-01-10`, "Traspaso", [
    { cuenta: ctx.caja, debe: 10000000 },
    { cuenta: ctx.capital, haber: 10000000 },
  ], 1);
  await asiento(`${ANIO - 1}-06-10`, "Traspaso", [
    { cuenta: ctx.maquinarias, debe: 4000000 },
    { cuenta: ctx.caja, haber: 4000000 },
  ], 2);

  // Resultado del año: ventas 8.000.000, gastos 3.000.000, multas 500.000.
  await asiento(`${ANIO}-03-10`, "Traspaso", [
    { cuenta: ctx.caja, debe: 8000000 },
    { cuenta: ctx.ventasCta, haber: 8000000 },
  ], 3);
  await asiento(`${ANIO}-04-10`, "Traspaso", [
    { cuenta: ctx.gastos, debe: 3000000 },
    { cuenta: ctx.caja, haber: 3000000 },
  ], 4);
  await asiento(`${ANIO}-05-10`, "Traspaso", [
    { cuenta: ctx.multas, debe: 500000 },
    { cuenta: ctx.caja, haber: 500000 },
  ], 5);

  const hash = await bcrypt.hash(CLAVE, 10);
  ctx.usuario = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Bloque11', $1, $2, 'admin_cliente', true) RETURNING id`,
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
  // El IPC es un dato nacional compartido: se limpia para no afectar a otras
  // pruebas ni dejar datos inventados en la tabla. Va ANTES de detener el
  // servidor, porque detenerlo cierra el pool y la consulta ya no corre.
  await pool.query(
    `UPDATE parametros_nacionales SET variacion_ipc = NULL WHERE periodo LIKE $1`,
    [`${ANIO}-%`]
  );
  if (ctx.server) await detenerServidor(ctx.server);
});

// ------------------------------------------------- corrección monetaria

test("la clasificación sugerida distingue lo monetario de lo que no lo es", () => {
  assert.equal(clasificacionSugerida({ tipo: "Activo", nombre: "Caja" }), "monetaria");
  assert.equal(clasificacionSugerida({ tipo: "Activo", nombre: "Clientes" }), "monetaria");
  assert.equal(clasificacionSugerida({ tipo: "Activo", nombre: "Maquinarias y equipos" }), "no_monetaria");
  assert.equal(clasificacionSugerida({ tipo: "Activo", nombre: "Existencias" }), "no_monetaria");
  assert.equal(clasificacionSugerida({ tipo: "Activo", nombre: "Dep. acumulada vehículos" }), "no_monetaria");
  assert.equal(clasificacionSugerida({ tipo: "Patrimonio", nombre: "Capital" }), "patrimonio");
  // Las cuentas de resultado no se corrigen.
  assert.equal(clasificacionSugerida({ tipo: "Gasto", nombre: "Arriendos" }), null);
});

test("sin el IPC del año cargado la corrección no se calcula ni se inventa", async () => {
  const { status, datos } = await pedir(
    `/api/correccion-monetaria?empresa_id=${ctx.empresa}&anio=${ANIO}`
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));
  assert.equal(datos.puede_calcular, false);
  assert.equal(datos.meses_sin_ipc.length, 12, "los doce meses faltan");
  assert.match(datos.motivo, /no se va a inventar/i);

  // Y tampoco se contabiliza.
  const contabilizar = await enviar("/api/correccion-monetaria/contabilizar", {
    empresa_id: ctx.empresa,
    anio: ANIO,
    criterio: "Corrección monetaria del artículo 41 sobre partidas no monetarias",
  });
  assert.equal(contabilizar.status, 400);
  assert.match(contabilizar.datos.error, /IPC/i);
});

test("el IPC se carga por período y los factores se acumulan hacia diciembre", async () => {
  // 1% mensual durante los doce meses.
  for (let mes = 1; mes <= 12; mes += 1) {
    const periodo = `${ANIO}-${String(mes).padStart(2, "0")}`;
    const { status } = await enviar("/api/correccion-monetaria/ipc", {
      periodo,
      variacion_ipc: 1,
    });

    // El usuario de prueba no es administrador del sistema: el IPC es nacional.
    assert.ok([200, 403].includes(status), `estado inesperado al cargar ${periodo}: ${status}`);
  }

  // Si la ruta está restringida, se carga directo: lo que se prueba acá es el
  // cálculo, no el permiso.
  await pool.query(
    `INSERT INTO parametros_nacionales (periodo, variacion_ipc, fuente)
     SELECT $1 || '-' || LPAD(g::text, 2, '0'), 1, 'prueba'
     FROM generate_series(1, 12) g
     ON CONFLICT (periodo) DO UPDATE SET variacion_ipc = 1`,
    [String(ANIO)]
  );

  const calculo = await factoresDelAnio(pool, ANIO);

  assert.equal(calculo.faltantes.length, 0);
  // Doce meses al 1%: 1,01^12 = 1,126825.
  assert.equal(calculo.factorAnual, 1.126825);
  // Lo que nace en diciembre no se corrige.
  assert.equal(calculo.factores[`${ANIO}-12`], 1);
  // Lo de enero sufre once meses: 1,01^11.
  assert.equal(calculo.factores[`${ANIO}-01`], 1.115668);

  // Una partida anterior al año usa el factor anual completo.
  assert.equal(factorParaFecha(`${ANIO - 1}-06-10`, ANIO, calculo), 1.126825);
  assert.equal(factorParaFecha(`${ANIO}-12-20`, ANIO, calculo), 1);
});

test("la corrección se calcula sobre lo no monetario y el capital propio", async () => {
  const { status, datos } = await pedir(
    `/api/correccion-monetaria?empresa_id=${ctx.empresa}&anio=${ANIO}`
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));
  assert.equal(datos.puede_calcular, true);
  assert.equal(datos.factor_anual, 1.126825);

  // Capital propio inicial: 10.000.000 de activos (6 en caja + 4 en
  // maquinarias) menos 0 de pasivos.
  assert.equal(datos.capital_propio_inicial.capital_propio, 10000000);
  assert.equal(datos.correccion_capital_propio, Math.round(10000000 * 0.126825));

  // La maquinaria es la única no monetaria con saldo.
  const lineaMaquinaria = datos.lineas.find((l) => l.cuenta_id === ctx.maquinarias);
  assert.ok(lineaMaquinaria, "la maquinaria se corrige");
  assert.equal(lineaMaquinaria.base, 4000000);
  assert.equal(lineaMaquinaria.correccion, Math.round(4000000 * 0.126825));

  // La caja es monetaria: no aparece.
  assert.equal(datos.lineas.find((l) => l.cuenta_id === ctx.caja), undefined);

  assert.ok(datos.avisos.some((a) => /REQUIERE VALIDACI[ÓO]N TRIBUTARIA/.test(a)));
  assert.ok(
    datos.avisos.some((a) => /no confirmada/i.test(a)),
    "avisa que las clasificaciones son propuestas"
  );
});

test("no se contabiliza con clasificaciones solo sugeridas ni sin criterio", async () => {
  const sinConfirmar = await enviar("/api/correccion-monetaria/contabilizar", {
    empresa_id: ctx.empresa,
    anio: ANIO,
    criterio: "Corrección del artículo 41 sobre activo fijo y capital propio",
  });

  assert.equal(sinConfirmar.status, 409, JSON.stringify(sinConfirmar.datos).slice(0, 200));
  assert.match(sinConfirmar.datos.error, /clasificaci[óo]n solo sugerida/i);

  // Se confirman las clasificaciones.
  const sugerencias = await pedir(
    `/api/correccion-monetaria/clasificaciones?empresa_id=${ctx.empresa}&anio=${ANIO}`
  );
  assert.equal(sugerencias.status, 200);
  assert.ok(sugerencias.datos.sin_confirmar > 0);

  const guardar = await enviar("/api/correccion-monetaria/clasificaciones", {
    empresa_id: ctx.empresa,
    clasificaciones: sugerencias.datos.sugerencias.map((s) => ({
      cuenta_id: s.cuenta_id,
      clasificacion: s.clasificacion_sugerida,
    })),
  });
  assert.equal(guardar.status, 200, JSON.stringify(guardar.datos).slice(0, 200));

  // Ahora falla solo por el criterio.
  const sinCriterio = await enviar("/api/correccion-monetaria/contabilizar", {
    empresa_id: ctx.empresa,
    anio: ANIO,
    criterio: "corto",
  });
  assert.equal(sinCriterio.status, 400);
  assert.match(sinCriterio.datos.error, /criterio/i);
});

test("la corrección monetaria se contabiliza cuadrada y queda con su criterio", async () => {
  const { status, datos } = await enviar("/api/correccion-monetaria/contabilizar", {
    empresa_id: ctx.empresa,
    anio: ANIO,
    criterio:
      "Artículo 41: se corrigen las maquinarias por el factor anual y se revaloriza el capital propio inicial.",
  });

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 400));
  assert.equal(Number(datos.correccion.factor_anual), 1.126825);
  assert.match(datos.correccion.criterio, /Art[íi]culo 41/);

  const { rows } = await pool.query(
    `SELECT total_debe, total_haber, fecha, tipo,
            (SELECT COALESCE(SUM(debe), 0) FROM comprobante_detalle WHERE comprobante_id = c.id) AS debe,
            (SELECT COALESCE(SUM(haber), 0) FROM comprobante_detalle WHERE comprobante_id = c.id) AS haber
     FROM comprobantes c WHERE c.id = $1`,
    [datos.comprobante.id]
  );

  assert.equal(Number(rows[0].debe), Number(rows[0].haber), "el asiento cuadra");
  assert.equal(rows[0].tipo, "Correccion");
  assert.equal(new Date(rows[0].fecha).getUTCDate(), 31, "al 31 de diciembre");

  // Dos veces no.
  const repetida = await enviar("/api/correccion-monetaria/contabilizar", {
    empresa_id: ctx.empresa,
    anio: ANIO,
    criterio: "Intento de repetir la corrección monetaria del mismo año",
  });
  assert.equal(repetida.status, 409);
});

// -------------------------------------------------------- renta anual

test("los regímenes están definidos con su tasa y si llevan registros", () => {
  assert.equal(REGIMENES["14A"].tasa_primera_categoria, 27);
  assert.equal(REGIMENES["14D3"].tasa_primera_categoria, 25);
  assert.equal(REGIMENES["14D8"].transparente, true);
  assert.equal(REGIMENES["14D8"].lleva_registros, false);
});

test("la RLI parte del balance y suma lo que el sistema sabe", async () => {
  const { status, datos } = await pedir(`/api/renta-anual?empresa_id=${ctx.empresa}&anio=${ANIO}`);

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 400));

  // Ventas 8.000.000, gastos 3.000.000, multas 500.000 y el gasto por
  // corrección monetaria que se contabilizó recién: 507.300 de corrección de
  // activos contra 1.268.250 de revalorización del capital, o sea 760.950 de
  // pérdida.
  assert.equal(datos.balance.ingresos, 8000000);
  assert.equal(datos.balance.gastos, 3500000 + 760950);
  assert.equal(datos.balance.resultado, 8000000 - 3500000 - 760950);

  // Y justamente por eso la corrección NO vuelve a entrar como partida: ya está
  // dentro del resultado según balance. Contarla dos veces dejaría la RLI mal
  // por el doble del efecto.
  assert.equal(datos.correccion_monetaria.contabilizada, true);
  assert.equal(
    datos.lineas.find((l) => /correcci[óo]n monetaria/i.test(l.concepto)),
    undefined,
    "la corrección contabilizada no se agrega de nuevo"
  );
  assert.ok(
    datos.avisos.some((a) => /no se agrega como partida/i.test(a)),
    "pero se dice por qué no aparece"
  );

  // Sin régimen definido no se calcula impuesto y se avisa.
  assert.equal(datos.regimen, null);
  assert.equal(datos.impuesto_primera_categoria, null);
  assert.ok(datos.avisos.some((a) => /r[ée]gimen tributario/i.test(a)));

  // El DDAN se lleva solo; los otros registros dicen qué necesitan.
  assert.equal(datos.registros.DDAN.origen, "sistema");
  assert.ok(datos.registros.RAI.requiere);
  assert.ok(datos.registros.SAC.requiere);
});

test("las multas marcadas como gasto rechazado agregan a la RLI", async () => {
  await pool.query(`UPDATE plan_cuentas SET gasto_rechazado = true WHERE id = $1`, [ctx.multas]);

  const { status, datos } = await pedir(`/api/renta-anual?empresa_id=${ctx.empresa}&anio=${ANIO}`);

  assert.equal(status, 200);

  const rechazado = datos.lineas.find((l) => /Gasto rechazado/.test(l.concepto));
  assert.ok(rechazado, "aparece como agregado");
  assert.equal(rechazado.tipo, "agregado");
  assert.equal(rechazado.monto, 500000);
  assert.equal(rechazado.origen, "sistema");
});

test("las partidas que el sistema no puede saber se agregan a mano y se conservan", async () => {
  const guardar = await enviar("/api/renta-anual", {
    empresa_id: ctx.empresa,
    anio: ANIO,
    lineas: [
      { concepto: "Ingresos no constitutivos de renta", tipo: "deduccion", monto: 200000 },
      { concepto: "Donación sin franquicia", tipo: "agregado", monto: 100000 },
      { concepto: "Línea en cero que no debe guardarse", tipo: "agregado", monto: 0 },
    ],
    saldos_iniciales: { RAI: 1000000, DDAN: 0, REX: 50000, SAC: 200000 },
    criterio: "Determinación preliminar de la RLI del ejercicio",
  });

  assert.equal(guardar.status, 200, JSON.stringify(guardar.datos).slice(0, 300));

  const { status, datos } = await pedir(`/api/renta-anual?empresa_id=${ctx.empresa}&anio=${ANIO}`);

  assert.equal(status, 200);

  const manuales = datos.lineas.filter((l) => l.origen === "manual");
  assert.equal(manuales.length, 2, "la línea en cero no se guardó");
  assert.ok(manuales.some((l) => /no constitutivos/.test(l.concepto)));

  // Y los saldos iniciales de los registros se conservan.
  assert.equal(datos.registros.RAI.saldo_inicial, 1000000);
  assert.equal(datos.registros.SAC.saldo_inicial, 200000);

  // La RLI refleja todo: resultado + agregados - deducciones.
  const esperada =
    datos.balance.resultado + datos.total_agregados - datos.total_deducciones;
  assert.equal(datos.renta_liquida_imponible, esperada);
});

test("sin régimen definido la renta no se cierra", async () => {
  const { status, datos } = await enviar("/api/renta-anual/cerrar", {
    empresa_id: ctx.empresa,
    anio: ANIO,
    criterio: "Cierre de la determinación de la renta del ejercicio",
  });

  assert.equal(status, 400, JSON.stringify(datos).slice(0, 200));
  assert.match(datos.error, /r[ée]gimen tributario/i);
});

test("con el régimen definido se calcula el impuesto y se cierra la renta", async () => {
  const regimen = await enviar("/api/renta-anual/regimen", {
    empresa_id: ctx.empresa,
    regimen: "14D3",
  });
  assert.equal(regimen.status, 200, JSON.stringify(regimen.datos).slice(0, 200));

  const consulta = await pedir(`/api/renta-anual?empresa_id=${ctx.empresa}&anio=${ANIO}`);
  assert.equal(consulta.datos.regimen.codigo, "14D3");
  assert.equal(consulta.datos.regimen.tasa_primera_categoria, 25);
  assert.equal(
    consulta.datos.impuesto_primera_categoria,
    Math.round(consulta.datos.renta_liquida_imponible * 0.25)
  );

  const cerrar = await enviar("/api/renta-anual/cerrar", {
    empresa_id: ctx.empresa,
    anio: ANIO,
    criterio: "Renta determinada según el artículo 14 letra D N°3, pro pyme general",
  });
  assert.equal(cerrar.status, 200, JSON.stringify(cerrar.datos).slice(0, 300));
  assert.equal(cerrar.datos.renta.estado, "cerrada");

  // Cerrada no se modifica sin reabrir.
  const modificar = await enviar("/api/renta-anual", {
    empresa_id: ctx.empresa,
    anio: ANIO,
    lineas: [{ concepto: "Otra cosa", tipo: "agregado", monto: 1 }],
  });
  assert.equal(modificar.status, 409);

  const reabrir = await enviar("/api/renta-anual/reabrir", {
    empresa_id: ctx.empresa,
    anio: ANIO,
    motivo: "Faltaba una partida por agregar",
  });
  assert.equal(reabrir.status, 200);
  assert.equal(reabrir.datos.renta.estado, "borrador");
  assert.match(reabrir.datos.renta.criterio, /Reapertura/);
});

test("el F22 propuesto dice que no es un formulario listo para presentar", async () => {
  const { status, datos } = await pedir(
    `/api/renta-anual/f22?empresa_id=${ctx.empresa}&anio=${ANIO}`
  );

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 300));
  assert.equal(datos.anio_tributario, ANIO + 1);
  assert.ok(datos.avisos.some((a) => /NO es un formulario listo/i.test(a)));

  const rli = datos.codigos.find((c) => c.codigo === "643");
  assert.equal(rli.valor, datos.renta_liquida_imponible);
  // Cada código dice de dónde sale, para poder revisarlo contra el balance.
  assert.ok(datos.codigos.every((c) => c.origen));

  const impuesto = datos.codigos.find((c) => c.codigo === "18");
  assert.equal(impuesto.valor, Math.round(datos.renta_liquida_imponible * 0.25));
});
