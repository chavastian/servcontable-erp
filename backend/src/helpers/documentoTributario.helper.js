/**
 * Signo tributario de los documentos.
 *
 * REQUIERE VALIDACIÓN CONTABLE/TRIBUTARIA.
 *
 * El problema: los montos de todos los documentos se guardan en positivo, y los
 * resúmenes de IVA, el F29, los libros y los paneles sumaban con
 * `SUM(iva)`. Una nota de crédito rebaja la operación que corrige, así que
 * sumarla en positivo infla el débito fiscal en ventas y el crédito fiscal en
 * compras. En la base de producción hay una nota de crédito de compra guardada
 * en positivo, de modo que el efecto es real, no teórico.
 *
 * Tratamiento que se aplica, según los códigos de documento del SII:
 *
 *   33  Factura afecta          suma
 *   34  Factura exenta          suma
 *   39  Boleta                  suma
 *   41  Boleta exenta           suma
 *   43  Liquidación factura     suma
 *   46  Factura de compra       suma
 *   56  Nota de débito          suma   (aumenta la operación)
 *   61  Nota de crédito         resta  (rebaja la operación)
 *  110  Factura de exportación  suma
 *  111  Nota de débito export.  suma
 *  112  Nota de crédito export. resta
 *
 * Los documentos creados a mano no siempre traen el código del SII; en ese caso
 * se mira el texto de `tipo_documento`.
 *
 * Esta decisión cambia cifras que se declaran al SII. Antes de darla por firme
 * debe revisarla un contador, y por eso los resúmenes informan aparte el efecto
 * de las notas de crédito.
 */

// Códigos que restan.
const CODIGOS_QUE_RESTAN = ["61", "112"];

// Texto de los documentos creados a mano que corresponden a una rebaja.
const TEXTO_QUE_RESTA = /nota\s*de\s*cr[eé]dito/i;

function signoDocumento(documento = {}) {
  const codigo = String(documento.sii_tipo_doc ?? "").trim();

  if (codigo) {
    return CODIGOS_QUE_RESTAN.includes(codigo) ? -1 : 1;
  }

  return TEXTO_QUE_RESTA.test(String(documento.tipo_documento ?? "")) ? -1 : 1;
}

/**
 * Expresión SQL que devuelve 1 o -1 para una fila de ventas o compras.
 * `alias` es el alias de la tabla en la consulta ("v", "c" o vacío).
 */
function expresionSigno(alias = "") {
  const prefijo = alias ? `${alias}.` : "";
  const codigos = CODIGOS_QUE_RESTAN.map((codigo) => `'${codigo}'`).join(", ");

  return `CASE
    WHEN COALESCE(${prefijo}sii_tipo_doc, '') <> ''
      THEN CASE WHEN ${prefijo}sii_tipo_doc IN (${codigos}) THEN -1 ELSE 1 END
    WHEN ${prefijo}tipo_documento ILIKE '%nota de cr%dito%' THEN -1
    ELSE 1
  END`;
}

/**
 * `SUM` con signo tributario. Reemplaza a `SUM(columna)` en los resúmenes.
 *
 *   sumaConSigno("iva", "v")  ->  COALESCE(SUM(<signo> * COALESCE(v.iva, 0)), 0)
 */
function sumaConSigno(columna, alias = "") {
  const prefijo = alias ? `${alias}.` : "";
  return `COALESCE(SUM((${expresionSigno(alias)}) * COALESCE(${prefijo}${columna}, 0)), 0)`;
}

/**
 * `SUM` solo de las notas de crédito, en positivo, para informar aparte cuánto
 * rebajaron. Permite que un contador revise el efecto de un vistazo.
 */
function sumaNotasCredito(columna, alias = "") {
  const prefijo = alias ? `${alias}.` : "";
  const codigos = CODIGOS_QUE_RESTAN.map((codigo) => `'${codigo}'`).join(", ");

  return `COALESCE(SUM(
    CASE
      WHEN ${prefijo}sii_tipo_doc IN (${codigos})
        OR (COALESCE(${prefijo}sii_tipo_doc, '') = ''
            AND ${prefijo}tipo_documento ILIKE '%nota de cr%dito%')
      THEN COALESCE(${prefijo}${columna}, 0)
      ELSE 0
    END
  ), 0)`;
}

/**
 * Igual que sumaConSigno, pero sumando solo las filas que cumplen una condicion.
 *
 * Existe porque FILTER va pegado a SUM y no al COALESCE que lo envuelve:
 * `COALESCE(SUM(x), 0) FILTER (WHERE ...)` no es SQL valido. Escribirlo a mano en
 * cada consulta invitaba a equivocarse justo en el signo de las notas de credito.
 */
function sumaConSignoSi(columna, condicion, alias = "") {
  const prefijo = alias ? `${alias}.` : "";

  return `COALESCE(SUM((${expresionSigno(alias)}) * COALESCE(${prefijo}${columna}, 0)) FILTER (WHERE ${condicion}), 0)`;
}

module.exports = {
  CODIGOS_QUE_RESTAN,
  signoDocumento,
  expresionSigno,
  sumaConSigno,
  sumaConSignoSi,
  sumaNotasCredito,
};
