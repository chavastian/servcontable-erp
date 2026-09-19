/**
 * Cálculo del finiquito en el servidor.
 *
 * Hasta ahora lo calculaba el navegador y el servidor sumaba lo que llegara:
 * cualquier usuario con permiso de remuneraciones podía guardar un finiquito
 * con cualquier monto, la lógica laboral no tenía pruebas, y faltaban el tope
 * de 90 UF, el descuento del seguro de cesantía y el impuesto sobre lo que
 * excede la indemnización legal.
 *
 * Del cliente se aceptan los supuestos: causal, fechas, si hubo aviso, días
 * del mes, montos voluntarios y descuentos. Todo lo demás se calcula aquí.
 *
 * Reglas (Código del Trabajo salvo indicación):
 * - Artículo 172: la última remuneración mensual es el sueldo base más las
 *   regalías fijas; se toma sueldo base más gratificación legal mensual más
 *   haberes imponibles fijos. Excluye horas extra. Tope 90 UF.
 * - Artículo 163: un mes por año, fracción superior a seis meses cuenta como
 *   año, tope 11 años. Solo con más de un año de contrato.
 * - Artículo 162 inciso 4: sustitutiva del aviso previo cuando no hubo aviso
 *   con 30 días, en causal del artículo 161.
 * - Ley 21.122: obra o faena, 2,5 días por mes en el artículo 159 N°5.
 * - Ley 19.728 artículo 13: en el artículo 161 se descuenta de la
 *   indemnización lo aportado por el empleador a la cuenta individual de
 *   cesantía. Sin historial de aportes se estima con 1,6% del imponible por
 *   mes; se puede indicar el monto real. REQUIERE VALIDACIÓN LABORAL.
 * - Artículo 178 y Ley de la Renta artículo 17 N°13: la indemnización legal
 *   no es renta; lo voluntario que excede tributa impuesto único.
 *   REQUIERE VALIDACIÓN TRIBUTARIA: la comparación con el promedio de 24
 *   meses no se hace todavía.
 */

const { exigirDeEmpresa } = require("./empresa.helper");
const { calcularVacacionesPendientesFiniquito, mesesEntre } = require("./vacaciones.helper");
const { obtenerParametrosOAnteriores } = require("./parametrosNacionales.helper");
const { calcularImpuestoUnicoLegal } = require("./impuestoUnicoLegal.helper");
const { aFechaISO, diasDesdeHasta } = require("./fecha.helper");

const TOPE_UF = 90;
const TOPE_ANIOS = 11;
const TASA_CIC_EMPLEADOR = 0.016;

function numero(valor) {
  return Number(valor || 0);
}

function redondear(valor) {
  return Math.round(numero(valor));
}

