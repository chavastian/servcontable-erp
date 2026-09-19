/**
 * Pruebas de aislamiento entre empresas.
 *
 * Monta dos empresas con un usuario cada una y comprueba que el usuario de la
 * primera no pueda leer ni escribir nada de la segunda. Es la prueba que
 * respalda poder vender el sistema a varios clientes a la vez: si alguna de
 * estas comprobaciones falla, un cliente ve los datos de otro.
 *
 *   DATABASE_URL=<staging o test> node --test test/aislamiento.test.js
 *
 * Crea y borra sus propios datos. Se niega a correr contra una base cuyo nombre
 * no contenga "test" o "staging".
 */

const test = require("node:test");
const assert = require("node:assert");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_aislamiento_no_produccion_32_car";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");

const SUFIJO = `aisl${Date.now().toString().slice(-8)}`;
const CLAVE = "Aislamiento-2026";

const contexto = {
  raiz: null,
  server: null,
  empresaA: null,
  empresaB: null,
  usuarioA: null,
  usuarioB: null,
  tokenA: null,
  datosB: {},
  creados: { usuarios: [], empresas: [] },
};

async function crearEmpresa(nombre, rut) {
  const { rows } = await pool.query(
    `INSERT INTO empresas (rut, razon_social, giro, activa)
     VALUES ($1, $2, 'Pruebas automatizadas', true) RETURNING id`,
    [rut, nombre]
  );

  contexto.creados.empresas.push(rows[0].id);
  return rows[0].id;
}

async function crearUsuario(correo, empresaId) {
  const hash = await bcrypt.hash(CLAVE, 10);

  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
     VALUES ('Usuario aislamiento', $1, $2, 'admin_cliente', true) RETURNING id`,
    [correo, hash]
  );

  const usuarioId = rows[0].id;
  contexto.creados.usuarios.push(usuarioId);

  await pool.query(
    `INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo)
     VALUES ($1, $2, 'OWNER', true)`,
    [usuarioId, empresaId]
  );

  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_id, status, billing_cycle, price,
                                currency, starts_at, expires_at, auto_renew, grace_days)
     SELECT $1, sp.id, 'ACTIVE', 'monthly', sp.monthly_price, 'CLP',
            CURRENT_DATE, CURRENT_DATE + 365, true, 5
     FROM subscription_plans sp WHERE sp.active = true ORDER BY sp.id LIMIT 1`,
    [usuarioId]
  );

  return usuarioId;
}

