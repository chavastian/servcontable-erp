/**
 * Tasa de retención de boletas de honorarios según el año de emisión.
 *
 * Es la misma tabla que usa el servidor (helpers/retencionHonorarios.helper.js),
 * que es quien decide de verdad: el formulario solo la muestra para que la
 * persona vea el líquido antes de guardar. Ley 21.133: gradualidad hasta 17% en
 * 2028.
 */

const TASAS_POR_ANIO = {
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
};

export function tasaRetencionVigente(fecha) {
  const anio = Number(String(fecha || "").slice(0, 4));

  if (!anio) return 17;
  if (anio >= 2028) return 17;
  if (anio < 2018) return 10;

  return TASAS_POR_ANIO[anio];
}
