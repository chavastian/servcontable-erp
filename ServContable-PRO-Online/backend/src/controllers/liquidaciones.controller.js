const pool = require("../database/db");
const {
  obtenerAusenciasLiquidacion,
} = require("../helpers/ausenciasLiquidacion.helper");

function calcularMonto(base, tasa) {
  return Math.round(Number(base || 0) * (Number(tasa || 0) / 100));
}

function redondear(valor) {
  return Math.round(Number(valor || 0));
}

function normalizarFactorImpuestoUnico(factor) {
  const valor = Number(factor || 0);

  // Permite guardar 4 o 0.04 sin distorsionar el calculo.
  if (valor > 1 && valor <= 100) {
    return valor / 100;
  }

  return valor;
}

const TASA_SEGURO_SOCIAL_DEFAULT = 1;
const JORNADA_SEMANAL_DEFAULT = 42;
const RECARGO_HORA_EXTRA_DEFAULT = 50;

function normalizarTipoGratificacion(tipo) {
  const texto = String(tipo || "MENSUAL")
    .trim()
    .toUpperCase();

  if (texto === "ANUAL") return "ANUAL";
  if (texto === "SIN" || texto === "SIN_GRATIFICACION") {
    return "SIN_GRATIFICACION";
  }

  return "MENSUAL";
}

function normalizarTipoCalculoHorasExtras(tipo) {
  const texto = String(tipo || "MENSUAL")
    .trim()
    .toUpperCase();

  if (texto === "SEMANAL") return "SEMANAL";
  if (texto === "DIARIO_5") return "DIARIO_5";
  if (texto === "DIARIO_6") return "DIARIO_6";
  if (texto === "POR_HORA") return "POR_HORA";
  if (texto === "VARIABLE") return "VARIABLE";

  return "MENSUAL";
}

function calcularHorasExtras({
  tipo_calculo,
  horas_extras,
  base_horas_extras,
  sueldo_base,
  jornada_horas_semanal,
  aplica_semana_corrida,
  semana_corrida,
  recargo_horas_extras,
  ingreso_minimo,
}) {
  const tipo = normalizarTipoCalculoHorasExtras(tipo_calculo);
  const horas = Number(horas_extras || 0);
  const jornada = Number(jornada_horas_semanal || JORNADA_SEMANAL_DEFAULT);
  const jornadaValida = jornada > 0 ? jornada : JORNADA_SEMANAL_DEFAULT;
  const recargo = Number(recargo_horas_extras || RECARGO_HORA_EXTRA_DEFAULT);
  const factorRecargo = 1 + recargo / 100;
  const sueldoBase = Number(sueldo_base || 0);
  const baseInformada = Number(base_horas_extras || 0);
  const semanaCorrida = aplica_semana_corrida ? Number(semana_corrida || 0) : 0;
  const base = baseInformada > 0 ? baseInformada : sueldoBase;

  if (horas <= 0) {
    return {
      tipo_calculo_horas_extras: tipo,
      horas_extras: 0,
      base_horas_extras: baseInformada,
      jornada_horas_semanal: jornadaValida,
      aplica_semana_corrida_horas_extras: Boolean(aplica_semana_corrida),
      semana_corrida_horas_extras: semanaCorrida,
      recargo_horas_extras: recargo,
      valor_hora_ordinaria: 0,
      valor_hora_extra: 0,
      monto_horas_extras: 0,
      detalle_horas_extras: "Sin horas extras.",
    };
  }

  let valorHoraOrdinaria = 0;
  let baseUsada = base;
  let detalle = "";

  if (tipo === "SEMANAL") {
    valorHoraOrdinaria = base / jornadaValida;
    detalle = "Sueldo semanal dividido por jornada semanal.";
  } else if (tipo === "DIARIO_5") {
    baseUsada = base * 5 + semanaCorrida;
    valorHoraOrdinaria = baseUsada / jornadaValida;
    detalle = "Sueldo diario por 5 dias mas semana corrida, dividido por jornada semanal.";
  } else if (tipo === "DIARIO_6") {
    baseUsada = base * 6 + semanaCorrida;
    valorHoraOrdinaria = baseUsada / jornadaValida;
    detalle = "Sueldo diario por 6 dias mas semana corrida, dividido por jornada semanal.";
  } else if (tipo === "POR_HORA") {
    valorHoraOrdinaria = base + (semanaCorrida > 0 ? semanaCorrida / jornadaValida : 0);
    detalle = "Valor hora pactado ajustado por semana corrida si corresponde.";
  } else if (tipo === "VARIABLE") {
    const ingresoMinimo = Number(ingreso_minimo || 0);
    baseUsada = Math.max(ingresoMinimo, base);
    valorHoraOrdinaria = ((baseUsada / 30) * 28) / (jornadaValida * 4);
    detalle = "Remuneracion variable o sin sueldo fijo: usa ingreso minimo si es mayor.";
  } else {
    valorHoraOrdinaria = ((base / 30) * 28) / (jornadaValida * 4);
    detalle = "Sueldo mensual dividido por 30, multiplicado por 28 y dividido por 4 semanas.";
  }

  const valorHoraExtra = redondear(valorHoraOrdinaria * factorRecargo);
  const montoHorasExtras = redondear(valorHoraExtra * horas);

  return {
    tipo_calculo_horas_extras: tipo,
    horas_extras: horas,
    base_horas_extras: baseInformada,
    jornada_horas_semanal: jornadaValida,
    aplica_semana_corrida_horas_extras: Boolean(aplica_semana_corrida),
    semana_corrida_horas_extras: semanaCorrida,
    recargo_horas_extras: recargo,
    valor_hora_ordinaria: redondear(valorHoraOrdinaria),
    valor_hora_extra: valorHoraExtra,
    monto_horas_extras: montoHorasExtras,
    detalle_horas_extras: `${detalle} Recargo aplicado: ${recargo}%.`,
  };
}

async function asegurarColumnaRecurrenteHaberes(client) {
  await client.query(`
    ALTER TABLE haberes_descuentos_remuneraciones
    ADD COLUMN IF NOT EXISTS recurrente BOOLEAN DEFAULT false
  `);
}

async function asegurarColumnasContabilizacionRemuneraciones(client) {
  await client.query(`
    ALTER TABLE configuracion_remuneraciones
    ADD COLUMN IF NOT EXISTS cuenta_sis_empleador_id INTEGER,
    ADD COLUMN IF NOT EXISTS cuenta_afc_empleador_id INTEGER,
    ADD COLUMN IF NOT EXISTS cuenta_mutual_empleador_id INTEGER,
    ADD COLUMN IF NOT EXISTS cuenta_otros_descuentos_id INTEGER
  `);

  await client.query(`
    ALTER TABLE comprobante_detalle
    ADD COLUMN IF NOT EXISTS rut_auxiliar VARCHAR(30) DEFAULT ''
  `);

  await asegurarColumnasLiquidacionSeguroSocial(client);
}

