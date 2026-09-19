/**
 * Depreciación lineal del activo fijo.
 *
 * Se calculan dos depreciaciones para el mismo bien, y esa es la parte que
 * importa entender:
 *
 * - La **normal** es la financiera: es la que se contabiliza, la que baja el
 *   valor libro del balance y la que se lleva a gasto.
 * - La **acelerada** del artículo 31 N°5 de la Ley de la Renta reduce la vida
 *   útil a un tercio y existe solo para determinar la renta líquida imponible.
 *   No toca el balance. Se guarda en columnas aparte para que la renta anual
 *   no tenga que recalcularla.
 *
 * El método es lineal: (valor de adquisición − valor residual) ÷ vida útil en
 * meses. Es el único que la práctica chilena usa de forma generalizada.
 *
 * REQUIERE VALIDACIÓN CONTABLE Y TRIBUTARIA:
 * - La vida útil de cada bien la fija el contador. `VIDAS_UTILES_SUGERIDAS` es
 *   una ayuda para no partir de cero, tomada de la Resolución Exenta SII N°43
 *   de 2002, y hay que cotejarla con la tabla vigente antes de usarla.
 * - La depreciación acelerada solo procede sobre bienes nuevos o importados y
 *   con vida útil normal de tres años o más. El sistema no lo comprueba: lo
 *   marca quien registra el bien.
 * - El mes de inicio se toma de `fecha_inicio_depreciacion`, incluido.
 */

const { aFechaISO } = require("./fecha.helper");

/**
 * Sugerencias de vida útil normal, en años. Solo eso: sugerencias.
 * REQUIERE VALIDACIÓN TRIBUTARIA contra la tabla vigente del SII.
 */
const VIDAS_UTILES_SUGERIDAS = [
  { categoria: "Construcciones de hormigón", anios: 50 },
  { categoria: "Edificios y construcciones de albañilería", anios: 40 },
  { categoria: "Construcciones de adobe o madera", anios: 20 },
  { categoria: "Instalaciones en general", anios: 10 },
  { categoria: "Maquinarias y equipos en general", anios: 15 },
  { categoria: "Vehículos motorizados en general", anios: 7 },
  { categoria: "Camiones de carga", anios: 7 },
  { categoria: "Muebles y enseres", anios: 7 },
  { categoria: "Sistemas computacionales", anios: 6 },
  { categoria: "Herramientas livianas", anios: 3 },
];

function numero(valor) {
  return Number(valor || 0);
}

function redondear(valor) {
  return Math.round(numero(valor));
}

/**
 * Meses completos transcurridos entre dos períodos AAAA-MM, contando el
 * primero. Enero a enero es 1 mes.
 */
function mesesEntrePeriodos(desde, hasta) {
  const [anioDesde, mesDesde] = String(desde).split("-").map(Number);
  const [anioHasta, mesHasta] = String(hasta).split("-").map(Number);

  if (!anioDesde || !mesDesde || !anioHasta || !mesHasta) return 0;

  return (anioHasta - anioDesde) * 12 + (mesHasta - mesDesde) + 1;
}

function periodoDeFecha(fecha) {
  const iso = aFechaISO(fecha);

  return iso ? iso.slice(0, 7) : null;
}

/**
 * Vida útil acelerada: un tercio de la normal, redondeada hacia abajo y con un
 * mínimo de un mes. El artículo 31 N°5 la permite sobre bienes con vida útil
 * normal de tres años o más.
 */
function vidaUtilAcelerada(vidaUtilMeses) {
  const meses = Math.trunc(numero(vidaUtilMeses));

  if (meses <= 0) return null;

  return Math.max(1, Math.floor(meses / 3));
}

function puedeAcelerar(vidaUtilMeses) {
  return Math.trunc(numero(vidaUtilMeses)) >= 36;
}

/**
 * Depreciación de un bien hasta un período, en una sola pasada.
 *
 * Devuelve la cuota del período y los acumulados, en las dos versiones. La
 * cuota del último mes absorbe la diferencia por redondeo, para que el bien
 * termine exactamente en su valor residual y no en un peso arriba o abajo.
 */
