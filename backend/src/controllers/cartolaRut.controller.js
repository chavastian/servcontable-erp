const pool = require("../database/db");
const { limpiarRut, normalizarRut, pareceRut } = require("../helpers/rut.helper");

const LIMITE_POR_DEFECTO = 100;
const LIMITE_MAXIMO = 300;

const ROLES_REMUNERACIONES = [
  "admin",
  "superadmin",
  "super_admin",
  "administrador_sistema",
  "admin_cliente",
  "cliente_admin",
  "contador",
  "contable",
  "remuneraciones",
  "rrhh",
];

const FILTRO_ROL = {
  cliente: "Cliente",
  proveedor: "Proveedor",
  prestador: "Prestador",
  trabajador: "Trabajador",
  auxiliar: "Auxiliar",
  otro: "Otro",
};

const FILTRO_ORIGEN = {
  ventas: "ventas",
  compras: "compras",
  honorarios: "honorarios",
  remuneraciones: "remuneraciones",
  pagos_cobros: "pagos_cobros",
  contabilidad: "contabilidad",
};

function fechaISO(valor) {
  if (!valor) return "";
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().substring(0, 10);
  }
  return String(valor).substring(0, 10);
}

function esFechaISO(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(valor || ""));
}

function texto(valor) {
  return String(valor || "").trim();
}

function numero(valor) {
  return Number(valor || 0);
}

function boolQuery(valor) {
  return ["1", "true", "si", "s", "yes"].includes(
    String(valor || "").trim().toLowerCase()
  );
}

function normalizarFiltroRut(valor = "") {
  const entrada = texto(valor);

  if (!entrada) {
    return { esRut: false, rutLimpio: null, rutFormateado: "", error: "" };
  }

  if (!pareceRut(entrada)) {
    return { esRut: false, rutLimpio: null, rutFormateado: "", error: "" };
  }

  const rut = normalizarRut(entrada);

  if (!rut.valido) {
    return {
      esRut: true,
      rutLimpio: null,
      rutFormateado: "",
      error: rut.error || "RUT invalido.",
    };
  }

  return {
    esRut: true,
    rutLimpio: limpiarRut(rut.rut_normalizado),
    rutFormateado: rut.rut,
    error: "",
  };
}

function normalizarRolFiltro(rol = "") {
  const clave = texto(rol).toLowerCase();
  return FILTRO_ROL[clave] || "";
}

function normalizarOrigenFiltro(origen = "") {
  const clave = texto(origen).toLowerCase();
  return FILTRO_ORIGEN[clave] || "";
}

function permisosComoTexto(permisos) {
  if (!permisos) return "";

  if (Array.isArray(permisos)) {
    return permisos.join(" ");
  }

  if (typeof permisos === "object") {
    return Object.keys(permisos)
      .filter((clave) => permisos[clave])
      .join(" ");
  }

  return String(permisos);
}

function puedeVerRemuneraciones(usuario = {}) {
  const rol = texto(usuario.rol).toLowerCase();

  if (ROLES_REMUNERACIONES.includes(rol)) {
    return true;
  }

  const permisos = permisosComoTexto(usuario.permisos).toLowerCase();
  return (
    permisos.includes("remuneraciones") ||
    permisos.includes("liquidaciones") ||
    permisos.includes("trabajadores")
  );
}

function obtenerParametros(req) {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const fechaDesde = texto(req.query.fecha_desde) || `${anio}-01-01`;
  const fechaHasta = texto(req.query.fecha_hasta) || `${anio}-12-31`;
  const pagina = Math.max(Number(req.query.page || req.query.pagina || 1), 1);
  const limite = Math.min(
    Math.max(Number(req.query.limit || req.query.limite || LIMITE_POR_DEFECTO), 1),
    LIMITE_MAXIMO
  );
  const busquedaOriginal = texto(
    req.query.rut || req.query.busqueda || req.query.q || req.query.tercero
  );
  const filtroRut = normalizarFiltroRut(busquedaOriginal);

  return {
    empresaId: Number(req.query.empresa_id || req.query.empresaId || 0),
    fechaDesde,
    fechaHasta,
    pagina,
    limite,
    offset: (pagina - 1) * limite,
    vista: texto(req.query.vista).toLowerCase() === "contable" ? "contable" : "comercial",
    busquedaOriginal,
    filtroRut,
    busquedaTexto: filtroRut.esRut ? "" : busquedaOriginal.toLowerCase(),
    origen: normalizarOrigenFiltro(req.query.origen),
    tipo: texto(req.query.tipo),
    estado: texto(req.query.estado).toLowerCase(),
    rol: normalizarRolFiltro(req.query.rol),
    soloPendientes: boolQuery(req.query.solo_pendientes || req.query.soloPendientes),
  };
}

