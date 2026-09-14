const express = require("express");
const cors = require("cors");
const path = require("path");
const { obtenerOrigenesCors, sirveFrontendDesdeBackend } = require("./config/env");

const estadoRoutes = require("./routes/estado.routes");
const authRoutes = require("./routes/auth.routes");
const empresasRoutes = require("./routes/empresas.routes");
const cuentasRoutes = require("./routes/cuentas.routes");
const comprobantesRoutes = require("./routes/comprobantes.routes");
const libroDiarioRoutes = require("./routes/libroDiario.routes");
const libroMayorRoutes = require("./routes/libroMayor.routes");
const balance8Routes = require("./routes/balance8.routes");
const estadoResultadosRoutes = require("./routes/estadoResultados.routes");
const ventasRoutes = require("./routes/ventas.routes");
const boletasRoutes = require("./routes/boletas.routes");
const comprasRoutes = require("./routes/compras.routes");
const resumenIVARoutes = require("./routes/resumenIVA.routes");
const resumenF29Routes = require("./routes/resumenF29.routes");
const remanenteIVARoutes = require("./routes/remanenteIVA.routes");
const configuracionContableRoutes = require("./routes/configuracionContable.routes");
const librosTributariosRoutes = require("./routes/librosTributarios.routes");
const honorariosRoutes = require("./routes/honorarios.routes");
const pagosCobrosRoutes = require("./routes/pagosCobros.routes");
const conciliacionBancariaRoutes = require("./routes/conciliacionBancaria.routes");
const cuentasPendientesRoutes = require("./routes/cuentasPendientes.routes");
const dashboardFinancieroRoutes = require("./routes/dashboardFinanciero.routes");
const trabajadoresRoutes = require("./routes/trabajadores.routes");
const liquidacionesRoutes = require("./routes/liquidaciones.routes");
const configuracionRemuneracionesRoutes = require("./routes/configuracionRemuneraciones.routes");
const pagosRemuneracionesRoutes = require("./routes/pagosRemuneraciones.routes");
const haberesDescuentosRoutes = require("./routes/haberesDescuentos.routes");
const impuestoUnicoRoutes = require("./routes/impuestoUnico.routes");
const finiquitosRoutes = require("./routes/finiquitos.routes");
const vacacionesAusenciasRoutes = require("./routes/vacacionesAusencias.routes");
const dashboardContableRoutes = require("./routes/dashboardContable.routes");
const analisisCuentasRoutes = require("./routes/analisisCuentas.routes");
const saldoVacacionesRoutes = require("./routes/saldoVacaciones.routes");
const planCuentasBaseRoutes = require("./routes/planCuentasBase.routes");
const ejerciciosRoutes = require("./routes/ejercicios.routes");
const auditoriaRoutes = require("./routes/auditoria.routes");
const pagosFlowRoutes = require("./routes/pagosFlow.routes");
const contactoRoutes = require("./routes/contacto.routes");
const adminSuscripcionesRoutes = require("./routes/adminSuscripciones.routes");
const adminUsuariosRoutes = require("./routes/adminUsuarios.routes");


const app = express();

if (process.env.TRUST_PROXY !== "false") {
  app.set("trust proxy", 1);
}

const origenesPermitidos = obtenerOrigenesCors();

function esOrigenMismoHost(origen, req) {
  if (!sirveFrontendDesdeBackend()) {
    return false;
  }

  try {
    const urlOrigen = new URL(origen);
    const hostServidor = String(
      req.headers["x-forwarded-host"] || req.headers.host || ""
    )
      .split(",")[0]
      .trim()
      .toLowerCase();

    return hostServidor && urlOrigen.host.toLowerCase() === hostServidor;
  } catch {
    return false;
  }
}

app.use((req, res, next) =>
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (origenesPermitidos.includes(origin) || esOrigenMismoHost(origin, req)) {
        return callback(null, true);
      }

      return callback(new Error("Origen no permitido por CORS"));
    },
    credentials: true,
  })(req, res, next)
);
app.use(express.json());

app.use("/", estadoRoutes);
app.use("/api", estadoRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/empresas", empresasRoutes);
app.use("/api/cuentas", cuentasRoutes);
app.use("/api/comprobantes", comprobantesRoutes);
app.use("/api/libro-diario", libroDiarioRoutes);
app.use("/api/libro-mayor", libroMayorRoutes);
app.use("/api/balance-8-columnas", balance8Routes);
app.use("/api/estado-resultados", estadoResultadosRoutes);
app.use("/api/ventas", ventasRoutes);
app.use("/api/boletas", boletasRoutes);
app.use("/api/compras", comprasRoutes);
app.use("/api/resumen-iva", resumenIVARoutes);
app.use("/api/resumen-f29", resumenF29Routes);
app.use("/api/remanente-iva", remanenteIVARoutes);
app.use("/api/configuracion-contable", configuracionContableRoutes);
app.use("/api/libros-tributarios", librosTributariosRoutes);
app.use("/api/honorarios", honorariosRoutes);
app.use("/api/pagos-cobros", pagosCobrosRoutes);
app.use("/api/conciliacion-bancaria", conciliacionBancariaRoutes);
app.use("/api/cuentas-pendientes", cuentasPendientesRoutes);
app.use("/api/dashboard-financiero", dashboardFinancieroRoutes);
app.use("/api/trabajadores", trabajadoresRoutes);
app.use("/api/liquidaciones", liquidacionesRoutes);
app.use("/api/configuracion-remuneraciones", configuracionRemuneracionesRoutes);
app.use("/api/pagos-remuneraciones", pagosRemuneracionesRoutes);
app.use("/api/haberes-descuentos", haberesDescuentosRoutes);
app.use("/api/impuesto-unico", impuestoUnicoRoutes);
app.use("/api/finiquitos", finiquitosRoutes);
app.use("/api/vacaciones-ausencias", vacacionesAusenciasRoutes);
app.use("/api/dashboard-contable", dashboardContableRoutes);
app.use("/api/analisis-cuentas", analisisCuentasRoutes);
app.use("/api/saldo-vacaciones", saldoVacacionesRoutes);
app.use("/api/plan-cuentas-base", planCuentasBaseRoutes);
app.use("/api/ejercicios", ejerciciosRoutes);
app.use("/api/auditoria", auditoriaRoutes);
app.use("/api/pagos-flow", pagosFlowRoutes);
app.use("/api/contacto", contactoRoutes);
app.use("/api/admin-suscripciones", adminSuscripcionesRoutes);
app.use("/api/admin-usuarios", adminUsuariosRoutes);

let frontendEstaticoConfigurado = false;

function habilitarFrontendEstatico(directorioDist) {
  if (frontendEstaticoConfigurado) {
    return;
  }

  const indexPath = path.join(directorioDist, "index.html");

  app.use(express.static(directorioDist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      return next();
    }

    return res.sendFile(indexPath);
  });

  frontendEstaticoConfigurado = true;
}

app.habilitarFrontendEstatico = habilitarFrontendEstatico;

module.exports = app;

