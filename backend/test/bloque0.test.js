/**
 * Bloque 0 de la revisión del 19-09-2026: lo que bloqueaba probar la versión
 * nueva.
 *
 * - Un GET con cuerpo JSON pasaba la membresía con la empresa propia en el
 *   cuerpo y consultaba la ajena en la query. Se leían trabajadores y libros
 *   de cualquier cliente.
 * - La migración de roles dejó "admin" en minúscula en tres puntos: crear
 *   empresa respondía 500 y administrar usuarios 403 para todo administrador
 *   de cliente.
 * - Haberes y ausencias aceptaban un trabajador de otra empresa y devolvían su
 *   nombre y RUT.
 * - Trece rutas de escritura no pedían permiso: un rol CONSULTA cambiaba tasas.
 * - Cambiar el rol de un usuario no cerraba sus sesiones.
 *
 *   DATABASE_URL=<staging o test> node --test test/bloque0.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_bloque0_no_produccion_32_carac";
process.env.COBRANZA_AUTOMATICA = "false";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const http = require("node:http");
const { iniciarServidor, detenerServidor } = require("../src/start");

/**
 * Un GET con cuerpo. fetch de Node lo rechaza, pero un atacante con curl no
 * tiene ese limite, y express.json lo parsea sin mirar el metodo.
 */
function getConCuerpo(ruta, token, cuerpo) {
  return new Promise((resolver, rechazar) => {
    const datos = JSON.stringify(cuerpo);
    const url = new URL(`${ctx.raiz}${ruta}`);
    const peticion = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(datos),
        },
      },
      (respuesta) => {
        let texto = "";
        respuesta.on("data", (trozo) => (texto += trozo));
        respuesta.on("end", () => {
          let json = {};
          try { json = JSON.parse(texto); } catch { json = {}; }
          resolver({ status: respuesta.statusCode, datos: json, texto });
        });
      }
    );
    peticion.on("error", rechazar);
    peticion.write(datos);
    peticion.end();
  });
}

const SUFIJO = `b0${Date.now().toString().slice(-8)}`;
const CLAVE = "Bloque0-2026";
const ctx = {};

async function crearUsuario(nombre, rol, empresaId, rolEmpresa) {
  const correo = `${nombre}${SUFIJO}@test.local`;
  const hash = await bcrypt.hash(CLAVE, 10);
  const id = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [nombre, correo, hash, rol]
    )
  ).rows[0].id;

  if (empresaId) {
    await pool.query(
      `INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo)
       VALUES ($1, $2, $3, true)`,
      [id, empresaId, rolEmpresa]
    );
  }

  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_id, status, billing_cycle, price,
                                currency, starts_at, expires_at, auto_renew, grace_days)
     SELECT $1, sp.id, 'ACTIVE', 'monthly', sp.monthly_price, 'CLP',
            CURRENT_DATE, CURRENT_DATE + 365, true, 5
     FROM subscription_plans sp WHERE sp.active = true ORDER BY sp.id LIMIT 1`,
    [id]
  );

  return { id, correo };
}

async function login(correo) {
  const respuesta = await fetch(`${ctx.raiz}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: correo, password: CLAVE }),
  });

  return (await respuesta.json()).token;
}

