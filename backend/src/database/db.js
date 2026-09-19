const { Pool } = require("pg");
require("dotenv").config();
const { usuarioActual } = require("../helpers/contextoUsuario.helper");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === "true"
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
});

pool.on("connect", () => {
  console.log("Conectado a PostgreSQL correctamente");
});

pool.on("error", (error) => {
  console.error("Error inesperado en PostgreSQL:", error);
});

// ---------------------------------------------------------------------------
// Autoría desde la base.
//
// Los disparadores de autoría leen `app.usuario_id`. Para que ese valor exista
// hay que fijarlo en la misma conexión que ejecuta la escritura:
//
// - En una transacción (client.query("BEGIN")), se fija justo después del
//   BEGIN con alcance de transacción: se limpia solo al terminar.
// - En una escritura suelta por pool.query, se toma un cliente, se fija, se
//   ejecuta y se limpia antes de devolverlo. Son dos viajes más solo para
//   escrituras; las lecturas siguen igual.
//
// El usuario sale del AsyncLocalStorage que llena verificarToken. Fuera de una
// petición (scripts, pruebas directas) no hay usuario y el disparador deja NULL.
// ---------------------------------------------------------------------------

const ESCRITURA = /^\s*(INSERT|UPDATE|DELETE|WITH)\b/i;
const INICIO_TRANSACCION = /^\s*BEGIN\b/i;

function textoDe(consulta) {
  return typeof consulta === "string" ? consulta : consulta?.text;
}

function envolverCliente(client) {
  if (client.__conContextoUsuario) return client;

  const consultaOriginal = client.query.bind(client);

  client.query = async function consultaConContexto(consulta, ...resto) {
    // Con callback no se puede encadenar: se deja pasar tal cual.
    if (typeof resto[resto.length - 1] === "function") {
      return consultaOriginal(consulta, ...resto);
    }

    const resultado = await consultaOriginal(consulta, ...resto);
    const texto = textoDe(consulta);

    if (texto && INICIO_TRANSACCION.test(texto)) {
      const usuario = usuarioActual();

      if (usuario) {
        await consultaOriginal("SELECT set_config('app.usuario_id', $1, true)", [
          String(usuario),
        ]);
      }
    }

    return resultado;
  };

  client.__conContextoUsuario = true;
  return client;
}

const connectOriginal = pool.connect.bind(pool);

pool.connect = function conectarConContexto(...args) {
  if (args.length > 0) {
    return connectOriginal(...args);
  }

  return connectOriginal().then(envolverCliente);
};

const queryOriginal = pool.query.bind(pool);

pool.query = async function consultaConContexto(consulta, ...resto) {
  const texto = textoDe(consulta);
  const usuario = usuarioActual();

  if (
    !usuario ||
    !texto ||
    !ESCRITURA.test(texto) ||
    typeof resto[resto.length - 1] === "function"
  ) {
    return queryOriginal(consulta, ...resto);
  }

  const client = await connectOriginal();

  try {
    await client.query("SELECT set_config('app.usuario_id', $1, false)", [String(usuario)]);
    return await client.query(consulta, ...resto);
  } finally {
    await client.query("SELECT set_config('app.usuario_id', '', false)").catch(() => {});
    client.release();
  }
};

module.exports = pool;