function validarParametros(params) {
  if (!params.empresaId) {
    return "Debe indicar empresa_id.";
  }

  if (!esFechaISO(params.fechaDesde) || !esFechaISO(params.fechaHasta)) {
    return "Debe indicar fechas validas en formato YYYY-MM-DD.";
  }

  if (params.fechaDesde > params.fechaHasta) {
    return "La fecha desde no puede ser mayor a la fecha hasta.";
  }

  if (!params.busquedaOriginal) {
    return "Debe indicar un RUT, nombre o razon social para consultar.";
  }

  if (params.filtroRut.error) {
    return params.filtroRut.error;
  }

  return "";
}

function expresionRutSql(alias) {
  return `UPPER(REGEXP_REPLACE(COALESCE(${alias}, ''), '[^0-9Kk]', '', 'g'))`;
}

function totalCompraSql(alias = "c") {
  return `COALESCE(NULLIF(${alias}.total, 0), COALESCE(${alias}.neto, 0) + COALESCE(${alias}.exento, 0) + COALESCE(${alias}.iva_credito, 0) + COALESCE(${alias}.iva_no_recuperable, 0) + COALESCE(${alias}.otros_impuestos, 0))`;
}

function esNotaCreditoSql(alias = "v") {
  return `(COALESCE(${alias}.sii_tipo_doc::text, '') IN ('60', '61', '112')
    OR LOWER(COALESCE(${alias}.tipo_documento, '')) LIKE '%credito%'
    OR LOWER(COALESCE(${alias}.tipo_documento, '')) LIKE '%credito%')`;
}

function pagosDocumentosCte() {
  return `
    pagos_documentos AS (
      SELECT
        empresa_id,
        tipo_documento,
        documento_id,
        COALESCE(SUM(monto), 0) AS total_pagado
      FROM pagos_cobros
      WHERE estado = 'vigente'
      GROUP BY empresa_id, tipo_documento, documento_id
    )
  `;
}

