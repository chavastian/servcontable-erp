/**
 * Impuesto único de segunda categoría por la tabla legal en UTM.
 *
 * El artículo 43 N°1 de la Ley de la Renta define los tramos en UTM, así que
 * la tabla es la misma para todas las empresas y todos los meses: lo único que
 * cambia es el valor de la UTM. El sistema, en cambio, pedía a cada empresa
 * cargar los tramos en pesos cada mes, y sin ellos guardaba la liquidación con
 * impuesto cero.
 *
 * Los tramos cargados por la empresa siguen mandando cuando existen (permiten
 * un ajuste puntual); esta tabla es lo que se usa cuando no hay.
 *
 * REQUIERE VALIDACIÓN TRIBUTARIA en cada cambio de ley: hoy la tabla vigente
 * es la del artículo 43 N°1 con las rebajas en UTM de la circular del SII.
 */

// [desde UTM, hasta UTM (null = sin tope), factor, rebaja en UTM]
const TRAMOS_UTM = Object.freeze([
  [0, 13.5, 0, 0],
  [13.5, 30, 0.04, 0.54],
  [30, 50, 0.08, 1.74],
  [50, 70, 0.135, 4.49],
  [70, 90, 0.23, 11.14],
  [90, 120, 0.304, 17.8],
  [120, 310, 0.35, 23.32],
  [310, null, 0.4, 38.82],
]);

function calcularImpuestoUnicoLegal(baseTributable, valorUtm) {
  const base = Number(baseTributable || 0);
  const utm = Number(valorUtm || 0);

  if (base <= 0 || utm <= 0) {
    return { impuesto: 0, tramo: null, factor: 0, rebaja: 0 };
  }

  const baseEnUtm = base / utm;
  const tramo = TRAMOS_UTM.find(
    ([desde, hasta]) => baseEnUtm > desde && (hasta === null || baseEnUtm <= hasta)
  );

  if (!tramo) {
    return { impuesto: 0, tramo: null, factor: 0, rebaja: 0 };
  }

  const [desde, hasta, factor, rebajaUtm] = tramo;
  const rebaja = Math.round(rebajaUtm * utm);
  const impuesto = Math.max(0, Math.round(base * factor - rebaja));

  return {
    impuesto,
    factor,
    rebaja,
    tramo: {
      origen: "tabla_legal_utm",
      desde_utm: desde,
      hasta_utm: hasta,
      desde: Math.round(desde * utm),
      hasta: hasta === null ? null : Math.round(hasta * utm),
      factor,
      rebaja,
      valor_utm: utm,
    },
  };
}

module.exports = { TRAMOS_UTM, calcularImpuestoUnicoLegal };
