/**
 * Importaciones fila por fila, sin perder lo que si se pudo guardar.
 *
 * El problema que resuelve: las importaciones abrian una transaccion, recorrian
 * el archivo con un try/catch por fila y al final hacian COMMIT. En PostgreSQL,
 * en cuanto una sentencia falla dentro de una transaccion, la transaccion queda
 * abortada y todas las siguientes fallan con "current transaction is aborted".
 * El COMMIT final se convierte en un ROLLBACK silencioso.
 *
 * Es decir: si la fila 51 de 100 fallaba, las 50 anteriores tampoco quedaban
 * guardadas, pero la respuesta informaba "50 insertadas". El usuario creia tener
 * su libro de compras cargado y la base estaba intacta.
 *
 * Con un punto de guardado por fila, el error revierte solo esa fila y el resto
 * se conserva.
 */

/**
 * Corre `tarea` dentro de un punto de guardado.
 *
 * Devuelve { ok: true, valor } o { ok: false, error }. Nunca lanza por un error
 * de la tarea: quien llama decide como informarlo.
 */
async function conPuntoDeGuardado(cliente, nombre, tarea) {
  const punto = `sp_${String(nombre).replace(/[^a-zA-Z0-9_]/g, "_")}`;

  await cliente.query(`SAVEPOINT ${punto}`);

  try {
    const valor = await tarea();
    await cliente.query(`RELEASE SAVEPOINT ${punto}`);
    return { ok: true, valor };
  } catch (error) {
    await cliente.query(`ROLLBACK TO SAVEPOINT ${punto}`);
    return { ok: false, error };
  }
}

/**
 * Recorre las filas de un archivo importado.
 *
 * `procesarFila(fila, indice)` puede lanzar: el error se anota y se sigue con la
 * siguiente. Lo que devuelva se acumula en `resultados`.
 *
 * `identificarFila` construye el texto con que se nombra la fila en los errores,
 * para que el usuario sepa que documento revisar.
 */
async function recorrerFilas(
  cliente,
  filas,
  procesarFila,
  { identificarFila = (fila, indice) => `fila ${indice + 1}` } = {}
) {
  const errores = [];
  const resultados = [];

  for (let indice = 0; indice < filas.length; indice += 1) {
    const fila = filas[indice];

    const resultado = await conPuntoDeGuardado(cliente, `fila_${indice}`, () =>
      procesarFila(fila, indice)
    );

    if (resultado.ok) {
      resultados.push(resultado.valor);
      continue;
    }

    const error = resultado.error;

    // Los errores de validacion propios llevan mensaje entendible. Los de
    // PostgreSQL no se muestran tal cual: revelan tablas y restricciones.
    const mensaje =
      error?.statusCode || error?.esValidacion
        ? error.message
        : traducirErrorFila(error);

    errores.push(`${identificarFila(fila, indice)}: ${mensaje}`);
  }

  return { resultados, errores };
}

function traducirErrorFila(error) {
  const codigos = {
    "23505": "el documento ya existe",
    "23503": "una cuenta o referencia indicada no existe en esta empresa",
    "23502": "falta un dato obligatorio",
    "22P02": "un dato no tiene el formato esperado",
    "22003": "un monto esta fuera del rango permitido",
  };

  return codigos[error?.code] || "no se pudo procesar";
}

/**
 * Resumen honesto de una importacion.
 *
 * `guardado` es lo que de verdad quedo en la base, y se informa aparte del
 * total de filas leidas para que un archivo con errores no parezca exitoso.
 */
function resumirImportacion({
  totalFilas,
  insertadas = 0,
  actualizadas = 0,
  omitidas = 0,
  comprobantesCreados = 0,
  errores = [],
}) {
  const guardado = insertadas + actualizadas;

  return {
    total_filas: totalFilas,
    insertadas,
    actualizadas,
    omitidas,
    comprobantes_creados: comprobantesCreados,
    con_error: errores.length,
    errores,
    guardado,
    // El frontend usa esto para decidir si muestra un aviso.
    resultado:
      errores.length === 0
        ? "completa"
        : guardado > 0
          ? "parcial"
          : "sin_cambios",
  };
}

/**
 * Texto para informar el error de una fila sin devolver el mensaje de
 * PostgreSQL, que revela tablas y restricciones.
 */
function describirErrorFila(error) {
  if (error && error.statusCode) return error.message;

  const codigos = {
    23505: "documento duplicado",
    23503: "referencia a un registro que no existe",
    23514: "valor fuera de lo permitido",
    22001: "texto demasiado largo",
    22003: "monto fuera de rango",
    22007: "fecha inválida",
    22008: "fecha inválida",
  };

  return codigos[error && error.code] || "no se pudo guardar la fila";
}

module.exports = {
  describirErrorFila,
  conPuntoDeGuardado,
  recorrerFilas,
  resumirImportacion,
};
