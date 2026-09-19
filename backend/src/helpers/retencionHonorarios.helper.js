/**
 * Tasa de retención de boletas de honorarios, por fecha de emisión.
 *
 * La Ley 21.133 (artículo 74 N°2 de la Ley de la Renta y su artículo primero
 * transitorio) fijó una gradualidad: la tasa sube cada año hasta llegar a 17%
 * en 2028. Antes el sistema recibía la tasa desde el formulario, con 14,5%
 * como valor propuesto: en 2026 toda boleta se retenía 0,75 puntos de menos,
 * el F29 declaraba menos y el prestador recibía de más.
 *
 * La tasa la decide la fecha de emisión, no quien digita. El formulario puede
 * mostrarla, pero no cambiarla.
 *
 * REQUIERE VALIDACIÓN TRIBUTARIA cada enero: confirmar contra el SII que la
 * tabla siga vigente y que no haya cambios de ley.
 */

const TASAS_POR_ANIO = Object.freeze({
  2018: 10,
  2019: 10,
  2020: 10.75,
  2021: 11.5,
  2022: 12.25,
  2023: 13,
  2024: 13.75,
  2025: 14.5,
  2026: 15.25,
  2027: 16,
  2028: 17,
});

const TASA_FINAL = 17;
const PRIMER_ANIO = 2018;

function anioDe(fecha) {
  if (!fecha) return null;

  const texto = fecha instanceof Date ? fecha.toISOString() : String(fecha);
  const coincidencia = texto.match(/^(\d{4})/);

  return coincidencia ? Number(coincidencia[1]) : null;
}

/**
 * Tasa vigente para una fecha de emisión, en porcentaje (15.25 = 15,25%).
 */
function tasaRetencionVigente(fechaEmision) {
  const anio = anioDe(fechaEmision);

  if (!anio) return TASA_FINAL;
  if (anio >= 2028) return TASA_FINAL;
  if (anio < PRIMER_ANIO) return TASAS_POR_ANIO[PRIMER_ANIO];

  return TASAS_POR_ANIO[anio];
}

function calcularRetencion(bruto, fechaEmision) {
  const tasa = tasaRetencionVigente(fechaEmision);
  const brutoNum = Number(bruto || 0);
  const retencion = Math.round(brutoNum * (tasa / 100));

  return { tasa, retencion, liquido: brutoNum - retencion };
}

module.exports = { TASAS_POR_ANIO, tasaRetencionVigente, calcularRetencion };
