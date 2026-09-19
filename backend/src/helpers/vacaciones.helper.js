/**
 * Vacaciones: devengo, uso y valor del día, en días hábiles.
 *
 * El feriado legal son 15 días hábiles por año (artículo 67 del Código del
 * Trabajo) y el sábado se cuenta como inhábil (artículo 69). El sistema
 * devengaba en hábiles y descontaba en días corridos: dos semanas de
 * vacaciones, que son 10 hábiles, se descontaban como 12. Además no existía el
 * feriado progresivo (artículo 68: un día más por cada tres nuevos años
 * después de diez años de cotizaciones) y el día se valorizaba con el sueldo
 * base dividido en 30 cuando el artículo 71 pide la remuneración íntegra.
 *
 * REQUIERE VALIDACIÓN LABORAL: la remuneración íntegra se toma como sueldo
 * base más gratificación legal mensual; los haberes variables no se
 * promedian todavía.
 */

const pool = require("../database/db");
const { feriadosDelAnio } = require("./calendarioTributario.helper");

const DIA = 86400000;

function numero(valor) {
  return Number(valor || 0);
}

function aISO(fecha) {
  if (!fecha) return null;

  if (fecha instanceof Date) {
    if (Number.isNaN(fecha.getTime())) return null;

    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(
      fecha.getDate()
    ).padStart(2, "0")}`;
  }

  const texto = String(fecha).slice(0, 10);

  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
}

function utc(iso) {
  return new Date(`${iso}T00:00:00Z`);
}

function esHabil(fechaUtc) {
  const dia = fechaUtc.getUTCDay();

  if (dia === 0 || dia === 6) return false;

  return !feriadosDelAnio(fechaUtc.getUTCFullYear()).has(fechaUtc.toISOString().slice(0, 10));
}

/**
 * Días hábiles entre dos fechas, ambas incluidas.
 */
function contarDiasHabiles(desde, hasta) {
  const inicio = aISO(desde);
  const fin = aISO(hasta);

  if (!inicio || !fin || fin < inicio) return 0;

  let cursor = utc(inicio);
  const limite = utc(fin);
  let habiles = 0;

  while (cursor <= limite) {
    if (esHabil(cursor)) habiles += 1;
    cursor = new Date(cursor.getTime() + DIA);
  }

  return habiles;
}

/**
 * Cuántos días corridos abarcan N días hábiles contados desde el día
 * siguiente a una fecha. Es lo que se paga en un finiquito: los hábiles
 * pendientes proyectados sobre el calendario.
 */
function habilesACorridos(desde, diasHabiles) {
  const inicio = aISO(desde);
  const pendientes = numero(diasHabiles);

  if (!inicio || pendientes <= 0) return 0;

  const completos = Math.floor(pendientes);
  const fraccion = Math.round((pendientes - completos) * 100) / 100;
  let cursor = new Date(utc(inicio).getTime() + DIA);
  let habiles = 0;
  let corridos = 0;

  while (habiles < completos && corridos < 500) {
    corridos += 1;
    if (esHabil(cursor)) habiles += 1;
    cursor = new Date(cursor.getTime() + DIA);
  }

  return Math.round((corridos + fraccion) * 100) / 100;
}

function mesesEntre(fechaIngreso, fechaCorte) {
  const inicio = aISO(fechaIngreso);
  const corte = aISO(fechaCorte);

  if (!inicio || !corte || corte < inicio) return 0;

  const [ai, mi, di] = inicio.split("-").map(Number);
  const [ac, mc, dc] = corte.split("-").map(Number);
  const mesesBase = (ac - ai) * 12 + (mc - mi);
  const incluyeMes = dc >= di ? 1 : 0;

  return Math.max(0, mesesBase + incluyeMes);
}

/**
 * Días de feriado progresivo por año: uno por cada tres años después de diez
 * de cotizaciones, contando los años previos que el trabajador acredite.
 */
function diasProgresivosPorAnio(fechaIngreso, fechaCorte, aniosCotizadosPrevios = 0) {
  const aniosEnEmpresa = mesesEntre(fechaIngreso, fechaCorte) / 12;
  const totales = numero(aniosCotizadosPrevios) + aniosEnEmpresa;

  if (totales <= 10) return 0;

  return Math.floor((totales - 10) / 3);
}

/**
 * Días hábiles devengados desde el ingreso hasta la fecha de corte: 15 al año
 * más el progresivo, prorrateados por mes.
 */
function calcularVacacionesDevengadas(fechaIngreso, fechaCorte, aniosCotizadosPrevios = 0) {
  const meses = mesesEntre(fechaIngreso, fechaCorte);

  if (meses <= 0) return 0;

  const porAnio = 15 + diasProgresivosPorAnio(fechaIngreso, fechaCorte, aniosCotizadosPrevios);

  return Math.round((meses * porAnio) / 12 * 100) / 100;
}

/**
 * Valor de un día de vacaciones: remuneración íntegra mensual dividida en 30.
 * REQUIERE VALIDACIÓN LABORAL (ver cabecera).
 */
function valorDiaVacaciones({ sueldo_base, gratificacion_mensual = 0 }) {
  return Math.round((numero(sueldo_base) + numero(gratificacion_mensual)) / 30);
}

async function calcularVacacionesPendientesFiniquito({
  empresa_id,
  trabajador_id,
  fecha_termino,
  sueldo_base,
  gratificacion_mensual = 0,
}) {
  const trabajadorResult = await pool.query(
    `SELECT id, rut, nombres, apellidos, cargo, fecha_ingreso, sueldo_base,
            COALESCE(anios_cotizados_previos, 0) AS anios_cotizados_previos
     FROM trabajadores
     WHERE empresa_id = $1 AND id = $2
     LIMIT 1`,
    [empresa_id, trabajador_id]
  );

  if (trabajadorResult.rows.length === 0) {
    throw Object.assign(new Error("Trabajador no encontrado para calcular vacaciones"), {
      statusCode: 404,
    });
  }

  const trabajador = trabajadorResult.rows[0];
  const fechaCorte = aISO(fecha_termino) || aISO(new Date());

  const usadosResult = await pool.query(
    `SELECT COALESCE(SUM(dias), 0) AS dias_usados
     FROM vacaciones_ausencias
     WHERE empresa_id = $1 AND trabajador_id = $2 AND estado = 'vigente' AND descuenta_vacaciones = true`,
    [empresa_id, trabajador_id]
  );

  const diasDevengados = calcularVacacionesDevengadas(
    trabajador.fecha_ingreso,
    fechaCorte,
    trabajador.anios_cotizados_previos
  );
  const diasUsados = numero(usadosResult.rows[0]?.dias_usados);
  const diasPendientes = Math.round((diasDevengados - diasUsados) * 100) / 100;
  const diasAPagarHabiles = diasPendientes > 0 ? diasPendientes : 0;
  const diasAPagarCorridos = habilesACorridos(fechaCorte, diasAPagarHabiles);
  const valorDia = valorDiaVacaciones({
    sueldo_base: sueldo_base || trabajador.sueldo_base,
    gratificacion_mensual,
  });

  return {
    fecha_corte: fechaCorte,
    fecha_ingreso: trabajador.fecha_ingreso,
    dias_devengados: diasDevengados,
    dias_progresivos_por_anio: diasProgresivosPorAnio(
      trabajador.fecha_ingreso,
      fechaCorte,
      trabajador.anios_cotizados_previos
    ),
    dias_usados: diasUsados,
    dias_pendientes: diasPendientes,
    // Lo que se paga: los hábiles pendientes llevados a corridos.
    dias_a_pagar: diasAPagarCorridos,
    dias_a_pagar_habiles: diasAPagarHabiles,
    valor_dia_vacaciones: valorDia,
    monto_vacaciones_pendientes: Math.round(valorDia * diasAPagarCorridos),
    alerta_saldo_negativo: diasPendientes < 0,
  };
}

module.exports = {
  contarDiasHabiles,
  habilesACorridos,
  mesesEntre,
  calcularMesesLaborales: mesesEntre,
  diasProgresivosPorAnio,
  calcularVacacionesDevengadas,
  valorDiaVacaciones,
  calcularVacacionesPendientesFiniquito,
};
