const pdfParse = require("pdf-parse");

const AFP_NOMBRES = [
  "Capital",
  "Cuprum",
  "Habitat",
  "PlanVital",
  "Provida",
  "Modelo",
  "Uno",
];

const MESES = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

const INDICADORES_PREVISIONALES_BASE = {
  fuente: "",
  periodo_remuneracion: "",
  periodo_pago: "",

  valor_uf: 0,
  valor_uf_anterior: 0,
  valor_utm: 0,
  valor_uta: 0,

  renta_tope_afp_uf: 0,
  renta_tope_afp_monto: 0,
  renta_tope_ips_uf: 60,
  renta_tope_ips_monto: 0,
  renta_tope_seguro_cesantia_uf: 0,
  renta_tope_seguro_cesantia_monto: 0,

  ingreso_minimo_dependientes: 0,
  ingreso_minimo_casa_particular: 0,
  ingreso_minimo_menores_mayores: 0,
  ingreso_minimo_no_remuneracional: 0,

  tasa_sis: 0,
  tasa_seguro_social_afp_empleador: 0,
  tasa_seguro_social_expectativa_vida: 0,
  tasa_rentabilidad_protegida: 0,
  aplica_ccaf: false,
  distribucion_salud_ccaf: 0,
  distribucion_salud_fonasa: 7,
  distribucion_salud_ccaf_previred: 3.1,
  distribucion_salud_fonasa_previred: 3.9,

  afc_plazo_indefinido_empleador: 0,
  afc_plazo_indefinido_trabajador: 0,
  afc_plazo_fijo_empleador: 0,
  afc_plazo_fijo_trabajador: 0,
  afc_plazo_indefinido_11_empleador: 0,
  afc_plazo_indefinido_11_trabajador: 0,
  afc_casa_particular_empleador: 0,
  afc_casa_particular_trabajador: 0,

  trabajo_pesado_empleador: 0,
  trabajo_pesado_trabajador: 0,
  trabajo_menos_pesado_empleador: 0,
  trabajo_menos_pesado_trabajador: 0,

  apv_tope_mensual: 0,
  apv_tope_anual: 0,
  deposito_convenido_tope_anual: 0,

  asignacion_tramo_a_monto: 0,
  asignacion_tramo_a_hasta: 0,
  asignacion_tramo_b_monto: 0,
  asignacion_tramo_b_desde: 0,
  asignacion_tramo_b_hasta: 0,
  asignacion_tramo_c_monto: 0,
  asignacion_tramo_c_desde: 0,
  asignacion_tramo_c_hasta: 0,
  asignacion_tramo_d_monto: 0,
  asignacion_tramo_d_desde: 0,

  ley_16744_tasa_basica: 0.9,
  ley_sanna_tasa: 0.03,
  tope_rebaja_zonas_extremas: 0,
};

function normalizarTexto(texto = "") {
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\uFFFD/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ");
}

function numeroChileno(valor, defecto = 0) {
  if (valor === null || valor === undefined) return defecto;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : defecto;

  const limpio = String(valor)
    .replace(/\$/g, "")
    .replace(/%/g, "")
    .replace(/R\.?I\.?/gi, "")
    .replace(/[^\d,.-]/g, "")
    .trim();

  if (!limpio || limpio === "-") return defecto;

  const normalizado = limpio.replace(/\./g, "").replace(",", ".");
  const numero = Number(normalizado);

  return Number.isFinite(numero) ? numero : defecto;
}

function primerNumero(texto, patron, defecto = 0) {
  const match = texto.match(patron);
  return match ? numeroChileno(match[1], defecto) : defecto;
}

function primerTexto(texto, patron, defecto = "") {
  const match = texto.match(patron);
  return match ? String(match[1] || "").trim() : defecto;
}

function periodoDesdeMesAnio(mes, anio) {
  const mesNumero = MESES[String(mes || "").trim().toLowerCase()];
  return mesNumero && anio ? `${anio}-${mesNumero}` : "";
}

function extraerMontos(texto) {
  return [...texto.matchAll(/\$\s*[\d.]+(?:,\d+)?/g)].map((match) =>
    numeroChileno(match[0])
  );
}

