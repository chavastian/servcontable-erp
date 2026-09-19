/**
 * Revisiones de consistencia sobre la contabilidad de una empresa.
 *
 * Son las comprobaciones que un contador hace de memoria antes de declarar, y
 * que hoy nadie le recuerda: que los asientos cuadren, que no queden documentos
 * sin cuenta asignada, que el IVA del libro coincida con lo contabilizado, que
 * no falten folios en la serie de ventas.
 *
 * Cada revisión devuelve la misma forma, para que el panel y el cierre mensual
 * puedan mostrarlas igual:
 *
 *   { codigo, titulo, estado, detalle, cantidad, afectados }
 *
 * `estado` es `ok`, `aviso` o `error`. La diferencia importa: un aviso es algo
 * que conviene mirar; un error es algo que hace que lo declarado no cuadre.
 *
 * Todas las consultas filtran por empresa y solo miran documentos vigentes.
 */

const { sumaConSigno } = require("./documentoTributario.helper");

const ESTADOS = Object.freeze({ OK: "ok", AVISO: "aviso", ERROR: "error" });

function resultado(codigo, titulo, estado, detalle, extra = {}) {
  return { codigo, titulo, estado, detalle, cantidad: 0, afectados: [], ...extra };
}

/**
 * Asientos cuyo debe no iguala al haber.
 *
 * Es el error más grave que puede tener un libro: rompe la partida doble y el
 * balance no cuadra. Desde ahora la validación impide crearlos, pero los que ya
 * existen hay que encontrarlos.
 */
async function asientosDescuadrados(cliente, empresaId, { desde, hasta }) {
  const { rows } = await cliente.query(
    `
    SELECT c.id, c.tipo, c.numero, c.fecha,
           COALESCE(SUM(cd.debe), 0)  AS debe,
           COALESCE(SUM(cd.haber), 0) AS haber
    FROM comprobantes c
    LEFT JOIN comprobante_detalle cd ON cd.comprobante_id = c.id
    WHERE c.empresa_id = $1
      AND c.estado = 'vigente'
      AND c.fecha BETWEEN $2 AND $3
    GROUP BY c.id, c.tipo, c.numero, c.fecha
    HAVING ROUND(COALESCE(SUM(cd.debe), 0)) <> ROUND(COALESCE(SUM(cd.haber), 0))
    ORDER BY c.fecha, c.numero
    LIMIT 50
    `,
    [empresaId, desde, hasta]
  );

  if (rows.length === 0) {
    return resultado(
      "asientos_descuadrados",
      "Asientos cuadrados",
      ESTADOS.OK,
      "Todos los asientos del período cuadran."
    );
  }

  return resultado(
    "asientos_descuadrados",
    "Asientos descuadrados",
    ESTADOS.ERROR,
    `${rows.length} asiento(s) con debe distinto del haber. El balance no va a cuadrar.`,
    {
      cantidad: rows.length,
      afectados: rows.map((f) => ({
        id: f.id,
        referencia: `${f.tipo} N° ${f.numero}`,
        fecha: f.fecha,
        debe: Number(f.debe),
        haber: Number(f.haber),
        diferencia: Number(f.debe) - Number(f.haber),
      })),
    }
  );
}

/**
 * Documentos sin cuenta contable asignada.
 *
 * Una compra sin cuenta de gasto no puede generar su asiento, así que queda
 * fuera de los libros sin que nada avise.
 */
