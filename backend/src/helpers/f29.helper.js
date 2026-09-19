/**
 * Cálculo del F29 de un período.
 *
 * Lo que había calculaba IVA débito menos crédito, un PPM sobre el neto afecto
 * con una tasa que llegaba en la consulta y no se guardaba, y las retenciones de
 * honorarios por mes de emisión. Faltaba el remanente, el IVA retenido de las
 * facturas de compra, el crédito proporcional del IVA de uso común y el activo
 * fijo. Y no había contra qué comparar, porque el F29 presentado no se
 * registraba en ninguna parte.
 *
 * Reglas que aplica:
 *
 * - Remanente en UTM (artículo 26 del DL 825): el del mes anterior se
 *   reconvierte con la UTM de este mes; el que queda se guarda en UTM.
 * - PPM sobre ingresos brutos (artículo 84 a) de la Ley de la Renta): neto
 *   afecto más exento, con signo.
 * - Retenciones de honorarios por mes de pago (artículos 74 N°2 y 79). Las
 *   boletas sin fecha de pago se toman por emisión y se avisa, porque perderlas
 *   sería peor. REQUIERE VALIDACIÓN TRIBUTARIA.
 * - Facturas de compra (tipo 46): el comprador retiene el IVA y lo declara.
 * - IVA de uso común: crédito proporcional con el factor acumulado del año
 *   (artículo 43 del reglamento del DL 825); el resto no es recuperable.
 * - Activo fijo: se informa aparte (línea del 27 bis), no cambia el total.
 */

const { sumaConSigno, sumaConSignoSi, expresionSigno } = require("./documentoTributario.helper");
const { utmDelPeriodo, periodoAnterior } = require("./parametrosNacionales.helper");

function redondear(valor) {
  return Math.round(Number(valor || 0));
}

/**
 * Factor de proporcionalidad del IVA de uso común: ventas afectas acumuladas
 * en el año hasta el período, sobre el total de ventas acumuladas.
 */
async function factorProporcionalidad(cliente, empresaId, periodo) {
  const anio = String(periodo).slice(0, 4);

  const { rows } = await cliente.query(
    `SELECT ${sumaConSigno("neto", "v")} AS afectas,
            ${sumaConSigno("exento", "v")} AS exentas
     FROM ventas v
     WHERE v.empresa_id = $1
       AND v.estado = 'vigente'
       AND v.periodo >= $2
       AND v.periodo <= $3`,
    [empresaId, `${anio}-01`, periodo]
  );

  const afectas = Number(rows[0]?.afectas || 0);
  const exentas = Number(rows[0]?.exentas || 0);
  const total = afectas + exentas;

  // Sin ventas exentas no hay proporción que hacer: todo el uso común es crédito.
  if (total <= 0 || exentas <= 0) return { factor: 1, afectas, exentas };

  return { factor: Math.max(0, Math.min(1, afectas / total)), afectas, exentas };
}

async function remanenteAnteriorDe(cliente, empresaId, periodo, utmActual) {
  const previo = periodoAnterior(periodo);

  const { rows } = await cliente.query(
    `SELECT remanente_siguiente, remanente_siguiente_utm, valor_utm, periodo
     FROM remanente_iva
     WHERE empresa_id = $1 AND periodo = $2`,
    [empresaId, previo]
  );

  if (rows.length === 0) {
    return { pesos: 0, utm: 0, origen: null, en_utm: false };
  }

  const fila = rows[0];
  const utmGuardada = Number(fila.remanente_siguiente_utm || 0);

  if (utmGuardada > 0 && utmActual) {
    return {
      pesos: redondear(utmGuardada * utmActual),
      utm: utmGuardada,
      origen: fila.periodo,
      en_utm: true,
    };
  }

  // Registro anterior a la conversión a UTM: se arrastra en pesos y se avisa.
  return {
    pesos: redondear(fila.remanente_siguiente),
    utm: utmActual ? Number(fila.remanente_siguiente || 0) / utmActual : 0,
    origen: fila.periodo,
    en_utm: false,
  };
}

