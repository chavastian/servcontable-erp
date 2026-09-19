/**
 * Una fecha, siempre como AAAA-MM-DD.
 *
 * El driver de PostgreSQL entrega las columnas DATE como objetos Date de
 * JavaScript, no como texto. Cualquier cálculo que haga `String(fecha).slice(0,
 * 10)` sobre eso obtiene "Sun Apr 1" y falla en silencio: la comparación de
 * fechas devuelve NaN, el calce bancario no encuentra candidatos y la proyección
 * de caja lanza "Invalid time value".
 *
 * Para un Date que viene de una columna DATE se usan los componentes locales, no
 * los UTC: el driver construye la medianoche local del día guardado, así que
 * `getDate()` devuelve el día correcto y `toISOString()` puede correrlo al
 * anterior o al siguiente según el huso.
 */

function dos(numero) {
  return String(numero).padStart(2, "0");
}

/**
 * Normaliza a AAAA-MM-DD. Devuelve null si no hay fecha reconocible, para que
 * quien llama decida qué hacer en lugar de recibir una fecha inventada.
 */
function aFechaISO(valor) {
  if (valor === null || valor === undefined || valor === "") return null;

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;

    return `${valor.getFullYear()}-${dos(valor.getMonth() + 1)}-${dos(valor.getDate())}`;
  }

  const texto = String(valor).trim();
  const coincidencia = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (coincidencia) {
    return `${coincidencia[1]}-${coincidencia[2]}-${coincidencia[3]}`;
  }

  const fecha = new Date(texto);

  return Number.isNaN(fecha.getTime()) ? null : aFechaISO(fecha);
}

/**
 * Días de calendario entre dos fechas, sin signo. Infinito si alguna no se puede
 * leer: así una fecha ilegible nunca pasa por cercana.
 */
function diasEntreFechas(a, b) {
  const uno = aFechaISO(a);
  const dos_ = aFechaISO(b);

  if (!uno || !dos_) return Number.POSITIVE_INFINITY;

  return Math.abs(
    Math.round((Date.parse(`${uno}T00:00:00Z`) - Date.parse(`${dos_}T00:00:00Z`)) / 86400000)
  );
}

/**
 * Días con signo: positivo si `hasta` es posterior a `desde`.
 */
function diasDesdeHasta(desde, hasta) {
  const uno = aFechaISO(desde);
  const dos_ = aFechaISO(hasta);

  if (!uno || !dos_) return null;

  return Math.round(
    (Date.parse(`${dos_}T00:00:00Z`) - Date.parse(`${uno}T00:00:00Z`)) / 86400000
  );
}

function sumarDiasAFecha(valor, dias) {
  const base = aFechaISO(valor);

  if (!base) return null;

  return new Date(Date.parse(`${base}T00:00:00Z`) + dias * 86400000)
    .toISOString()
    .slice(0, 10);
}

module.exports = { aFechaISO, diasEntreFechas, diasDesdeHasta, sumarDiasAFecha };