function movimientosComercialesCte(incluirRemuneraciones) {
  const totalCompra = totalCompraSql("c");
  const notaCreditoVenta = esNotaCreditoSql("v");
  const notaCreditoCompra = esNotaCreditoSql("c");

  const movimientos = [
    `
      SELECT
        CONCAT('venta:', v.id) AS source_key,
        v.id::text AS source_id,
        v.empresa_id,
        v.fecha::date AS fecha,
        v.periodo,
        'ventas' AS origen,
        'Documento de venta' AS tipo,
        'Cliente' AS rol,
        v.rut_cliente AS rut_tercero,
        v.razon_social_cliente AS nombre_tercero,
        v.tipo_documento AS documento_tipo,
        v.folio::text AS folio,
        CONCAT(CASE WHEN ${notaCreditoVenta} THEN 'Nota de credito venta' ELSE 'Venta' END, ' folio ', COALESCE(v.folio::text, '')) AS glosa,
        CASE WHEN ${notaCreditoVenta} THEN 0 ELSE COALESCE(v.total, 0) END::numeric AS cargo,
        CASE WHEN ${notaCreditoVenta} THEN ABS(COALESCE(v.total, 0)) ELSE 0 END::numeric AS abono,
        COALESCE(v.total, 0)::numeric AS total_documento,
        COALESCE(pd.total_pagado, 0)::numeric AS total_pagado,
        CASE
          WHEN ${notaCreditoVenta} THEN 0
          ELSE GREATEST(COALESCE(v.total, 0) - COALESCE(pd.total_pagado, 0), 0)
        END::numeric AS saldo_pendiente,
        CASE
          WHEN ${notaCreditoVenta} THEN 'aplicado'
          WHEN GREATEST(COALESCE(v.total, 0) - COALESCE(pd.total_pagado, 0), 0) <= 0 THEN 'pagado'
          WHEN COALESCE(pd.total_pagado, 0) > 0 THEN 'parcial'
          ELSE 'pendiente'
        END AS estado_cartola,
        COALESCE(v.estado, 'vigente') AS estado_origen,
        'documento' AS source_kind,
        'por_cobrar' AS tipo_saldo,
        v.comprobante_id,
        NULL::date AS fecha_vencimiento,
        ${expresionRutSql("v.rut_cliente")} AS rut_limpio,
        10 AS orden
      FROM ventas v
      LEFT JOIN pagos_documentos pd
        ON pd.empresa_id = v.empresa_id
       AND pd.tipo_documento = 'Venta'
       AND pd.documento_id = v.id
      WHERE v.estado = 'vigente'
    `,
    `
      SELECT
        CONCAT('compra:', c.id) AS source_key,
        c.id::text AS source_id,
        c.empresa_id,
        c.fecha::date AS fecha,
        c.periodo,
        'compras' AS origen,
        'Documento de compra' AS tipo,
        'Proveedor' AS rol,
        c.rut_proveedor AS rut_tercero,
        c.razon_social_proveedor AS nombre_tercero,
        c.tipo_documento AS documento_tipo,
        c.folio::text AS folio,
        CONCAT(CASE WHEN ${notaCreditoCompra} THEN 'Nota de credito compra' ELSE 'Compra' END, ' folio ', COALESCE(c.folio::text, '')) AS glosa,
        CASE WHEN ${notaCreditoCompra} THEN 0 ELSE ${totalCompra} END::numeric AS cargo,
        CASE WHEN ${notaCreditoCompra} THEN ABS(${totalCompra}) ELSE 0 END::numeric AS abono,
        ${totalCompra}::numeric AS total_documento,
        COALESCE(pd.total_pagado, 0)::numeric AS total_pagado,
        CASE
          WHEN ${notaCreditoCompra} THEN 0
          ELSE GREATEST(${totalCompra} - COALESCE(pd.total_pagado, 0), 0)
        END::numeric AS saldo_pendiente,
        CASE
          WHEN ${notaCreditoCompra} THEN 'aplicado'
          WHEN GREATEST(${totalCompra} - COALESCE(pd.total_pagado, 0), 0) <= 0 THEN 'pagado'
          WHEN COALESCE(pd.total_pagado, 0) > 0 THEN 'parcial'
          ELSE 'pendiente'
        END AS estado_cartola,
        COALESCE(c.estado, 'vigente') AS estado_origen,
        'documento' AS source_kind,
        'por_pagar' AS tipo_saldo,
        c.comprobante_id,
        NULL::date AS fecha_vencimiento,
        ${expresionRutSql("c.rut_proveedor")} AS rut_limpio,
        20 AS orden
      FROM compras c
      LEFT JOIN pagos_documentos pd
        ON pd.empresa_id = c.empresa_id
       AND pd.tipo_documento = 'Compra'
       AND pd.documento_id = c.id
      WHERE c.estado = 'vigente'
    `,
    `
      SELECT
        CONCAT('honorario:', h.id) AS source_key,
        h.id::text AS source_id,
        h.empresa_id,
        h.fecha_emision::date AS fecha,
        h.periodo,
        'honorarios' AS origen,
        'Honorario recibido' AS tipo,
        'Prestador' AS rol,
        h.rut_prestador AS rut_tercero,
        h.nombre_prestador AS nombre_tercero,
        h.tipo_documento AS documento_tipo,
        h.folio::text AS folio,
        CONCAT('Honorario folio ', COALESCE(h.folio::text, '')) AS glosa,
        COALESCE(h.liquido, 0)::numeric AS cargo,
        0::numeric AS abono,
        COALESCE(h.liquido, 0)::numeric AS total_documento,
        COALESCE(pd.total_pagado, 0)::numeric AS total_pagado,
        GREATEST(COALESCE(h.liquido, 0) - COALESCE(pd.total_pagado, 0), 0)::numeric AS saldo_pendiente,
        CASE
          WHEN GREATEST(COALESCE(h.liquido, 0) - COALESCE(pd.total_pagado, 0), 0) <= 0 THEN 'pagado'
          WHEN COALESCE(pd.total_pagado, 0) > 0 THEN 'parcial'
          ELSE 'pendiente'
        END AS estado_cartola,
        COALESCE(h.estado, 'vigente') AS estado_origen,
        'documento' AS source_kind,
        'por_pagar' AS tipo_saldo,
        h.comprobante_id,
        NULL::date AS fecha_vencimiento,
        ${expresionRutSql("h.rut_prestador")} AS rut_limpio,
        30 AS orden
      FROM honorarios h
      LEFT JOIN pagos_documentos pd
        ON pd.empresa_id = h.empresa_id
       AND pd.tipo_documento = 'Honorario'
       AND pd.documento_id = h.id
      WHERE h.estado = 'vigente'
    `,
    `
      SELECT
        CONCAT('pago_cobro:', pc.id) AS source_key,
        pc.id::text AS source_id,
        pc.empresa_id,
        pc.fecha::date AS fecha,
        pc.periodo,
        'pagos_cobros' AS origen,
        pc.tipo_movimiento AS tipo,
        CASE
          WHEN pc.tipo_documento = 'Venta' OR pc.tipo_movimiento = 'Cobro' THEN 'Cliente'
          WHEN pc.tipo_documento = 'Honorario' THEN 'Prestador'
          WHEN pc.tipo_documento = 'Liquidacion' THEN 'Trabajador'
          WHEN pc.tipo_documento = 'Compra' OR pc.tipo_movimiento = 'Pago' THEN 'Proveedor'
          ELSE 'Otro'
        END AS rol,
        pc.rut_tercero,
        pc.nombre_tercero,
        pc.tipo_documento AS documento_tipo,
        pc.folio::text AS folio,
        COALESCE(NULLIF(pc.glosa, ''), CONCAT(pc.tipo_movimiento, ' ', COALESCE(pc.tipo_documento, ''), ' folio ', COALESCE(pc.folio::text, ''))) AS glosa,
        0::numeric AS cargo,
        CASE WHEN COALESCE(pc.estado, 'vigente') = 'vigente' THEN COALESCE(pc.monto, 0) ELSE 0 END::numeric AS abono,
        COALESCE(pc.monto, 0)::numeric AS total_documento,
        COALESCE(pc.monto, 0)::numeric AS total_pagado,
        0::numeric AS saldo_pendiente,
        COALESCE(pc.estado, 'vigente') AS estado_cartola,
        COALESCE(pc.estado, 'vigente') AS estado_origen,
        'pago' AS source_kind,
        CASE WHEN pc.tipo_movimiento = 'Cobro' THEN 'por_cobrar' ELSE 'por_pagar' END AS tipo_saldo,
        pc.comprobante_id,
        NULL::date AS fecha_vencimiento,
        ${expresionRutSql("pc.rut_tercero")} AS rut_limpio,
        40 AS orden
      FROM pagos_cobros pc
    `,
  ];

  if (incluirRemuneraciones) {
    movimientos.push(`
      SELECT
        CONCAT('liquidacion:', l.id) AS source_key,
        l.id::text AS source_id,
        l.empresa_id,
        TO_DATE(COALESCE(NULLIF(l.periodo, ''), '1900-01') || '-01', 'YYYY-MM-DD')::date AS fecha,
        l.periodo,
        'remuneraciones' AS origen,
        'Liquidacion de sueldo' AS tipo,
        'Trabajador' AS rol,
        t.rut AS rut_tercero,
        TRIM(CONCAT(COALESCE(t.nombres, ''), ' ', COALESCE(t.apellidos, ''))) AS nombre_tercero,
        'Liquidacion' AS documento_tipo,
        l.periodo AS folio,
        CONCAT('Liquidacion periodo ', COALESCE(l.periodo, '')) AS glosa,
        COALESCE(l.liquido_pagar, 0)::numeric AS cargo,
        0::numeric AS abono,
        COALESCE(l.liquido_pagar, 0)::numeric AS total_documento,
        0::numeric AS total_pagado,
        COALESCE(l.liquido_pagar, 0)::numeric AS saldo_pendiente,
        CASE
          WHEN COALESCE(l.estado, 'vigente') IN ('pagada', 'pagado') THEN 'pagado'
          ELSE 'pendiente'
        END AS estado_cartola,
        COALESCE(l.estado, 'vigente') AS estado_origen,
        'documento' AS source_kind,
        'por_pagar' AS tipo_saldo,
        l.comprobante_id,
        NULL::date AS fecha_vencimiento,
        ${expresionRutSql("t.rut")} AS rut_limpio,
        35 AS orden
      FROM liquidaciones l
      INNER JOIN trabajadores t
        ON t.id = l.trabajador_id
      WHERE COALESCE(l.estado, 'vigente') <> 'eliminada'
    `);
  }

  return `
    WITH
    ${pagosDocumentosCte()},
    movimientos AS (
      ${movimientos.join("\nUNION ALL\n")}
    )
  `;
}

