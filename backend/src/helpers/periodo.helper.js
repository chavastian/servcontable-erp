/**
 * Bloqueo de periodos cerrados.
 *
 * Cerrar un ejercicio contable significa que sus cifras quedan firmes: es la
 * base de una declaracion presentada al SII. Hasta ahora el cierre solo
 * cambiaba un estado en la tabla y no impedia nada: se podian seguir creando,
 * modificando y anulando asientos con fecha dentro del ejercicio cerrado, con
 * lo que los libros dejaban de cuadrar con lo declarado.
 *
 * Un ejercicio se identifica por empresa y ano. La fecha del documento decide a
 * cual pertenece.
 */

const ESTADO_CERRADO = "cerrado";

class ErrorPeriodoCerrado extends Error {
  constructor(anio) {
    super(
      `El ejercicio ${anio} esta cerrado. Para registrar o modificar movimientos de ese periodo hay que reabrirlo.`
    );
    this.name = "ErrorPeriodoCerrado";
    this.statusCode = 409;
    this.anio = anio;
  }
}

/**
 * Obtiene el ano de una fecha, venga como texto ISO, como periodo AAAA-MM o
 * como Date.
 */
function anioDe(fecha) {
  if (!fecha) {
    return null;
  }

  if (fecha instanceof Date) {
    return fecha.getFullYear();
  }

  const texto = String(fecha).trim();
  const coincidencia = texto.match(/^(\d{4})/);

  return coincidencia ? Number(coincidencia[1]) : null;
}

/**
 * Lanza ErrorPeriodoCerrado si la fecha cae en un ejercicio cerrado.
 *
 * Si no existe un ejercicio para ese ano, no se bloquea: muchas empresas
 * trabajan sin haber creado el ejercicio y exigirlo aca rompería el flujo
 * actual sin mejorar nada.
 */
async function exigirPeriodoAbierto(cliente, empresaId, fecha) {
  const anio = anioDe(fecha);

  if (!anio || !empresaId) {
    return;
  }

  const { rows } = await cliente.query(
    `SELECT estado
     FROM ejercicios_contables
     WHERE empresa_id = $1 AND anio = $2
     LIMIT 1`,
    [Number(empresaId), anio]
  );

  if (rows.length === 0) {
    return;
  }

  if (String(rows[0].estado || "").toLowerCase() === ESTADO_CERRADO) {
    throw new ErrorPeriodoCerrado(anio);
  }
}

/**
 * Igual que exigirPeriodoAbierto pero para varias fechas, por ejemplo al
 * contabilizar un lote de documentos. Una sola consulta.
 */
async function exigirPeriodosAbiertos(cliente, empresaId, fechas = []) {
  const anios = [...new Set(fechas.map(anioDe).filter(Boolean))];

  if (anios.length === 0 || !empresaId) {
    return;
  }

  const { rows } = await cliente.query(
    `SELECT anio
     FROM ejercicios_contables
     WHERE empresa_id = $1
       AND anio = ANY($2::int[])
       AND LOWER(estado) = $3`,
    [Number(empresaId), anios, ESTADO_CERRADO]
  );

  if (rows.length > 0) {
    throw new ErrorPeriodoCerrado(rows[0].anio);
  }
}

module.exports = {
  ESTADO_CERRADO,
  ErrorPeriodoCerrado,
  anioDe,
  exigirPeriodoAbierto,
  exigirPeriodosAbiertos,
};
