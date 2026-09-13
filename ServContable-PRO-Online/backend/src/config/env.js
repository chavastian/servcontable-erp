function esProduccion() {
  return process.env.NODE_ENV === "production";
}

function sirveFrontendDesdeBackend() {
  return process.env.SERVE_FRONTEND === "true";
}

function obtenerJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (secret && secret.trim()) {
    return secret.trim();
  }

  if (esProduccion()) {
    throw new Error("JWT_SECRET es obligatorio en produccion.");
  }

  return "clave_desarrollo_servcontable_no_usar_en_produccion";
}

function obtenerOrigenesCors() {
  const origenes = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || "";

  if (origenes.trim()) {
    return origenes
      .split(",")
      .map((origen) => origen.trim())
      .filter(Boolean);
  }

  if (esProduccion()) {
    return [];
  }

  return [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
  ];
}

function validarEntorno() {
  if (!esProduccion()) {
    return;
  }

  const faltantes = [];

  if (!process.env.DATABASE_URL) {
    faltantes.push("DATABASE_URL");
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 32) {
    faltantes.push("JWT_SECRET de al menos 32 caracteres");
  }

  if (
    !sirveFrontendDesdeBackend() &&
    !process.env.CORS_ORIGIN &&
    !process.env.CORS_ORIGINS
  ) {
    faltantes.push("CORS_ORIGIN");
  }

  if (faltantes.length > 0) {
    throw new Error(
      `Faltan variables obligatorias para produccion: ${faltantes.join(", ")}`
    );
  }
}

module.exports = {
  esProduccion,
  sirveFrontendDesdeBackend,
  obtenerJwtSecret,
  obtenerOrigenesCors,
  validarEntorno,
};