function movimientosContablesCte() {
  return `
    WITH movimientos AS (
      SELECT
        CONCAT('asiento:', cd.id) AS source_key,
        cd.id::text AS source_id,
        c.empresa_id,
        c.fecha::date AS fecha,
        c.periodo,
        'contabilidad' AS origen,
        CONCAT('Comprobante ', COALESCE(c.tipo, '')) AS tipo,
        'Auxiliar' AS rol,
        cd.rut_auxiliar AS rut_tercero,
        '' AS nombre_tercero,
        c.tipo AS documento_tipo,
        c.numero::text AS folio,
        COALESCE(NULLIF(cd.glosa, ''), c.glosa) AS glosa,
        COALESCE(cd.debe, 0)::numeric AS cargo,
        COALESCE(cd.haber, 0)::numeric AS abono,
        NULL::numeric AS total_documento,
        NULL::numeric AS total_pagado,
        0::numeric AS saldo_pendiente,
        COALESCE(c.estado, 'vigente') AS estado_cartola,
        COALESCE(c.estado, 'vigente') AS estado_origen,
        'asiento' AS source_kind,
        'contable' AS tipo_saldo,
        c.id AS comprobante_id,
        NULL::date AS fecha_vencimiento,
        ${expresionRutSql("cd.rut_auxiliar")} AS rut_limpio,
        50 AS orden
      FROM comprobantes c
      INNER JOIN comprobante_detalle cd
        ON cd.comprobante_id = c.id
      WHERE COALESCE(c.estado, 'vigente') = 'vigente'
        AND COALESCE(cd.rut_auxiliar, '') <> ''
    )
  `;
}