function textoCausal(causal) {
  return String(causal || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function reglaPorCausal(causal, tipoContrato) {
  const t = textoCausal(causal);
  const contrato = textoCausal(tipoContrato);
  const obraFaena = contrato.includes("obra") || contrato.includes("faena");
  const es161 = t.includes("161") || t.includes("necesidades de la empresa") || t.includes("desahucio");
  const es160 = t.includes("160");
  const es159n5 = t.includes("159") && (t.includes("nro.5") || t.includes("n°5") || t.includes("nro 5") || t.includes("n 5") || t.includes("conclusion del trabajo") || t.includes("conclusion de la obra"));

  if (es161) {
    return { articulo: "Art. 161", pagaAvisoPrevio: true, pagaIndemnizacionAnios: true, pagaObraFaena: false, descuentaAfc: true };
  }

  if (es159n5) {
    return { articulo: "Art. 159 N°5", pagaAvisoPrevio: false, pagaIndemnizacionAnios: false, pagaObraFaena: obraFaena, descuentaAfc: false };
  }

  if (es160) {
    return { articulo: "Art. 160", pagaAvisoPrevio: false, pagaIndemnizacionAnios: false, pagaObraFaena: false, descuentaAfc: false };
  }

  return { articulo: "Art. 159", pagaAvisoPrevio: false, pagaIndemnizacionAnios: false, pagaObraFaena: false, descuentaAfc: false };
}

function tiempoDeServicio(fechaIngreso, fechaTermino) {
  const inicio = aFechaISO(fechaIngreso);
  const termino = aFechaISO(fechaTermino);

  if (!inicio || !termino || termino < inicio) {
    return { anios: 0, meses: 0, dias: 0, mesesTotales: 0, aniosReconocidos: 0 };
  }

  const [ai, mi, di] = inicio.split("-").map(Number);
  const [at, mt, dt] = termino.split("-").map(Number);
  let mesesTotales = (at - ai) * 12 + (mt - mi);

  if (dt < di) mesesTotales -= 1;

  const fechaMesCompleto = new Date(Date.UTC(ai, mi - 1 + mesesTotales, di));
  const dias = Math.max(0, Math.round((Date.parse(`${termino}T00:00:00Z`) - fechaMesCompleto.getTime()) / 86400000));
  const anios = Math.floor(mesesTotales / 12);
  const meses = mesesTotales % 12;
  const fraccionMayorASeis = meses > 6 || (meses === 6 && dias > 0);
  const aniosReconocidos = mesesTotales >= 12 ? Math.min(TOPE_ANIOS, anios + (fraccionMayorASeis ? 1 : 0)) : 0;

  return { anios, meses, dias, mesesTotales, aniosReconocidos };
}

async function haberesImponiblesFijos(client, empresaId, trabajadorId, periodo) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(monto), 0) AS total
     FROM haberes_descuentos_remuneraciones
     WHERE empresa_id = $1 AND trabajador_id = $2 AND estado = 'vigente'
       AND tipo = 'HABER_IMPONIBLE' AND COALESCE(recurrente, false) = true AND periodo <= $3`,
    [empresaId, trabajadorId, periodo]
  );

  return numero(rows[0]?.total);
}

async function calcularFiniquito(client, entradas) {
  const {
    empresa_id,
    trabajador_id,
    fecha_termino,
    causal,
    fecha_aviso,
    hubo_aviso_30_dias = false,
    dias_trabajados_mes,
    incluir_liquidacion_pendiente = false,
    sueldo_pendiente,
    base_indemnizacion,
    indemnizacion_voluntaria = 0,
    otros_haberes = 0,
    otros_descuentos = 0,
    descuentos = 0,
    seguro_cesantia_descuento,
  } = entradas;

  if (!empresa_id || !trabajador_id || !fecha_termino || !causal) {
    throw Object.assign(new Error("Debe indicar empresa, trabajador, fecha de término y causal"), { statusCode: 400 });
  }

  const trabajador = await exigirDeEmpresa(client, "trabajadores", trabajador_id, empresa_id);
  const fechaTermino = aFechaISO(fecha_termino);
  const periodo = fechaTermino.slice(0, 7);
  const avisos = [];

  const { parametros } = await obtenerParametrosOAnteriores(client, periodo);
  const configuracion = await client.query(
    `SELECT valor_uf, ingreso_minimo, indicadores_previsionales FROM configuracion_remuneraciones WHERE empresa_id = $1 AND periodo = $2`,
    [empresa_id, periodo]
  );
  const config = configuracion.rows[0] || {};
  const valorUf = numero(config.valor_uf) || numero(parametros?.valor_uf);
  const ingresoMinimo = numero(config.ingreso_minimo) || numero(parametros?.ingreso_minimo);
  const utm = numero(config.indicadores_previsionales?.valor_utm) || numero(parametros?.valor_utm);

  if (!valorUf) {
    avisos.push("No hay UF para el período: el tope de 90 UF de la indemnización no se pudo aplicar. REQUIERE VALIDACIÓN.");
  }

  const regla = reglaPorCausal(causal, trabajador.tipo_contrato);
  const tiempo = tiempoDeServicio(trabajador.fecha_ingreso, fechaTermino);
  const sueldoBase = numero(trabajador.sueldo_base);

  // Gratificación legal mensual con tope, igual que en la liquidación.
  const gratificacionSinTope = Math.round(sueldoBase * 0.25);
  const gratificacionMensual =
    ingresoMinimo > 0 ? Math.min(gratificacionSinTope, Math.round((4.75 * ingresoMinimo) / 12)) : gratificacionSinTope;
  const fijos = await haberesImponiblesFijos(client, empresa_id, trabajador_id, periodo);

  // Base indemnizatoria (artículo 172): sueldo base, gratificación y haberes
  // fijos. Nunca horas extra. Con tope de 90 UF.
  let baseSinTope = numero(base_indemnizacion) > 0 ? numero(base_indemnizacion) : sueldoBase + gratificacionMensual + fijos;
  const topePesos = valorUf > 0 ? Math.round(TOPE_UF * valorUf) : null;
  const topeAplicado = topePesos !== null && baseSinTope > topePesos;
  const baseIndemnizacion = topeAplicado ? topePesos : baseSinTope;

  // Aviso previo: 30 días de anticipación cuentan desde la fecha de aviso.
  const diasDeAviso = fecha_aviso ? diasDesdeHasta(fecha_aviso, fechaTermino) : null;
  const huboAviso = Boolean(hubo_aviso_30_dias) || (diasDeAviso !== null && diasDeAviso >= 30);

  let indemnizacionAviso = 0;
  let indemnizacionAnios = 0;
  let aniosServicio = 0;
  let observacionAviso = "No aplica aviso previo para esta causal.";
  let observacionAnios = "No corresponde indemnización legal por esta causal, salvo pacto o monto voluntario.";

  if (regla.pagaIndemnizacionAnios) {
    aniosServicio = tiempo.aniosReconocidos;
    indemnizacionAnios = Math.round(baseIndemnizacion * aniosServicio);
    indemnizacionAviso = huboAviso ? 0 : Math.round(baseIndemnizacion);
    observacionAviso = huboAviso
      ? `Aviso con ${diasDeAviso !== null ? diasDeAviso : 30} días o más: no corresponde sustitutiva.`
      : `${regla.articulo} sin aviso de 30 días: una remuneración mensual de ${baseIndemnizacion.toLocaleString("es-CL")} (artículo 162 inciso 4).`;
    observacionAnios = `${regla.articulo}: ${aniosServicio} año(s) reconocidos sobre ${tiempo.anios} año(s) y ${tiempo.meses} mes(es). Base ${baseIndemnizacion.toLocaleString("es-CL")}${topeAplicado ? " (tope de 90 UF aplicado)" : ""}. Fracción superior a seis meses cuenta un año; tope 11 años.`;
  } else if (regla.pagaObraFaena) {
    const mesesCompletos = tiempo.anios * 12 + tiempo.meses;
    const mesesIndemnizables = mesesCompletos < 1 ? 0 : mesesCompletos + (tiempo.dias > 15 ? 1 : 0);
    aniosServicio = mesesIndemnizables;
    indemnizacionAnios = Math.round(mesesIndemnizables * 2.5 * (baseIndemnizacion / 30));
    observacionAviso = "No aplica aviso previo en el artículo 159 N°5.";
    observacionAnios = `Obra o faena (Ley 21.122): ${mesesIndemnizables} mes(es) por 2,5 días sobre ${baseIndemnizacion.toLocaleString("es-CL")}.`;
  }

  // Vacaciones pendientes, en hábiles llevados a corridos.
  const vacaciones = await calcularVacacionesPendientesFiniquito({
    empresa_id,
    trabajador_id,
    fecha_termino: fechaTermino,
    sueldo_base: sueldoBase,
    gratificacion_mensual: gratificacionMensual,
  });

  // Sueldo del mes de término.
  let sueldoPendiente;
  let diasMes = dias_trabajados_mes !== undefined && dias_trabajados_mes !== null && dias_trabajados_mes !== ""
    ? numero(dias_trabajados_mes)
    : Number(fechaTermino.slice(8, 10));
  let observacionSueldo = `${diasMes} día(s) del mes de término sobre ${sueldoBase.toLocaleString("es-CL")}.`;

  if (incluir_liquidacion_pendiente) {
    const liquidacion = await client.query(
      `SELECT liquido_pagar, dias_trabajados, periodo FROM liquidaciones
       WHERE empresa_id = $1 AND trabajador_id = $2 AND periodo = $3 AND estado = 'emitida'
       ORDER BY id DESC LIMIT 1`,
      [empresa_id, trabajador_id, periodo]
    );

    if (liquidacion.rows[0]) {
      sueldoPendiente = redondear(liquidacion.rows[0].liquido_pagar);
      diasMes = numero(liquidacion.rows[0].dias_trabajados || diasMes);
      observacionSueldo = `Líquido de la liquidación ${periodo}: ${sueldoPendiente.toLocaleString("es-CL")}.`;
    } else {
      avisos.push(`No hay liquidación emitida en ${periodo} para incluir; se calcula por días.`);
    }
  }

  if (sueldoPendiente === undefined) {
    sueldoPendiente = sueldo_pendiente !== undefined && sueldo_pendiente !== null && sueldo_pendiente !== ""
      ? redondear(sueldo_pendiente)
      : Math.round((sueldoBase / 30) * Math.min(30, diasMes));
  }

  // Seguro de cesantía: lo aportado por el empleador a la cuenta individual
  // se descuenta de la indemnización por años de servicio (artículo 161).
  let descuentoAfc = 0;
  let observacionDescuentos = "";

  if (regla.descuentaAfc && indemnizacionAnios > 0) {
    if (seguro_cesantia_descuento !== undefined && seguro_cesantia_descuento !== null && seguro_cesantia_descuento !== "") {
      descuentoAfc = redondear(seguro_cesantia_descuento);
      observacionDescuentos = "Aporte del empleador a la cuenta de cesantía informado a mano.";
    } else {
      const mesesCotizados = Math.min(tiempo.mesesTotales, TOPE_ANIOS * 12);
      descuentoAfc = Math.min(indemnizacionAnios, Math.round(sueldoBase * TASA_CIC_EMPLEADOR * mesesCotizados));
      observacionDescuentos = `Aporte del empleador a la cuenta de cesantía estimado en 1,6% por ${mesesCotizados} mes(es). Reemplázalo por el certificado de la AFC. REQUIERE VALIDACIÓN LABORAL.`;
      avisos.push(observacionDescuentos);
    }
  }

  // Impuesto único sobre lo que excede la indemnización legal.
  const excedente = redondear(indemnizacion_voluntaria);
  let impuesto = 0;

  if (excedente > 0) {
    if (utm > 0) {
      impuesto = calcularImpuestoUnicoLegal(excedente, utm).impuesto;
      avisos.push("La indemnización voluntaria tributa impuesto único sobre el excedente de lo legal (artículo 17 N°13 de la Ley de la Renta). Calculado con la tabla en UTM del mes. REQUIERE VALIDACIÓN TRIBUTARIA: no se comparó con el promedio de 24 meses.");
    } else {
      avisos.push("Hay indemnización voluntaria y no se conoce la UTM del período: no se calculó el impuesto único sobre el excedente.");
    }
  }

  const totalHaberes = sueldoPendiente + vacaciones.monto_vacaciones_pendientes + indemnizacionAviso + indemnizacionAnios + excedente + redondear(otros_haberes);
  const totalDescuentos = redondear(descuentos) + descuentoAfc + redondear(otros_descuentos) + impuesto;
  const totalFiniquito = totalHaberes - totalDescuentos;

  return {
    trabajador: {
      id: trabajador.id,
      rut: trabajador.rut,
      nombres: trabajador.nombres,
      apellidos: trabajador.apellidos,
      fecha_ingreso: aFechaISO(trabajador.fecha_ingreso),
      tipo_contrato: trabajador.tipo_contrato,
    },
    regla: regla.articulo,
    calculo: {
      periodo,
      fecha_termino: fechaTermino,
      fecha_aviso: aFechaISO(fecha_aviso),
      causal,
      hubo_aviso_30_dias: huboAviso,
      dias_trabajados_mes: diasMes,
      sueldo_base: sueldoBase,
      sueldo_pendiente: sueldoPendiente,

      vacaciones_pendientes: vacaciones.dias_a_pagar,
      valor_dia_vacaciones: vacaciones.valor_dia_vacaciones,
      base_vacaciones: sueldoBase + gratificacionMensual,
      vacaciones_proporcionales: vacaciones.monto_vacaciones_pendientes,
      dias_vacaciones_devengadas: vacaciones.dias_devengados,
      dias_vacaciones_usadas: vacaciones.dias_usados,
      dias_vacaciones_pendientes: vacaciones.dias_pendientes,
      dias_vacaciones_a_pagar: vacaciones.dias_a_pagar,
      monto_vacaciones_pendientes: vacaciones.monto_vacaciones_pendientes,

      sueldo_indemnizable: baseIndemnizacion,
      base_indemnizacion: baseIndemnizacion,
      base_indemnizacion_sin_tope: baseSinTope,
      tope_90_uf_aplicado: topeAplicado,
      valor_uf: valorUf || null,
      anios_servicio: aniosServicio,
      meses_servicio: tiempo.meses,
      dias_servicio: tiempo.dias,
      indemnizacion_aviso_previo: indemnizacionAviso,
      indemnizacion_anios_servicio: indemnizacionAnios,
      indemnizacion_voluntaria: excedente,

      otros_haberes: redondear(otros_haberes),
      descuentos: redondear(descuentos),
      seguro_cesantia_descuento: descuentoAfc,
      otros_descuentos: redondear(otros_descuentos),
      impuesto_unico_finiquito: impuesto,

      total_haberes: totalHaberes,
      total_descuentos: totalDescuentos,
      total_finiquito: totalFiniquito,

      observacion_sueldo_pendiente: observacionSueldo,
      observacion_vacaciones: `${vacaciones.dias_a_pagar_habiles} día(s) hábiles pendientes, ${vacaciones.dias_a_pagar} corridos desde el día siguiente al término, a ${vacaciones.valor_dia_vacaciones.toLocaleString("es-CL")} por día.`,
      observacion_aviso_previo: observacionAviso,
      observacion_anios_servicio: observacionAnios,
      observacion_indemnizacion_voluntaria: excedente > 0 ? `Impuesto único sobre el excedente: ${impuesto.toLocaleString("es-CL")}.` : "",
      observacion_descuentos: observacionDescuentos,
    },
    avisos,
  };
}

module.exports = { calcularFiniquito, reglaPorCausal, tiempoDeServicio, TOPE_UF, TOPE_ANIOS };
