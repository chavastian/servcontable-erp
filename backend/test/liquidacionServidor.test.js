/**
 * Los montos de una liquidación los calcula el servidor.
 *
 * Antes `guardarLiquidacion` recibía del cliente todos los montos ya
 * calculados —AFP, salud, impuesto único, líquido a pagar, costo empresa— y los
 * guardaba tal cual, sin recalcular nada.
 *
 * Una liquidación es un documento legal que se entrega al trabajador y la base
 * de lo que se cotiza en AFP, salud y seguro de cesantía. Un monto manipulado,
 * o simplemente un error del navegador, quedaba guardado como si fuera
 * correcto: una liquidación con cero de cotización previsional es un problema
 * para el empleador ante la Dirección del Trabajo.
 *
 *   DATABASE_URL=<staging o test> node --test test/liquidacionServidor.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_liquidacion_no_produccion_32_ca";
process.env.COBRANZA_AUTOMATICA = "false";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");

const SUFIJO = `liq${Date.now().toString().slice(-8)}`;
const CLAVE = "Liquidacion-2026";
const CORREO = `${SUFIJO}@test.local`;
const PERIODO = "2026-05";
const SUELDO = 1200000;

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

function entradas(extra = {}) {
  return {
    empresa_id: ctx.empresa,
    trabajador_id: ctx.trabajador,
    periodo: PERIODO,
    dias_trabajados: 30,
    ...extra,
  };
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
      [`L${SUFIJO}-6`, `Empresa liquidacion ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.trabajador = (
    await pool.query(
      `INSERT INTO trabajadores (empresa_id, rut, nombres, apellidos, fecha_ingreso,
                                 estado, sueldo_base, afp, salud)
       VALUES ($1, '16153127-8', 'Trabajador', 'Prueba', '2024-01-02', 'activo',
               $2, 'MODELO', 'FONASA')
       RETURNING id`,
      [ctx.empresa, SUELDO]
    )
  ).rows[0].id;

  // Parámetros del período: sin esto no hay con qué calcular.
  await pool.query(
    `INSERT INTO configuracion_remuneraciones
       (empresa_id, periodo, valor_uf, tope_imponible_uf, tasa_afc_trabajador,
        tasa_afc_empleador, tasa_mutual)
     VALUES ($1, $2, 39000, 87.8, 0.6, 2.4, 0.95)`,
    [ctx.empresa, PERIODO]
  );

  await pool.query(
    `INSERT INTO afp_parametros (empresa_id, periodo, nombre, tasa_afp, tasa_sis,
                                 tasa_seguro_social, activo)
     VALUES ($1, $2, 'MODELO', 10.58, 1.54, 1, true)`,
    [ctx.empresa, PERIODO]
  );

  await pool.query(
    `INSERT INTO impuesto_unico_tramos (empresa_id, periodo, desde, hasta, factor, rebaja, activo)
     VALUES ($1, $2, 0, 900000, 0, 0, true),
            ($1, $2, 900001, 2000000, 0.04, 36000, true)`,
    [ctx.empresa, PERIODO]
  );

  const hash = await bcrypt.hash(CLAVE, 10);
  const usuarioId = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Liquidacion', $1, $2, 'admin_cliente', true) RETURNING id`,
      [CORREO, hash]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo)
     VALUES ($1, $2, 'OWNER', true)`,
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

  ctx.token = (await login.json()).token;
  assert.ok(ctx.token);
});

test.after(async () => {
  if (ctx.server) await detenerServidor(ctx.server);
});

test("el calculo del servidor descuenta AFP y salud", async () => {
  const { status, datos } = await enviar("/api/liquidaciones/calcular", entradas());

  assert.equal(status, 200, JSON.stringify(datos).slice(0, 250));

  // Los montos viven en `calculo`; `configuracion` trae las tasas.
  const c = datos.calculo;
  ctx.calculo = c;

  assert.ok(Number(c.descuento_afp) > 0, "debe descontar AFP");
  assert.ok(Number(c.descuento_salud) > 0, "debe descontar salud");
  assert.ok(Number(c.liquido_pagar) > 0, "debe haber liquido a pagar");
  assert.ok(
    Number(c.liquido_pagar) < Number(c.total_haberes),
    "el liquido tiene que ser menor que los haberes"
  );
});

test("guardar ignora los montos que envia el cliente", async () => {
  // Este es el caso que importa: el cliente miente y el servidor no le cree.
  const { status, datos } = await enviar(
    "/api/liquidaciones",
    entradas({
      // Todo esto debe ignorarse.
      descuento_afp: 0,
      descuento_salud: 0,
      descuento_afc: 0,
      impuesto_unico: 0,
      total_descuentos: 0,
      liquido_pagar: 99999999,
      total_haberes: 99999999,
      costo_empresa: 0,
      sueldo_base: 99999999,
    })
  );

  assert.equal(status, 201, JSON.stringify(datos).slice(0, 250));

  const { rows } = await pool.query(
    `SELECT sueldo_base, descuento_afp, descuento_salud, total_descuentos,
            liquido_pagar, total_haberes, costo_empresa
     FROM liquidaciones WHERE id = $1`,
    [datos.liquidacion.id]
  );

  const guardada = rows[0];

  assert.equal(
    Number(guardada.sueldo_base),
    SUELDO,
    "el sueldo base tiene que salir del contrato, no del cuerpo de la peticion"
  );
  assert.ok(
    Number(guardada.descuento_afp) > 0,
    "la cotizacion de AFP no puede quedar en cero porque el cliente lo pidio"
  );
  assert.ok(Number(guardada.descuento_salud) > 0, "salud tampoco");
  assert.notEqual(
    Number(guardada.liquido_pagar),
    99999999,
    "el liquido a pagar no puede venir del cliente"
  );
  assert.ok(
    Number(guardada.costo_empresa) > 0,
    "el costo empresa se calcula, no se recibe"
  );
});

test("lo guardado coincide con lo que informa el calculo", async () => {
  // Si no coincidieran, la pantalla mostraria una cosa y la base tendria otra.
  const { rows } = await pool.query(
    `SELECT descuento_afp, descuento_salud, total_descuentos, liquido_pagar,
            total_haberes, impuesto_unico
     FROM liquidaciones
     WHERE empresa_id = $1 AND trabajador_id = $2 AND periodo = $3`,
    [ctx.empresa, ctx.trabajador, PERIODO]
  );

  const guardada = rows[0];
  const c = ctx.calculo;

  for (const campo of [
    "descuento_afp",
    "descuento_salud",
    "total_descuentos",
    "liquido_pagar",
    "total_haberes",
    "impuesto_unico",
  ]) {
    assert.equal(
      Number(guardada[campo]),
      Number(c[campo]),
      `${campo}: la base tiene ${guardada[campo]} y el calculo informo ${c[campo]}`
    );
  }
});

test("la respuesta de guardar devuelve el calculo del servidor", async () => {
  // Para que la pantalla muestre exactamente lo que quedo guardado.
  await pool.query(
    "DELETE FROM liquidaciones WHERE empresa_id = $1 AND periodo = $2",
    [ctx.empresa, PERIODO]
  );

  const { datos } = await enviar(
    "/api/liquidaciones",
    entradas({ liquido_pagar: 1, descuento_afp: 1 })
  );

  assert.ok(datos.calculo, "debe devolver el calculo");
  assert.ok(Number(datos.calculo.descuento_afp) > 1);
  assert.equal(
    Number(datos.calculo.liquido_pagar),
    Number(datos.liquidacion.liquido_pagar),
    "el calculo devuelto y la fila guardada tienen que coincidir"
  );
});

test("mas dias de ausencia bajan el liquido a pagar", async () => {
  // Comprueba que las entradas si influyen: no se trata de ignorar todo.
  await pool.query(
    "DELETE FROM liquidaciones WHERE empresa_id = $1 AND periodo = $2",
    [ctx.empresa, PERIODO]
  );

  const completo = await enviar("/api/liquidaciones/calcular", entradas({ dias_trabajados: 30 }));
  const parcial = await enviar("/api/liquidaciones/calcular", entradas({ dias_trabajados: 15 }));

  assert.ok(
    Number(parcial.datos.calculo.liquido_pagar) <
      Number(completo.datos.calculo.liquido_pagar),
    "medio mes trabajado tiene que pagar menos"
  );
});

test("un trabajador de otra empresa no se puede liquidar", async () => {
  const otraEmpresa = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa)
       VALUES ($1, $2, true) RETURNING id`,
      [`X${SUFIJO}-1`, `Empresa ajena ${SUFIJO}`]
    )
  ).rows[0].id;

  const ajeno = (
    await pool.query(
      `INSERT INTO trabajadores (empresa_id, rut, nombres, fecha_ingreso, estado, sueldo_base)
       VALUES ($1, '11111111-1', 'Ajeno', '2024-01-02', 'activo', 900000)
       RETURNING id`,
      [otraEmpresa]
    )
  ).rows[0].id;

  const { status } = await enviar(
    "/api/liquidaciones",
    entradas({ trabajador_id: ajeno })
  );

  assert.ok(status >= 400, `deberia rechazarse y dio ${status}`);
});

test("editar una liquidacion tambien recalcula en el servidor", async () => {
  // Crear recalculaba; editar guardaba los montos del cliente tal cual. Bastaba
  // crear y despues editar para saltarse el calculo.
  const creada = await enviar("/api/liquidaciones", entradas());
  assert.equal(creada.status, 201, JSON.stringify(creada.datos).slice(0, 200));

  const id = creada.datos.liquidacion.id;

  const editada = await enviar(
    `/api/liquidaciones/${id}`,
    entradas({
      dias_trabajados: 30,
      descuento_afp: 0,
      descuento_salud: 0,
      impuesto_unico: 0,
      liquido_pagar: 99999999,
      costo_empresa: 0,
    }),
    "PUT"
  );

  assert.equal(editada.status, 200, JSON.stringify(editada.datos).slice(0, 200));

  const { rows } = await pool.query(
    `SELECT descuento_afp, descuento_salud, liquido_pagar, costo_empresa
     FROM liquidaciones WHERE id = $1`,
    [id]
  );

  assert.ok(Number(rows[0].descuento_afp) > 0, "AFP no puede quedar en cero al editar");
  assert.ok(Number(rows[0].descuento_salud) > 0, "salud tampoco");
  assert.notEqual(Number(rows[0].liquido_pagar), 99999999);
  assert.ok(Number(rows[0].costo_empresa) > 0);
});

test("editar una liquidacion no permite cambiarla a un trabajador de otra empresa", async () => {
  // Solo puede existir una liquidacion por trabajador y periodo: se reutiliza la
  // que crearon las pruebas anteriores.
  const creada = {
    datos: {
      liquidacion: (
        await pool.query(
          `SELECT id FROM liquidaciones WHERE empresa_id = $1 AND estado <> 'eliminada' LIMIT 1`,
          [ctx.empresa]
        )
      ).rows[0],
    },
  };
  const otraEmpresa = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa) VALUES ($1, $2, true) RETURNING id`,
      [`Z${SUFIJO}-1`, `Ajena ${SUFIJO}`]
    )
  ).rows[0].id;
  const ajeno = (
    await pool.query(
      `INSERT INTO trabajadores (empresa_id, rut, nombres, apellidos, fecha_ingreso, sueldo_base, estado, afp, salud)
       VALUES ($1, $2, 'Otro', 'Ajeno', '2025-01-02', 500000, 'activo', 'MODELO', 'FONASA') RETURNING id`,
      [otraEmpresa, `${SUFIJO}-2`]
    )
  ).rows[0].id;

  const editada = await enviar(
    `/api/liquidaciones/${creada.datos.liquidacion.id}`,
    entradas({ trabajador_id: ajeno }),
    "PUT"
  );

  assert.equal(editada.status, 403);
});
