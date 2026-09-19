/**
 * Calce automático de la cartola bancaria.
 *
 * Conciliar es la tarea más tediosa del mes: se recorre la cartola línea por
 * línea buscando a qué documento o pago corresponde cada movimiento. La mayoría
 * calza por monto y fecha, y muchas veces el RUT viene escrito en la
 * descripción.
 *
 * Esto no aplica nada por su cuenta: **propone**. Un calce equivocado ensucia la
 * contabilidad, así que la decisión la toma una persona, y solo se confirman los
 * que ella acepte. Lo que el sistema aporta es dejar de buscar a mano.
 *
 * Reglas, en orden de confianza:
 *
 *   1. Monto exacto, fecha dentro del margen y RUT presente en la descripción.
 *   2. Monto exacto y fecha dentro del margen, si hay un solo candidato.
 *   3. Monto exacto y fecha dentro de un margen más amplio, si hay uno solo.
 *
 * Si quedan varios candidatos igual de buenos, no se propone ninguno: adivinar
 * entre dos es peor que no proponer.
 */

const { aFechaISO, diasEntreFechas } = require("./fecha.helper");

// Margen de días entre la fecha del banco y la del documento.
const DIAS_CERCA = 5;
const DIAS_AMPLIO = 30;

// Tolerancia en pesos. Uno, porque los redondeos de un peso existen.
const TOLERANCIA = 1;

/**
 * Extrae RUTs que aparezcan en el texto de la cartola.
 *
 * Los bancos los escriben de cualquier forma: con puntos, sin puntos, con guion
 * o pegados. Se normaliza todo a cuerpo sin formato para poder comparar.
 */
function rutsEnTexto(texto) {
  const limpio = String(texto || "").toUpperCase();
  const encontrados = new Set();

  // Con o sin puntos, con guion y dígito verificador.
  const patron = /(\d{1,2}[.]?\d{3}[.]?\d{3})\s*-?\s*([0-9K])/g;
  let coincidencia = patron.exec(limpio);

  while (coincidencia) {
    const cuerpo = coincidencia[1].replace(/\./g, "");
    encontrados.add(`${cuerpo}-${coincidencia[2]}`);
    coincidencia = patron.exec(limpio);
  }

  return [...encontrados];
}

function normalizarRut(valor) {
  return String(valor || "")
    .toUpperCase()
    .replace(/[.\s]/g, "");
}

// Las fechas llegan como Date desde PostgreSQL, no como texto: normalizarlas es
// lo que hace fecha.helper.
function diasEntre(a, b) {
  return diasEntreFechas(a, b);
}

/**
 * Candidatos con los que puede calzar un movimiento bancario.
 *
 * Un cargo en el banco es plata que salió: paga una compra o un honorario. Un
 * abono es plata que entró: cobra una venta. Se miran los documentos con saldo
 * pendiente y los pagos ya registrados que todavía no se conciliaron.
 */
async function candidatosParaMovimiento(cliente, empresaId, movimiento) {
  const esAbono = Number(movimiento.abono || 0) > 0;
  const monto = Math.abs(
    Number(movimiento.monto || movimiento.abono || movimiento.cargo || 0)
  );

  if (monto <= 0) return [];

  const desde = TOLERANCIA;

  if (esAbono) {
    // Entró plata: probablemente una venta que se cobró.
    const { rows } = await cliente.query(
      `
      SELECT v.id, 'venta' AS origen, v.folio, v.fecha,
             v.rut_cliente AS rut, v.razon_social_cliente AS tercero,
             v.total AS monto, v.comprobante_id
      FROM ventas v
      WHERE v.empresa_id = $1
        AND v.estado = 'vigente'
        AND ABS(v.total - $2) <= $3
      UNION ALL
      SELECT pc.id, 'pago_cobro', pc.folio, pc.fecha,
             pc.rut_tercero, pc.nombre_tercero, pc.monto, pc.comprobante_id
      FROM pagos_cobros pc
      WHERE pc.empresa_id = $1
        AND pc.estado = 'vigente'
        AND pc.tipo_movimiento = 'Cobro'
        AND ABS(pc.monto - $2) <= $3
      LIMIT 40
      `,
      [empresaId, monto, desde]
    );

    return rows;
  }

  // Salió plata: una compra o un honorario que se pagó.
  const { rows } = await cliente.query(
    `
    SELECT c.id, 'compra' AS origen, c.folio, c.fecha,
           c.rut_proveedor AS rut, c.razon_social_proveedor AS tercero,
           c.total AS monto, c.comprobante_id
    FROM compras c
    WHERE c.empresa_id = $1
      AND c.estado = 'vigente'
      AND ABS(c.total - $2) <= $3
    UNION ALL
    SELECT h.id, 'honorario', h.folio, h.fecha_emision,
           h.rut_prestador, h.nombre_prestador, h.liquido, h.comprobante_id
    FROM honorarios h
    WHERE h.empresa_id = $1
      AND h.estado = 'vigente'
      AND ABS(h.liquido - $2) <= $3
    UNION ALL
    SELECT pc.id, 'pago_cobro', pc.folio, pc.fecha,
           pc.rut_tercero, pc.nombre_tercero, pc.monto, pc.comprobante_id
    FROM pagos_cobros pc
    WHERE pc.empresa_id = $1
      AND pc.estado = 'vigente'
      AND pc.tipo_movimiento = 'Pago'
      AND ABS(pc.monto - $2) <= $3
    LIMIT 40
    `,
    [empresaId, monto, desde]
  );

  return rows;
}

