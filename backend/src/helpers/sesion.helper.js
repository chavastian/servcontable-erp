/**
 * Emision y revocacion de tokens de sesion.
 *
 * El token es un JWT firmado y el servidor no guarda los emitidos, asi que por
 * si solo no se puede invalidar. Para poder cerrar sesiones lleva dentro la
 * version de sesion del usuario (`tv`), que se compara en cada peticion contra
 * la columna usuarios.token_version. Subir ese contador deja fuera de inmediato
 * todos los tokens anteriores de esa persona.
 *
 * Se sube al cambiar la contrasena y al desactivar la cuenta.
 */

const jwt = require("jsonwebtoken");
const { obtenerJwtSecret } = require("../config/env");

// Antes eran 8 horas fijas. Con renovacion desde el frontend, una vigencia mas
// corta reduce la ventana util de un token robado sin molestar a quien trabaja.
const VIGENCIA = process.env.JWT_EXPIRES_IN || "4h";

async function obtenerVersionSesion(cliente, usuarioId) {
  const { rows } = await cliente.query(
    "SELECT token_version FROM usuarios WHERE id = $1 LIMIT 1",
    [usuarioId]
  );

  return Number(rows[0]?.token_version ?? 1);
}

/**
 * Firma un token para el usuario, incluyendo su version de sesion.
 * `extra` permite agregar datos propios de la sesion, como el estado de prueba.
 */
async function firmarToken(cliente, usuario, extra = {}) {
  const version = await obtenerVersionSesion(cliente, usuario.id);

  return jwt.sign(
    {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      tv: version,
      ...extra,
    },
    obtenerJwtSecret(),
    { expiresIn: VIGENCIA }
  );
}

/**
 * Invalida todas las sesiones abiertas del usuario.
 */
async function revocarSesiones(cliente, usuarioId) {
  await cliente.query(
    "UPDATE usuarios SET token_version = COALESCE(token_version, 1) + 1 WHERE id = $1",
    [usuarioId]
  );
}

/**
 * Comprueba que el token siga vigente para ese usuario.
 *
 * Un token emitido antes de que la columna existiera no trae `tv`; se acepta
 * para no expulsar a nadie al desplegar, y deja de valer cuando expira.
 */
async function sesionVigente(cliente, tokenDecodificado) {
  if (tokenDecodificado?.tv === undefined) {
    return true;
  }

  const version = await obtenerVersionSesion(cliente, tokenDecodificado.id);
  return Number(tokenDecodificado.tv) === version;
}

module.exports = {
  VIGENCIA,
  firmarToken,
  revocarSesiones,
  sesionVigente,
  obtenerVersionSesion,
};
