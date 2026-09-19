/**
 * Calendario de obligaciones tributarias y previsionales.
 *
 * El contador las sabe de memoria, pero en un estudio con veinte empresas la
 * memoria falla justo en la semana en que se juntan el F29, Previred y el pago
 * de las retenciones. Multa por atraso hay siempre.
 *
 * REQUIERE VALIDACIÓN TRIBUTARIA
 * ------------------------------
 * Las fechas legales se mueven. Cuando el vencimiento cae sábado, domingo o
 * festivo pasa al día hábil siguiente, y los festivos chilenos cambian cada
 * año: algunos son móviles por la Ley 19.973 y otros dependen de la Pascua. El
 * SII además prorroga plazos por resolución. Acá se calculan los festivos de
 * fecha fija y los de Semana Santa, que son deterministas, y **todo lo demás
 * queda marcado para que una persona lo confirme**. Este calendario recuerda, no
 * reemplaza el aviso oficial.
 *
 * Fuentes que hay que confirmar cada año: calendario del SII (sii.cl), plazos de
 * Previred y el listado de feriados legales.
 */

const DIA = 86400000;

/**
 * Domingo de Pascua por el algoritmo de Meeus/Butcher. Es aritmética pura, no
 * cambia por resolución de nadie.
 */
function domingoDePascua(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(Date.UTC(anio, mes - 1, dia));
}