async function calcularF29(cliente, empresaId, periodo, opciones = {}) {
  const avisos = [];

  const [config, utm, ventasResult, comprasResult, honorariosResult, presentada] =
    await Promise.all([
      cliente.query(
        `SELECT tasa_ppm, facturador_electronico FROM configuracion_contable WHERE empresa_id = $1`,
        [empresaId]
      ),
      utmDelPeriodo(cliente, periodo),
      cliente.query(
        `SELECT ${sumaConSigno("neto", "v")} AS neto,
                ${sumaConSigno("exento", "v")} AS exento,
                ${sumaConSigno("iva", "v")} AS iva_debito,
                ${sumaConSigno("total", "v")} AS total,
                COUNT(*)::int AS documentos
         FROM ventas v
         WHERE v.empresa_id = $1 AND v.periodo = $2 AND v.estado = 'vigente'`,
        [empresaId, periodo]
      ),
      cliente.query(
        `SELECT ${sumaConSigno("neto", "c")} AS neto,
                ${sumaConSigno("exento", "c")} AS exento,
                ${sumaConSigno("iva_credito", "c")} AS iva_credito,
                ${sumaConSigno("iva_no_recuperable", "c")} AS iva_no_recuperable,
                ${sumaConSigno("iva_uso_comun", "c")} AS iva_uso_comun,
                ${sumaConSigno("neto_activo_fijo", "c")} AS neto_activo_fijo,
                ${sumaConSigno("iva_activo_fijo", "c")} AS iva_activo_fijo,
                ${sumaConSigno("otros_impuestos", "c")} AS otros_impuestos,
                ${sumaConSigno("total", "c")} AS total,
                ${sumaConSignoSi("iva_credito", "c.sii_tipo_doc = '46'", "c")} AS iva_retenido_46,
                COUNT(*) FILTER (WHERE c.sii_tipo_doc = '46')::int AS facturas_compra,
                COUNT(*)::int AS documentos
         FROM compras c
         WHERE c.empresa_id = $1 AND c.periodo = $2 AND c.estado = 'vigente'`,
        [empresaId, periodo]
      ),
      cliente.query(
        `SELECT
           COALESCE(SUM(bruto) FILTER (WHERE TO_CHAR(COALESCE(fecha_pago, fecha_emision), 'YYYY-MM') = $2), 0) AS bruto,
           COALESCE(SUM(retencion) FILTER (WHERE TO_CHAR(COALESCE(fecha_pago, fecha_emision), 'YYYY-MM') = $2), 0) AS retencion,
           COALESCE(SUM(liquido) FILTER (WHERE TO_CHAR(COALESCE(fecha_pago, fecha_emision), 'YYYY-MM') = $2), 0) AS liquido,
           COUNT(*) FILTER (WHERE fecha_pago IS NULL AND TO_CHAR(fecha_emision, 'YYYY-MM') = $2)::int AS sin_fecha_pago,
           COALESCE(SUM(retencion) FILTER (WHERE fecha_pago IS NULL AND TO_CHAR(fecha_emision, 'YYYY-MM') = $2), 0) AS retencion_sin_fecha_pago
         FROM honorarios
         WHERE empresa_id = $1 AND estado = 'vigente'`,
        [empresaId, periodo]
      ),
      cliente.query(
        `SELECT * FROM declaraciones_f29 WHERE empresa_id = $1 AND periodo = $2 AND estado = 'vigente'`,
        [empresaId, periodo]
      ),
    ]);

  const tasaPpm = Number(
    opciones.tasa_ppm !== undefined && opciones.tasa_ppm !== null && opciones.tasa_ppm !== ""
      ? opciones.tasa_ppm
      : config.rows[0]?.tasa_ppm || 0
  );

  if (!config.rows[0]) {
    avisos.push("La empresa no tiene configuración contable: el PPM se calcula con tasa 0.");
  } else if (!tasaPpm) {
    avisos.push("La tasa de PPM de la empresa es 0. Configúrala en Configuración Contable.");
  }

  if (!utm) {
    avisos.push(
      `No hay UTM registrada para ${periodo} en los parámetros nacionales: el remanente se arrastra en pesos. Carga los indicadores del período.`
    );
  }

  const v = ventasResult.rows[0];
  const c = comprasResult.rows[0];
  const h = honorariosResult.rows[0];

  const ventasNeto = redondear(v.neto);
  const ventasExento = redondear(v.exento);
  const ivaDebito = redondear(v.iva_debito);

  const ivaCreditoDirecto = redondear(c.iva_credito);
  const ivaUsoComun = redondear(c.iva_uso_comun);
  const proporcion = await factorProporcionalidad(cliente, empresaId, periodo);
  const creditoUsoComun = redondear(ivaUsoComun * proporcion.factor);
  const usoComunNoRecuperable = ivaUsoComun - creditoUsoComun;
  const ivaActivoFijo = redondear(c.iva_activo_fijo);
  const ivaRetenido46 = redondear(c.iva_retenido_46);

  // El IVA de una factura de compra lo retiene el comprador: es débito a
  // declarar, y a la vez crédito (ya viene en iva_credito). Se informa aparte.
  const ivaCredito = ivaCreditoDirecto + creditoUsoComun;

  const remanenteAnterior = await remanenteAnteriorDe(cliente, empresaId, periodo, utm);

  if (remanenteAnterior.origen && !remanenteAnterior.en_utm) {
    avisos.push(
      `El remanente de ${remanenteAnterior.origen} está guardado en pesos, no en UTM. Se arrastra sin reajuste. REQUIERE VALIDACIÓN TRIBUTARIA.`
    );
  }

  const ivaDisponible = ivaCredito + remanenteAnterior.pesos;
  const ivaDeterminado = ivaDebito - ivaDisponible;
  const ivaPagar = ivaDeterminado > 0 ? ivaDeterminado : 0;
  const remanenteSiguientePesos = ivaDeterminado < 0 ? Math.abs(ivaDeterminado) : 0;
  const remanenteSiguienteUtm = utm ? Number((remanenteSiguientePesos / utm).toFixed(4)) : null;

  // PPM sobre ingresos brutos: afecto más exento, con signo.
  const basePpm = ventasNeto + ventasExento;
  const ppm = redondear(basePpm * (tasaPpm / 100));

  const honorariosRetencion = redondear(h.retencion);

  if (Number(h.sin_fecha_pago) > 0) {
    avisos.push(
      `${h.sin_fecha_pago} boleta(s) de honorarios sin fecha de pago se declaran por su fecha de emisión (${redondear(
        h.retencion_sin_fecha_pago
      ).toLocaleString("es-CL")} de retención). La norma es por mes de pago. REQUIERE VALIDACIÓN TRIBUTARIA.`
    );
  }

  const totalF29 = ivaPagar + ppm + honorariosRetencion + ivaRetenido46;

  const declarada = presentada.rows[0] || null;
  const diferencia = declarada
    ? redondear(declarada.total_pagado) - totalF29
    : null;

  return {
    empresa_id: Number(empresaId),
    periodo,
    valor_utm: utm,
    tasa_ppm: tasaPpm,
    ventas: {
      neto: ventasNeto,
      exento: ventasExento,
      iva_debito: ivaDebito,
      total: redondear(v.total),
      documentos: Number(v.documentos),
    },
    compras: {
      neto: redondear(c.neto),
      exento: redondear(c.exento),
      iva_credito: ivaCreditoDirecto,
      iva_no_recuperable: redondear(c.iva_no_recuperable),
      iva_uso_comun: ivaUsoComun,
      credito_uso_comun: creditoUsoComun,
      uso_comun_no_recuperable: usoComunNoRecuperable,
      neto_activo_fijo: redondear(c.neto_activo_fijo),
      iva_activo_fijo: ivaActivoFijo,
      otros_impuestos: redondear(c.otros_impuestos),
      total: redondear(c.total),
      documentos: Number(c.documentos),
      facturas_compra: Number(c.facturas_compra),
    },
    proporcionalidad: {
      factor: Number(proporcion.factor.toFixed(4)),
      ventas_afectas_acumuladas: redondear(proporcion.afectas),
      ventas_exentas_acumuladas: redondear(proporcion.exentas),
      aplica: ivaUsoComun > 0,
    },
    iva: {
      iva_debito: ivaDebito,
      iva_credito: ivaCredito,
      remanente_anterior: remanenteAnterior.pesos,
      remanente_anterior_utm: Number(remanenteAnterior.utm.toFixed(4)),
      iva_disponible: ivaDisponible,
      iva_determinado: ivaDeterminado,
      iva_pagar: ivaPagar,
      remanente_siguiente: remanenteSiguientePesos,
      remanente_siguiente_utm: remanenteSiguienteUtm,
      iva_retenido: ivaRetenido46,
    },
    ppm: {
      base_ppm: basePpm,
      tasa_ppm: tasaPpm,
      monto_ppm: ppm,
    },
    honorarios: {
      bruto: redondear(h.bruto),
      retencion: honorariosRetencion,
      liquido: redondear(h.liquido),
      sin_fecha_pago: Number(h.sin_fecha_pago),
    },
    total_f29_estimado: totalF29,
    presentada: declarada
      ? {
          id: declarada.id,
          folio_sii: declarada.folio_sii,
          fecha_presentacion: declarada.fecha_presentacion,
          total_pagado: redondear(declarada.total_pagado),
          iva_determinado: redondear(declarada.iva_determinado),
          diferencia_contra_calculado: diferencia,
        }
      : null,
    avisos,
  };
}

module.exports = { calcularF29, factorProporcionalidad, remanenteAnteriorDe };

// Se exporta para pruebas y para el cierre mensual.
module.exports.expresionSigno = expresionSigno;