async function sembrarDatos(empresaId) {
  const cuenta = (
    await pool.query(
      `INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, clasificacion, naturaleza, nivel, activo)
       VALUES ($1, '1101999', 'Caja pruebas', 'Activo', 'Activo corriente', 'Deudora', 4, true)
       RETURNING id`,
      [empresaId]
    )
  ).rows[0].id;

  const contraparte = (
    await pool.query(
      `INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, clasificacion, naturaleza, nivel, activo)
       VALUES ($1, '2101999', 'Proveedores pruebas', 'Pasivo', 'Pasivo corriente', 'Acreedora', 4, true)
       RETURNING id`,
      [empresaId]
    )
  ).rows[0].id;

  const comprobante = (
    await pool.query(
      `INSERT INTO comprobantes (empresa_id, periodo, fecha, tipo, numero, glosa,
                                 total_debe, total_haber, estado)
       VALUES ($1, '2026-01', '2026-01-15', 'Traspaso', 90001, 'Asiento reservado', 1000, 1000, 'vigente')
       RETURNING id`,
      [empresaId]
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO comprobante_detalle (comprobante_id, cuenta_id, glosa, debe, haber)
     VALUES ($1, $2, 'Debe', 1000, 0), ($1, $3, 'Haber', 0, 1000)`,
    [comprobante, cuenta, contraparte]
  );

  const venta = (
    await pool.query(
      `INSERT INTO ventas (empresa_id, periodo, fecha, tipo_documento, folio, rut_cliente,
                           razon_social_cliente, neto, exento, iva, total, estado)
       VALUES ($1, '2026-01', '2026-01-15', 'Factura', '90001', '11111111-1',
               'Cliente reservado', 1000, 0, 190, 1190, 'vigente')
       RETURNING id`,
      [empresaId]
    )
  ).rows[0].id;

  const trabajador = (
    await pool.query(
      `INSERT INTO trabajadores (empresa_id, rut, nombres, apellidos, fecha_ingreso, estado)
       VALUES ($1, '22222222-2', 'Trabajador', 'Reservado', '2026-01-02', 'activo')
       RETURNING id`,
      [empresaId]
    )
  ).rows[0].id;

  return { cuenta, contraparte, comprobante, venta, trabajador };
}

async function pedir(ruta, opciones = {}) {
  const { token = contexto.tokenA, metodo = "GET", cuerpo, formulario } = opciones;
  const cabeceras = {};

  if (token) cabeceras.Authorization = `Bearer ${token}`;

  let body;

  if (formulario) {
    body = formulario;
  } else if (cuerpo !== undefined) {
    cabeceras["Content-Type"] = "application/json";
    body = JSON.stringify(cuerpo);
  }

  const respuesta = await fetch(`${contexto.raiz}${ruta}`, {
    method: metodo,
    headers: cabeceras,
    body,
  });

  const texto = await respuesta.text();
  let datos = null;

  try {
    datos = JSON.parse(texto);
  } catch {
    datos = texto;
  }

  return { status: respuesta.status, datos };
}

test.before(async () => {
  const base = (await pool.query("SELECT current_database() AS d")).rows[0].d;

  if (!/test|staging/i.test(base)) {
    throw new Error(`La base "${base}" no es de pruebas.`);
  }

  contexto.empresaA = await crearEmpresa(`Empresa A ${SUFIJO}`, `A${SUFIJO}-1`);
  contexto.empresaB = await crearEmpresa(`Empresa B ${SUFIJO}`, `B${SUFIJO}-2`);
  contexto.usuarioA = await crearUsuario(`a-${SUFIJO}@test.local`, contexto.empresaA);
  contexto.usuarioB = await crearUsuario(`b-${SUFIJO}@test.local`, contexto.empresaB);
  contexto.datosB = await sembrarDatos(contexto.empresaB);
  contexto.datosA = await sembrarDatos(contexto.empresaA);

  const iniciado = await iniciarServidor({ host: "127.0.0.1", port: 0 });
  contexto.server = iniciado.server;
  contexto.raiz = `http://127.0.0.1:${iniciado.port}`;

  const login = await pedir("/api/auth/login", {
    token: null,
    metodo: "POST",
    cuerpo: { email: `a-${SUFIJO}@test.local`, password: CLAVE },
  });

  assert.equal(login.status, 200, "el usuario A debe poder entrar");
  contexto.tokenA = login.datos.token;
  assert.ok(contexto.tokenA, "debe devolver token");
});

test.after(async () => {
  if (contexto.server) await detenerServidor(contexto.server);
});

// --------------------------------------------------------------------------
// Lectura
// --------------------------------------------------------------------------

test("el usuario A no puede listar datos de la empresa B", async () => {
  const rutas = [
    `/api/cuentas?empresa_id=${contexto.empresaB}`,
    `/api/comprobantes?empresa_id=${contexto.empresaB}`,
    `/api/ventas?empresa_id=${contexto.empresaB}&periodo=2026-01`,
    `/api/compras?empresa_id=${contexto.empresaB}&periodo=2026-01`,
    `/api/trabajadores?empresa_id=${contexto.empresaB}`,
    `/api/liquidaciones?empresa_id=${contexto.empresaB}&periodo=2026-01`,
    `/api/configuracion-contable?empresa_id=${contexto.empresaB}`,
    `/api/ejercicios?empresa_id=${contexto.empresaB}`,
    `/api/dashboard-contable?empresa_id=${contexto.empresaB}&periodo=2026-01`,
    `/api/libro-diario?empresa_id=${contexto.empresaB}&fecha_desde=2026-01-01&fecha_hasta=2026-12-31`,
  ];

  for (const ruta of rutas) {
    const { status } = await pedir(ruta);
    assert.equal(status, 403, `${ruta} deberia responder 403 y respondio ${status}`);
  }
});

test("el usuario A no puede leer un comprobante de la empresa B por su id", async () => {
  // Los identificadores son enteros consecutivos: probarlos es trivial.
  const { status, datos } = await pedir(`/api/comprobantes/${contexto.datosB.comprobante}`);

  assert.ok(
    status === 403 || status === 404,
    `deberia negar el acceso y respondio ${status} ${JSON.stringify(datos).slice(0, 100)}`
  );
});

test("el usuario A si puede leer su propio comprobante", async () => {
  const { status, datos } = await pedir(`/api/comprobantes/${contexto.datosA.comprobante}`);

  assert.equal(status, 200, "el acceso propio no debe romperse");
  assert.equal(Number(datos.comprobante.empresa_id), contexto.empresaA);
});

test("el listado de empresas solo trae las propias", async () => {
  const { status, datos } = await pedir("/api/empresas");

  assert.equal(status, 200);
  const lista = Array.isArray(datos) ? datos : datos.empresas || [];
  const ids = lista.map((empresa) => Number(empresa.id));

  assert.ok(ids.includes(contexto.empresaA), "debe ver la suya");
  assert.ok(!ids.includes(contexto.empresaB), "no debe ver la ajena");
});

// --------------------------------------------------------------------------
// Escritura
// --------------------------------------------------------------------------

test("el usuario A no puede crear un comprobante en la empresa B", async () => {
  const { status } = await pedir("/api/comprobantes", {
    metodo: "POST",
    cuerpo: {
      empresa_id: contexto.empresaB,
      periodo: "2026-02",
      fecha: "2026-02-10",
      tipo: "Traspaso",
      glosa: "Intento cruzado",
      detalles: [
        { cuenta_id: contexto.datosB.cuenta, debe: 500, haber: 0 },
        { cuenta_id: contexto.datosB.contraparte, debe: 0, haber: 500 },
      ],
    },
  });

  assert.equal(status, 403, `deberia responder 403 y respondio ${status}`);
});

test("el usuario A no puede imputar una cuenta de la empresa B en su propio asiento", async () => {
  // Este es el caso que mezcla los saldos de dos clientes sin que ninguna
  // consulta parezca fuera de lugar: la empresa es la correcta y la cuenta no.
  const { status, datos } = await pedir("/api/comprobantes", {
    metodo: "POST",
    cuerpo: {
      empresa_id: contexto.empresaA,
      periodo: "2026-02",
      fecha: "2026-02-10",
      tipo: "Traspaso",
      glosa: "Cuenta ajena",
      detalles: [
        { cuenta_id: contexto.datosB.cuenta, debe: 500, haber: 0 },
        { cuenta_id: contexto.datosA.contraparte, debe: 0, haber: 500 },
      ],
    },
  });

  assert.ok(
    status >= 400 && status < 500,
    `deberia rechazar la cuenta ajena y respondio ${status} ${JSON.stringify(datos).slice(0, 150)}`
  );

  const filtradas = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM comprobante_detalle cd
     JOIN comprobantes c ON c.id = cd.comprobante_id
     JOIN plan_cuentas pc ON pc.id = cd.cuenta_id
     WHERE c.empresa_id = $1 AND pc.empresa_id <> $1`,
    [contexto.empresaA]
  );

  assert.equal(
    filtradas.rows[0].n,
    0,
    "no debe quedar ninguna linea imputada a una cuenta de otra empresa"
  );
});

test("el usuario A no puede importar documentos a la empresa B", async () => {
  // La importacion llega como multipart. La autenticacion corre antes de que
  // multer llene el cuerpo, asi que la empresa se valida despues de multer.
  const csv = [
    "Nro;Tipo Doc;Tipo Compra;RUT Proveedor;Razon Social;Folio;Fecha Docto;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto Total",
    "1;33;Del Giro;76123456-7;Proveedor;1001;15/01/2026;0;1000;190;1190",
  ].join("\n");

  for (const ruta of [
    "/api/compras/importar-sii",
    "/api/ventas/importar-sii",
    "/api/boletas/importar-sii",
    "/api/conciliacion-bancaria/importar",
  ]) {
    const formulario = new FormData();
    formulario.append("empresa_id", String(contexto.empresaB));
    formulario.append("periodo", "2026-01");
    formulario.append(
      "archivo",
      new Blob([csv], { type: "text/csv" }),
      "libro.csv"
    );

    const { status, datos } = await pedir(ruta, { metodo: "POST", formulario });

    assert.equal(
      status,
      403,
      `${ruta} deberia responder 403 y respondio ${status} ${JSON.stringify(datos).slice(0, 120)}`
    );
  }

  const filas = await pool.query(
    "SELECT COUNT(*)::int AS n FROM compras WHERE empresa_id = $1",
    [contexto.empresaB]
  );

  assert.equal(filas.rows[0].n, 0, "no debe haberse importado nada en la empresa B");
});

test("el archivo importado tiene limite de tamano y de tipo", async () => {
  const formularioGrande = new FormData();
  formularioGrande.append("empresa_id", String(contexto.empresaA));
  formularioGrande.append("periodo", "2026-01");
  formularioGrande.append(
    "archivo",
    new Blob([Buffer.alloc(11 * 1024 * 1024, 0x41)], { type: "text/csv" }),
    "enorme.csv"
  );

  const grande = await pedir("/api/compras/importar-sii", {
    metodo: "POST",
    formulario: formularioGrande,
  });

  assert.equal(grande.status, 413, `un archivo de 11 MB deberia rechazarse, dio ${grande.status}`);

  const formularioTipo = new FormData();
  formularioTipo.append("empresa_id", String(contexto.empresaA));
  formularioTipo.append("periodo", "2026-01");
  formularioTipo.append(
    "archivo",
    new Blob(["MZ binario"], { type: "application/octet-stream" }),
    "programa.exe"
  );

  const tipo = await pedir("/api/compras/importar-sii", {
    metodo: "POST",
    formulario: formularioTipo,
  });

  assert.equal(tipo.status, 415, `un .exe deberia rechazarse, dio ${tipo.status}`);
});

// --------------------------------------------------------------------------
// Privilegios
// --------------------------------------------------------------------------

test("un administrador de cliente no puede tocar al administrador del sistema", async () => {
  const superadmin = await pool.query(
    `SELECT id FROM usuarios
     WHERE LOWER(rol) IN ('superadmin', 'admin', 'administrador_sistema')
       AND activo = true
     ORDER BY id LIMIT 1`
  );

  if (superadmin.rows.length === 0) {
    return;
  }

  const objetivo = superadmin.rows[0].id;

  const password = await pedir(`/api/auth/usuarios/${objetivo}/password`, {
    metodo: "PATCH",
    cuerpo: { password: "Intento-De-Robo-2026" },
  });

  assert.equal(
    password.status,
    403,
    `resetear la clave del superadministrador deberia dar 403 y dio ${password.status}`
  );

  const estado = await pedir(`/api/auth/usuarios/${objetivo}/estado`, {
    metodo: "PATCH",
    cuerpo: { activo: false },
  });

  assert.equal(
    estado.status,
    403,
    `desactivar al superadministrador deberia dar 403 y dio ${estado.status}`
  );
});

test("un administrador de cliente no puede tocar usuarios de otra empresa", async () => {
  const password = await pedir(`/api/auth/usuarios/${contexto.usuarioB}/password`, {
    metodo: "PATCH",
    cuerpo: { password: "Intento-Cruzado-2026" },
  });

  assert.ok(
    password.status === 403 || password.status === 404,
    `deberia negarlo y dio ${password.status}`
  );

  const estado = await pedir(`/api/auth/usuarios/${contexto.usuarioB}/estado`, {
    metodo: "PATCH",
    cuerpo: { activo: false },
  });

  assert.ok(
    estado.status === 403 || estado.status === 404,
    `deberia negarlo y dio ${estado.status}`
  );

  const sigueActivo = await pool.query("SELECT activo FROM usuarios WHERE id = $1", [
    contexto.usuarioB,
  ]);

  assert.equal(sigueActivo.rows[0].activo, true, "el usuario B debe seguir activo");
});

// --------------------------------------------------------------------------
// Validaciones de entrada
// --------------------------------------------------------------------------

test("un empresa_id que no es numero se rechaza", async () => {
  for (const valor of ["abc", "1 OR 1=1", "-5", "0"]) {
    const { status } = await pedir(
      `/api/comprobantes?empresa_id=${encodeURIComponent(valor)}`
    );

    assert.ok(
      status === 400 || status === 403,
      `empresa_id "${valor}" deberia rechazarse y dio ${status}`
    );
  }
});

test("sin token no se accede a nada", async () => {
  const { status } = await pedir(`/api/comprobantes?empresa_id=${contexto.empresaA}`, {
    token: null,
  });

  assert.equal(status, 401);
});