async function asegurarColumnasLiquidacionSeguroSocial(db) {
  await db.query(`
    ALTER TABLE liquidaciones
    ADD COLUMN IF NOT EXISTS tasa_seguro_social NUMERIC(12,4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS aporte_seguro_social_empleador NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tipo_calculo_horas_extras VARCHAR(30) DEFAULT 'MENSUAL',
    ADD COLUMN IF NOT EXISTS horas_extras NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS base_horas_extras NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS jornada_horas_semanal NUMERIC(8,2) DEFAULT 42,
    ADD COLUMN IF NOT EXISTS aplica_semana_corrida_horas_extras BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS semana_corrida_horas_extras NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS recargo_horas_extras NUMERIC(8,4) DEFAULT 50,
    ADD COLUMN IF NOT EXISTS valor_hora_extra NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS monto_horas_extras NUMERIC(14,2) DEFAULT 0
  `);
}

async function obtenerConfiguracion(client, empresaId, periodo) {
  const resultado = await client.query(
    `
    SELECT *
    FROM configuracion_remuneraciones
    WHERE empresa_id = $1
      AND periodo = $2
    `,
    [empresaId, periodo]
  );

  return resultado.rows[0] || null;
}

async function obtenerAfpTrabajador(client, empresaId, periodo, nombreAfp) {
  if (!nombreAfp) return null;

  const resultado = await client.query(
    `
    SELECT *
    FROM afp_parametros
    WHERE empresa_id = $1
      AND periodo = $2
      AND LOWER(nombre) = LOWER($3)
      AND activo = true
    LIMIT 1
    `,
    [empresaId, periodo, nombreAfp]
  );

  return resultado.rows[0] || null;
}

async function calcularImpuestoUnico(client, empresaId, periodo, baseTributable) {
  const base = Number(baseTributable || 0);
  const resultado = await client.query(
    `
    SELECT *
    FROM impuesto_unico_tramos
    WHERE empresa_id = $1
      AND periodo = $2
      AND activo = true
      AND $3 >= desde
      AND (
        hasta = 0
        OR $3 <= hasta
      )
    ORDER BY desde DESC
    LIMIT 1
    `,
    [empresaId, periodo, base]
  );

  if (resultado.rows.length === 0) {
    return {
      impuesto: 0,
      tramo: null,
    };
  }

  const tramo = resultado.rows[0];
  const factor = normalizarFactorImpuestoUnico(tramo.factor);

  const impuesto = Math.max(
    0,
    Math.round(base * factor - Number(tramo.rebaja || 0))
  );

  return {
    impuesto,
    tramo: {
      ...tramo,
      factor,
    },
  };
}

