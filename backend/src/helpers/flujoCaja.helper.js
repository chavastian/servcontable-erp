/**
 * Antigüedad de saldos y proyección de flujo de caja.
 *
 * Dos preguntas que hoy el sistema no responde: cuánto me deben y desde cuándo,
 * y con lo que hay pendiente, ¿me alcanza el mes que viene?
 *
 * La primera es un hecho: se calcula del saldo de cada documento y los días
 * transcurridos desde su fecha. La segunda es una estimación y se dice que lo es.
 *
 * Sobre la fecha de vencimiento
 * -----------------------------
 * Las tablas de compras y ventas **no guardan fecha de vencimiento**: el sistema
 * nunca la pidió. Entonces no se puede saber cuándo vence realmente cada
 * factura. Lo que se hace es aplicar un plazo en días sobre la fecha del
 * documento, que quien consulta define (30 por omisión, el plazo comercial más
 * común en Chile). La proyección viaja marcada como estimación, con el plazo
 * usado a la vista, para que nadie la lea como un dato cierto.
 *
 * Agregar la fecha de vencimiento al documento es el paso siguiente, y entonces
 * esto puede dejar de estimar.
 */

const {
  aFechaISO,
  diasDesdeHasta,
  sumarDiasAFecha,
} = require("./fecha.helper");
const { expresionSigno } = require("./documentoTributario.helper");

const DIA = 86400000;

// Tramos de antigüedad. Los mismos que usa cualquier informe de cartera.
const TRAMOS = [
  { codigo: "al_dia", titulo: "Por vencer", desde: -99999, hasta: 0 },
  { codigo: "1_30", titulo: "1 a 30 días", desde: 1, hasta: 30 },
  { codigo: "31_60", titulo: "31 a 60 días", desde: 31, hasta: 60 },
  { codigo: "61_90", titulo: "61 a 90 días", desde: 61, hasta: 90 },
  { codigo: "mas_90", titulo: "Más de 90 días", desde: 91, hasta: 99999 },
];

const PLAZO_POR_DEFECTO = 30;

// PostgreSQL entrega las columnas DATE como objetos Date, asi que toda fecha
// pasa por fecha.helper antes de cualquier resta.
function aFecha(valor) {
  return aFechaISO(valor);
}

function sumarDias(fechaISO, dias) {
  return sumarDiasAFecha(fechaISO, dias);
}

function diasEntre(desde, hasta) {
  return diasDesdeHasta(desde, hasta);
}

function tramoDe(diasVencido) {
  return (
    TRAMOS.find((t) => diasVencido >= t.desde && diasVencido <= t.hasta) ||
    TRAMOS[TRAMOS.length - 1]
  );
}

/**
 * Documentos de venta con saldo pendiente.
 *
 * Pendiente es el total del documento menos los cobros vigentes imputados a él,
 * igual que en cuentas por cobrar: si las dos pantallas calcularan distinto,
 * ninguna sería creíble.
 */
async function porCobrarPendiente(cliente, empresaId, hasta) {
  const { rows } = await cliente.query(
    `
    SELECT v.id, v.fecha, v.folio, v.tipo_documento,
           v.rut_cliente AS rut, v.razon_social_cliente AS tercero,
           v.total,
           COALESCE(SUM(pc.monto), 0) AS pagado,
           v.total - COALESCE(SUM(pc.monto), 0) AS saldo
    FROM ventas v
    LEFT JOIN pagos_cobros pc
      ON pc.empresa_id = v.empresa_id
     AND pc.tipo_documento = 'Venta'
     AND pc.documento_id = v.id
     AND pc.estado = 'vigente'
    WHERE v.empresa_id = $1
      AND v.estado = 'vigente'
      AND (${expresionSigno("v")}) > 0
      AND v.fecha <= $2
    GROUP BY v.id, v.fecha, v.folio, v.tipo_documento, v.rut_cliente,
             v.razon_social_cliente, v.total
    HAVING v.total - COALESCE(SUM(pc.monto), 0) > 0
    ORDER BY v.fecha
    `,
    [empresaId, hasta]
  );

  return rows;
}

/**
 * Compras y honorarios con saldo pendiente de pago.
 */