function calcularDepreciacion(activo, periodo) {
  const inicio = periodoDeFecha(activo.fecha_inicio_depreciacion || activo.fecha_adquisicion);
  const depreciable = Math.max(0, redondear(activo.valor_adquisicion) - redondear(activo.valor_residual));
  const vacio = {
    periodo,
    depreciable,
    meses_transcurridos: 0,
    depreciacion_mes: 0,
    acumulada: 0,
    valor_libro: redondear(activo.valor_adquisicion),
    depreciacion_mes_acelerada: 0,
    acumulada_acelerada: 0,
    valor_libro_acelerado: redondear(activo.valor_adquisicion),
    terminado: false,
    motivo: "",
  };

  if (!inicio || !periodo) {
    return { ...vacio, motivo: "El bien no tiene fecha de inicio de depreciación." };
  }

  if (periodo < inicio) {
    return { ...vacio, motivo: `La depreciación empieza en ${inicio}.` };
  }

  // Un bien dado de baja no se sigue depreciando después del mes de la baja.
  const periodoBaja = periodoDeFecha(activo.fecha_baja);

  if (periodoBaja && periodo > periodoBaja) {
    return { ...vacio, motivo: `El bien se dio de baja en ${periodoBaja}.` };
  }

  if (depreciable <= 0) {
    return { ...vacio, motivo: "El valor depreciable es cero.", valor_libro: redondear(activo.valor_residual) };
  }

  function tramo(vidaUtil) {
    const meses = Math.trunc(numero(vidaUtil));

    if (meses <= 0) {
      return { cuotaMes: 0, acumulada: 0, terminado: true };
    }

    const transcurridos = mesesEntrePeriodos(inicio, periodo);
    const cuota = Math.floor(depreciable / meses);

    if (transcurridos > meses) {
      // Ya estaba totalmente depreciado antes de este período.
      return { cuotaMes: 0, acumulada: depreciable, terminado: true };
    }

    // El último mes cierra la diferencia del redondeo.
    const cuotaMes = transcurridos === meses ? depreciable - cuota * (meses - 1) : cuota;
    const acumulada = transcurridos === meses ? depreciable : cuota * transcurridos;

    return { cuotaMes, acumulada, terminado: transcurridos >= meses };
  }

  const normal = tramo(activo.vida_util_meses);
  const aceleradaAplica =
    Boolean(activo.aplica_acelerada) &&
    (activo.vida_util_acelerada_meses || vidaUtilAcelerada(activo.vida_util_meses));
  const acelerada = aceleradaAplica
    ? tramo(activo.vida_util_acelerada_meses || vidaUtilAcelerada(activo.vida_util_meses))
    : normal;

  const residual = redondear(activo.valor_residual);

  return {
    periodo,
    depreciable,
    meses_transcurridos: mesesEntrePeriodos(inicio, periodo),
    depreciacion_mes: normal.cuotaMes,
    acumulada: normal.acumulada,
    valor_libro: redondear(activo.valor_adquisicion) - normal.acumulada,
    depreciacion_mes_acelerada: acelerada.cuotaMes,
    acumulada_acelerada: acelerada.acumulada,
    valor_libro_acelerado: redondear(activo.valor_adquisicion) - acelerada.acumulada,
    valor_residual: residual,
    terminado: normal.terminado,
    motivo: normal.cuotaMes === 0 && normal.terminado ? "El bien ya está totalmente depreciado." : "",
  };
}

/**
 * Cuadro de depreciación de un bien, mes a mes, para mostrar en su ficha.
 */
function cuadroDepreciacion(activo, hastaPeriodo) {
  const inicio = periodoDeFecha(activo.fecha_inicio_depreciacion || activo.fecha_adquisicion);

  if (!inicio) return [];

  const vidaUtil = Math.trunc(numero(activo.vida_util_meses));
  const total = Math.min(vidaUtil, hastaPeriodo ? mesesEntrePeriodos(inicio, hastaPeriodo) : vidaUtil);
  const filas = [];
  let [anio, mes] = inicio.split("-").map(Number);

  for (let indice = 0; indice < Math.max(0, total); indice += 1) {
    const periodo = `${anio}-${String(mes).padStart(2, "0")}`;

    filas.push(calcularDepreciacion(activo, periodo));

    mes += 1;

    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }

  return filas;
}

module.exports = {
  VIDAS_UTILES_SUGERIDAS,
  mesesEntrePeriodos,
  periodoDeFecha,
  vidaUtilAcelerada,
  puedeAcelerar,
  calcularDepreciacion,
  cuadroDepreciacion,
};