async function calcularLiquidacionBase(req, res) {
  const client = await pool.connect();

  try {
    const {
      empresa_id,
      trabajador_id,
      periodo,
      dias_trabajados = 30,
      gratificacion = 0,
      tipo_gratificacion = "MENSUAL",
      haberes_no_imponibles = 0,
      otros_descuentos = 0,
      tipo_calculo_horas_extras = "MENSUAL",
      horas_extras = 0,
      base_horas_extras = 0,
      jornada_horas_semanal = JORNADA_SEMANAL_DEFAULT,
      aplica_semana_corrida_horas_extras = false,
      semana_corrida_horas_extras = 0,
      recargo_horas_extras = RECARGO_HORA_EXTRA_DEFAULT,
    } = req.body;

    if (!empresa_id || !trabajador_id || !periodo) {
      return res.status(400).json({
        error: "Empresa, trabajador y período son obligatorios",
      });
    }

    const trabajadorResult = await client.query(
      `
      SELECT *
      FROM trabajadores
      WHERE id = $1
        AND empresa_id = $2
        AND estado = 'activo'
      `,
      [trabajador_id, empresa_id]
    );

    if (trabajadorResult.rows.length === 0) {
      return res.status(404).json({
        error: "Trabajador no encontrado o inactivo",
      });
    }

    const trabajador = trabajadorResult.rows[0];

    const configuracion = await obtenerConfiguracion(
      client,
      empresa_id,
      periodo
    );

    if (!configuracion) {
      return res.status(400).json({
        error:
          "No existe Configuración de Remuneraciones para este período. Debes configurarla antes de calcular liquidaciones.",
      });
    }

    const afpParametro = await obtenerAfpTrabajador(
      client,
      empresa_id,
      periodo,
      trabajador.afp
    );

    if (!afpParametro) {
      return res.status(400).json({
        error:
          "La AFP del trabajador no está configurada para este período. Revisa la AFP del trabajador y la configuración de remuneraciones.",
      });
    }

    await asegurarColumnaRecurrenteHaberes(client);

    const variablesDetalleResult = await client.query(
      `
      SELECT
        tipo,
        COALESCE(NULLIF(TRIM(nombre), ''), 'Concepto sin nombre') AS nombre,
        COALESCE(SUM(monto), 0) AS total
      FROM haberes_descuentos_remuneraciones
      WHERE empresa_id = $1
        AND trabajador_id = $2
        AND estado = 'vigente'
        AND (
          periodo = $3
          OR (
            COALESCE(recurrente, false) = true
            AND periodo <= $3
          )
        )
      GROUP BY tipo, COALESCE(NULLIF(TRIM(nombre), ''), 'Concepto sin nombre')
      ORDER BY tipo ASC, nombre ASC
      `,
      [empresa_id, trabajador_id, periodo]
    );

    let variablesImponibles = 0;
    let variablesNoImponibles = 0;
    let variablesDescuentos = 0;
    const detalleVariablesImponibles = [];
    const detalleVariablesNoImponibles = [];
    const detalleVariablesDescuentos = [];

    for (const item of variablesDetalleResult.rows) {
      const monto = Number(item.total || 0);
      const concepto = item.nombre;

      if (item.tipo === "HABER_IMPONIBLE") {
        variablesImponibles += monto;
        detalleVariablesImponibles.push({
          concepto,
          monto,
        });
      }

      if (item.tipo === "HABER_NO_IMPONIBLE") {
        variablesNoImponibles += monto;
        detalleVariablesNoImponibles.push({
          concepto,
          monto,
        });
      }

      if (item.tipo === "DESCUENTO") {
        variablesDescuentos += monto;
        detalleVariablesDescuentos.push({
          concepto,
          monto,
        });
      }
    }

    const sueldoBase = Number(trabajador.sueldo_base || 0);
    const dias = Number(dias_trabajados || 30);

    const ausenciasLiquidacion = await obtenerAusenciasLiquidacion({
      empresa_id,
      trabajador_id,
      periodo,
      sueldo_base: sueldoBase,
    });

    const diasAusencia = Number(ausenciasLiquidacion.dias_ausencia || 0);
    const horasAusencia = Number(ausenciasLiquidacion.horas_ausencia || 0);
    const descuentoAusencias = Number(
      ausenciasLiquidacion.descuento_ausencias || 0
    );

    const calculoHorasExtras = calcularHorasExtras({
      tipo_calculo: tipo_calculo_horas_extras,
      horas_extras,
      base_horas_extras,
      sueldo_base: sueldoBase,
      jornada_horas_semanal,
      aplica_semana_corrida: aplica_semana_corrida_horas_extras,
      semana_corrida: semana_corrida_horas_extras,
      recargo_horas_extras,
      ingreso_minimo: configuracion.ingreso_minimo,
    });

    const sueldoProporcional = redondear((sueldoBase / 30) * dias);
    const imponibleSinGratificacion =
      sueldoProporcional +
      variablesImponibles +
      Number(calculoHorasExtras.monto_horas_extras || 0);
    const tipoGratificacion = normalizarTipoGratificacion(tipo_gratificacion);

    let gratificacionNum = 0;

    if (tipoGratificacion === "ANUAL") {
      gratificacionNum = Number(gratificacion || 0);
    } else if (tipoGratificacion === "MENSUAL") {
      gratificacionNum = redondear(imponibleSinGratificacion * 0.25);
    }

    const noImponibles = variablesNoImponibles;
    const otrosDesc = variablesDescuentos;
    const detalleOtrosDescuentos = [...detalleVariablesDescuentos];

    const baseImponible = imponibleSinGratificacion + gratificacionNum;

    const topeImponiblePesos =
      Number(configuracion.tope_imponible_uf || 0) *
      Number(configuracion.valor_uf || 0);

    const baseAfectaDescuentos =
      topeImponiblePesos > 0
        ? Math.min(baseImponible, topeImponiblePesos)
        : baseImponible;

    const tasaAfp = Number(afpParametro.tasa_afp || 0);
    const tasaSis =
      Number(afpParametro.tasa_sis || 0) ||
      Number(configuracion.tasa_sis || 0);
    const tasaSeguroSocial = Number(
      afpParametro.tasa_seguro_social ?? TASA_SEGURO_SOCIAL_DEFAULT
    );

    const tasaSalud = Number(configuracion.tasa_salud || 7);

    const contratoPlazoFijo =
      String(trabajador.tipo_contrato || "")
        .trim()
        .toLowerCase() === "plazo fijo";

    const tasaAfcTrabajador = contratoPlazoFijo
      ? 0
      : Number(configuracion.tasa_afc_trabajador || 0);

    const tasaAfcEmpleador = contratoPlazoFijo
      ? 3
      : Number(configuracion.tasa_afc_empleador || 0);
    const tasaMutual = Number(configuracion.tasa_mutual || 0);

    const descuentoAfp = calcularMonto(baseAfectaDescuentos, tasaAfp);
    const descuentoSalud = calcularMonto(baseAfectaDescuentos, tasaSalud);
    const descuentoAfc = calcularMonto(
      baseAfectaDescuentos,
      tasaAfcTrabajador
    );

    const descuentosPrevisionalesTributarios =
      Number(descuentoAfp || 0) +
      Number(descuentoSalud || 0) +
      Number(descuentoAfc || 0);

    const baseTributable = Math.max(
      0,
      redondear(baseImponible - descuentosPrevisionalesTributarios)
    );

    const impuestoUnicoResult = await calcularImpuestoUnico(
      client,
      empresa_id,
      periodo,
      baseTributable
    );

    const impuestoUnico = impuestoUnicoResult.impuesto;
    const tramoImpuestoUnico = impuestoUnicoResult.tramo;
    const advertenciasCalculo = [
      "Calculo parametrizado segun configuracion del periodo. Las ausencias, permisos sin goce, atrasos o suspensiones que afecten remuneracion ya quedan incorporadas como descuento.",
    ];

    if (!tramoImpuestoUnico) {
      advertenciasCalculo.push(
        `No existe tramo de impuesto unico para la base tributable ${baseTributable.toLocaleString(
          "es-CL"
        )} en el periodo ${periodo}; se dejo impuesto unico en $0.`
      );
    }

    const totalHaberesImponibles = baseImponible;
    const totalHaberesNoImponibles = noImponibles;
    const totalHaberes = totalHaberesImponibles + totalHaberesNoImponibles;

    const totalDescuentos =
      Number(descuentoAfp || 0) +
      Number(descuentoSalud || 0) +
      Number(descuentoAfc || 0) +
      Number(impuestoUnico || 0) +
      Number(otrosDesc || 0) +
      Number(descuentoAusencias || 0);

    const liquidoPagar =
      Number(totalHaberes || 0) - Number(totalDescuentos || 0);

    const aporteSisEmpleador = calcularMonto(baseAfectaDescuentos, tasaSis);
    const aporteAfcEmpleador = calcularMonto(
      baseAfectaDescuentos,
      tasaAfcEmpleador
    );
    const aporteMutualEmpleador = calcularMonto(
      baseAfectaDescuentos,
      tasaMutual
    );
    const aporteSeguroSocialEmpleador = calcularMonto(
      baseAfectaDescuentos,
      tasaSeguroSocial
    );

    const costoEmpresa =
      totalHaberes +
      aporteSisEmpleador +
      aporteAfcEmpleador +
      aporteMutualEmpleador +
      aporteSeguroSocialEmpleador;

    return res.json({
      trabajador,
      configuracion: {
        periodo,
        afp: trabajador.afp,
        tasa_afp: tasaAfp,
        tasa_salud: tasaSalud,
        tasa_afc_trabajador: tasaAfcTrabajador,
        tasa_afc_empleador: tasaAfcEmpleador,
        tasa_sis: tasaSis,
        tasa_seguro_social: tasaSeguroSocial,
        tasa_mutual: tasaMutual,
        tope_imponible_uf: Number(configuracion.tope_imponible_uf || 0),
        valor_uf: Number(configuracion.valor_uf || 0),
        tope_imponible_pesos: redondear(topeImponiblePesos),
      },
      calculo: {
        periodo,
        tipo_gratificacion: tipoGratificacion,
        dias_trabajados: dias,
        sueldo_base: sueldoBase,
        sueldo_proporcional: sueldoProporcional,
        gratificacion: gratificacionNum,
        ...calculoHorasExtras,

        variables_haberes_imponibles: variablesImponibles,
        variables_haberes_no_imponibles: variablesNoImponibles,
        variables_descuentos: variablesDescuentos,
        detalle_variables_haberes_imponibles: detalleVariablesImponibles,
        detalle_variables_haberes_no_imponibles: detalleVariablesNoImponibles,
        detalle_variables_descuentos: detalleVariablesDescuentos,
        detalle_otros_descuentos: detalleOtrosDescuentos,
        haberes_no_imponibles_manual: Number(haberes_no_imponibles || 0),
        otros_descuentos_manual: Number(otros_descuentos || 0),

        dias_ausencia: diasAusencia,
        horas_ausencia: horasAusencia,
        descuento_ausencias: descuentoAusencias,

        base_imponible: baseImponible,
        base_tributable: baseTributable,
        descuentos_previsionales_tributarios:
          descuentosPrevisionalesTributarios,
        tramo_impuesto_unico_id: tramoImpuestoUnico?.id || null,
        tramo_impuesto_unico_desde: Number(tramoImpuestoUnico?.desde || 0),
        tramo_impuesto_unico_hasta: Number(tramoImpuestoUnico?.hasta || 0),
        factor_impuesto_unico: Number(tramoImpuestoUnico?.factor || 0),
        rebaja_impuesto_unico: Number(tramoImpuestoUnico?.rebaja || 0),
        tope_imponible_pesos: redondear(topeImponiblePesos),
        base_afecta_descuentos: redondear(baseAfectaDescuentos),

        total_haberes_imponibles: totalHaberesImponibles,
        total_haberes_no_imponibles: totalHaberesNoImponibles,
        total_haberes: totalHaberes,

        tasa_afp: tasaAfp,
        tasa_salud: tasaSalud,
        tasa_afc_trabajador: tasaAfcTrabajador,
        tasa_afc_empleador: tasaAfcEmpleador,
        tasa_sis: tasaSis,
        tasa_seguro_social: tasaSeguroSocial,
        tasa_mutual: tasaMutual,

        descuento_afp: descuentoAfp,
        descuento_salud: descuentoSalud,
        descuento_afc: descuentoAfc,
        impuesto_unico: impuestoUnico,
        otros_descuentos: otrosDesc,
        total_descuentos: totalDescuentos,

        liquido_pagar: liquidoPagar,

        aporte_sis_empleador: aporteSisEmpleador,
        aporte_seguro_social_empleador: aporteSeguroSocialEmpleador,
        aporte_afc_empleador: aporteAfcEmpleador,
        aporte_mutual_empleador: aporteMutualEmpleador,
        costo_empresa: costoEmpresa,
      },
      advertencia: advertenciasCalculo.join(" "),
    });
  } catch (error) {
    console.error("Error al calcular liquidación:", error);

    return res.status(500).json({
      error: error.message || "Error interno al calcular liquidación",
    });
  } finally {
    client.release();
  }
}