/**
 * Decide la mejor propuesta para un movimiento, o ninguna.
 */
function elegirPropuesta(movimiento, candidatos) {
  if (candidatos.length === 0) {
    return { propuesta: null, motivo: "sin_candidatos" };
  }

  const rutsDelTexto = rutsEnTexto(
    `${movimiento.descripcion || ""} ${movimiento.documento || ""}`
  ).map(normalizarRut);

  const conDistancia = candidatos.map((candidato) => ({
    ...candidato,
    dias: diasEntre(movimiento.fecha, candidato.fecha),
    rutCoincide:
      rutsDelTexto.length > 0 &&
      rutsDelTexto.includes(normalizarRut(candidato.rut)),
  }));

  // Regla 1: RUT en la descripción y fecha cerca. Es la más confiable.
  const porRut = conDistancia.filter((c) => c.rutCoincide && c.dias <= DIAS_AMPLIO);

  if (porRut.length === 1) {
    return {
      propuesta: porRut[0],
      confianza: "alta",
      motivo: "monto exacto, RUT en la descripcion y fecha cercana",
    };
  }

  if (porRut.length > 1) {
    // Varios del mismo RUT por el mismo monto: hay que elegir a mano.
    return {
      propuesta: null,
      motivo: "varios_candidatos",
      candidatos: porRut.slice(0, 5),
    };
  }

  // Regla 2: monto exacto y fecha cerca, si hay uno solo.
  const cerca = conDistancia.filter((c) => c.dias <= DIAS_CERCA);

  if (cerca.length === 1) {
    return {
      propuesta: cerca[0],
      confianza: "media",
      motivo: `monto exacto y fecha a ${cerca[0].dias} dia(s)`,
    };
  }

  // Regla 3: monto exacto en un margen amplio, si hay uno solo.
  const amplio = conDistancia.filter((c) => c.dias <= DIAS_AMPLIO);

  if (amplio.length === 1) {
    return {
      propuesta: amplio[0],
      confianza: "baja",
      motivo: `monto exacto, pero la fecha esta a ${amplio[0].dias} dia(s)`,
    };
  }

  return {
    propuesta: null,
    motivo: amplio.length > 1 ? "varios_candidatos" : "sin_candidatos",
    candidatos: amplio.slice(0, 5),
  };
}

/**
 * Propone calces para los movimientos pendientes de un período.
 *
 * No escribe nada.
 */
async function proponerCalces(cliente, empresaId, periodo, { limite = 200 } = {}) {
  const { rows: movimientos } = await cliente.query(
    `
    SELECT id, fecha, descripcion, documento, cargo, abono, monto
    FROM conciliacion_bancaria_movimientos
    WHERE empresa_id = $1
      AND periodo = $2
      AND COALESCE(estado, 'pendiente') = 'pendiente'
    ORDER BY fecha, id
    LIMIT $3
    `,
    [empresaId, periodo, limite]
  );

  const propuestas = [];
  const sinCalce = [];
  const ambiguos = [];

  for (const movimiento of movimientos) {
    const candidatos = await candidatosParaMovimiento(cliente, empresaId, movimiento);
    const decision = elegirPropuesta(movimiento, candidatos);

    const base = {
      movimiento_id: movimiento.id,
      fecha: aFechaISO(movimiento.fecha),
      descripcion: movimiento.descripcion,
      cargo: Number(movimiento.cargo || 0),
      abono: Number(movimiento.abono || 0),
    };

    if (decision.propuesta) {
      propuestas.push({
        ...base,
        confianza: decision.confianza,
        motivo: decision.motivo,
        calza_con: {
          origen: decision.propuesta.origen,
          id: decision.propuesta.id,
          folio: decision.propuesta.folio,
          fecha: aFechaISO(decision.propuesta.fecha),
          tercero: decision.propuesta.tercero,
          rut: decision.propuesta.rut,
          monto: Number(decision.propuesta.monto),
          comprobante_id: decision.propuesta.comprobante_id,
        },
      });
      continue;
    }

    if (decision.motivo === "varios_candidatos") {
      ambiguos.push({
        ...base,
        motivo: "Hay más de un documento que calza. Elegir a mano.",
        candidatos: (decision.candidatos || []).map((c) => ({
          origen: c.origen,
          id: c.id,
          folio: c.folio,
          fecha: aFechaISO(c.fecha),
          tercero: c.tercero,
          monto: Number(c.monto),
          comprobante_id: c.comprobante_id || null,
        })),
      });
      continue;
    }

    sinCalce.push({ ...base, motivo: "No se encontró documento con ese monto." });
  }

  const altas = propuestas.filter((p) => p.confianza === "alta").length;

  return {
    periodo,
    revisados: movimientos.length,
    propuestas,
    ambiguos,
    sin_calce: sinCalce,
    resumen: {
      con_propuesta: propuestas.length,
      confianza_alta: altas,
      confianza_media: propuestas.filter((p) => p.confianza === "media").length,
      confianza_baja: propuestas.filter((p) => p.confianza === "baja").length,
      ambiguos: ambiguos.length,
      sin_calce: sinCalce.length,
    },
  };
}

module.exports = {
  DIAS_CERCA,
  DIAS_AMPLIO,
  rutsEnTexto,
  diasEntre,
  elegirPropuesta,
  candidatosParaMovimiento,
  proponerCalces,
};
