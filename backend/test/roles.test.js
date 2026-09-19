/**
 * Roles dentro de una empresa.
 *
 * Hasta ahora `rol_empresa` solo servía para decidir quién administra usuarios.
 * Para la contabilidad no se consultaba en ninguna parte: quien tenía acceso a
 * una empresa podía crear asientos, anularlos y cerrar ejercicios por igual. Un
 * estudio que da acceso a un asistente para que solo consulte no podía hacerlo.
 *
 *   DATABASE_URL=<staging o test> node --test test/roles.test.js
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_roles_no_produccion_32_caracte";
process.env.COBRANZA_AUTOMATICA = "false";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");
const {
  ROLES,
  normalizarRolEmpresa,
  rolTienePermiso,
  permisosDelRol,
} = require("../src/helpers/roles.helper");

const SUFIJO = `rol${Date.now().toString().slice(-8)}`;
const CLAVE = "Roles-2026";

const ctx = { tokens: {} };

async function crearUsuarioConRol(nombre, rol) {
  const correo = `${nombre}-${SUFIJO}@test.local`;
  const hash = await bcrypt.hash(CLAVE, 10);

  const usuarioId = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ($1, $2, $3, 'usuario_cliente', true) RETURNING id`,
      [`Usuario ${rol}`, correo, hash]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo)
     VALUES ($1, $2, $3, true)`,
    [usuarioId, ctx.empresa, rol]
  );

  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_id, status, billing_cycle, price,
                                currency, starts_at, expires_at, auto_renew, grace_days)
     SELECT $1, sp.id, 'ACTIVE', 'monthly', sp.monthly_price, 'CLP',
            CURRENT_DATE, CURRENT_DATE + 365, true, 5
     FROM subscription_plans sp WHERE sp.active = true ORDER BY sp.id LIMIT 1`,
    [usuarioId]
  );

  const login = await fetch(`${ctx.raiz}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: correo, password: CLAVE }),
  });

  const datos = await login.json();
  assert.ok(datos.token, `el usuario ${rol} debe poder entrar`);

  return datos.token;
}

async function comoRol(rol, ruta, { metodo = "GET", cuerpo } = {}) {
  const respuesta = await fetch(`${ctx.raiz}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${ctx.tokens[rol]}`,
      ...(cuerpo ? { "Content-Type": "application/json" } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });

  return { status: respuesta.status, datos: await respuesta.json().catch(() => ({})) };
}

function asiento(fecha = "2026-08-12") {
  return {
    empresa_id: ctx.empresa,
    fecha,
    tipo: "Traspaso",
    glosa: "Prueba de roles",
    detalles: [
      { cuenta_id: ctx.cuentaDebe, debe: 1000, haber: 0 },
      { cuenta_id: ctx.cuentaHaber, debe: 0, haber: 1000 },
    ],
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
      [`R${SUFIJO}-2`, `Empresa roles ${SUFIJO}`]
    )
  ).rows[0].id;

  ctx.cuentaDebe = (
    await pool.query(
      `INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, naturaleza, nivel, activo)
       VALUES ($1, '1101020', 'Caja', 'Activo', 'Deudora', 4, true) RETURNING id`,
      [ctx.empresa]
    )
  ).rows[0].id;

  ctx.cuentaHaber = (
    await pool.query(
      `INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, naturaleza, nivel, activo)
       VALUES ($1, '3101020', 'Capital', 'Patrimonio', 'Acreedora', 4, true) RETURNING id`,
      [ctx.empresa]
    )
  ).rows[0].id;

  const iniciado = await iniciarServidor({ host: "127.0.0.1", port: 0 });
  ctx.server = iniciado.server;
  ctx.raiz = `http://127.0.0.1:${iniciado.port}`;

  for (const rol of [ROLES.OWNER, ROLES.ADMIN, ROLES.CONTADOR, ROLES.EDITOR, ROLES.CONSULTA]) {
    ctx.tokens[rol] = await crearUsuarioConRol(rol.toLowerCase(), rol);
  }
});

test.after(async () => {
  if (ctx.server) await detenerServidor(ctx.server);
});

// --------------------------------------------------------------------------
// El modelo, sin tocar la base
// --------------------------------------------------------------------------

test("los roles heredados se traducen a los nuevos", () => {
  // En produccion habia "admin" y "usuario" como texto libre.
  assert.equal(normalizarRolEmpresa("admin"), ROLES.ADMIN);
  assert.equal(normalizarRolEmpresa("administrador"), ROLES.ADMIN);
  assert.equal(normalizarRolEmpresa("usuario"), ROLES.EDITOR);
  assert.equal(normalizarRolEmpresa("viewer"), ROLES.CONSULTA);
  assert.equal(normalizarRolEmpresa("CONTADOR"), ROLES.CONTADOR);
});

test("un rol desconocido cae en el permiso mas bajo, no en el mas alto", () => {
  // Frente a un dato inesperado, lo seguro es conceder lo minimo.
  assert.equal(normalizarRolEmpresa("jefe supremo"), ROLES.CONSULTA);
  assert.equal(normalizarRolEmpresa(""), ROLES.CONSULTA);
  assert.equal(normalizarRolEmpresa(null), ROLES.CONSULTA);
});

test("la jerarquia de permisos es la esperada", () => {
  assert.ok(rolTienePermiso(ROLES.CONSULTA, "VER"));
  assert.ok(!rolTienePermiso(ROLES.CONSULTA, "REGISTRAR"));

  assert.ok(rolTienePermiso(ROLES.EDITOR, "REGISTRAR"));
  assert.ok(rolTienePermiso(ROLES.EDITOR, "IMPORTAR"));
  assert.ok(!rolTienePermiso(ROLES.EDITOR, "ANULAR"));
  assert.ok(!rolTienePermiso(ROLES.EDITOR, "CERRAR_EJERCICIO"));

  assert.ok(rolTienePermiso(ROLES.CONTADOR, "ANULAR"));
  assert.ok(rolTienePermiso(ROLES.CONTADOR, "CERRAR_EJERCICIO"));
  assert.ok(rolTienePermiso(ROLES.CONTADOR, "REMUNERACIONES"));
  assert.ok(!rolTienePermiso(ROLES.CONTADOR, "ADMINISTRAR_USUARIOS"));

  assert.ok(rolTienePermiso(ROLES.ADMIN, "ADMINISTRAR_USUARIOS"));
  assert.ok(!rolTienePermiso(ROLES.ADMIN, "DESACTIVAR_EMPRESA"));

  assert.ok(rolTienePermiso(ROLES.OWNER, "DESACTIVAR_EMPRESA"));
});

test("un permiso que no existe nunca se concede", () => {
  // Un nombre mal escrito en una ruta debe fallar cerrado, no abierto.
  assert.ok(!rolTienePermiso(ROLES.OWNER, "PERMISO_INVENTADO"));
});

test("el dueño tiene todos los permisos", () => {
  const todos = permisosDelRol(ROLES.OWNER);
  assert.ok(todos.includes("VER"));
  assert.ok(todos.includes("DESACTIVAR_EMPRESA"));
  assert.ok(todos.length >= 11);
});

// --------------------------------------------------------------------------
// Contra la API
// --------------------------------------------------------------------------

test("consulta puede leer pero no registrar", async () => {
  const lectura = await comoRol(ROLES.CONSULTA, `/api/comprobantes?empresa_id=${ctx.empresa}`);
  assert.equal(lectura.status, 200, "debe poder ver los libros");

  const escritura = await comoRol(ROLES.CONSULTA, "/api/comprobantes", {
    metodo: "POST",
    cuerpo: asiento(),
  });

  assert.equal(escritura.status, 403, `no debe poder crear asientos, dio ${escritura.status}`);
  assert.match(escritura.datos.error, /no permite/i);
  assert.equal(escritura.datos.rol, ROLES.CONSULTA, "la respuesta dice cual es su rol");
});

test("editor registra pero no anula", async () => {
  const creado = await comoRol(ROLES.EDITOR, "/api/comprobantes", {
    metodo: "POST",
    cuerpo: asiento("2026-08-13"),
  });

  assert.equal(creado.status, 201, JSON.stringify(creado.datos).slice(0, 200));
  ctx.comprobanteId = creado.datos.comprobante.id;

  const anulado = await comoRol(ROLES.EDITOR, `/api/comprobantes/${ctx.comprobanteId}`, {
    metodo: "DELETE",
    cuerpo: { empresa_id: ctx.empresa },
  });

  assert.equal(anulado.status, 403, "anular es de contador para arriba");

  const { rows } = await pool.query("SELECT estado FROM comprobantes WHERE id = $1", [
    ctx.comprobanteId,
  ]);

  assert.equal(rows[0].estado, "vigente", "el asiento no debe haberse anulado");
});

test("contador si puede anular", async () => {
  const anulado = await comoRol(ROLES.CONTADOR, `/api/comprobantes/${ctx.comprobanteId}`, {
    metodo: "DELETE",
    cuerpo: { empresa_id: ctx.empresa },
  });

  assert.ok(
    anulado.status < 400,
    `deberia poder anular y dio ${anulado.status} ${JSON.stringify(anulado.datos).slice(0, 150)}`
  );
});

test("editor no puede cerrar un ejercicio", async () => {
  const respuesta = await comoRol(ROLES.EDITOR, "/api/ejercicios", {
    metodo: "POST",
    cuerpo: { empresa_id: ctx.empresa, anio: 2027 },
  });

  assert.equal(respuesta.status, 403);
});

test("editor no puede tocar el plan de cuentas", async () => {
  const respuesta = await comoRol(ROLES.EDITOR, "/api/cuentas", {
    metodo: "POST",
    cuerpo: {
      empresa_id: ctx.empresa,
      codigo: "9999999",
      nombre: "Cuenta inventada",
      tipo: "Activo",
      naturaleza: "Deudora",
    },
  });

  assert.equal(respuesta.status, 403, "configurar es de contador para arriba");
});

test("editor no puede registrar remuneraciones", async () => {
  const respuesta = await comoRol(ROLES.EDITOR, "/api/trabajadores", {
    metodo: "POST",
    cuerpo: {
      empresa_id: ctx.empresa,
      rut: "16153127-8",
      nombres: "Trabajador",
      apellidos: "Prueba",
      fecha_ingreso: "2026-01-02",
    },
  });

  assert.equal(respuesta.status, 403);
});

test("contador si puede registrar un trabajador", async () => {
  const respuesta = await comoRol(ROLES.CONTADOR, "/api/trabajadores", {
    metodo: "POST",
    cuerpo: {
      empresa_id: ctx.empresa,
      rut: "16153127-8",
      nombres: "Trabajador",
      apellidos: "Prueba",
      fecha_ingreso: "2026-01-02",
      sueldo_base: 800000,
    },
  });

  assert.ok(
    respuesta.status < 400,
    `deberia poder y dio ${respuesta.status} ${JSON.stringify(respuesta.datos).slice(0, 150)}`
  );
});

test("la respuesta de un permiso negado dice que falta, sin filtrar nada mas", async () => {
  const respuesta = await comoRol(ROLES.CONSULTA, "/api/comprobantes", {
    metodo: "POST",
    cuerpo: asiento(),
  });

  assert.equal(respuesta.datos.permiso_requerido, "REGISTRAR");
  assert.ok(
    !JSON.stringify(respuesta.datos).match(/relation|column|SELECT/i),
    "no debe filtrar detalles internos"
  );
});

test("la base rechaza un rol que no existe", async () => {
  // La restriccion es la ultima red: aunque el codigo se equivoque, no entra
  // un rol invalido que despues se interprete de cualquier forma.
  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo)
         VALUES ((SELECT id FROM usuarios ORDER BY id LIMIT 1), $1, 'JEFE_SUPREMO', true)`,
        [ctx.empresa]
      ),
    (error) => {
      assert.match(error.message, /usuarios_empresas_rol_valido|violates check/i);
      return true;
    }
  );
});