async function pedir(token, ruta, { metodo = "GET", cuerpo } = {}) {
  const respuesta = await fetch(`${ctx.raiz}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });

  return { status: respuesta.status, datos: await respuesta.json().catch(() => ({})) };
}

test.before(async () => {
  const base = (await pool.query("SELECT current_database() AS d")).rows[0].d;

  if (!/test|staging/i.test(base)) {
    throw new Error(`La base "${base}" no es de pruebas.`);
  }

  ctx.empresaA = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa) VALUES ($1, $2, true) RETURNING id`,
      [`A${SUFIJO}-1`, `Empresa A ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.empresaB = (
    await pool.query(
      `INSERT INTO empresas (rut, razon_social, activa) VALUES ($1, $2, true) RETURNING id`,
      [`B${SUFIJO}-2`, `Empresa B ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.trabajadorB = (
    await pool.query(
      `INSERT INTO trabajadores (empresa_id, rut, nombres, apellidos, fecha_ingreso, sueldo_base, estado)
       VALUES ($1, $2, 'Ajeno', 'De Otra Empresa', '2025-01-02', 500000, 'activo') RETURNING id`,
      [ctx.empresaB, `${SUFIJO}-9`]
    )
  ).rows[0].id;

  ctx.duenoA = await crearUsuario("dueno", "admin_cliente", ctx.empresaA, "OWNER");
  ctx.consultaA = await crearUsuario("consulta", "usuario", ctx.empresaA, "CONSULTA");
  ctx.editable = await crearUsuario("editable", "usuario", ctx.empresaA, "EDITOR");

  const iniciado = await iniciarServidor({ host: "127.0.0.1", port: 0 });
  ctx.server = iniciado.server;
  ctx.raiz = `http://127.0.0.1:${iniciado.port}`;

  ctx.tokenDueno = await login(ctx.duenoA.correo);
  ctx.tokenConsulta = await login(ctx.consultaA.correo);
  assert.ok(ctx.tokenDueno && ctx.tokenConsulta);
});

test.after(async () => {
  if (ctx.server) await detenerServidor(ctx.server);
});

// ---------------------------------------------------------------------------
// C-01
// ---------------------------------------------------------------------------

test("un GET con la empresa propia en el cuerpo y la ajena en la query se rechaza", async () => {
  const respuesta = await getConCuerpo(
    `/api/trabajadores?empresa_id=${ctx.empresaB}`,
    ctx.tokenDueno,
    { empresa_id: ctx.empresaA }
  );

  assert.equal(respuesta.status, 400, "dos empresas distintas en una peticion es la fuga");
  assert.ok(!respuesta.texto.includes("Ajeno"), "no debe devolver datos de la otra empresa");
});

test("un GET con la empresa ajena solo en el cuerpo responde 403", async () => {
  const respuesta = await getConCuerpo("/api/trabajadores", ctx.tokenDueno, {
    empresa_id: ctx.empresaB,
  });

  assert.equal(respuesta.status, 403);
});

test("verificarToken normaliza empresa_id en la query para los controladores", async () => {
  // empresaId en camelCase se elimina y empresa_id queda numerico y validado.
  const { status, datos } = await pedir(
    ctx.tokenDueno,
    `/api/trabajadores?empresaId=${ctx.empresaA}`
  );

  assert.equal(status, 200);
  assert.equal(datos.total, 0);
});

// ---------------------------------------------------------------------------
// C-02
// ---------------------------------------------------------------------------

test("un administrador de cliente puede crear una empresa y queda como OWNER", async () => {
  const { status, datos } = await pedir(ctx.tokenDueno, "/api/empresas", {
    metodo: "POST",
    cuerpo: { rut: `${SUFIJO.slice(-7)}-3`, razon_social: `Nueva ${SUFIJO}`, giro: "prueba" },
  });

  assert.equal(status, 201, JSON.stringify(datos));

  const nuevaId = datos.empresa?.id || datos.id;
  const { rows } = await pool.query(
    `SELECT rol_empresa FROM usuarios_empresas WHERE usuario_id = $1 AND empresa_id = $2`,
    [ctx.duenoA.id, nuevaId]
  );

  assert.equal(rows[0]?.rol_empresa, "OWNER");
});

test("el dueno de la empresa puede listar y administrar sus usuarios", async () => {
  const { status, datos } = await pedir(
    ctx.tokenDueno,
    `/api/auth/usuarios?empresa_id=${ctx.empresaA}`
  );

  assert.equal(status, 200, JSON.stringify(datos));
  assert.ok(Array.isArray(datos.usuarios));
  assert.ok(datos.usuarios.some((u) => u.id === ctx.consultaA.id));
});

// ---------------------------------------------------------------------------
// A-01
// ---------------------------------------------------------------------------

test("un haber con trabajador de otra empresa se rechaza", async () => {
  const { status } = await pedir(ctx.tokenDueno, "/api/haberes-descuentos", {
    metodo: "POST",
    cuerpo: {
      empresa_id: ctx.empresaA,
      trabajador_id: ctx.trabajadorB,
      periodo: "2026-05",
      nombre: "Bono",
      tipo: "haber",
      monto: 10000,
    },
  });

  assert.equal(status, 403);

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int c FROM haberes_descuentos_remuneraciones WHERE trabajador_id = $1`,
    [ctx.trabajadorB]
  );

  assert.equal(rows[0].c, 0);
});

test("una ausencia con trabajador de otra empresa se rechaza", async () => {
  const { status } = await pedir(ctx.tokenDueno, "/api/vacaciones-ausencias", {
    metodo: "POST",
    cuerpo: {
      empresa_id: ctx.empresaA,
      trabajador_id: ctx.trabajadorB,
      periodo: "2026-05",
      tipo: "Ausencia",
      fecha_inicio: "2026-05-04",
      fecha_termino: "2026-05-05",
    },
  });

  assert.equal(status, 403);
});

// ---------------------------------------------------------------------------
// A-02
// ---------------------------------------------------------------------------

test("un rol CONSULTA no puede escribir tramos, tasas ni ausencias", async () => {
  const intentos = [
    ["/api/impuesto-unico", { empresa_id: ctx.empresaA, periodo: "2026-05", desde: 0, hasta: 0, factor: 0, rebaja: 0 }],
    ["/api/configuracion-remuneraciones/afp", { empresa_id: ctx.empresaA, periodo: "2026-05", nombre: "X", tasa_afp: 1 }],
    ["/api/haberes-descuentos", { empresa_id: ctx.empresaA, trabajador_id: 1, periodo: "2026-05", nombre: "Bono", tipo: "haber", monto: 1 }],
    ["/api/remanente-iva", { empresa_id: ctx.empresaA, periodo: "2026-05" }],
  ];

  for (const [ruta, cuerpo] of intentos) {
    const { status } = await pedir(ctx.tokenConsulta, ruta, { metodo: "POST", cuerpo });
    assert.equal(status, 403, `${ruta} deberia pedir permiso`);
  }
});

// ---------------------------------------------------------------------------
// A-07
// ---------------------------------------------------------------------------

test("cambiar el rol de un usuario cierra sus sesiones abiertas", async () => {
  const tokenEditable = await login(ctx.editable.correo);
  const antes = await pedir(tokenEditable, "/api/auth/me");
  assert.equal(antes.status, 200);

  const cambio = await pedir(ctx.tokenDueno, `/api/auth/usuarios/${ctx.editable.id}`, {
    metodo: "PATCH",
    cuerpo: {
      empresa_id: ctx.empresaA,
      nombre: "editable",
      email: ctx.editable.correo,
      rol: "admin_cliente",
      activo: true,
      empresas: [{ empresa_id: ctx.empresaA, rol_empresa: "EDITOR" }],
    },
  });

  assert.ok([200, 201].includes(cambio.status), JSON.stringify(cambio.datos));

  const despues = await pedir(tokenEditable, "/api/auth/me");
  assert.equal(despues.status, 401, "el token anterior al cambio de rol ya no vale");
});