function whereFiltrado({ vista }) {
  const filtroPendientes =
    vista === "contable"
      ? "AND ($10::boolean = false OR $10::boolean = true)"
      : "AND ($10::boolean = false OR (m.source_kind = 'documento' AND m.saldo_pendiente > 0))";

  return `
    filtrados AS (
      SELECT m.*
      FROM movimientos m
      WHERE m.empresa_id = $1
        AND m.fecha <= $5::date
        AND ($2::text IS NULL OR m.rut_limpio = $2)
        AND (
          $3::text IS NULL
          OR LOWER(COALESCE(m.nombre_tercero, '')) LIKE '%' || $3::text || '%'
          OR LOWER(COALESCE(m.glosa, '')) LIKE '%' || $3::text || '%'
          OR LOWER(COALESCE(m.rut_tercero, '')) LIKE '%' || $3::text || '%'
          OR (
            UPPER(REGEXP_REPLACE($3::text, '[^0-9Kk]', '', 'g')) <> ''
            AND m.rut_limpio LIKE '%' || UPPER(REGEXP_REPLACE($3::text, '[^0-9Kk]', '', 'g')) || '%'
          )
        )
        AND ($6::text IS NULL OR m.origen = $6)
        AND ($7::text IS NULL OR LOWER(COALESCE(m.tipo, '')) = LOWER($7::text))
        AND ($8::text IS NULL OR LOWER(COALESCE(m.estado_cartola, '')) = $8)
        AND ($9::text IS NULL OR m.rol = $9)
        ${filtroPendientes}
    )
  `;
}

function parametrosSql(params) {
  return [
    params.empresaId,
    params.filtroRut.rutLimpio || null,
    params.busquedaTexto || null,
    params.fechaDesde,
    params.fechaHasta,
    params.origen || null,
    params.tipo || null,
    params.estado || null,
    params.rol || null,
    params.vista === "contable" ? false : params.soloPendientes,
  ];
}

function sqlMovimientos(params, incluirRemuneraciones) {
  const base =
    params.vista === "contable"
      ? movimientosContablesCte()
      : movimientosComercialesCte(incluirRemuneraciones);

  return `
    ${base},
    ${whereFiltrado(params)},
    saldo_anterior AS (
      SELECT COALESCE(SUM(cargo - abono), 0) AS saldo
      FROM filtrados
      WHERE fecha < $4::date
    ),
    rango AS (
      SELECT *
      FROM filtrados
      WHERE fecha BETWEEN $4::date AND $5::date
    )
    SELECT
      r.*,
      (r.cargo - r.abono)::numeric AS efecto_saldo,
      ((SELECT saldo FROM saldo_anterior)
        + SUM(r.cargo - r.abono) OVER (ORDER BY r.fecha ASC, r.orden ASC, r.source_key ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
      )::numeric AS saldo_acumulado,
      COUNT(*) OVER() AS total_filtrado
    FROM rango r
    ORDER BY r.fecha ASC, r.orden ASC, r.source_key ASC
    LIMIT $11 OFFSET $12
  `;
}