function extraerPeriodo(texto) {
  const match = texto.match(
    /Para Cotizaciones a Pagar en\s+([A-Za-z]+)\s+(\d{4})\s+\(Remuneraciones\s+([A-Za-z]+)\s+(\d{4})\)/i
  );

  if (!match) {
    return {
      periodoPago: "",
      periodoRemuneracion: "",
    };
  }

  return {
    periodoPago: periodoDesdeMesAnio(match[1], match[2]),
    periodoRemuneracion: periodoDesdeMesAnio(match[3], match[4]),
  };
}

function extraerAfps(texto, indicadores) {
  return AFP_NOMBRES.map((nombre) => {
    const patron = new RegExp(
      `${nombre}\\s*([\\d,]+)%\\s*([\\d,]+)%\\s*([\\d,]+)%\\s*([\\d,]+)%`,
      "i"
    );
    const match = texto.match(patron);

    if (!match) return null;

    const tasaTrabajador = numeroChileno(match[1]);
    const tasaEmpleador = numeroChileno(match[2]);
    const tasaTotal = numeroChileno(match[3]);
    const tasaIndependiente = numeroChileno(match[4]);
    const tasaSeguroSocial =
      tasaEmpleador +
      numeroChileno(indicadores.tasa_seguro_social_expectativa_vida);

    return {
      nombre,
      tasa_afp: tasaTrabajador,
      tasa_empleador: tasaEmpleador,
      tasa_total: tasaTotal,
      tasa_independiente: tasaIndependiente,
      tasa_sis: indicadores.tasa_sis,
      tasa_seguro_social: tasaSeguroSocial,
    };
  }).filter(Boolean);
}

