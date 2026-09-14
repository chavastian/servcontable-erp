const fs = require("fs");
const path = require("path");
const app = require("./app");
const pool = require("./database/db");
const {
  esProduccion,
  sirveFrontendDesdeBackend,
  validarEntorno,
} = require("./config/env");
const { inicializarAuth } = require("./helpers/auth.helper");
const { inicializarSuscripciones } = require("./helpers/suscripcion.helper");

function resolverFrontendDist(opciones = {}) {
  if (opciones.frontendDist) {
    return opciones.frontendDist;
  }

  if (!sirveFrontendDesdeBackend()) {
    return null;
  }

  if (process.env.FRONTEND_DIST) {
    return path.resolve(process.cwd(), process.env.FRONTEND_DIST);
  }

  return path.resolve(__dirname, "../../frontend/dist");
}

function hostPorDefecto() {
  if (esProduccion()) {
    return "0.0.0.0";
  }

  return "127.0.0.1";
}

async function iniciarServidor(opciones = {}) {
  validarEntorno();
  await inicializarAuth(pool);
  await inicializarSuscripciones(pool);

  const frontendDist = resolverFrontendDist(opciones);

  if (frontendDist) {
    const indexPath = path.join(frontendDist, "index.html");

    if (!fs.existsSync(indexPath)) {
      throw new Error(
        `No existe el frontend compilado en ${frontendDist}. Ejecuta npm run build:web antes de iniciar con SERVE_FRONTEND=true.`
      );
    }

    app.habilitarFrontendEstatico(frontendDist);
  }

  const host = opciones.host || process.env.HOST || hostPorDefecto();
  const port = Number(opciones.port ?? process.env.PORT ?? 4000);

  const server = await new Promise((resolve, reject) => {
    const instancia = app.listen(port, host, () => resolve(instancia));
    instancia.once("error", reject);
  });

  const direccion = server.address();
  return {
    server,
    host,
    port: typeof direccion === "object" && direccion ? direccion.port : port,
  };
}

async function detenerServidor(server) {
  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await pool.end();
}

module.exports = {
  iniciarServidor,
  detenerServidor,
};