function comoFecha(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Feriados chilenos de fecha fija, más Viernes Santo y Sábado Santo.
 *
 * Quedan fuera a propósito los móviles (San Pedro y San Pablo, Virgen del
 * Carmen cuando corre la ley de traslado, Día de la Raza) y cualquier feriado
 * regional o decretado. Por eso toda fecha calculada viaja con un aviso.
 */
function trasladar(fecha, dias) {
  return new Date(fecha.getTime() + dias * DIA);
}

/**
 * Ley 19.668: 29 de junio y 12 de octubre se corren al lunes cuando caen
 * martes, miércoles o jueves (al anterior) o viernes (al siguiente).
 */
function trasladadoALunes(fecha) {
  const dia = fecha.getUTCDay();

  if (dia === 2) return trasladar(fecha, -1);
  if (dia === 3) return trasladar(fecha, -2);
  if (dia === 4) return trasladar(fecha, -3);
  if (dia === 5) return trasladar(fecha, 3);

  return fecha;
}

/**
 * Ley 20.299: el 31 de octubre se corre al viernes anterior si cae martes y
 * al viernes siguiente si cae miércoles.
 */
function trasladadoAViernes(fecha) {
  const dia = fecha.getUTCDay();

  if (dia === 2) return trasladar(fecha, -4);
  if (dia === 3) return trasladar(fecha, 2);

  return fecha;
}

/**
 * Ley 21.357: el Día de los Pueblos Indígenas es el del solsticio de invierno,
 * 20 o 21 de junio según el año. Desde 2024 cae el 20 en los años múltiplos
 * de 4 y en el siguiente, y el 21 en los otros dos; antes de 2024 fue el 21.
 * REQUIERE VALIDACIÓN: cotejar con el decreto de cada año.
 */
function diaSolsticioJunio(anio) {
  if (anio < 2024) return 21;

  return anio % 4 <= 1 ? 20 : 21;
}

function feriadosDelAnio(anio) {
  const pascua = domingoDePascua(anio);

  const fijos = [
    [1, 1], // Año Nuevo
    [5, 1], // Día del Trabajo
    [5, 21], // Glorias Navales
    [7, 16], // Virgen del Carmen
    [8, 15], // Asunción de la Virgen
    [9, 18], // Independencia
    [9, 19], // Glorias del Ejército
    [11, 1], // Todos los Santos
    [12, 8], // Inmaculada Concepción
    [12, 25], // Navidad
  ];

  const feriados = new Set(
    fijos.map(([mes, dia]) => comoFecha(new Date(Date.UTC(anio, mes - 1, dia))))
  );

  feriados.add(comoFecha(new Date(pascua.getTime() - 2 * DIA))); // Viernes Santo
  feriados.add(comoFecha(new Date(pascua.getTime() - 1 * DIA))); // Sábado Santo

  // Antes el 20 de junio era fijo, y el 29 de junio, el 12 de octubre y el
  // 31 de octubre se ignoraban o se tomaban sin traslado.
  feriados.add(comoFecha(new Date(Date.UTC(anio, 5, diaSolsticioJunio(anio)))));
  feriados.add(comoFecha(trasladadoALunes(new Date(Date.UTC(anio, 5, 29))))); // San Pedro y San Pablo
  feriados.add(comoFecha(trasladadoALunes(new Date(Date.UTC(anio, 9, 12))))); // Encuentro de Dos Mundos
  feriados.add(comoFecha(trasladadoAViernes(new Date(Date.UTC(anio, 9, 31))))); // Iglesias Evangélicas

  // Ley 20.215: cuando el 18 cae martes el lunes 17 es feriado; cuando cae
  // miércoles lo es el viernes 20.
  const dia18 = new Date(Date.UTC(anio, 8, 18)).getUTCDay();

  if (dia18 === 2) feriados.add(comoFecha(new Date(Date.UTC(anio, 8, 17))));
  if (dia18 === 3) feriados.add(comoFecha(new Date(Date.UTC(anio, 8, 20))));

  return feriados;
}

/**
 * Corre la fecha al día hábil siguiente si cae fin de semana o festivo conocido.
 *
 * Devuelve también si tuvo que moverla, porque el traslado es justo la parte que
 * conviene que una persona confirme.
 */
function proximoDiaHabil(fechaISO) {
  const anio = Number(String(fechaISO).slice(0, 4));
  const feriados = feriadosDelAnio(anio);

  let fecha = new Date(`${fechaISO}T00:00:00Z`);
  let movida = false;
  let vueltas = 0;

  while (vueltas < 10) {
    const dia = fecha.getUTCDay();
    const esFinDeSemana = dia === 0 || dia === 6;
    const esFeriado = feriados.has(comoFecha(fecha));

    if (!esFinDeSemana && !esFeriado) break;

    fecha = new Date(fecha.getTime() + DIA);
    movida = true;
    vueltas += 1;
  }

  return { fecha: comoFecha(fecha), movida };
}

function sumarMes(periodo, meses = 1) {
  const anio = Number(String(periodo).slice(0, 4));
  const mes = Number(String(periodo).slice(5, 7));
  const d = new Date(Date.UTC(anio, mes - 1 + meses, 1));

  return d.toISOString().slice(0, 7);
}

function fechaEn(periodo, dia) {
  const anio = Number(String(periodo).slice(0, 4));
  const mes = Number(String(periodo).slice(5, 7));
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();

  return comoFecha(new Date(Date.UTC(anio, mes - 1, Math.min(dia, ultimo))));
}

function diasHasta(fechaISO, hoy) {
  const objetivo = Date.parse(`${fechaISO}T00:00:00Z`);
  const referencia = Date.parse(`${String(hoy).slice(0, 10)}T00:00:00Z`);

  return Math.round((objetivo - referencia) / DIA);
}

/**
 * Obligaciones del período indicado, con su fecha de vencimiento.
 *
 * `facturadorElectronico` cambia el plazo del F29: quien emite solo documentos
 * electrónicos y paga por internet declara hasta el 20; el resto, hasta el 12.
 * `previredElectronico` mueve el pago de cotizaciones del 10 al 13.
 */
function obligacionesDelPeriodo(
  periodo,
  { facturadorElectronico = true, previredElectronico = true, hoy = null } = {}
) {
  const referencia = hoy || new Date().toISOString().slice(0, 10);
  const siguiente = sumarMes(periodo, 1);
  const anio = Number(String(periodo).slice(0, 4));
  const mes = Number(String(periodo).slice(5, 7));

  const base = [
    {
      codigo: "f29",
      titulo: "F29 — IVA y PPM",
      descripcion:
        "Declaración y pago mensual del IVA. Incluye el pago provisional mensual y las retenciones del mes.",
      organismo: "SII",
      dia: facturadorElectronico ? 20 : 12,
      nota: facturadorElectronico
        ? "Plazo al 20 por emitir solo documentos electrónicos y pagar por internet."
        : "Plazo al 12. Con facturación electrónica y pago por internet se extiende al 20.",
    },
    {
      codigo: "cotizaciones",
      titulo: "Cotizaciones previsionales (Previred)",
      descripcion:
        "Pago de AFP, salud, seguro de cesantía y mutual de las remuneraciones del mes.",
      organismo: "Previred",
      dia: previredElectronico ? 13 : 10,
      nota: previredElectronico
        ? "Plazo al 13 por pago electrónico en Previred."
        : "Plazo al 10 para pago en papel.",
    },
    {
      codigo: "lre",
      titulo: "Libro de Remuneraciones Electrónico",
      descripcion: "Envío mensual del libro de remuneraciones a la Dirección del Trabajo.",
      organismo: "Dirección del Trabajo",
      dia: 15,
      nota: "Obligatorio para empleadores con cinco o más trabajadores.",
    },
  ];

  // Obligaciones anuales, según el mes del período.
  const anuales = [];

  if (mes === 3) {
    anuales.push({
      codigo: "declaraciones_juradas",
      titulo: "Declaraciones juradas anuales",
      descripcion:
        "Declaraciones juradas del año anterior (honorarios, sueldos, retenciones, entre otras).",
      organismo: "SII",
      vence: `${anio}-03-31`,
      nota: "Cada declaración jurada tiene su propia fecha, entre marzo y junio. Confirmar en el SII.",
    });
  }

  if (mes === 4) {
    anuales.push({
      codigo: "f22",
      titulo: "F22 — Renta anual",
      descripcion: `Declaración de renta del año tributario ${anio}.`,
      organismo: "SII",
      vence: `${anio}-04-30`,
      nota: "El plazo cambia si hay devolución o pago. Confirmar la fecha oficial del SII.",
    });
  }

  const obligaciones = base.map((obligacion) => {
    const nominal = fechaEn(siguiente, obligacion.dia);
    const { fecha, movida } = proximoDiaHabil(nominal);
    const dias = diasHasta(fecha, referencia);

    return {
      codigo: obligacion.codigo,
      titulo: obligacion.titulo,
      descripcion: obligacion.descripcion,
      organismo: obligacion.organismo,
      periodo,
      vence: fecha,
      vence_nominal: nominal,
      movida_por_dia_no_habil: movida,
      dias_restantes: dias,
      estado: dias < 0 ? "vencida" : dias <= 3 ? "urgente" : dias <= 10 ? "proxima" : "futura",
      nota: obligacion.nota,
      requiere_validacion: true,
    };
  });

  const anualesConFecha = anuales.map((obligacion) => {
    const { fecha, movida } = proximoDiaHabil(obligacion.vence);
    const dias = diasHasta(fecha, referencia);

    return {
      ...obligacion,
      periodo,
      vence: fecha,
      vence_nominal: obligacion.vence,
      movida_por_dia_no_habil: movida,
      dias_restantes: dias,
      estado: dias < 0 ? "vencida" : dias <= 3 ? "urgente" : dias <= 10 ? "proxima" : "futura",
      requiere_validacion: true,
    };
  });

  const todas = [...obligaciones, ...anualesConFecha].sort((a, b) =>
    a.vence.localeCompare(b.vence)
  );

  return {
    periodo,
    hoy: referencia,
    obligaciones: todas,
    resumen: {
      vencidas: todas.filter((o) => o.estado === "vencida").length,
      urgentes: todas.filter((o) => o.estado === "urgente").length,
      proximas: todas.filter((o) => o.estado === "proxima").length,
    },
    aviso:
      "Fechas de referencia. Los feriados móviles y las prórrogas del SII no están incluidos: confirmar en sii.cl y previred.com antes de declarar.",
  };
}

module.exports = {
  domingoDePascua,
  feriadosDelAnio,
  proximoDiaHabil,
  sumarMes,
  fechaEn,
  diasHasta,
  obligacionesDelPeriodo,
};