function extraerIndicadoresDesdeTexto(textoOriginal = "") {
  const texto = normalizarTexto(textoOriginal);
  const montos = extraerMontos(texto);
  const { periodoPago, periodoRemuneracion } = extraerPeriodo(texto);

  const indicadores = {
    ...INDICADORES_PREVISIONALES_BASE,
    fuente: "Previred",
    periodo_pago: periodoPago,
    periodo_remuneracion: periodoRemuneracion,

    valor_uf: montos[0] || 0,
    valor_uf_anterior: montos[1] || 0,
    renta_tope_afp_monto: montos[2] || 0,
    ingreso_minimo_dependientes: montos[3] || 0,
    renta_tope_ips_monto: montos[4] || 0,
    ingreso_minimo_menores_mayores: montos[5] || 0,
    renta_tope_seguro_cesantia_monto: montos[6] || 0,
    ingreso_minimo_casa_particular: montos[7] || 0,
    ingreso_minimo_no_remuneracional: montos[8] || 0,
  };

  const utmUta = texto.match(/\$\s*([\d.]+)\s*\$\s*([\d.]+)\s*Al 31/i);
  indicadores.valor_utm = utmUta ? numeroChileno(utmUta[1]) : montos[16] || 0;
  indicadores.valor_uta = utmUta ? numeroChileno(utmUta[2]) : montos[17] || 0;

  indicadores.renta_tope_afp_uf = primerNumero(
    texto,
    /Para Afiliados AFP:\s*([\d,]+)\s*UF/i
  );
  indicadores.renta_tope_ips_uf = primerNumero(
    texto,
    /Para afiliados al INP\s*\(([\d,]+)\s*UF\)/i,
    60
  );
  indicadores.renta_tope_seguro_cesantia_uf = primerNumero(
    texto,
    /Para Seguro de Cesantia:\s*([\d,]+)\s*UF/i
  );

  indicadores.tasa_sis = primerNumero(
    texto,
    /Tasa del Seguro de Invalidez y Sobrevivencia \(SIS\):\s*([\d,]+)%/i
  ) || primerNumero(texto, /Tasa SIS\s*([\d,]+)%/i);
  indicadores.tasa_seguro_social_expectativa_vida = primerNumero(
    texto,
    /Independiente\s*([\d,]+)%\s*Cargo del/i
  );

  const afps = extraerAfps(texto, indicadores);
  indicadores.tasa_seguro_social_afp_empleador =
    afps[0]?.tasa_empleador || 0;

  const distribucion = texto.match(
    /\(\*\) Tasa a considerar[\s\S]*?\n\s*([\d,]+)%\s*R\.?I\.?\s*\n\s*([\d,]+)%\s*R\.?I\./i
  );
  if (distribucion) {
    indicadores.distribucion_salud_ccaf = numeroChileno(distribucion[1]);
    indicadores.distribucion_salud_fonasa = numeroChileno(distribucion[2]);
    indicadores.distribucion_salud_ccaf_previred =
      indicadores.distribucion_salud_ccaf;
    indicadores.distribucion_salud_fonasa_previred =
      indicadores.distribucion_salud_fonasa;
  }

  const afcSecuencia = texto.match(
    /EmpleadorTrabajador\s*\n\s*([\d,]+)%\s*R\.?I\.?\s*([\d,]+)%\s*R\.?I\.?\s*\n\s*([\d,]+)%\s*R\.?I\.?\s*-\s*\n\s*([\d,]+)%\s*R\.?I\.?\s*-\s*\n\s*([\d,]+)%\s*R\.?I\.?\s*-/i
  );
  if (afcSecuencia) {
    indicadores.afc_plazo_indefinido_empleador = numeroChileno(
      afcSecuencia[1]
    );
    indicadores.afc_plazo_indefinido_trabajador = numeroChileno(
      afcSecuencia[2]
    );
    indicadores.afc_plazo_fijo_empleador = numeroChileno(afcSecuencia[3]);
    indicadores.afc_plazo_indefinido_11_empleador = numeroChileno(
      afcSecuencia[4]
    );
    indicadores.afc_casa_particular_empleador = numeroChileno(afcSecuencia[5]);
  } else {
    const afcIndefinido = texto.match(
      /Plazo Indefinido\s*([\d,]+)%\s*R\.?I\.?\s*([\d,]+)%\s*R\.?I\./i
    );
    if (afcIndefinido) {
      indicadores.afc_plazo_indefinido_empleador = numeroChileno(
        afcIndefinido[1]
      );
      indicadores.afc_plazo_indefinido_trabajador = numeroChileno(
        afcIndefinido[2]
      );
    }

    indicadores.afc_plazo_fijo_empleador = primerNumero(
      texto,
      /Plazo Fijo\s*([\d,]+)%\s*R\.?I\.?/i
    );
    indicadores.afc_plazo_indefinido_11_empleador = primerNumero(
      texto,
      /Plazo Indefinido 11 anos o mas[\s\S]*?([\d,]+)%\s*R\.?I\.?/i
    );
    indicadores.afc_casa_particular_empleador = primerNumero(
      texto,
      /Trabajador de Casa Particular[\s\S]*?([\d,]+)%\s*R\.?I\.?/i
    );
  }

  const trabajoPesado = texto.match(
    /Trabajo Pesado\s*([\d,]+)%\s*R\.?I\.?\s*([\d,]+)%\s*R\.?I\./i
  );
  if (trabajoPesado) {
    indicadores.trabajo_pesado_empleador = numeroChileno(trabajoPesado[1]);
    indicadores.trabajo_pesado_trabajador = numeroChileno(trabajoPesado[2]);
  }

  const trabajoMenosPesado = texto.match(
    /Trabajo Menos Pesado\s*([\d,]+)%\s*R\.?I\.?\s*([\d,]+)%\s*R\.?I\./i
  );
  if (trabajoMenosPesado) {
    indicadores.trabajo_menos_pesado_empleador = numeroChileno(
      trabajoMenosPesado[1]
    );
    indicadores.trabajo_menos_pesado_trabajador = numeroChileno(
      trabajoMenosPesado[2]
    );
  }

  const apv = texto.match(/\$\s*([\d.]+)\s*Tramo\s*\n\s*\$\s*([\d.]+)/i);
  if (apv) {
    indicadores.apv_tope_mensual = numeroChileno(apv[1]);
    indicadores.apv_tope_anual = numeroChileno(apv[2]);
  } else {
    indicadores.apv_tope_mensual = montos[9] || 0;
    indicadores.apv_tope_anual = montos[10] || 0;
  }

  indicadores.deposito_convenido_tope_anual = montos[11] || 0;

  const tramoA = texto.match(
    /1\s*\(A\)\s*\$?\s*([\d.]+)\s*Renta\s*<[\s\S]*?\$\s*([\d.]+)/i
  );
  if (tramoA) {
    indicadores.asignacion_tramo_a_monto = numeroChileno(tramoA[1]);
    indicadores.asignacion_tramo_a_hasta = numeroChileno(tramoA[2]);
  } else {
    indicadores.asignacion_tramo_a_monto = montos[18] || 0;
    indicadores.asignacion_tramo_a_hasta = montos[19] || 0;
  }

  const tramoB = texto.match(
    /2\s*\(B\)\s*\$?\s*([\d.]+)\s*Renta\s*>\s*\$\s*([\d.]+)\s*<\s*=?\s*\$\s*([\d.]+)/i
  );
  if (tramoB) {
    indicadores.asignacion_tramo_b_monto = numeroChileno(tramoB[1]);
    indicadores.asignacion_tramo_b_desde = numeroChileno(tramoB[2]);
    indicadores.asignacion_tramo_b_hasta = numeroChileno(tramoB[3]);
  } else {
    indicadores.asignacion_tramo_b_monto = montos[20] || 0;
    indicadores.asignacion_tramo_b_desde = montos[21] || 0;
    indicadores.asignacion_tramo_b_hasta = montos[22] || 0;
  }

  const tramoC = texto.match(
    /3\s*\(C\)\s*\$?\s*([\d.]+)\s*Renta\s*>\s*\$\s*([\d.]+)\s*<\s*=?\s*\$\s*([\d.]+)/i
  );
  if (tramoC) {
    indicadores.asignacion_tramo_c_monto = numeroChileno(tramoC[1]);
    indicadores.asignacion_tramo_c_desde = numeroChileno(tramoC[2]);
    indicadores.asignacion_tramo_c_hasta = numeroChileno(tramoC[3]);
  } else {
    indicadores.asignacion_tramo_c_monto = montos[23] || 0;
    indicadores.asignacion_tramo_c_desde = montos[24] || 0;
    indicadores.asignacion_tramo_c_hasta = montos[25] || 0;
  }

  indicadores.asignacion_tramo_d_desde = primerNumero(
    texto,
    /4\s*\(D\)\s*-?\s*Renta\s*>\s*\$\s*([\d.]+)/i
  ) || montos[26] || 0;

  return {
    indicadores,
    afps,
    texto,
  };
}

