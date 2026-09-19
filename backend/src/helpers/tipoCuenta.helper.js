/**
 * Clasificación de una cuenta por su tipo declarado.
 *
 * El plan de cuentas guarda `tipo` con ocho valores: Activo, Pasivo,
 * Patrimonio, Ingreso, Ganancia, Costo, Gasto y Pérdida. Los informes, en
 * cambio, clasificaban buscando palabras en el nombre: "Pérdida por venta
 * activo fijo" caía en Activo porque contiene la palabra, y los paneles
 * comparaban contra 'Ingreso' y 'Gasto' literales mientras el plan base carga
 * 'Ganancia' y 'Pérdida', así que mostraban resultado cero con un balance de
 * 681.337.
 *
 * Desde acá el tipo manda. El texto del nombre queda solo como último recurso
 * para cuentas con un tipo que no sea uno de los ocho, y la base ya no admite
 * otros (migración bloque1-integridad).
 */

const TIPOS = Object.freeze([
  "Activo",
  "Pasivo",
  "Patrimonio",
  "Ingreso",
  "Ganancia",
  "Costo",
  "Gasto",
  "Pérdida",
]);

const TIPOS_INGRESO = Object.freeze(["Ingreso", "Ganancia"]);
const TIPOS_COSTO = Object.freeze(["Costo"]);
const TIPOS_GASTO = Object.freeze(["Gasto", "Pérdida"]);
const TIPOS_RESULTADO = Object.freeze([...TIPOS_INGRESO, ...TIPOS_COSTO, ...TIPOS_GASTO]);

function normalizarTexto(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Lleva cualquier forma de escribir el tipo a uno de los ocho, o null.
 */
function normalizarTipo(tipo) {
  const t = normalizarTexto(tipo);

  if (t === "activo") return "Activo";
  if (t === "pasivo") return "Pasivo";
  if (t === "patrimonio") return "Patrimonio";
  if (t === "ingreso" || t === "ingresos") return "Ingreso";
  if (t === "ganancia" || t === "ganancias") return "Ganancia";
  if (t === "costo" || t === "costos") return "Costo";
  if (t === "gasto" || t === "gastos") return "Gasto";
  if (t === "perdida" || t === "perdidas") return "Pérdida";

  return null;
}

/**
 * Columna del balance de ocho columnas que corresponde al tipo, o null si el
 * tipo no es uno de los ocho. Patrimonio va con pasivo, como en el balance.
 */
function columnaBalancePorTipo(tipo) {
  const t = normalizarTipo(tipo);

  if (t === "Activo") return "activo";
  if (t === "Pasivo" || t === "Patrimonio") return "pasivo";
  if (TIPOS_INGRESO.includes(t)) return "ganancia";
  if (TIPOS_COSTO.includes(t) || TIPOS_GASTO.includes(t)) return "perdida";

  return null;
}

/**
 * Categoría del estado de resultados: "ingreso", "costo", "gasto", o null para
 * cuentas de balance. Devuelve undefined si el tipo no se reconoce.
 */
function categoriaResultadoPorTipo(tipo) {
  const t = normalizarTipo(tipo);

  if (!t) return undefined;
  if (t === "Activo" || t === "Pasivo" || t === "Patrimonio") return null;
  if (TIPOS_INGRESO.includes(t)) return "ingreso";
  if (TIPOS_COSTO.includes(t)) return "costo";

  return "gasto";
}

/**
 * Lista SQL para usar en `pc.tipo IN (...)`.
 */
function listaSql(tipos) {
  return tipos.map((t) => `'${t}'`).join(", ");
}

module.exports = {
  TIPOS,
  TIPOS_INGRESO,
  TIPOS_COSTO,
  TIPOS_GASTO,
  TIPOS_RESULTADO,
  normalizarTipo,
  columnaBalancePorTipo,
  categoriaResultadoPorTipo,
  listaSql,
};
