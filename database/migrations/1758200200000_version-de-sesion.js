/**
 * Version de sesion por usuario, para poder revocar tokens.
 *
 * El token de sesion es un JWT firmado: el servidor no lleva registro de los
 * emitidos, asi que hasta ahora no habia forma de invalidarlos. Cambiar la
 * contrasena de alguien, o desactivar su cuenta, dejaba su token anterior
 * funcionando durante las 8 horas de vigencia.
 *
 * Con este contador, el token lleva dentro la version con la que se emitio y en
 * cada peticion se compara con la de la base. Subir el contador invalida de
 * inmediato todas las sesiones de ese usuario.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1
  `);
};

exports.down = (pgm) => {
  pgm.sql("ALTER TABLE usuarios DROP COLUMN IF EXISTS token_version");
};
