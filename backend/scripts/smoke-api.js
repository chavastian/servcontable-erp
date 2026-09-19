#!/usr/bin/env node
/**
 * Prueba de humo de la API contra una base real.
 *
 * Levanta el servidor en un puerto libre, crea un usuario de prueba, se
 * autentica y recorre los endpoints principales de lectura. Sirve para
 * comprobar que un cambio no rompio nada: despues de quitar el DDL en tiempo
 * de ejecucion, cada modulo tenia que seguir respondiendo.
 *
 *   DATABASE_URL=<staging> node scripts/smoke-api.js
 *
 * Se niega a correr contra una base cuyo nombre no contenga "test" o
 * "staging": crea y borra datos.
 */

require("dotenv").config();

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "clave_de_prueba_para_smoke_api_no_produccion_32";

const bcrypt = require("bcryptjs");
const pool = require("../src/database/db");
const { iniciarServidor, detenerServidor } = require("../src/start");

const CORREO_PRUEBA = "smoke-api@servcontable.local";
const CLAVE_PRUEBA = "Smoke-Api-2026";

const resultados = { ok: 0, fallo: 0, detalles: [] };

function registrar(nombre, ok, extra = "") {
  if (ok) resultados.ok += 1;
  else resultados.fallo += 1;
  resultados.detalles.push(`${ok ? "  ok  " : " FALLA"} ${nombre}${extra ? ` -> ${extra}` : ""}`);
}