async function documentosSinCuenta(cliente, empresaId, { desde, hasta }) {
  const { rows } = await cliente.query(
    `
    SELECT 'compra' AS origen, id, folio, fecha, razon_social_proveedor AS tercero, total
    FROM compras
    WHERE empresa_id = $1 AND estado = 'vigente'
      AND fecha BETWEEN $2 AND $3
      AND cuenta_gasto_id IS NULL
    UNION ALL
    SELECT 'venta' AS origen, id, folio, fecha, razon_social_cliente AS tercero, total
    FROM ventas
    WHERE empresa_id = $1 AND estado = 'vigente'
      AND fecha BETWEEN $2 AND $3
      AND cuenta_ingreso_id IS NULL
    ORDER BY fecha, folio
    LIMIT 100
    `,
    [empresaId, desde, hasta]
  );

  if (rows.length === 0) {
    return resultado(
      "documentos_sin_cuenta",
      "Documentos con cuenta asignada",
      ESTADOS.OK,
      "Todos los documentos del período tienen su cuenta contable."
    );
  }

  return resultado(
    "documentos_sin_cuenta",
    "Documentos sin cuenta contable",
    ESTADOS.ERROR,
    `${rows.length} documento(s) sin cuenta asignada. No generan asiento y quedan fuera de los libros.`,
    {
      cantidad: rows.length,
      afectados: rows.map((f) => ({
        id: f.id,
        origen: f.origen,
        referencia: `${f.origen} folio ${f.folio || "sin folio"}`,
        fecha: f.fecha,
        tercero: f.tercero,
        total: Number(f.total),
      })),
    }
  );
}

/**
 * Documentos vigentes sin su asiento generado.
 */
async function documentosSinAsiento(cliente, empresaId, { desde, hasta }) {
  const { rows } = await cliente.query(
    `
    SELECT 'compra' AS origen, COUNT(*)::int AS n
    FROM compras
    WHERE empresa_id = $1 AND estado = 'vigente'
      AND fecha BETWEEN $2 AND $3 AND comprobante_id IS NULL
    UNION ALL
    SELECT 'venta', COUNT(*)::int
    FROM ventas
    WHERE empresa_id = $1 AND estado = 'vigente'
      AND fecha BETWEEN $2 AND $3 AND comprobante_id IS NULL
    `,
    [empresaId, desde, hasta]
  );

  const total = rows.reduce((suma, f) => suma + Number(f.n), 0);

  if (total === 0) {
    return resultado(
      "documentos_sin_asiento",
      "Documentos contabilizados",
      ESTADOS.OK,
      "Todos los documentos del período tienen su asiento."
    );
  }

  return resultado(
    "documentos_sin_asiento",
    "Documentos sin contabilizar",
    ESTADOS.AVISO,
    `${total} documento(s) sin asiento generado.`,
    {
      cantidad: total,
      afectados: rows
        .filter((f) => Number(f.n) > 0)
        .map((f) => ({ origen: f.origen, cantidad: Number(f.n) })),
    }
  );
}

/**
 * El IVA del libro contra el IVA contabilizado.
 *
 * Es la revisión que evita declarar un F29 que no coincide con la contabilidad.
 * Si los dos números difieren, uno de los dos está mal y hay que saber cuál
 * antes de presentar.
 */
