/**
 * Quién está haciendo la petición, disponible desde cualquier consulta.
 *
 * La autoría (creado_por, actualizado_por) se prometió en doce tablas y solo
 * se escribía en dos, porque dependía de que cada controlador llamara a un
 * helper. De 147 compras creadas en la copia desde que existe la columna,
 * ninguna tenía autor.
 *
 * Ahora el usuario viaja en un AsyncLocalStorage desde verificarToken, y la
 * capa de base de datos lo entrega a PostgreSQL como `app.usuario_id`. Un
 * disparador en cada tabla lo lee y fija la autoría: ningún controlador puede
 * olvidarse.
 */

const { AsyncLocalStorage } = require("node:async_hooks");

const contexto = new AsyncLocalStorage();

function conUsuario(usuarioId, funcion) {
  return contexto.run({ usuarioId: usuarioId ? Number(usuarioId) : null }, funcion);
}

function usuarioActual() {
  const almacen = contexto.getStore();
  const id = almacen?.usuarioId;

  return Number.isInteger(id) && id > 0 ? id : null;
}

module.exports = { conUsuario, usuarioActual };