async function porPagarPendiente(cliente, empresaId, hasta) {
  const { rows } = await cliente.query(
    `
    SELECT c.id, 'compra' AS origen, c.fecha, c.folio, c.tipo_documento,
           c.rut_proveedor AS rut, c.razon_social_proveedor AS tercero,
           c.total,
           COALESCE(SUM(pc.monto), 0) AS pagado,
           c.total - COALESCE(SUM(pc.monto), 0) AS saldo
    FROM compras c
    LEFT JOIN pagos_cobros pc
      ON pc.empresa_id = c.empresa_id
     AND pc.tipo_documento = 'Compra'
     AND pc.documento_id = c.id
     AND pc.estado = 'vigente'
    WHERE c.empresa_id = $1
      AND c.estado = 'vigente'
      AND (${expresionSigno("c")}) > 0
      AND c.fecha <= $2
    GROUP BY c.id, c.fecha, c.folio, c.tipo_documento, c.rut_proveedor,
             c.razon_social_proveedor, c.total
    HAVING c.total - COALESCE(SUM(pc.monto), 0) > 0

    UNION ALL

    SELECT h.id, 'honorario', h.fecha_emision, h.folio, h.tipo_documento,
           h.rut_prestador, h.nombre_prestador,
           h.liquido,
           COALESCE(SUM(pc.monto), 0),
           h.liquido - COALESCE(SUM(pc.monto), 0)
    FROM honorarios h
    LEFT JOIN pagos_cobros pc
      ON pc.empresa_id = h.empresa_id
     AND pc.tipo_documento = 'Honorario'
     AND pc.documento_id = h.id
     AND pc.estado = 'vigente'
    WHERE h.empresa_id = $1
      AND h.estado = 'vigente'
      AND h.fecha_emision <= $2
    GROUP BY h.id, h.fecha_emision, h.folio, h.tipo_documento, h.rut_prestador,
             h.nombre_prestador, h.liquido
    HAVING h.liquido - COALESCE(SUM(pc.monto), 0) > 0

    ORDER BY 3
    `,
    [empresaId, hasta]
  );

  return rows;
}

/**
 * Reparte los documentos en tramos de antigüedad.
 *
 * Esto es un hecho, no una estimación: el saldo existe y la fecha del documento
 * existe. Lo único convencional es el plazo con que se decide desde cuándo un
 * documento está vencido.
 */
function agruparPorAntiguedad(documentos, { hoy, plazoDias }) {
  const tramos = TRAMOS.reduce((mapa, tramo) => {
    mapa[tramo.codigo] = { ...tramo, monto: 0, documentos: 0 };
    return mapa;
  }, {});

  let total = 0;

  const detalle = documentos.map((documento) => {
    const saldo = Math.round(Number(documento.saldo || 0));
    const vencimiento = sumarDias(documento.fecha, plazoDias);
    const diasVencido = diasEntre(vencimiento, hoy);
    const tramo = tramoDe(diasVencido);

    tramos[tramo.codigo].monto += saldo;
    tramos[tramo.codigo].documentos += 1;
    total += saldo;

    return {
      id: documento.id,
      origen: documento.origen || "venta",
      fecha: aFecha(documento.fecha),
      folio: documento.folio,
      tipo_documento: documento.tipo_documento,
      rut: documento.rut,
      tercero: documento.tercero,
      total: Math.round(Number(documento.total || 0)),
      pagado: Math.round(Number(documento.pagado || 0)),
      saldo,
      vencimiento_estimado: vencimiento,
      dias_vencido: diasVencido,
      tramo: tramo.codigo,
    };
  });

  return {
    total,
    documentos: detalle.length,
    tramos: Object.values(tramos),
    detalle,
  };
}

/**
 * Proyección semana a semana a partir de los saldos pendientes.
 *
 * Es una estimación y se declara como tal: supone que cada documento se cobra o
 * se paga en su vencimiento estimado, y que lo ya vencido entra en la primera
 * semana. Un cliente que no ha pagado en noventa días probablemente no pague la
 * próxima semana, así que lo vencido se muestra aparte en lugar de diluirlo.
 */
