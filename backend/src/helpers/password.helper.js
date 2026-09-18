/**
 * Politica de contrasenas, en un solo lugar.
 *
 * Antes solo el reseteo hecho por un administrador exigia 8 caracteres. El
 * registro publico, la creacion de usuarios por un administrador de cliente y
 * el reseteo con token del correo aceptaban cualquier cosa, incluida una sola
 * letra. Con lo cual el minimo no existia en la practica.
 */

const LARGO_MINIMO = Number(process.env.PASSWORD_MIN_LENGTH || 8);
const LARGO_MAXIMO = 200;

// Las mas usadas en Chile y en cualquier lista de contrasenas filtradas.
const PROHIBIDAS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "contrasena",
  "contraseña",
  "qwertyui",
  "servcontable",
  "servcontablepro",
  "administrador",
  "admin1234",
]);

/**
 * Devuelve { valida, error }.
 *
 * No exige mezclar mayusculas, numeros y simbolos: en la practica eso empuja a
 * la gente a variaciones predecibles. Se pide largo y que no sea una de las
 * contrasenas evidentes.
 */
function validarPassword(password, { email = "" } = {}) {
  const valor = String(password ?? "");

  if (!valor) {
    return { valida: false, error: "La contrasena es obligatoria" };
  }

  if (valor.length < LARGO_MINIMO) {
    return {
      valida: false,
      error: `La contrasena debe tener al menos ${LARGO_MINIMO} caracteres`,
    };
  }

  if (valor.length > LARGO_MAXIMO) {
    return {
      valida: false,
      error: `La contrasena no puede superar los ${LARGO_MAXIMO} caracteres`,
    };
  }

  if (valor.trim().length === 0) {
    return { valida: false, error: "La contrasena no puede ser solo espacios" };
  }

  const normalizada = valor.toLowerCase();

  if (PROHIBIDAS.has(normalizada)) {
    return {
      valida: false,
      error: "Esa contrasena es demasiado comun. Elige otra.",
    };
  }

  const usuarioCorreo = String(email || "").split("@")[0].toLowerCase();

  if (usuarioCorreo.length >= 4 && normalizada.includes(usuarioCorreo)) {
    return {
      valida: false,
      error: "La contrasena no puede contener tu correo",
    };
  }

  return { valida: true };
}

/**
 * Responde 400 y devuelve true si la contrasena no sirve. Pensado para usarse
 * como guarda de una linea en los controladores.
 */
function rechazarPasswordInvalida(res, password, opciones) {
  const { valida, error } = validarPassword(password, opciones);

  if (!valida) {
    res.status(400).json({ error });
    return true;
  }

  return false;
}

module.exports = {
  LARGO_MINIMO,
  validarPassword,
  rechazarPasswordInvalida,
};