function crearConfiguracionDesdeIndicadores(indicadores) {
  return {
    tasa_salud: 7,
    tasa_sis: indicadores.tasa_sis,
    tasa_afc_trabajador: indicadores.afc_plazo_indefinido_trabajador,
    tasa_afc_empleador: indicadores.afc_plazo_indefinido_empleador,
    tope_imponible_uf: indicadores.renta_tope_afp_uf,
    valor_uf: indicadores.valor_uf,
    ingreso_minimo: indicadores.ingreso_minimo_dependientes,
    tramo_asignacion_a: indicadores.asignacion_tramo_a_monto,
    tramo_asignacion_b: indicadores.asignacion_tramo_b_monto,
    tramo_asignacion_c: indicadores.asignacion_tramo_c_monto,
    indicadores_previsionales: indicadores,
  };
}

async function parsearIndicadoresPrevisionalesDesdeBuffer(archivo) {
  if (!archivo?.buffer) {
    throw new Error("Debe adjuntar un archivo de indicadores previsionales");
  }

  const nombre = String(archivo.originalname || "").toLowerCase();
  const esPdf =
    archivo.mimetype === "application/pdf" || nombre.endsWith(".pdf");
  const texto = esPdf
    ? (await pdfParse(archivo.buffer)).text
    : archivo.buffer.toString("utf8");

  const resultado = extraerIndicadoresDesdeTexto(texto);

  return {
    ...resultado,
    configuracion: crearConfiguracionDesdeIndicadores(resultado.indicadores),
  };
}

module.exports = {
  INDICADORES_PREVISIONALES_BASE,
  crearConfiguracionDesdeIndicadores,
  extraerIndicadoresDesdeTexto,
  parsearIndicadoresPrevisionalesDesdeBuffer,
};