function sqlResumen(params, incluirRemuneraciones) {
  const base =
    params.vista === "contable"
      ? movimientosContablesCte()
      : movimientosComercialesCte(incluirRemuneraciones);

  return `
    ${base},
    ${whereFiltrado(params)}
    SELECT
      COALESCE(SUM(CASE WHEN fecha < $4::date THEN cargo - abono ELSE 0 END), 0)::numeric AS saldo_anterior,
      COALESCE(SUM(CASE WHEN fecha BETWEEN $4::date AND $5::date THEN cargo ELSE 0 END), 0)::numeric AS cargos,
      COALESCE(SUM(CASE WHEN fecha BETWEEN $4::date AND $5::date THEN abono ELSE 0 END), 0)::numeric AS abonos,
      COALESCE(SUM(CASE WHEN fecha <= $5::date THEN cargo - abono ELSE 0 END), 0)::numeric AS saldo_actual,
      COALESCE(SUM(CASE WHEN fecha BETWEEN $4::date AND $5::date AND tipo_saldo = 'por_cobrar' AND source_kind = 'documento' THEN saldo_pendiente ELSE 0 END), 0)::numeric AS pendiente_por_cobrar,
      COALESCE(SUM(CASE WHEN fecha BETWEEN $4::date AND $5::date AND tipo_saldo = 'por_pagar' AND source_kind = 'documento' THEN saldo_pendiente ELSE 0 END), 0)::numeric AS pendiente_por_pagar,
      COUNT(*) FILTER (WHERE fecha BETWEEN $4::date AND $5::date)::integer AS movimientos,
      COUNT(*) FILTER (WHERE fecha BETWEEN $4::date AND $5::date AND source_kind = 'documento' AND saldo_pendiente > 0)::integer AS documentos_pendientes,
      MAX(fecha) FILTER (WHERE fecha BETWEEN $4::date AND $5::date) AS ultima_fecha
    FROM filtrados
  `;
}

function sqlPendientes(params, incluirRemuneraciones) {
  const base =
    params.vista === "contable"
      ? movimientosContablesCte()
      : movimientosComercialesCte(incluirRemuneraciones);

  return `
    ${base},
    ${whereFiltrado({ ...params, soloPendientes: false })}
    SELECT *
    FROM filtrados
    WHERE fecha BETWEEN $4::date AND $5::date
      AND source_kind = 'documento'
      AND saldo_pendiente > 0
    ORDER BY fecha ASC, orden ASC, source_key ASC
    LIMIT 100
  `;
}

function normalizarMovimiento(row) {
  return {
    source_key: row.source_key,
    source_id: row.source_id,
    fecha: fechaISO(row.fecha),
    periodo: row.periodo || "",
    origen: row.origen || "",
    tipo: row.tipo || "",
    rol: row.rol || "",
    rut_tercero: row.rut_tercero || "",
    nombre_tercero: row.nombre_tercero || "",
    documento_tipo: row.documento_tipo || "",
    folio: row.folio || "",
    glosa: row.glosa || "",
    cargo: numero(row.cargo),
    abono: numero(row.abono),
    efecto_saldo: numero(row.efecto_saldo),
    saldo_acumulado: numero(row.saldo_acumulado),
    total_documento: row.total_documento === null ? null : numero(row.total_documento),
    total_pagado: row.total_pagado === null ? null : numero(row.total_pagado),
    saldo_pendiente: numero(row.saldo_pendiente),
    estado_cartola: row.estado_cartola || "",
    estado_origen: row.estado_origen || "",
    source_kind: row.source_kind || "",
    tipo_saldo: row.tipo_saldo || "",
    comprobante_id: row.comprobante_id || null,
    fecha_vencimiento: fechaISO(row.fecha_vencimiento),
  };
}