async function guardarLiquidacion(req, res) {
  try {
    const {
      empresa_id,
      trabajador_id,
      periodo,

      dias_trabajados,
      sueldo_base,
      sueldo_proporcional,
      gratificacion,
      tipo_calculo_horas_extras,
      horas_extras,
      base_horas_extras,
      jornada_horas_semanal,
      aplica_semana_corrida_horas_extras,
      semana_corrida_horas_extras,
      recargo_horas_extras,
      valor_hora_extra,
      monto_horas_extras,

      variables_haberes_imponibles,
      variables_haberes_no_imponibles,
      variables_descuentos,

      dias_ausencia,
      horas_ausencia,
      descuento_ausencias,

      base_imponible,
      base_tributable,
      tramo_impuesto_unico_id,
      factor_impuesto_unico,
      rebaja_impuesto_unico,
      tope_imponible_pesos,
      base_afecta_descuentos,

      total_haberes_imponibles,
      total_haberes_no_imponibles,
      total_haberes,

      tasa_afp,
      tasa_salud,
      tasa_afc_trabajador,
      tasa_afc_empleador,
      tasa_sis,
      tasa_seguro_social,
      tasa_mutual,

      descuento_afp,
      descuento_salud,
      descuento_afc,
      impuesto_unico,
      otros_descuentos,
      total_descuentos,
      liquido_pagar,

      aporte_sis_empleador,
      aporte_seguro_social_empleador,
      aporte_afc_empleador,
      aporte_mutual_empleador,
      costo_empresa,
    } = req.body;

    if (!empresa_id || !trabajador_id || !periodo) {
      return res.status(400).json({
        error: "Empresa, trabajador y período son obligatorios",
      });
    }

    await asegurarColumnasLiquidacionSeguroSocial(pool);

    const resultado = await pool.query(
      `
      INSERT INTO liquidaciones
      (
        empresa_id,
        trabajador_id,
        periodo,

        dias_trabajados,
        sueldo_base,
        sueldo_proporcional,
        gratificacion,
        tipo_calculo_horas_extras,
        horas_extras,
        base_horas_extras,
        jornada_horas_semanal,
        aplica_semana_corrida_horas_extras,
        semana_corrida_horas_extras,
        recargo_horas_extras,
        valor_hora_extra,
        monto_horas_extras,

        variables_haberes_imponibles,
        variables_haberes_no_imponibles,
        variables_descuentos,

        dias_ausencia,
        horas_ausencia,
        descuento_ausencias,

        base_imponible,
        base_tributable,
        tramo_impuesto_unico_id,
        factor_impuesto_unico,
        rebaja_impuesto_unico,
        tope_imponible_pesos,
        base_afecta_descuentos,

        total_haberes_imponibles,
        total_haberes_no_imponibles,
        total_haberes,

        tasa_afp,
        tasa_salud,
        tasa_afc_trabajador,
        tasa_afc_empleador,
        tasa_sis,
        tasa_seguro_social,
        tasa_mutual,

        descuento_afp,
        descuento_salud,
        descuento_afc,
        impuesto_unico,
        otros_descuentos,
        total_descuentos,
        liquido_pagar,

        aporte_sis_empleador,
        aporte_seguro_social_empleador,
        aporte_afc_empleador,
        aporte_mutual_empleador,
        costo_empresa,

        estado
      )
      VALUES
      (
        $1,$2,$3,
        $4,$5,$6,$7,
        $8,$9,$10,$11,$12,$13,$14,$15,$16,
        $17,$18,$19,
        $20,$21,$22,
        $23,$24,$25,$26,$27,$28,$29,
        $30,$31,$32,
        $33,$34,$35,$36,$37,$38,$39,
        $40,$41,$42,$43,$44,$45,$46,
        $47,$48,$49,$50,$51,
        'emitida'
      )
      RETURNING *
      `,
      [
        empresa_id,
        trabajador_id,
        periodo,

        Number(dias_trabajados || 30),
        Number(sueldo_base || 0),
        Number(sueldo_proporcional || 0),
        Number(gratificacion || 0),
        normalizarTipoCalculoHorasExtras(tipo_calculo_horas_extras),
        Number(horas_extras || 0),
        Number(base_horas_extras || 0),
        Number(jornada_horas_semanal || JORNADA_SEMANAL_DEFAULT),
        Boolean(aplica_semana_corrida_horas_extras),
        Number(semana_corrida_horas_extras || 0),
        Number(recargo_horas_extras || RECARGO_HORA_EXTRA_DEFAULT),
        Number(valor_hora_extra || 0),
        Number(monto_horas_extras || 0),

        Number(variables_haberes_imponibles || 0),
        Number(variables_haberes_no_imponibles || 0),
        Number(variables_descuentos || 0),

        Number(dias_ausencia || 0),
        Number(horas_ausencia || 0),
        Number(descuento_ausencias || 0),

        Number(base_imponible || 0),
        Number(base_tributable || 0),
        tramo_impuesto_unico_id || null,
        Number(factor_impuesto_unico || 0),
        Number(rebaja_impuesto_unico || 0),
        Number(tope_imponible_pesos || 0),
        Number(base_afecta_descuentos || 0),

        Number(total_haberes_imponibles || 0),
        Number(total_haberes_no_imponibles || 0),
        Number(total_haberes || 0),

        Number(tasa_afp || 0),
        Number(tasa_salud || 0),
        Number(tasa_afc_trabajador || 0),
        Number(tasa_afc_empleador || 0),
        Number(tasa_sis || 0),
        Number(tasa_seguro_social || 0),
        Number(tasa_mutual || 0),

        Number(descuento_afp || 0),
        Number(descuento_salud || 0),
        Number(descuento_afc || 0),
        Number(impuesto_unico || 0),
        Number(otros_descuentos || 0),
        Number(total_descuentos || 0),
        Number(liquido_pagar || 0),

        Number(aporte_sis_empleador || 0),
        Number(aporte_seguro_social_empleador || 0),
        Number(aporte_afc_empleador || 0),
        Number(aporte_mutual_empleador || 0),
        Number(costo_empresa || 0),
      ]
    );

    return res.status(201).json({
      mensaje: "Liquidación guardada correctamente",
      liquidacion: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al guardar liquidación:", error);

    if (error.code === "23505") {
      return res.status(400).json({
        error:
          "Ya existe una liquidación para este trabajador en el período indicado",
      });
    }

    return res.status(500).json({
      error: error.message || "Error interno al guardar liquidación",
    });
  }
}

async function actualizarLiquidacion(req, res) {
  try {
    const { id } = req.params;
    const {
      empresa_id,
      trabajador_id,
      periodo,
      dias_trabajados,
      sueldo_base,
      sueldo_proporcional,
      gratificacion,
      tipo_calculo_horas_extras,
      horas_extras,
      base_horas_extras,
      jornada_horas_semanal,
      aplica_semana_corrida_horas_extras,
      semana_corrida_horas_extras,
      recargo_horas_extras,
      valor_hora_extra,
      monto_horas_extras,
      variables_haberes_imponibles,
      variables_haberes_no_imponibles,
      variables_descuentos,
      dias_ausencia,
      horas_ausencia,
      descuento_ausencias,
      base_imponible,
      base_tributable,
      tramo_impuesto_unico_id,
      factor_impuesto_unico,
      rebaja_impuesto_unico,
      tope_imponible_pesos,
      base_afecta_descuentos,
      total_haberes_imponibles,
      total_haberes_no_imponibles,
      total_haberes,
      tasa_afp,
      tasa_salud,
      tasa_afc_trabajador,
      tasa_afc_empleador,
      tasa_sis,
      tasa_seguro_social,
      tasa_mutual,
      descuento_afp,
      descuento_salud,
      descuento_afc,
      impuesto_unico,
      otros_descuentos,
      total_descuentos,
      liquido_pagar,
      aporte_sis_empleador,
      aporte_seguro_social_empleador,
      aporte_afc_empleador,
      aporte_mutual_empleador,
      costo_empresa,
    } = req.body;

    if (!id || !empresa_id || !trabajador_id || !periodo) {
      return res.status(400).json({
        error: "Id, empresa, trabajador y periodo son obligatorios",
      });
    }

    const existente = await pool.query(
      `
      SELECT id, contabilizada
      FROM liquidaciones
      WHERE id = $1
        AND empresa_id = $2
        AND estado <> 'eliminada'
      `,
      [id, empresa_id]
    );

    if (existente.rows.length === 0) {
      return res.status(404).json({
        error: "Liquidacion no encontrada",
      });
    }

    if (Boolean(existente.rows[0].contabilizada)) {
      return res.status(400).json({
        error: "No se puede editar una liquidacion contabilizada",
      });
    }

    await asegurarColumnasLiquidacionSeguroSocial(pool);

    const resultado = await pool.query(
      `
      UPDATE liquidaciones
      SET trabajador_id = $3,
          periodo = $4,
          dias_trabajados = $5,
          sueldo_base = $6,
          sueldo_proporcional = $7,
          gratificacion = $8,
          tipo_calculo_horas_extras = $9,
          horas_extras = $10,
          base_horas_extras = $11,
          jornada_horas_semanal = $12,
          aplica_semana_corrida_horas_extras = $13,
          semana_corrida_horas_extras = $14,
          recargo_horas_extras = $15,
          valor_hora_extra = $16,
          monto_horas_extras = $17,
          variables_haberes_imponibles = $18,
          variables_haberes_no_imponibles = $19,
          variables_descuentos = $20,
          dias_ausencia = $21,
          horas_ausencia = $22,
          descuento_ausencias = $23,
          base_imponible = $24,
          base_tributable = $25,
          tramo_impuesto_unico_id = $26,
          factor_impuesto_unico = $27,
          rebaja_impuesto_unico = $28,
          tope_imponible_pesos = $29,
          base_afecta_descuentos = $30,
          total_haberes_imponibles = $31,
          total_haberes_no_imponibles = $32,
          total_haberes = $33,
          tasa_afp = $34,
          tasa_salud = $35,
          tasa_afc_trabajador = $36,
          tasa_afc_empleador = $37,
          tasa_sis = $38,
          tasa_seguro_social = $39,
          tasa_mutual = $40,
          descuento_afp = $41,
          descuento_salud = $42,
          descuento_afc = $43,
          impuesto_unico = $44,
          otros_descuentos = $45,
          total_descuentos = $46,
          liquido_pagar = $47,
          aporte_sis_empleador = $48,
          aporte_seguro_social_empleador = $49,
          aporte_afc_empleador = $50,
          aporte_mutual_empleador = $51,
          costo_empresa = $52
      WHERE id = $1
        AND empresa_id = $2
      RETURNING *
      `,
      [
        Number(id),
        Number(empresa_id),
        Number(trabajador_id),
        periodo,
        Number(dias_trabajados || 30),
        Number(sueldo_base || 0),
        Number(sueldo_proporcional || 0),
        Number(gratificacion || 0),
        normalizarTipoCalculoHorasExtras(tipo_calculo_horas_extras),
        Number(horas_extras || 0),
        Number(base_horas_extras || 0),
        Number(jornada_horas_semanal || JORNADA_SEMANAL_DEFAULT),
        Boolean(aplica_semana_corrida_horas_extras),
        Number(semana_corrida_horas_extras || 0),
        Number(recargo_horas_extras || RECARGO_HORA_EXTRA_DEFAULT),
        Number(valor_hora_extra || 0),
        Number(monto_horas_extras || 0),
        Number(variables_haberes_imponibles || 0),
        Number(variables_haberes_no_imponibles || 0),
        Number(variables_descuentos || 0),
        Number(dias_ausencia || 0),
        Number(horas_ausencia || 0),
        Number(descuento_ausencias || 0),
        Number(base_imponible || 0),
        Number(base_tributable || 0),
        tramo_impuesto_unico_id || null,
        Number(factor_impuesto_unico || 0),
        Number(rebaja_impuesto_unico || 0),
        Number(tope_imponible_pesos || 0),
        Number(base_afecta_descuentos || 0),
        Number(total_haberes_imponibles || 0),
        Number(total_haberes_no_imponibles || 0),
        Number(total_haberes || 0),
        Number(tasa_afp || 0),
        Number(tasa_salud || 0),
        Number(tasa_afc_trabajador || 0),
        Number(tasa_afc_empleador || 0),
        Number(tasa_sis || 0),
        Number(tasa_seguro_social || 0),
        Number(tasa_mutual || 0),
        Number(descuento_afp || 0),
        Number(descuento_salud || 0),
        Number(descuento_afc || 0),
        Number(impuesto_unico || 0),
        Number(otros_descuentos || 0),
        Number(total_descuentos || 0),
        Number(liquido_pagar || 0),
        Number(aporte_sis_empleador || 0),
        Number(aporte_seguro_social_empleador || 0),
        Number(aporte_afc_empleador || 0),
        Number(aporte_mutual_empleador || 0),
        Number(costo_empresa || 0),
      ]
    );

    return res.json({
      mensaje: "Liquidacion actualizada correctamente",
      liquidacion: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al actualizar liquidacion:", error);

    return res.status(500).json({
      error: error.message || "Error interno al actualizar liquidacion",
    });
  }
}

async function eliminarLiquidacion(req, res) {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { empresa_id } = req.body;

    if (!id || !empresa_id) {
      return res.status(400).json({
        error: "Id y empresa son obligatorios",
      });
    }

    const existente = await client.query(
      `
      SELECT id, contabilizada, comprobante_id
      FROM liquidaciones
      WHERE id = $1
        AND empresa_id = $2
        AND estado <> 'eliminada'
      `,
      [id, empresa_id]
    );

    if (existente.rows.length === 0) {
      return res.status(404).json({
        error: "Liquidacion no encontrada",
      });
    }

    await client.query("BEGIN");

    const liquidacionActual = existente.rows[0];
    const comprobanteId = Number(liquidacionActual.comprobante_id || 0) || null;
    const estaContabilizada = Boolean(liquidacionActual.contabilizada);

    if (estaContabilizada && comprobanteId) {
      await client.query(
        `
        UPDATE comprobantes
        SET estado = 'eliminado'
        WHERE id = $1
          AND empresa_id = $2
          AND COALESCE(estado, 'vigente') <> 'eliminado'
        `,
        [comprobanteId, empresa_id]
      );

      await client.query(
        `
        UPDATE liquidaciones
        SET contabilizada = false,
            comprobante_id = NULL
        WHERE empresa_id = $1
          AND comprobante_id = $2
          AND estado <> 'eliminada'
        `,
        [empresa_id, comprobanteId]
      );
    }

    const resultado = await client.query(
      `
      UPDATE liquidaciones
      SET estado = 'eliminada'
      WHERE id = $1
        AND empresa_id = $2
      RETURNING *
      `,
      [id, empresa_id]
    );

    await client.query("COMMIT");

    const mensaje = estaContabilizada
      ? "Liquidacion contabilizada eliminada y comprobante asociado anulado correctamente"
      : "Liquidacion eliminada correctamente";

    return res.json({
      mensaje,
      liquidacion: resultado.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al eliminar liquidacion:", error);

    return res.status(500).json({
      error: error.message || "Error interno al eliminar liquidacion",
    });
  } finally {
    client.release();
  }
}

async function listarLiquidaciones(req, res) {
  try {
    const { empresa_id, periodo } = req.query;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    await asegurarColumnasLiquidacionSeguroSocial(pool);

    let query = `
      SELECT
        l.*,
        t.rut,
        t.nombres,
        t.apellidos,
        t.cargo,
        t.afp,
        t.salud,
        t.sexo,
        t.nacionalidad,
        t.jornada,
        t.tramo_asignacion,
        t.cargas,
        t.centro_costo,
        t.tipo_contrato,
        t.fecha_nacimiento,
        t.codigo_afp_previred,
        t.codigo_salud_previred,
        t.codigo_mutual_previred,
        t.regimen_previsional,
        t.tipo_trabajador_previred,
        t.tipo_contrato_previred,
        t.seguro_cesantia,
        t.movimiento_personal,
        t.fecha_movimiento_desde,
        t.fecha_movimiento_hasta
      FROM liquidaciones l
      INNER JOIN trabajadores t
        ON t.id = l.trabajador_id
      WHERE l.empresa_id = $1
        AND l.estado <> 'eliminada'
    `;

    const valores = [empresa_id];

    if (periodo) {
      query += ` AND l.periodo = $2`;
      valores.push(periodo);
    }

    query += ` ORDER BY l.periodo DESC, t.apellidos ASC, t.nombres ASC`;

    const resultado = await pool.query(query, valores);

    const totales = resultado.rows.reduce(
      (acc, item) => {
        acc.total_haberes += Number(item.total_haberes || 0);
        acc.total_horas_extras += Number(item.monto_horas_extras || 0);
        acc.total_descuentos += Number(item.total_descuentos || 0);
        acc.liquido_pagar += Number(item.liquido_pagar || 0);
        acc.costo_empresa += Number(item.costo_empresa || 0);
        acc.descuento_ausencias += Number(item.descuento_ausencias || 0);
        acc.dias_ausencia += Number(item.dias_ausencia || 0);
        return acc;
      },
      {
        total_haberes: 0,
        total_horas_extras: 0,
        total_descuentos: 0,
        liquido_pagar: 0,
        costo_empresa: 0,
        descuento_ausencias: 0,
        dias_ausencia: 0,
      }
    );

    return res.json({
      total: resultado.rows.length,
      liquidaciones: resultado.rows,
      totales,
    });
  } catch (error) {
    console.error("Error al listar liquidaciones:", error);

    return res.status(500).json({
      error: "Error interno al listar liquidaciones",
    });
  }
}

async function obtenerSiguienteNumeroComprobante(client, empresaId, tipo) {
  const resultado = await client.query(
    `
    SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente
    FROM comprobantes
    WHERE empresa_id = $1
      AND tipo = $2
    `,
    [empresaId, tipo]
  );

  return Number(resultado.rows[0].siguiente || 1);
}

async function contabilizarLiquidaciones(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id, periodo } = req.body;

    if (!empresa_id || !periodo) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y periodo",
      });
    }

    await client.query("BEGIN");

    await asegurarColumnasContabilizacionRemuneraciones(client);

    const configResult = await client.query(
      `
      SELECT *
      FROM configuracion_remuneraciones
      WHERE empresa_id = $1
        AND periodo = $2
      `,
      [empresa_id, periodo]
    );

    if (configResult.rows.length === 0) {
      throw new Error(
        "No existe configuración de remuneraciones para este período"
      );
    }

    const config = configResult.rows[0];

    const cuentasRequeridas = [
      { campo: "cuenta_sueldos_id", nombre: "Cuenta gasto sueldos" },
      { campo: "cuenta_afp_id", nombre: "Cuenta AFP por pagar" },
      { campo: "cuenta_salud_id", nombre: "Cuenta salud por pagar" },
      { campo: "cuenta_afc_id", nombre: "Cuenta AFC por pagar" },
      { campo: "cuenta_mutual_id", nombre: "Cuenta mutual por pagar" },
      {
        campo: "cuenta_impuesto_unico_id",
        nombre: "Cuenta impuesto único por pagar",
      },
      {
        campo: "cuenta_sueldos_por_pagar_id",
        nombre: "Cuenta sueldos por pagar",
      },
    ];

    const faltantes = cuentasRequeridas.filter((item) => !config[item.campo]);

    if (faltantes.length > 0) {
      throw new Error(
        `Faltan cuentas en Configuración Remuneraciones: ${faltantes
          .map((item) => item.nombre)
          .join(", ")}`
      );
    }

    const liquidacionesResult = await client.query(
      `
      SELECT
        l.*,
        t.rut,
        t.nombres,
        t.apellidos,
        t.cargo
      FROM liquidaciones l
      INNER JOIN trabajadores t
        ON t.id = l.trabajador_id
      WHERE l.empresa_id = $1
        AND l.periodo = $2
        AND l.estado = 'emitida'
        AND COALESCE(l.contabilizada, false) = false
      ORDER BY t.apellidos ASC, t.nombres ASC
      `,
      [empresa_id, periodo]
    );

    const liquidaciones = liquidacionesResult.rows;

    if (liquidaciones.length === 0) {
      throw new Error(
        "No hay liquidaciones emitidas pendientes de contabilizar para este período"
      );
    }

    const totales = liquidaciones.reduce(
      (acc, item) => {
        acc.total_haberes += Number(item.total_haberes || 0);
        acc.descuento_afp += Number(item.descuento_afp || 0);
        acc.descuento_salud += Number(item.descuento_salud || 0);
        acc.descuento_afc += Number(item.descuento_afc || 0);
        acc.impuesto_unico += Number(item.impuesto_unico || 0);
        acc.otros_descuentos += Number(item.otros_descuentos || 0);
        acc.liquido_pagar += Number(item.liquido_pagar || 0);

        acc.aporte_sis_empleador += Number(item.aporte_sis_empleador || 0);
        acc.aporte_seguro_social_empleador += Number(
          item.aporte_seguro_social_empleador || 0
        );
        acc.aporte_afc_empleador += Number(item.aporte_afc_empleador || 0);
        acc.aporte_mutual_empleador += Number(
          item.aporte_mutual_empleador || 0
        );

        return acc;
      },
      {
        total_haberes: 0,
        descuento_afp: 0,
        descuento_salud: 0,
        descuento_afc: 0,
        impuesto_unico: 0,
        otros_descuentos: 0,
        liquido_pagar: 0,
        aporte_sis_empleador: 0,
        aporte_seguro_social_empleador: 0,
        aporte_afc_empleador: 0,
        aporte_mutual_empleador: 0,
      }
    );

    const totalAportesEmpleador =
      totales.aporte_sis_empleador +
      totales.aporte_seguro_social_empleador +
      totales.aporte_afc_empleador +
      totales.aporte_mutual_empleador;

    const totalDebe = totales.total_haberes + totalAportesEmpleador;

    const totalHaber =
      totales.descuento_afp +
      totales.descuento_salud +
      totales.descuento_afc +
      totales.impuesto_unico +
      totales.aporte_sis_empleador +
      totales.aporte_seguro_social_empleador +
      totales.aporte_afc_empleador +
      totales.aporte_mutual_empleador +
      totales.otros_descuentos +
      totales.liquido_pagar;

    const diferencia = Math.round(totalDebe - totalHaber);

    if (diferencia !== 0) {
      throw new Error(
        `El asiento no cuadra. Debe: ${totalDebe}, Haber: ${totalHaber}, Diferencia: ${diferencia}`
      );
    }

    const tipo = "Remuneracion";
    const numero = await obtenerSiguienteNumeroComprobante(
      client,
      empresa_id,
      tipo
    );

    const fechaComprobante = `${periodo}-28`;
    const glosa = `Centralización remuneraciones período ${periodo}`;

    const comprobanteResult = await client.query(
      `
      INSERT INTO comprobantes
      (
        empresa_id,
        periodo,
        fecha,
        tipo,
        numero,
        glosa,
        total_debe,
        total_haber,
        estado
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'vigente')
      RETURNING *
      `,
      [
        empresa_id,
        periodo,
        fechaComprobante,
        tipo,
        numero,
        glosa,
        totalDebe,
        totalHaber,
      ]
    );

    const comprobante = comprobanteResult.rows[0];

    const cuentaSisEmpleadorDebe =
      config.cuenta_sis_empleador_id || config.cuenta_sueldos_id;
    const cuentaAfcEmpleadorDebe =
      config.cuenta_afc_empleador_id || config.cuenta_sueldos_id;
    const cuentaMutualEmpleadorDebe =
      config.cuenta_mutual_empleador_id || config.cuenta_sueldos_id;
    const cuentaOtrosDescuentosHaber =
      config.cuenta_otros_descuentos_id || config.cuenta_sueldos_por_pagar_id;

    const detalles = [];

    for (const item of liquidaciones) {
      const rutAuxiliar = String(item.rut || "").trim();
      const nombreTrabajador = `${item.nombres || ""} ${
        item.apellidos || ""
      }`.trim();
      const etiquetaTrabajador = [rutAuxiliar, nombreTrabajador]
        .filter(Boolean)
        .join(" - ");

      const agregarDetalle = ({
        cuenta_id,
        glosa,
        debe = 0,
        haber = 0,
      }) => {
        const debeNum = Number(debe || 0);
        const haberNum = Number(haber || 0);

        if (debeNum === 0 && haberNum === 0) return;

        detalles.push({
          cuenta_id,
          glosa: etiquetaTrabajador ? `${glosa} | ${etiquetaTrabajador}` : glosa,
          debe: debeNum,
          haber: haberNum,
          rut_auxiliar: rutAuxiliar,
        });
      };

      const totalHaberes = Number(item.total_haberes || 0);
      const descuentoAfp = Number(item.descuento_afp || 0);
      const descuentoSalud = Number(item.descuento_salud || 0);
      const descuentoAfc = Number(item.descuento_afc || 0);
      const impuestoUnico = Number(item.impuesto_unico || 0);
      const otrosDescuentos = Number(item.otros_descuentos || 0);
      const liquidoPagar = Number(item.liquido_pagar || 0);

      const aporteSisEmpleador = Number(item.aporte_sis_empleador || 0);
      const aporteSeguroSocialEmpleador = Number(
        item.aporte_seguro_social_empleador || 0
      );
      const aporteAfcEmpleador = Number(item.aporte_afc_empleador || 0);
      const aporteMutualEmpleador = Number(item.aporte_mutual_empleador || 0);

      agregarDetalle({
        cuenta_id: config.cuenta_sueldos_id,
        glosa: "Gasto remuneraciones",
        debe: totalHaberes,
      });

      agregarDetalle({
        cuenta_id: cuentaSisEmpleadorDebe,
        glosa: "SIS empleador",
        debe: aporteSisEmpleador,
      });

      agregarDetalle({
        cuenta_id: cuentaSisEmpleadorDebe,
        glosa: "Seguro social empleador",
        debe: aporteSeguroSocialEmpleador,
      });

      agregarDetalle({
        cuenta_id: cuentaAfcEmpleadorDebe,
        glosa: "AFC empleador",
        debe: aporteAfcEmpleador,
      });

      agregarDetalle({
        cuenta_id: cuentaMutualEmpleadorDebe,
        glosa: "Mutual empleador",
        debe: aporteMutualEmpleador,
      });

      agregarDetalle({
        cuenta_id: config.cuenta_afp_id,
        glosa: "AFP por pagar",
        haber: descuentoAfp + aporteSisEmpleador + aporteSeguroSocialEmpleador,
      });

      agregarDetalle({
        cuenta_id: config.cuenta_salud_id,
        glosa: "Salud por pagar",
        haber: descuentoSalud,
      });

      agregarDetalle({
        cuenta_id: config.cuenta_afc_id,
        glosa: "AFC por pagar",
        haber: descuentoAfc + aporteAfcEmpleador,
      });

      agregarDetalle({
        cuenta_id: config.cuenta_mutual_id,
        glosa: "Mutual por pagar",
        haber: aporteMutualEmpleador,
      });

      agregarDetalle({
        cuenta_id: config.cuenta_impuesto_unico_id,
        glosa: "Impuesto unico por pagar",
        haber: impuestoUnico,
      });

      agregarDetalle({
        cuenta_id: cuentaOtrosDescuentosHaber,
        glosa: "Otros descuentos remuneraciones",
        haber: otrosDescuentos,
      });

      agregarDetalle({
        cuenta_id: config.cuenta_sueldos_por_pagar_id,
        glosa: "Sueldos liquidos por pagar",
        haber: liquidoPagar,
      });
    }

    for (const detalle of detalles) {
      await client.query(
        `
        INSERT INTO comprobante_detalle
        (
          comprobante_id,
          cuenta_id,
          glosa,
          debe,
          haber,
          rut_auxiliar
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [
          comprobante.id,
          Number(detalle.cuenta_id),
          detalle.glosa,
          Number(detalle.debe || 0),
          Number(detalle.haber || 0),
          detalle.rut_auxiliar || "",
        ]
      );
    }

    await client.query(
      `
      UPDATE liquidaciones
      SET contabilizada = true,
          comprobante_id = $1
      WHERE empresa_id = $2
        AND periodo = $3
        AND estado = 'emitida'
        AND COALESCE(contabilizada, false) = false
      `,
      [comprobante.id, empresa_id, periodo]
    );

    await client.query("COMMIT");

    return res.json({
      mensaje: "Liquidaciones contabilizadas correctamente",
      comprobante,
      totales: {
        total_debe: totalDebe,
        total_haber: totalHaber,
        liquidaciones_contabilizadas: liquidaciones.length,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error al contabilizar liquidaciones:", error);

    return res.status(500).json({
      error: error.message || "Error interno al contabilizar liquidaciones",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  calcularLiquidacionBase,
  guardarLiquidacion,
  actualizarLiquidacion,
  eliminarLiquidacion,
  listarLiquidaciones,
  contabilizarLiquidaciones,
};

