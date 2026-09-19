/**
 * Quién escribió cada fila.
 *
 * Las tablas contables ahora llevan `creado_por`, `actualizado_por` y
 * `actualizado_en`. Antes no había forma de saber de dónde salió un asiento
 * ante una discrepancia: `auditoria_movimientos` es un registro aparte que no
 * siempre se escribe y que no acompaña al dato.
 *
 * Se aplica después de escribir, en la misma transacción. Es deliberadamente
 * tolerante: si la columna no existe todavía en esa tabla, no hace nada, para
 * que un despliegue sin la migración aplicada no rompa el sistema.
 */

// Tablas que llevan las columnas de autoría.
const TABLAS = new Set([
  "comprobantes",
  "comprobante_detalle",
  "ventas",
  "compras",
  "honorarios",
  "pagos_cobros",
  "liquidaciones",
  "finiquitos",
  "pagos_remuneraciones",
  "conciliacion_bancaria_movimientos",
  "ejercicios_contables",
  "plan_cuentas",
]);

function usuarioDe(req) {
  const id = Number(req?.usuario?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Marca quién creó las filas indicadas.
 */
async function marcarCreacion(cliente, tabla, ids, req) {
  const usuarioId = usuarioDe(req);
  const lista = (Array.isArray(ids) ? ids : [ids])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (!usuarioId || lista.length === 0 || !TABLAS.has(tabla)) {
    return;
  }

  try {
    await cliente.query(
      `UPDATE ${tabla}
       SET creado_por = COALESCE(creado_por, $1)
       WHERE id = ANY($2::int[])`,
      [usuarioId, lista]
    );
  } catch (error) {
    // La columna puede no existir si falta aplicar la migración. No es motivo
    // para tumbar la operación contable.
    if (error.code !== "42703") {
      throw error;
    }
  }
}

/**
 * Marca quién modificó las filas indicadas y cuándo.
 */
async function marcarActualizacion(cliente, tabla, ids, req) {
  const usuarioId = usuarioDe(req);
  const lista = (Array.isArray(ids) ? ids : [ids])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (!usuarioId || lista.length === 0 || !TABLAS.has(tabla)) {
    return;
  }

  try {
    await cliente.query(
      `UPDATE ${tabla}
       SET actualizado_por = $1,
           actualizado_en = NOW()
       WHERE id = ANY($2::int[])`,
      [usuarioId, lista]
    );
  } catch (error) {
    if (error.code !== "42703") {
      throw error;
    }
  }
}

module.exports = {
  TABLAS,
  marcarCreacion,
  marcarActualizacion,
};