function normalizarResumen(row = {}) {
  return {
    saldo_anterior: numero(row.saldo_anterior),
    cargos: numero(row.cargos),
    abonos: numero(row.abonos),
    saldo_actual: numero(row.saldo_actual),
    pendiente_por_cobrar: numero(row.pendiente_por_cobrar),
    pendiente_por_pagar: numero(row.pendiente_por_pagar),
    movimientos: Number(row.movimientos || 0),
    documentos_pendientes: Number(row.documentos_pendientes || 0),
    ultima_fecha: fechaISO(row.ultima_fecha),
  };
}

async function obtenerCartolaRut(req, res) {
  try {
    const params = obtenerParametros(req);
    const error = validarParametros(params);

    if (error) {
      return res.status(400).json({ error });
    }

    const incluirRemuneraciones = puedeVerRemuneraciones(req.usuario);
    const valoresBase = parametrosSql(params);
    const valoresListado = [...valoresBase, params.limite, params.offset];

    const [movimientosResult, resumenResult, pendientesResult] = await Promise.all([
      pool.query(sqlMovimientos(params, incluirRemuneraciones), valoresListado),
      pool.query(sqlResumen(params, incluirRemuneraciones), valoresBase),
      params.vista === "contable"
        ? Promise.resolve({ rows: [] })
        : pool.query(sqlPendientes(params, incluirRemuneraciones), valoresBase),
    ]);

    const movimientos = movimientosResult.rows.map(normalizarMovimiento);
    const total = Number(movimientosResult.rows[0]?.total_filtrado || 0);

    return res.json({
      tercero: {
        busqueda: params.busquedaOriginal,
        rut: params.filtroRut.rutFormateado,
        rut_limpio: params.filtroRut.rutLimpio,
      },
      resumen: normalizarResumen(resumenResult.rows[0] || {}),
      movimientos,
      documentos_pendientes: pendientesResult.rows.map(normalizarMovimiento),
      paginacion: {
        pagina: params.pagina,
        limite: params.limite,
        total,
        paginas: Math.max(Math.ceil(total / params.limite), 1),
      },
      filtros: {
        fecha_desde: params.fechaDesde,
        fecha_hasta: params.fechaHasta,
        vista: params.vista,
        origen: params.origen,
        tipo: params.tipo,
        estado: params.estado,
        rol: params.rol,
        solo_pendientes: params.soloPendientes,
      },
      permisos: {
        incluye_remuneraciones: incluirRemuneraciones,
      },
      notas: {
        vencimientos:
          "La base actual no tiene fecha de vencimiento por documento; por eso la cartola no calcula morosidad por dias.",
      },
    });
  } catch (error) {
    console.error("Error al obtener cartola por RUT:", error);
    return res.status(500).json({
      error: "Error interno al obtener cartola por RUT",
    });
  }
}