async function ivaLibroContraContabilidad(cliente, empresaId, periodo) {
  // Solo los documentos que tienen asiento.
  //
  // Un documento sin asiento ya lo informa la revisión de documentos sin
  // contabilizar; contarlo también acá haría que el mismo problema apareciera
  // dos veces y volvería esta revisión ruido que nadie mira.
  const libro = await cliente.query(
    `
    SELECT
      (SELECT ${sumaConSigno("iva")} FROM ventas
        WHERE empresa_id = $1 AND periodo = $2 AND estado = 'vigente'
          AND comprobante_id IS NOT NULL) AS debito,
      (SELECT ${sumaConSigno("iva_credito")} FROM compras
        WHERE empresa_id = $1 AND periodo = $2 AND estado = 'vigente'
          AND comprobante_id IS NOT NULL) AS credito
    `,
    [empresaId, periodo]
  );

  const configuracion = await cliente.query(
    `SELECT cuenta_iva_debito_id, cuenta_iva_credito_id
     FROM configuracion_contable WHERE empresa_id = $1 LIMIT 1`,
    [empresaId]
  );

  const config = configuracion.rows[0];

  if (!config?.cuenta_iva_debito_id || !config?.cuenta_iva_credito_id) {
    return resultado(
      "iva_libro_contabilidad",
      "IVA del libro contra contabilidad",
      ESTADOS.AVISO,
      "No se puede comparar: faltan las cuentas de IVA en la Configuración Contable."
    );
  }

  // Solo los asientos de esos mismos documentos, no todo el movimiento del mes
  // en las cuentas de IVA.
  //
  // Mirar la cuenta completa daba falsas alarmas: el asiento que paga el F29
  // debita la cuenta de IVA débito para dejarla en cero, así que en una empresa
  // que contabiliza el pago el movimiento neto del mes quedaba negativo y la
  // revisión gritaba un descuadre que no existía. Lo que esta revisión tiene que
  // responder es si el asiento de cada documento lleva el IVA que el documento
  // declara.
  const contable = await cliente.query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN cd.cuenta_id = $3 THEN cd.haber - cd.debe ELSE 0 END), 0) AS debito,
      COALESCE(SUM(CASE WHEN cd.cuenta_id = $4 THEN cd.debe - cd.haber ELSE 0 END), 0) AS credito
    FROM comprobante_detalle cd
    JOIN comprobantes c ON c.id = cd.comprobante_id
    WHERE c.empresa_id = $1
      AND c.estado = 'vigente'
      AND (
        c.id IN (
          SELECT comprobante_id FROM ventas
          WHERE empresa_id = $1 AND periodo = $2 AND estado = 'vigente'
            AND comprobante_id IS NOT NULL
        )
        OR c.id IN (
          SELECT comprobante_id FROM compras
          WHERE empresa_id = $1 AND periodo = $2 AND estado = 'vigente'
            AND comprobante_id IS NOT NULL
        )
      )
    `,
    [empresaId, periodo, config.cuenta_iva_debito_id, config.cuenta_iva_credito_id]
  );

  const debitoLibro = Math.round(Number(libro.rows[0].debito));
  const creditoLibro = Math.round(Number(libro.rows[0].credito));
  const debitoContable = Math.round(Number(contable.rows[0].debito));
  const creditoContable = Math.round(Number(contable.rows[0].credito));

  const difDebito = debitoLibro - debitoContable;
  const difCredito = creditoLibro - creditoContable;
  const cuadra = difDebito === 0 && difCredito === 0;

  const cifras = {
    debito_libro: debitoLibro,
    debito_contable: debitoContable,
    diferencia_debito: difDebito,
    credito_libro: creditoLibro,
    credito_contable: creditoContable,
    diferencia_credito: difCredito,
  };

  if (cuadra) {
    return resultado(
      "iva_libro_contabilidad",
      "IVA del libro contra contabilidad",
      ESTADOS.OK,
      "El IVA de los documentos coincide con el de sus asientos.",
      { cifras }
    );
  }

  return resultado(
    "iva_libro_contabilidad",
    "IVA del libro contra contabilidad",
    ESTADOS.ERROR,
    "El IVA que declaran los documentos no coincide con el de sus asientos. Revisar antes de declarar el F29.",
    { cifras }
  );
}

/**
 * Movimientos bancarios sin conciliar.
 */
async function conciliacionPendiente(cliente, empresaId, periodo) {
  const { rows } = await cliente.query(
    `
    SELECT COUNT(*)::int AS pendientes,
           COALESCE(SUM(ABS(monto)), 0) AS monto
    FROM conciliacion_bancaria_movimientos
    WHERE empresa_id = $1
      AND periodo = $2
      AND COALESCE(estado, 'pendiente') = 'pendiente'
    `,
    [empresaId, periodo]
  );

  const pendientes = Number(rows[0].pendientes);

  if (pendientes === 0) {
    return resultado(
      "conciliacion_pendiente",
      "Conciliación bancaria al día",
      ESTADOS.OK,
      "No hay movimientos bancarios sin conciliar en el período."
    );
  }

  return resultado(
    "conciliacion_pendiente",
    "Conciliación bancaria pendiente",
    ESTADOS.AVISO,
    `${pendientes} movimiento(s) bancario(s) sin conciliar.`,
    { cantidad: pendientes, cifras: { monto_pendiente: Math.round(Number(rows[0].monto)) } }
  );
}

/**
 * Saltos en la numeración de las ventas.
 *
 * El SII espera una serie continua por tipo de documento. Un folio que falta
 * suele significar un documento que no se registró, y eso se pregunta después.
 */
async function foliosFaltantes(cliente, empresaId, periodo) {
  const { rows } = await cliente.query(
    `
    WITH numeradas AS (
      SELECT tipo_documento,
             folio::bigint AS folio
      FROM ventas
      WHERE empresa_id = $1
        AND periodo = $2
        AND estado = 'vigente'
        AND folio ~ '^[0-9]+$'
    ),
    saltos AS (
      SELECT tipo_documento,
             folio,
             LAG(folio) OVER (PARTITION BY tipo_documento ORDER BY folio) AS anterior
      FROM numeradas
    )
    SELECT tipo_documento, anterior, folio, (folio - anterior - 1) AS faltan
    FROM saltos
    WHERE anterior IS NOT NULL AND folio - anterior > 1
    ORDER BY tipo_documento, folio
    LIMIT 50
    `,
    [empresaId, periodo]
  );

  if (rows.length === 0) {
    return resultado(
      "folios_faltantes",
      "Numeración de ventas continua",
      ESTADOS.OK,
      "No hay saltos en los folios de venta del período."
    );
  }

  const total = rows.reduce((suma, f) => suma + Number(f.faltan), 0);

  return resultado(
    "folios_faltantes",
    "Saltos en la numeración de ventas",
    ESTADOS.AVISO,
    `Faltan ${total} folio(s) en la serie. Puede ser un documento sin registrar.`,
    {
      cantidad: total,
      afectados: rows.map((f) => ({
        tipo_documento: f.tipo_documento,
        desde: Number(f.anterior) + 1,
        hasta: Number(f.folio) - 1,
        faltan: Number(f.faltan),
      })),
    }
  );
}

/**
 * Documentos repetidos.
 *
 * El mismo tipo, folio y RUT dos veces es casi siempre una carga duplicada, y
 * duplica el IVA declarado.
 */
async function documentosDuplicados(cliente, empresaId, periodo) {
  const { rows } = await cliente.query(
    `
    SELECT 'compra' AS origen, tipo_documento, folio, rut_proveedor AS rut,
           COUNT(*)::int AS veces, SUM(total) AS total
    FROM compras
    WHERE empresa_id = $1 AND periodo = $2 AND estado = 'vigente'
      AND COALESCE(folio, '') <> ''
    GROUP BY 1, 2, 3, 4
    HAVING COUNT(*) > 1
    UNION ALL
    SELECT 'venta', tipo_documento, folio, rut_cliente,
           COUNT(*)::int, SUM(total)
    FROM ventas
    WHERE empresa_id = $1 AND periodo = $2 AND estado = 'vigente'
      AND COALESCE(folio, '') <> ''
    GROUP BY 1, 2, 3, 4
    HAVING COUNT(*) > 1
    LIMIT 50
    `,
    [empresaId, periodo]
  );

  if (rows.length === 0) {
    return resultado(
      "documentos_duplicados",
      "Sin documentos duplicados",
      ESTADOS.OK,
      "No hay documentos repetidos en el período."
    );
  }

  return resultado(
    "documentos_duplicados",
    "Documentos duplicados",
    ESTADOS.ERROR,
    `${rows.length} documento(s) cargado(s) más de una vez. Duplican el IVA del período.`,
    {
      cantidad: rows.length,
      afectados: rows.map((f) => ({
        origen: f.origen,
        referencia: `${f.tipo_documento} folio ${f.folio}`,
        rut: f.rut,
        veces: Number(f.veces),
        total: Number(f.total),
      })),
    }
  );
}

/**
 * Montos muy distintos de lo habitual para ese proveedor.
 *
 * No afirma que esté mal: señala lo que conviene mirar. Un gasto diez veces
 * mayor que el promedio del proveedor suele ser un error de digitación, un
 * punto decimal corrido.
 */
async function montosAtipicos(cliente, empresaId, periodo) {
  const { rows } = await cliente.query(
    `
    WITH historia AS (
      SELECT rut_proveedor,
             AVG(total) AS promedio,
             COUNT(*)::int AS documentos
      FROM compras
      WHERE empresa_id = $1
        AND estado = 'vigente'
        AND periodo < $2
        AND COALESCE(rut_proveedor, '') <> ''
      GROUP BY rut_proveedor
      HAVING COUNT(*) >= 3
    )
    SELECT c.id, c.folio, c.fecha, c.razon_social_proveedor, c.total,
           ROUND(h.promedio) AS promedio_historico,
           h.documentos
    FROM compras c
    JOIN historia h ON h.rut_proveedor = c.rut_proveedor
    WHERE c.empresa_id = $1
      AND c.periodo = $2
      AND c.estado = 'vigente'
      AND h.promedio > 0
      AND c.total > h.promedio * 5
    ORDER BY c.total DESC
    LIMIT 20
    `,
    [empresaId, periodo]
  );

  if (rows.length === 0) {
    return resultado(
      "montos_atipicos",
      "Montos dentro de lo habitual",
      ESTADOS.OK,
      "Ninguna compra se aparta del historial de su proveedor."
    );
  }

  return resultado(
    "montos_atipicos",
    "Montos fuera de lo habitual",
    ESTADOS.AVISO,
    `${rows.length} compra(s) más de cinco veces sobre el promedio de su proveedor. Vale la pena revisarlas.`,
    {
      cantidad: rows.length,
      afectados: rows.map((f) => ({
        id: f.id,
        referencia: `folio ${f.folio || "sin folio"}`,
        fecha: f.fecha,
        tercero: f.razon_social_proveedor,
        total: Number(f.total),
        promedio_historico: Number(f.promedio_historico),
        veces: Number((Number(f.total) / Number(f.promedio_historico)).toFixed(1)),
        documentos_previos: Number(f.documentos),
      })),
    }
  );
}

/**
 * Estado del ejercicio contable del año del período.
 */
async function estadoDelEjercicio(cliente, empresaId, periodo) {
  const anio = Number(String(periodo).slice(0, 4));

  const { rows } = await cliente.query(
    `SELECT estado, fecha_cierre FROM ejercicios_contables
     WHERE empresa_id = $1 AND anio = $2 LIMIT 1`,
    [empresaId, anio]
  );

  if (rows.length === 0) {
    return resultado(
      "ejercicio",
      "Ejercicio contable",
      ESTADOS.AVISO,
      `No hay un ejercicio ${anio} registrado. Conviene crearlo para poder cerrarlo después.`
    );
  }

  const cerrado = String(rows[0].estado || "").toLowerCase() === "cerrado";

  return resultado(
    "ejercicio",
    "Ejercicio contable",
    ESTADOS.OK,
    cerrado
      ? `El ejercicio ${anio} está cerrado. No admite cambios.`
      : `El ejercicio ${anio} está abierto.`,
    { cifras: { anio, estado: rows[0].estado, cerrado } }
  );
}

/**
 * Corre todas las revisiones de un período.
 *
 * Devuelve el conjunto más un resumen, para que quien llame no tenga que
 * recorrerlas para saber si algo anda mal.
 */
/**
 * Compras declaradas mas de dos periodos despues de su fecha.
 *
 * El articulo 24 del DL 825 permite usar el credito hasta dos periodos despues
 * si la factura se recibio con atraso. Pasado eso, el credito se pierde y el
 * documento no debe entrar al F29 de ese mes.
 */
async function documentosRezagados(cliente, empresaId, periodo) {
  const { rows } = await cliente.query(
    `
    SELECT id, folio, tipo_documento, fecha, razon_social_proveedor AS tercero, total
    FROM compras
    WHERE empresa_id = $1
      AND periodo = $2
      AND estado = 'vigente'
      AND (DATE_TRUNC('month', ($2 || '-01')::date) - DATE_TRUNC('month', fecha)) > INTERVAL '2 months'
    ORDER BY fecha
    LIMIT 50
    `,
    [empresaId, periodo]
  );

  if (rows.length === 0) {
    return resultado(
      "documentos_rezagados",
      "Compras dentro del plazo de credito",
      ESTADOS.OK,
      "Ninguna compra se declara mas de dos periodos despues de su fecha."
    );
  }

  return resultado(
    "documentos_rezagados",
    "Compras fuera del plazo de credito",
    ESTADOS.ERROR,
    `${rows.length} compra(s) con fecha de mas de dos periodos atras. El credito fiscal de esas facturas ya no se puede usar (articulo 24 del DL 825).`,
    {
      cantidad: rows.length,
      afectados: rows.map((f) => ({
        id: f.id,
        referencia: `${f.tipo_documento} folio ${f.folio || "s/f"}`,
        fecha: f.fecha,
        tercero: f.tercero,
        total: Number(f.total),
      })),
    }
  );
}

/**
 * F29: registrado o no, y si lo registrado coincide con lo que el sistema
 * calculo al registrarlo. Ademas, documentos tocados despues de presentar.
 */
async function f29DelPeriodo(cliente, empresaId, periodo) {
  const hoy = new Date().toISOString().slice(0, 7);

  const { rows } = await cliente.query(
    `SELECT d.id, d.folio_sii, d.fecha_presentacion, d.total_pagado,
            r.total_f29 AS calculado_al_registrar,
            (SELECT COUNT(*)::int FROM compras c
              WHERE c.empresa_id = d.empresa_id AND c.periodo = d.periodo
                AND COALESCE(c.actualizado_en, c.creado_en) > d.fecha_presentacion + INTERVAL '1 day')
            + (SELECT COUNT(*)::int FROM ventas v
              WHERE v.empresa_id = d.empresa_id AND v.periodo = d.periodo
                AND COALESCE(v.actualizado_en, v.creado_en) > d.fecha_presentacion + INTERVAL '1 day')
              AS documentos_posteriores
     FROM declaraciones_f29 d
     LEFT JOIN remanente_iva r ON r.empresa_id = d.empresa_id AND r.periodo = d.periodo
     WHERE d.empresa_id = $1 AND d.periodo = $2 AND d.estado = 'vigente'`,
    [empresaId, periodo]
  );

  if (rows.length === 0) {
    if (periodo < hoy) {
      return resultado(
        "f29_presentado",
        "F29 sin registrar",
        ESTADOS.AVISO,
        "El periodo ya paso y no hay un F29 registrado. Registra el folio y la fecha de presentacion para fijar el remanente."
      );
    }

    return resultado("f29_presentado", "F29", ESTADOS.OK, "El periodo aun esta en curso.");
  }

  const d = rows[0];
  const diferencia = Math.round(Number(d.total_pagado || 0) - Number(d.calculado_al_registrar || 0));
  const posteriores = Number(d.documentos_posteriores || 0);

  if (diferencia !== 0) {
    return resultado(
      "f29_presentado",
      "F29 presentado con diferencia",
      ESTADOS.ERROR,
      `Lo pagado en el F29 (${Number(d.total_pagado).toLocaleString("es-CL")}) difiere en ${diferencia.toLocaleString("es-CL")} de lo que el sistema calculo al registrarlo.`,
      { cantidad: 1, cifras: { pagado: Number(d.total_pagado), calculado: Number(d.calculado_al_registrar), diferencia } }
    );
  }

  if (posteriores > 0) {
    return resultado(
      "f29_presentado",
      "Documentos modificados despues de presentar el F29",
      ESTADOS.AVISO,
      `${posteriores} documento(s) del periodo se crearon o modificaron despues de la presentacion del ${String(d.fecha_presentacion).slice(0, 10)}. Puede corresponder una rectificatoria.`,
      { cantidad: posteriores }
    );
  }

  return resultado(
    "f29_presentado",
    "F29 presentado",
    ESTADOS.OK,
    `F29 ${d.folio_sii ? `folio ${d.folio_sii}` : ""} registrado el ${String(d.fecha_presentacion).slice(0, 10)}, coincide con lo calculado.`.replace("  ", " ")
  );
}

async function honorariosSinFechaDePago(cliente, empresaId, periodo) {
  const { rows } = await cliente.query(
    `SELECT id, folio, nombre_prestador AS tercero, fecha_emision AS fecha, retencion
     FROM honorarios
     WHERE empresa_id = $1 AND estado = 'vigente' AND fecha_pago IS NULL
       AND TO_CHAR(fecha_emision, 'YYYY-MM') = $2
     ORDER BY fecha_emision LIMIT 50`,
    [empresaId, periodo]
  );

  if (rows.length === 0) {
    return resultado("honorarios_fecha_pago", "Honorarios con fecha de pago", ESTADOS.OK, "Todas las boletas del periodo tienen fecha de pago.");
  }

  return resultado(
    "honorarios_fecha_pago",
    "Boletas de honorarios sin fecha de pago",
    ESTADOS.AVISO,
    `${rows.length} boleta(s) sin fecha de pago. La retencion se declara en el mes en que se paga (articulo 79 de la Ley de la Renta); sin fecha, el sistema la declara por emision.`,
    { cantidad: rows.length, afectados: rows.map((f) => ({ id: f.id, referencia: `boleta ${f.folio || "s/f"}`, fecha: f.fecha, tercero: f.tercero, total: Number(f.retencion) })) }
  );
}

async function facturasDeCompra(cliente, empresaId, periodo) {
  const { rows } = await cliente.query(
    `SELECT id, folio, razon_social_proveedor AS tercero, fecha, iva_credito
     FROM compras
     WHERE empresa_id = $1 AND periodo = $2 AND estado = 'vigente' AND sii_tipo_doc = '46'
     ORDER BY fecha LIMIT 50`,
    [empresaId, periodo]
  );

  if (rows.length === 0) {
    return resultado("facturas_compra", "Facturas de compra", ESTADOS.OK, "No hay facturas de compra (tipo 46) en el periodo.");
  }

  const retenido = rows.reduce((suma, f) => suma + Number(f.iva_credito || 0), 0);

  return resultado(
    "facturas_compra",
    "Facturas de compra con IVA retenido",
    ESTADOS.AVISO,
    `${rows.length} factura(s) de compra: el IVA (${retenido.toLocaleString("es-CL")}) lo retiene la empresa y va como IVA retenido en el F29. Revisar que el asiento lleve la retencion.`,
    { cantidad: rows.length, afectados: rows.map((f) => ({ id: f.id, referencia: `factura de compra ${f.folio || "s/f"}`, fecha: f.fecha, tercero: f.tercero, total: Number(f.iva_credito) })) }
  );
}

async function revisarPeriodo(cliente, empresaId, periodo) {
  const anio = Number(String(periodo).slice(0, 4));
  const mes = Number(String(periodo).slice(5, 7));
  const desde = `${periodo}-01`;
  // El día 0 del mes siguiente es el último del mes pedido.
  const hasta = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
  const rango = { desde, hasta };

  const revisiones = await Promise.all([
    asientosDescuadrados(cliente, empresaId, rango),
    documentosSinCuenta(cliente, empresaId, rango),
    documentosSinAsiento(cliente, empresaId, rango),
    documentosDuplicados(cliente, empresaId, periodo),
    ivaLibroContraContabilidad(cliente, empresaId, periodo),
    conciliacionPendiente(cliente, empresaId, periodo),
    foliosFaltantes(cliente, empresaId, periodo),
    montosAtipicos(cliente, empresaId, periodo),
    estadoDelEjercicio(cliente, empresaId, periodo),
    documentosRezagados(cliente, empresaId, periodo),
    f29DelPeriodo(cliente, empresaId, periodo),
    honorariosSinFechaDePago(cliente, empresaId, periodo),
    facturasDeCompra(cliente, empresaId, periodo),
  ]);

  const errores = revisiones.filter((r) => r.estado === ESTADOS.ERROR);
  const avisos = revisiones.filter((r) => r.estado === ESTADOS.AVISO);

  return {
    periodo,
    desde,
    hasta,
    revisiones,
    resumen: {
      errores: errores.length,
      avisos: avisos.length,
      correctas: revisiones.length - errores.length - avisos.length,
      // Lo que decide si se puede declarar tranquilo.
      listo_para_declarar: errores.length === 0,
      estado: errores.length > 0 ? ESTADOS.ERROR : avisos.length > 0 ? ESTADOS.AVISO : ESTADOS.OK,
    },
  };
}

module.exports = {
  ESTADOS,
  revisarPeriodo,
  asientosDescuadrados,
  documentosSinCuenta,
  documentosSinAsiento,
  documentosDuplicados,
  ivaLibroContraContabilidad,
  conciliacionPendiente,
  foliosFaltantes,
  montosAtipicos,
  estadoDelEjercicio,
  documentosRezagados,
  f29DelPeriodo,
  honorariosSinFechaDePago,
  facturasDeCompra,
};