async function main() {
  const base = (await pool.query("SELECT current_database() AS d")).rows[0].d;

  if (!/test|staging/i.test(base)) {
    throw new Error(`La base "${base}" no es de pruebas. Esta prueba crea datos.`);
  }

  console.log(`Prueba de humo contra ${base}\n`);

  // Usuario de prueba con acceso a la primera empresa activa.
  const hash = await bcrypt.hash(CLAVE_PRUEBA, 10);
  const usuario = (
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES ('Smoke API', $1, $2, 'admin_cliente', true)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, activo = true
       RETURNING id`,
      [CORREO_PRUEBA, hash]
    )
  ).rows[0];

  const empresa = (
    await pool.query(
      "SELECT id FROM empresas WHERE activa = true ORDER BY id LIMIT 1"
    )
  ).rows[0];

  if (!empresa) {
    throw new Error("No hay empresas activas en la base de pruebas.");
  }

  await pool.query(
    `INSERT INTO usuarios_empresas (usuario_id, empresa_id, rol_empresa, activo)
     VALUES ($1, $2, 'OWNER', true)
     ON CONFLICT (usuario_id, empresa_id) DO UPDATE SET activo = true, rol_empresa = 'OWNER'`,
    [usuario.id, empresa.id]
  );

  // La suscripcion debe estar vigente, si no todo responde 402.
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_id, status, billing_cycle, price, currency,
                                starts_at, expires_at, auto_renew, grace_days)
     SELECT $1, sp.id, 'ACTIVE', 'monthly', sp.monthly_price, 'CLP',
            CURRENT_DATE, CURRENT_DATE + 365, true, 5
     FROM subscription_plans sp WHERE sp.active = true ORDER BY sp.id LIMIT 1
     ON CONFLICT DO NOTHING`,
    [usuario.id]
  );

  const { server, port } = await iniciarServidor({ host: "127.0.0.1", port: 0 });
  const raiz = `http://127.0.0.1:${port}`;

  try {
    const salud = await fetch(`${raiz}/api/estado`);
    registrar("GET /api/estado", salud.ok, `HTTP ${salud.status}`);

    const login = await fetch(`${raiz}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: CORREO_PRUEBA, password: CLAVE_PRUEBA }),
    });
    const datosLogin = await login.json().catch(() => ({}));
    const token = datosLogin.token || datosLogin.access_token;
    registrar("POST /api/auth/login", Boolean(token), token ? "" : JSON.stringify(datosLogin).slice(0, 120));

    if (!token) {
      throw new Error("Sin token no se puede seguir.");
    }

    const cabeceras = { Authorization: `Bearer ${token}` };
    const anio = new Date().getFullYear();
    const periodo = `${anio}-01`;
    const desde = `${anio}-01-01`;
    const hasta = `${anio}-12-31`;
    const rango = `fecha_desde=${desde}&fecha_hasta=${hasta}`;

    const rutas = [
      ["GET /api/auth/me", `/api/auth/me`],
      ["GET /api/empresas", `/api/empresas`],
      ["GET /api/cuentas", `/api/cuentas?empresa_id=${empresa.id}`],
      ["GET /api/comprobantes", `/api/comprobantes?empresa_id=${empresa.id}`],
      ["GET /api/libro-diario", `/api/libro-diario?empresa_id=${empresa.id}&${rango}`],
      ["GET /api/libro-mayor", `/api/libro-mayor?empresa_id=${empresa.id}&${rango}`],
      ["GET /api/balance-8-columnas", `/api/balance-8-columnas?empresa_id=${empresa.id}&${rango}`],
      ["GET /api/estado-resultados", `/api/estado-resultados?empresa_id=${empresa.id}&${rango}`],
      ["GET /api/ventas", `/api/ventas?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/compras", `/api/compras?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/boletas", `/api/boletas?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/resumen-iva", `/api/resumen-iva?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/resumen-f29", `/api/resumen-f29?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/honorarios", `/api/honorarios?empresa_id=${empresa.id}&${rango}`],
      ["GET /api/pagos-cobros", `/api/pagos-cobros?empresa_id=${empresa.id}&${rango}`],
      ["GET /api/pagos-cobros/documentos-pendientes", `/api/pagos-cobros/documentos-pendientes?empresa_id=${empresa.id}&tipo=Cobro`],
      ["GET /api/conciliacion-bancaria", `/api/conciliacion-bancaria?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/cuentas-pendientes/por-cobrar", `/api/cuentas-pendientes/por-cobrar?empresa_id=${empresa.id}&${rango}`],
      ["GET /api/cuentas-pendientes/por-pagar", `/api/cuentas-pendientes/por-pagar?empresa_id=${empresa.id}&${rango}`],
      ["GET /api/dashboard-contable", `/api/dashboard-contable?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/dashboard-financiero", `/api/dashboard-financiero?empresa_id=${empresa.id}&${rango}`],
      ["GET /api/analisis-cuentas", `/api/analisis-cuentas?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/trabajadores", `/api/trabajadores?empresa_id=${empresa.id}`],
      ["GET /api/liquidaciones", `/api/liquidaciones?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/configuracion-remuneraciones", `/api/configuracion-remuneraciones?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/haberes-descuentos", `/api/haberes-descuentos?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/impuesto-unico", `/api/impuesto-unico?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/finiquitos", `/api/finiquitos?empresa_id=${empresa.id}`],
      ["GET /api/vacaciones-ausencias", `/api/vacaciones-ausencias?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/saldo-vacaciones", `/api/saldo-vacaciones?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/terceros", `/api/terceros?empresa_id=${empresa.id}`],
      ["GET /api/centros-costo", `/api/centros-costo?empresa_id=${empresa.id}`],
      ["GET /api/activos-fijos", `/api/activos-fijos?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/activos-fijos/vidas-utiles", `/api/activos-fijos/vidas-utiles`],
      ["GET /api/activos-fijos/depreciacion", `/api/activos-fijos/depreciacion?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/activos-fijos/informe", `/api/activos-fijos/informe?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/declaraciones-juradas/1879", `/api/declaraciones-juradas/1879?empresa_id=${empresa.id}&anio=${periodo.slice(0, 4)}`],
      ["GET /api/declaraciones-juradas/1887", `/api/declaraciones-juradas/1887?empresa_id=${empresa.id}&anio=${periodo.slice(0, 4)}`],
      ["GET /api/centros-costo/informe", `/api/centros-costo/informe?empresa_id=${empresa.id}&fecha_desde=${periodo}-01&fecha_hasta=${periodo}-28`],
      ["GET /api/configuracion-contable", `/api/configuracion-contable?empresa_id=${empresa.id}`],
      ["GET /api/ejercicios", `/api/ejercicios?empresa_id=${empresa.id}`],
      ["GET /api/auditoria", `/api/auditoria?empresa_id=${empresa.id}&${rango}`],
      ["GET /api/cartola-rut", `/api/cartola-rut?empresa_id=${empresa.id}&rut=77964779-K&${rango}`],
      ["GET /api/libros-tributarios/ventas", `/api/libros-tributarios/ventas?empresa_id=${empresa.id}&${rango}`],
      ["GET /api/libros-tributarios/compras", `/api/libros-tributarios/compras?empresa_id=${empresa.id}&${rango}`],
      ["GET /api/remanente-iva", `/api/remanente-iva?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/panel-estudio", `/api/panel-estudio?periodo=${periodo}`],
      ["GET /api/cierre-mensual", `/api/cierre-mensual?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/cierre-mensual/estado", `/api/cierre-mensual/estado?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/conciliacion-bancaria/sugerencias", `/api/conciliacion-bancaria/sugerencias?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/sugerencias-cuenta", `/api/sugerencias-cuenta?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/sugerencias-cuenta/por-rut", `/api/sugerencias-cuenta/por-rut?empresa_id=${empresa.id}&rut=77964779-K`],
      ["GET /api/calendario-tributario", `/api/calendario-tributario?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/flujo-caja", `/api/flujo-caja?empresa_id=${empresa.id}`],
      ["GET /api/f29", `/api/f29?empresa_id=${empresa.id}&periodo=${periodo}`],
      ["GET /api/f29/presentadas", `/api/f29/presentadas?empresa_id=${empresa.id}`],
      ["GET /api/ejercicios", `/api/ejercicios?empresa_id=${empresa.id}`],
      ["GET /api/libro-mayor", `/api/libro-mayor?empresa_id=${empresa.id}&fecha_desde=${periodo}-01&fecha_hasta=${periodo}-28`],
      ["GET /api/saldo-vacaciones", `/api/saldo-vacaciones?empresa_id=${empresa.id}&periodo=${periodo}`],
    ];

    for (const [nombre, ruta] of rutas) {
      try {
        const res = await fetch(`${raiz}${ruta}`, { headers: cabeceras });
        const cuerpo = await res.text();
        const ok = res.status < 400;
        registrar(nombre, ok, ok ? "" : `HTTP ${res.status} ${cuerpo.slice(0, 150)}`);
      } catch (error) {
        registrar(nombre, false, error.message);
      }
    }
  } finally {
    await detenerServidor(server);
  }

  console.log(resultados.detalles.join("\n"));
  console.log(`\nTotal: ${resultados.ok} ok, ${resultados.fallo} fallas`);
  process.exit(resultados.fallo > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exit(1);
});