function proyectar(porCobrar, porPagar, { hoy, plazoDias, semanas = 8 }) {
  const tramosFuturos = [];

  for (let i = 0; i < semanas; i += 1) {
    const desde = sumarDias(hoy, i * 7);
    const hasta = sumarDias(hoy, i * 7 + 6);

    tramosFuturos.push({
      semana: i + 1,
      desde,
      hasta,
      ingresos: 0,
      egresos: 0,
      neto: 0,
    });
  }

  const vencido = { ingresos: 0, egresos: 0 };
  const masAdelante = { ingresos: 0, egresos: 0 };

  function repartir(documentos, campo, acumuladoVencido) {
    for (const documento of documentos) {
      const saldo = Math.round(Number(documento.saldo || 0));
      const vencimiento = sumarDias(documento.fecha, plazoDias);

      if (vencimiento < hoy) {
        acumuladoVencido[campo] += saldo;
        continue;
      }

      const tramo = tramosFuturos.find(
        (t) => vencimiento >= t.desde && vencimiento <= t.hasta
      );

      if (tramo) {
        tramo[campo] += saldo;
      } else {
        masAdelante[campo] += saldo;
      }
    }
  }

  repartir(porCobrar, "ingresos", vencido);
  repartir(porPagar, "egresos", vencido);

  let acumulado = 0;

  const semanasConNeto = tramosFuturos.map((tramo) => {
    const neto = tramo.ingresos - tramo.egresos;
    acumulado += neto;

    return { ...tramo, neto, acumulado };
  });

  const semanasNegativas = semanasConNeto.filter((s) => s.acumulado < 0);

  return {
    semanas: semanasConNeto,
    vencido,
    mas_adelante: masAdelante,
    resumen: {
      ingresos_proyectados: semanasConNeto.reduce((s, t) => s + t.ingresos, 0),
      egresos_proyectados: semanasConNeto.reduce((s, t) => s + t.egresos, 0),
      neto_proyectado: acumulado,
      primera_semana_negativa: semanasNegativas.length > 0 ? semanasNegativas[0].semana : null,
    },
    es_estimacion: true,
    supuestos: [
      `Cada documento se cobra o se paga ${plazoDias} días después de su fecha.`,
      "El sistema no guarda fecha de vencimiento, así que el plazo es el que se indicó en la consulta.",
      "Lo ya vencido se informa aparte y no se reparte en las semanas.",
      "No incluye sueldos, cotizaciones, impuestos ni gastos que aún no estén registrados como documento.",
    ],
  };
}

/**
 * Antigüedad más proyección, en una respuesta.
 */
async function flujoDeCaja(cliente, empresaId, opciones = {}) {
  const hoy = aFecha(opciones.hoy || new Date().toISOString());
  const plazoDias = Number.isFinite(Number(opciones.plazoDias))
    ? Number(opciones.plazoDias)
    : PLAZO_POR_DEFECTO;
  const semanas = Number(opciones.semanas) > 0 ? Number(opciones.semanas) : 8;

  const [cobrar, pagar] = await Promise.all([
    porCobrarPendiente(cliente, empresaId, hoy),
    porPagarPendiente(cliente, empresaId, hoy),
  ]);

  const antiguedadCobrar = agruparPorAntiguedad(cobrar, { hoy, plazoDias });
  const antiguedadPagar = agruparPorAntiguedad(pagar, { hoy, plazoDias });
  const proyeccion = proyectar(cobrar, pagar, { hoy, plazoDias, semanas });

  return {
    hoy,
    plazo_dias: plazoDias,
    por_cobrar: antiguedadCobrar,
    por_pagar: antiguedadPagar,
    posicion_actual: {
      por_cobrar: antiguedadCobrar.total,
      por_pagar: antiguedadPagar.total,
      diferencia: antiguedadCobrar.total - antiguedadPagar.total,
    },
    proyeccion,
  };
}

module.exports = {
  TRAMOS,
  PLAZO_POR_DEFECTO,
  sumarDias,
  diasEntre,
  tramoDe,
  agruparPorAntiguedad,
  proyectar,
  porCobrarPendiente,
  porPagarPendiente,
  flujoDeCaja,
};