function sqlBuscarTerceros(incluirRemuneraciones) {
  const terceros = [
    `
      SELECT
        v.empresa_id,
        v.rut_cliente AS rut,
        v.razon_social_cliente AS nombre,
        'Cliente' AS rol,
        'ventas' AS origen,
        MAX(v.fecha::date) AS ultima_fecha,
        ${expresionRutSql("v.rut_cliente")} AS rut_limpio
      FROM ventas v
      WHERE v.estado = 'vigente'
      GROUP BY v.empresa_id, v.rut_cliente, v.razon_social_cliente
    `,
    `
      SELECT
        c.empresa_id,
        c.rut_proveedor AS rut,
        c.razon_social_proveedor AS nombre,
        'Proveedor' AS rol,
        'compras' AS origen,
        MAX(c.fecha::date) AS ultima_fecha,
        ${expresionRutSql("c.rut_proveedor")} AS rut_limpio
      FROM compras c
      WHERE c.estado = 'vigente'
      GROUP BY c.empresa_id, c.rut_proveedor, c.razon_social_proveedor
    `,
    `
      SELECT
        h.empresa_id,
        h.rut_prestador AS rut,
        h.nombre_prestador AS nombre,
        'Prestador' AS rol,
        'honorarios' AS origen,
        MAX(h.fecha_emision::date) AS ultima_fecha,
        ${expresionRutSql("h.rut_prestador")} AS rut_limpio
      FROM honorarios h
      WHERE h.estado = 'vigente'
      GROUP BY h.empresa_id, h.rut_prestador, h.nombre_prestador
    `,
    `
      SELECT
        pc.empresa_id,
        pc.rut_tercero AS rut,
        pc.nombre_tercero AS nombre,
        CASE
          WHEN pc.tipo_documento = 'Venta' OR pc.tipo_movimiento = 'Cobro' THEN 'Cliente'
          WHEN pc.tipo_documento = 'Honorario' THEN 'Prestador'
          WHEN pc.tipo_documento = 'Liquidacion' THEN 'Trabajador'
          WHEN pc.tipo_documento = 'Compra' OR pc.tipo_movimiento = 'Pago' THEN 'Proveedor'
          ELSE 'Otro'
        END AS rol,
        'pagos_cobros' AS origen,
        MAX(pc.fecha::date) AS ultima_fecha,
        ${expresionRutSql("pc.rut_tercero")} AS rut_limpio
      FROM pagos_cobros pc
      GROUP BY pc.empresa_id, pc.rut_tercero, pc.nombre_tercero, pc.tipo_documento, pc.tipo_movimiento
    `,
  ];

  if (incluirRemuneraciones) {
    terceros.push(`
      SELECT
        t.empresa_id,
        t.rut,
        TRIM(CONCAT(COALESCE(t.nombres, ''), ' ', COALESCE(t.apellidos, ''))) AS nombre,
        'Trabajador' AS rol,
        'remuneraciones' AS origen,
        MAX(COALESCE(t.creado_en::date, CURRENT_DATE)) AS ultima_fecha,
        ${expresionRutSql("t.rut")} AS rut_limpio
      FROM trabajadores t
      WHERE COALESCE(t.estado, 'activo') <> 'eliminado'
      GROUP BY t.empresa_id, t.rut, t.nombres, t.apellidos
    `);
  }

  return `
    WITH terceros AS (
      ${terceros.join("\nUNION ALL\n")}
    )
    SELECT
      rut_limpio,
      COALESCE(NULLIF(MAX(rut), ''), rut_limpio) AS rut,
      COALESCE(NULLIF(MAX(nombre), ''), 'Sin nombre') AS nombre,
      ARRAY_AGG(DISTINCT rol ORDER BY rol) AS roles,
      ARRAY_AGG(DISTINCT origen ORDER BY origen) AS origenes,
      MAX(ultima_fecha) AS ultima_fecha,
      COUNT(*)::integer AS apariciones
    FROM terceros
    WHERE empresa_id = $1
      AND COALESCE(rut_limpio, '') <> ''
      AND (
        $2::text IS NULL
        OR LOWER(COALESCE(nombre, '')) LIKE '%' || $2::text || '%'
        OR LOWER(COALESCE(rut, '')) LIKE '%' || $2::text || '%'
        OR (
          UPPER(REGEXP_REPLACE($2::text, '[^0-9Kk]', '', 'g')) <> ''
          AND rut_limpio LIKE '%' || UPPER(REGEXP_REPLACE($2::text, '[^0-9Kk]', '', 'g')) || '%'
        )
      )
    GROUP BY rut_limpio
    ORDER BY MAX(ultima_fecha) DESC NULLS LAST, MAX(nombre) ASC
    LIMIT $3
  `;
}

async function buscarTerceros(req, res) {
  try {
    const empresaId = Number(req.query.empresa_id || req.query.empresaId || 0);
    const q = texto(req.query.q || req.query.busqueda).toLowerCase();
    const limite = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);

    if (!empresaId) {
      return res.status(400).json({ error: "Debe indicar empresa_id." });
    }

    const incluirRemuneraciones = puedeVerRemuneraciones(req.usuario);
    const resultado = await pool.query(sqlBuscarTerceros(incluirRemuneraciones), [
      empresaId,
      q || null,
      limite,
    ]);

    return res.json({
      total: resultado.rows.length,
      terceros: resultado.rows.map((row) => ({
        rut: row.rut || "",
        rut_limpio: row.rut_limpio || "",
        nombre: row.nombre || "",
        roles: row.roles || [],
        origenes: row.origenes || [],
        ultima_fecha: fechaISO(row.ultima_fecha),
        apariciones: Number(row.apariciones || 0),
      })),
      permisos: {
        incluye_remuneraciones: incluirRemuneraciones,
      },
    });
  } catch (error) {
    console.error("Error al buscar terceros para cartola:", error);
    return res.status(500).json({
      error: "Error interno al buscar terceros",
    });
  }
}

module.exports = {
  obtenerCartolaRut,
  buscarTerceros,
  __cartolaRutInternals: {
    normalizarFiltroRut,
    obtenerParametros,
    puedeVerRemuneraciones,
  },
};
