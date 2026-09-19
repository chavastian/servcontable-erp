const pool = require("../database/db");
const {
  leerPaginacion,
  fragmentoPaginacion,
  valoresPaginacion,
  recortarPagina,
} = require("../helpers/paginacion.helper");
const { expresionSigno } = require("../helpers/documentoTributario.helper");

const { registrarAuditoria } = require("../helpers/auditoria.helper");
const {
  insertarDetallesComprobante,
  obtenerSiguienteNumeroComprobante,
} = require("../helpers/comprobante.helper");
const {
  normalizarRutDocumentoOpcional,
  normalizarNombreTercero,
} = require("../helpers/trazabilidadRut.helper");
const { validarCuentaOperativa } = require("../helpers/cuentas.helper");

function obtenerPeriodo(fecha) {
  if (!fecha) return "";
  return String(fecha).substring(0, 7);
}

function esVerdadero(valor) {
  return String(valor).toLowerCase() === "true";
}

function normalizarFechaISO(fecha) {
  if (!fecha) return "";

  if (typeof fecha === "string") {
    return fecha.substring(0, 10);
  }

  if (fecha instanceof Date && !Number.isNaN(fecha.getTime())) {
    return fecha.toISOString().substring(0, 10);
  }

  return String(fecha).substring(0, 10);
}

function texto(valor = "") {
  return String(valor || "").trim();
}

function referenciaDocumento(doc = {}) {
  const folioDocumento = texto(doc.folio);

  if (folioDocumento) {
    return `FOLIO ${folioDocumento}`;
  }

  if (doc.id) {
    return `DOC ${doc.id}`;
  }

  return texto(doc.tipo_documento || "DOCUMENTO").toUpperCase();
}

function glosaBaseDocumento(doc = {}) {
  return (
    texto(doc.glosa_original) ||
    texto(doc.glosa_documento) ||
    texto(doc.glosa) ||
    texto(doc.descripcion) ||
    texto(doc.nombre_tercero) ||
    texto(doc.tipo_documento) ||
    "Documento"
  );
}

function glosaDocumentoMovimiento(tipoMovimiento, doc = {}) {
  const prefijo = tipoMovimiento === "Cobro" ? "COBRO" : "PAGO";
  return `${prefijo} ${referenciaDocumento(doc)} - ${glosaBaseDocumento(doc)}`;
}

function glosaMasiva(tipoMovimiento, documentos = []) {
  const prefijo = tipoMovimiento === "Cobro" ? "COBRO MASIVO" : "PAGO MASIVO";
  const folios = documentos
    .map((doc) => texto(doc.folio))
    .filter(Boolean)
    .slice(0, 5);
  const sufijoFolios = folios.length
    ? ` - FOLIOS ${folios.join(", ")}${
        documentos.length > folios.length ? ", ..." : ""
      }`
    : "";

  return `${prefijo} - ${documentos.length} DOCUMENTOS${sufijoFolios}`;
}

function tipoOperacionDesdeDocumento(tipoMovimiento, tipoDocumento) {
  if (tipoDocumento === "Venta" || tipoMovimiento === "Cobro") {
    return "Cobro";
  }

  if (tipoDocumento === "Honorario") {
    return "PagoHonorario";
  }

  if (tipoDocumento === "Compra") {
    return "PagoCompra";
  }

  return "";
}

async function crearComprobantePagoCobro(client, datos) {
  const {
    empresa_id,
    tipo_movimiento,
    fecha,
    monto,
    glosa,
    cuenta_banco_id,
    cuenta_contraparte_id,
    rut_tercero,
    nombre_tercero,
    folio,
    documentos_detalle = [],
  } = datos;

  const montoNum = Number(monto || 0);
  const periodo = obtenerPeriodo(fecha);
  const tipoComprobante = tipo_movimiento === "Cobro" ? "Ingreso" : "Egreso";
  const rutAuxiliar = normalizarRutDocumentoOpcional(rut_tercero);
  const folioDocumento = String(folio || "").trim();
  const numero = await obtenerSiguienteNumeroComprobante(
    client,
    empresa_id,
    tipoComprobante
  );

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
      fecha,
      tipoComprobante,
      numero,
      glosa || "",
      montoNum,
      montoNum,
    ]
  );

  const comprobante = comprobanteResult.rows[0];

  let detalles = [];
  const documentosDetalle = Array.isArray(documentos_detalle)
    ? documentos_detalle
    : [];

  if (documentosDetalle.length > 1) {
    const detalleContraparte = documentosDetalle
      .map((documento) => {
        const montoDocumento = Number(documento.monto || 0);

        if (montoDocumento <= 0) {
          return null;
        }

        return {
          cuenta_id: cuenta_contraparte_id,
          debe: tipo_movimiento === "Pago" ? montoDocumento : 0,
          haber: tipo_movimiento === "Cobro" ? montoDocumento : 0,
          folio: String(documento.folio || "").trim(),
          rut_auxiliar: normalizarRutDocumentoOpcional(documento.rut_tercero),
          glosa: documento.glosa || glosa || "",
        };
      })
      .filter(Boolean);

    detalles =
      tipo_movimiento === "Cobro"
        ? [
            {
              cuenta_id: cuenta_banco_id,
              debe: montoNum,
              haber: 0,
              glosa: glosa || "",
            },
            ...detalleContraparte,
          ]
        : [
            ...detalleContraparte,
            {
              cuenta_id: cuenta_banco_id,
              debe: 0,
              haber: montoNum,
              glosa: glosa || "",
            },
          ];
  } else if (tipo_movimiento === "Cobro") {
    detalles = [
      {
        cuenta_id: cuenta_banco_id,
        debe: montoNum,
        haber: 0,
        folio: folioDocumento,
      },
      {
        cuenta_id: cuenta_contraparte_id,
        debe: 0,
        haber: montoNum,
        folio: folioDocumento,
        rut_auxiliar: rutAuxiliar,
      },
    ];
  } else {
    detalles = [
      {
        cuenta_id: cuenta_contraparte_id,
        debe: montoNum,
        haber: 0,
        folio: folioDocumento,
        rut_auxiliar: rutAuxiliar,
      },
      {
        cuenta_id: cuenta_banco_id,
        debe: 0,
        haber: montoNum,
        folio: folioDocumento,
      },
    ];
  }

  await insertarDetallesComprobante(
    client,
    comprobante.id,
    detalles.map((detalle) => ({
      ...detalle,
      glosa:
        detalle.glosa ||
        glosa ||
        `${tipo_movimiento || ""} folio ${folioDocumento || ""} ${
          normalizarNombreTercero(nombre_tercero) || ""
        }`.trim(),
    }))
  );

  return comprobante;
}

async function obtenerDocumentosPendientesPorOperacion(
  client,
  empresaId,
  tipoOperacion,
  documentoIds = []
) {
  const ids = Array.isArray(documentoIds)
    ? documentoIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    : [];

  const aplicarFiltroIds = ids.length > 0;

  if (tipoOperacion === "Cobro") {
    const params = [empresaId];
    let filtroIds = "";

    if (aplicarFiltroIds) {
      params.push(ids);
      filtroIds = ` AND v.id = ANY($${params.length}::int[])`;
    }

    const resultado = await client.query(
      `
      SELECT
        v.id,
        'Venta' AS tipo_documento,
        TO_CHAR(v.fecha::date, 'YYYY-MM-DD') AS fecha,
        v.folio,
        v.rut_cliente AS rut_tercero,
        v.razon_social_cliente AS nombre_tercero,
        CONCAT_WS(' ', 'Venta', NULLIF(v.razon_social_cliente, '')) AS glosa_original,
        v.total,
        COALESCE(SUM(pc.monto), 0) AS pagado,
        v.total - COALESCE(SUM(pc.monto), 0) AS saldo
      FROM ventas v
      LEFT JOIN pagos_cobros pc
        ON pc.documento_id = v.id
       AND pc.tipo_documento = 'Venta'
       AND pc.estado = 'vigente'
      WHERE v.empresa_id = $1
        AND v.estado = 'vigente'
        AND (${expresionSigno("v")}) > 0
        -- Una nota de credito no es un documento por cobrar: rebaja otro.
        AND (${expresionSigno("v")}) > 0
        ${filtroIds}
      GROUP BY
        v.id,
        v.fecha,
        v.folio,
        v.rut_cliente,
        v.razon_social_cliente,
        v.total
      HAVING v.total - COALESCE(SUM(pc.monto), 0) > 0
      ORDER BY v.fecha ASC, v.folio ASC
      `,
      params
    );

    return resultado.rows;
  }

  if (tipoOperacion === "PagoCompra") {
    const params = [empresaId];
    let filtroIds = "";

    if (aplicarFiltroIds) {
      params.push(ids);
      filtroIds = ` AND c.id = ANY($${params.length}::int[])`;
    }

    const resultado = await client.query(
      `
      SELECT
        c.id,
        'Compra' AS tipo_documento,
        TO_CHAR(c.fecha::date, 'YYYY-MM-DD') AS fecha,
        c.folio,
        c.rut_proveedor AS rut_tercero,
        c.razon_social_proveedor AS nombre_tercero,
        CONCAT_WS(' ', 'Compra', NULLIF(c.razon_social_proveedor, '')) AS glosa_original,
        COALESCE(c.exento, 0) AS exento,
        COALESCE(NULLIF(c.total, 0), COALESCE(c.neto, 0) + COALESCE(c.exento, 0) + COALESCE(c.iva_credito, 0) + COALESCE(c.iva_no_recuperable, 0) + COALESCE(c.otros_impuestos, 0)) AS total,
        COALESCE(SUM(pc.monto), 0) AS pagado,
        COALESCE(NULLIF(c.total, 0), COALESCE(c.neto, 0) + COALESCE(c.exento, 0) + COALESCE(c.iva_credito, 0) + COALESCE(c.iva_no_recuperable, 0) + COALESCE(c.otros_impuestos, 0)) - COALESCE(SUM(pc.monto), 0) AS saldo
      FROM compras c
      LEFT JOIN pagos_cobros pc
        ON pc.documento_id = c.id
       AND pc.tipo_documento = 'Compra'
       AND pc.estado = 'vigente'
      WHERE c.empresa_id = $1
        AND c.estado = 'vigente'
        AND (${expresionSigno("c")}) > 0
        ${filtroIds}
      GROUP BY
        c.id,
        c.fecha,
        c.folio,
        c.rut_proveedor,
        c.razon_social_proveedor,
           c.total,
           c.neto,
           c.exento,
           c.iva_credito,
           c.iva_no_recuperable,
           c.otros_impuestos
      HAVING COALESCE(NULLIF(c.total, 0), COALESCE(c.neto, 0) + COALESCE(c.exento, 0) + COALESCE(c.iva_credito, 0) + COALESCE(c.iva_no_recuperable, 0) + COALESCE(c.otros_impuestos, 0)) - COALESCE(SUM(pc.monto), 0) > 0
      ORDER BY c.fecha ASC, c.folio ASC
      `,
      params
    );

    return resultado.rows;
  }

  if (tipoOperacion === "PagoHonorario") {
    const params = [empresaId];
    let filtroIds = "";

    if (aplicarFiltroIds) {
      params.push(ids);
      filtroIds = ` AND h.id = ANY($${params.length}::int[])`;
    }

    const resultado = await client.query(
      `
      SELECT
        h.id,
        'Honorario' AS tipo_documento,
        TO_CHAR(h.fecha_emision::date, 'YYYY-MM-DD') AS fecha,
        h.folio,
        h.rut_prestador AS rut_tercero,
        h.nombre_prestador AS nombre_tercero,
        CONCAT_WS(' ', 'Honorario', NULLIF(h.nombre_prestador, '')) AS glosa_original,
        h.liquido AS total,
        COALESCE(SUM(pc.monto), 0) AS pagado,
        h.liquido - COALESCE(SUM(pc.monto), 0) AS saldo
      FROM honorarios h
      LEFT JOIN pagos_cobros pc
        ON pc.documento_id = h.id
       AND pc.tipo_documento = 'Honorario'
       AND pc.estado = 'vigente'
      WHERE h.empresa_id = $1
        AND h.estado = 'vigente'
        ${filtroIds}
      GROUP BY
        h.id,
        h.fecha_emision,
        h.folio,
        h.rut_prestador,
        h.nombre_prestador,
        h.liquido
      HAVING h.liquido - COALESCE(SUM(pc.monto), 0) > 0
      ORDER BY h.fecha_emision ASC, h.folio ASC
      `,
      params
    );

    return resultado.rows;
  }

  return [];
}

async function listarDocumentosPendientes(req, res) {
  try {
    const { empresa_id, tipo } = req.query;

    if (!empresa_id || !tipo) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y tipo",
      });
    }

    let resultado;

    if (tipo === "Cobro") {
      resultado = await pool.query(
        `
        SELECT
          v.id,
          'Venta' AS tipo_documento,
          v.fecha,
          v.folio,
          v.rut_cliente AS rut_tercero,
          v.razon_social_cliente AS nombre_tercero,
          CONCAT_WS(' ', 'Venta', NULLIF(v.razon_social_cliente, '')) AS glosa_original,
          v.total,
          COALESCE(SUM(pc.monto), 0) AS pagado,
          v.total - COALESCE(SUM(pc.monto), 0) AS saldo
        FROM ventas v
        LEFT JOIN pagos_cobros pc
          ON pc.documento_id = v.id
         AND pc.tipo_documento = 'Venta'
         AND pc.estado = 'vigente'
        WHERE v.empresa_id = $1
          AND v.estado = 'vigente'
          AND (${expresionSigno("v")}) > 0
        GROUP BY
          v.id,
          v.fecha,
          v.folio,
          v.rut_cliente,
          v.razon_social_cliente,
          v.total
        HAVING v.total - COALESCE(SUM(pc.monto), 0) > 0
        ORDER BY v.fecha ASC, v.folio ASC
        `,
        [empresa_id]
      );
    } else if (tipo === "PagoCompra") {
      resultado = await pool.query(
        `
        SELECT
          c.id,
          'Compra' AS tipo_documento,
          c.fecha,
          c.folio,
          c.rut_proveedor AS rut_tercero,
          c.razon_social_proveedor AS nombre_tercero,
          CONCAT_WS(' ', 'Compra', NULLIF(c.razon_social_proveedor, '')) AS glosa_original,
        COALESCE(c.exento, 0) AS exento,
          COALESCE(NULLIF(c.total, 0), COALESCE(c.neto, 0) + COALESCE(c.exento, 0) + COALESCE(c.iva_credito, 0) + COALESCE(c.iva_no_recuperable, 0) + COALESCE(c.otros_impuestos, 0)) AS total,
        COALESCE(SUM(pc.monto), 0) AS pagado,
        COALESCE(NULLIF(c.total, 0), COALESCE(c.neto, 0) + COALESCE(c.exento, 0) + COALESCE(c.iva_credito, 0) + COALESCE(c.iva_no_recuperable, 0) + COALESCE(c.otros_impuestos, 0)) - COALESCE(SUM(pc.monto), 0) AS saldo
        FROM compras c
        LEFT JOIN pagos_cobros pc
          ON pc.documento_id = c.id
         AND pc.tipo_documento = 'Compra'
         AND pc.estado = 'vigente'
        WHERE c.empresa_id = $1
          AND c.estado = 'vigente'
          AND (${expresionSigno("c")}) > 0
        GROUP BY
          c.id,
          c.fecha,
          c.folio,
          c.rut_proveedor,
          c.razon_social_proveedor,
           c.total,
           c.neto,
           c.exento,
           c.iva_credito,
           c.iva_no_recuperable,
           c.otros_impuestos
        HAVING COALESCE(NULLIF(c.total, 0), COALESCE(c.neto, 0) + COALESCE(c.exento, 0) + COALESCE(c.iva_credito, 0) + COALESCE(c.iva_no_recuperable, 0) + COALESCE(c.otros_impuestos, 0)) - COALESCE(SUM(pc.monto), 0) > 0
        ORDER BY c.fecha ASC, c.folio ASC
        `,
        [empresa_id]
      );
    } else if (tipo === "PagoHonorario") {
      resultado = await pool.query(
        `
        SELECT
          h.id,
          'Honorario' AS tipo_documento,
          h.fecha_emision AS fecha,
          h.folio,
          h.rut_prestador AS rut_tercero,
          h.nombre_prestador AS nombre_tercero,
          CONCAT_WS(' ', 'Honorario', NULLIF(h.nombre_prestador, '')) AS glosa_original,
          h.liquido AS total,
          COALESCE(SUM(pc.monto), 0) AS pagado,
          h.liquido - COALESCE(SUM(pc.monto), 0) AS saldo
        FROM honorarios h
        LEFT JOIN pagos_cobros pc
          ON pc.documento_id = h.id
         AND pc.tipo_documento = 'Honorario'
         AND pc.estado = 'vigente'
        WHERE h.empresa_id = $1
          AND h.estado = 'vigente'
        GROUP BY
          h.id,
          h.fecha_emision,
          h.folio,
          h.rut_prestador,
          h.nombre_prestador,
          h.liquido
        HAVING h.liquido - COALESCE(SUM(pc.monto), 0) > 0
        ORDER BY h.fecha_emision ASC, h.folio ASC
        `,
        [empresa_id]
      );
    } else {
      return res.status(400).json({
        error: "Tipo no valido",
      });
    }

    return res.json({
      total: resultado.rows.length,
      documentos: resultado.rows,
    });
  } catch (error) {
    console.error("Error al listar documentos pendientes:", error);

    return res.status(500).json({
      error: "Error interno al listar documentos pendientes",
    });
  }
}

async function listarPagosCobros(req, res) {
  try {
    const { empresa_id, fecha_desde, fecha_hasta, incluir_anulados } = req.query;

    if (!empresa_id || !fecha_desde || !fecha_hasta) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, fecha_desde y fecha_hasta",
      });
    }

    const incluirAnulados = esVerdadero(incluir_anulados);
    const paginacion = leerPaginacion(req.query);

    const resultado = await pool.query(
      `
      SELECT
        pc.*,
        comp.numero AS comprobante_numero,
        comp.tipo AS comprobante_tipo,
        comp.fecha AS comprobante_fecha,
        comp.glosa AS comprobante_glosa,
        comp.estado AS comprobante_estado,
        cb.codigo AS banco_codigo,
        cb.nombre AS banco_nombre,
        cc.codigo AS contraparte_codigo,
        cc.nombre AS contraparte_nombre
      FROM pagos_cobros pc
      LEFT JOIN comprobantes comp
        ON comp.id = pc.comprobante_id
      LEFT JOIN plan_cuentas cb
        ON cb.id = pc.cuenta_banco_id
      LEFT JOIN plan_cuentas cc
        ON cc.id = pc.cuenta_contraparte_id
      WHERE pc.empresa_id = $1
        AND ($4::boolean = true OR pc.estado = 'vigente')
        AND pc.fecha BETWEEN $2 AND $3
      ORDER BY pc.fecha DESC, pc.id DESC${fragmentoPaginacion(paginacion, 5)}
      `,
      [empresa_id, fecha_desde, fecha_hasta, incluirAnulados, ...valoresPaginacion(paginacion)]
    );

    const pagina = recortarPagina(resultado.rows, paginacion);
    const movimientos = pagina.filas;

    const totales = movimientos.reduce(
      (acc, item) => {
        if (item.estado !== "vigente") {
          return acc;
        }

        if (item.tipo_movimiento === "Cobro") {
          acc.cobros += Number(item.monto || 0);
        } else {
          acc.pagos += Number(item.monto || 0);
        }

        acc.total += Number(item.monto || 0);
        return acc;
      },
      {
        cobros: 0,
        pagos: 0,
        total: 0,
      }
    );

    return res.json({
      paginacion: pagina.paginacion,
      total: movimientos.length,
      movimientos,
      totales,
    });
  } catch (error) {
    console.error("Error al listar pagos/cobros:", error);

    return res.status(500).json({
      error: "Error interno al listar pagos/cobros",
    });
  }
}

async function registrarPagoCobro(req, res) {
  const client = await pool.connect();

  try {
    const {
      empresa_id,
      tipo_operacion,
      tipo_movimiento,
      tipo_documento,
      documento_id,
      documento_ids = [],
      procesar_todos = false,
      modo_comprobante = "unico",
      fecha,
      rut_tercero,
      nombre_tercero,
      folio,
      glosa,
      monto,
      cuenta_banco_id,
      cuenta_contraparte_id,
      contabilizar = true,
    } = req.body;
    const contabilizarAutomatico = esVerdadero(contabilizar);
    const procesarTodos = esVerdadero(procesar_todos);
    const cuentaBancoId = Number(cuenta_banco_id || 0);
    const cuentaContraparteId = Number(cuenta_contraparte_id || 0);

    if (!empresa_id) {
      return res.status(400).json({
        error: "Empresa es obligatoria",
      });
    }

    if (!cuentaBancoId || !cuentaContraparteId) {
      return res.status(400).json({
        error: "Debe indicar cuenta banco/caja y cuenta contraparte",
      });
    }

    await validarCuentaOperativa(client, {
      empresaId: empresa_id,
      cuentaId: cuentaBancoId,
      etiqueta: "cuenta banco/caja",
    });

    await validarCuentaOperativa(client, {
      empresaId: empresa_id,
      cuentaId: cuentaContraparteId,
      etiqueta: "cuenta contraparte",
    });

    if (procesarTodos) {
      if (
        tipo_operacion !== "Cobro" &&
        tipo_operacion !== "PagoCompra" &&
        tipo_operacion !== "PagoHonorario"
      ) {
        return res.status(400).json({
          error:
            "Para procesar todos debes indicar tipo_operacion valido (Cobro, PagoCompra o PagoHonorario)",
        });
      }

      const modoComprobante =
        modo_comprobante === "por_documento" ? "por_documento" : "unico";

      if (contabilizarAutomatico && modoComprobante === "unico" && !fecha) {
        return res.status(400).json({
          error:
            "Debes indicar fecha cuando eliges un unico comprobante para todos los documentos",
        });
      }

      const docsPendientes = await obtenerDocumentosPendientesPorOperacion(
        client,
        empresa_id,
        tipo_operacion,
        documento_ids
      );

      if (!docsPendientes.length) {
        return res.status(400).json({
          error:
            "No hay documentos pendientes disponibles para el tipo de operacion seleccionado",
        });
      }

      const tipoMovimientoMasivo = tipo_operacion === "Cobro" ? "Cobro" : "Pago";

      await client.query("BEGIN");

      const movimientosCreados = [];
      let totalMonto = 0;

      for (const doc of docsPendientes) {
        const montoDoc = Number(doc.saldo || 0);

        if (montoDoc <= 0) {
          continue;
        }

        const fechaDocumento = normalizarFechaISO(doc.fecha);
        const fechaMovimiento =
          modoComprobante === "por_documento"
            ? fechaDocumento
            : normalizarFechaISO(fecha || fechaDocumento);
        const periodoMovimiento = obtenerPeriodo(fechaMovimiento);
        const rutTerceroNormalizado = normalizarRutDocumentoOpcional(
          doc.rut_tercero
        );
        const nombreTercero = normalizarNombreTercero(doc.nombre_tercero);
        const glosaMovimiento = glosaDocumentoMovimiento(
          tipoMovimientoMasivo,
          doc
        );

        const movimientoResult = await client.query(
          `
          INSERT INTO pagos_cobros
          (
            empresa_id,
            tipo_movimiento,
            tipo_documento,
            documento_id,
            fecha,
            periodo,
            rut_tercero,
            nombre_tercero,
            folio,
            glosa,
            monto,
            cuenta_banco_id,
            cuenta_contraparte_id,
            estado,
            contabilizado
          )
          VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'vigente',false)
          RETURNING *
          `,
          [
            empresa_id,
            tipoMovimientoMasivo,
            doc.tipo_documento || "",
            doc.id,
            fechaMovimiento,
            periodoMovimiento,
            rutTerceroNormalizado,
            nombreTercero,
            doc.folio || "",
            glosaMovimiento,
            montoDoc,
            cuentaBancoId,
            cuentaContraparteId,
          ]
        );

        movimientosCreados.push({
          ...movimientoResult.rows[0],
          fecha_documento: fechaDocumento,
        });
        totalMonto += montoDoc;
      }

      if (!movimientosCreados.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error:
            "No se pudieron crear movimientos porque los documentos ya no tienen saldo pendiente",
        });
      }

      const idsMovimientos = movimientosCreados.map((item) => Number(item.id));
      let comprobanteUnico = null;
      let comprobantesCreados = 0;

      if (contabilizarAutomatico) {
        if (modoComprobante === "unico") {
          const glosaComprobanteUnico = glosaMasiva(
            tipoMovimientoMasivo,
            movimientosCreados
          );

          comprobanteUnico = await crearComprobantePagoCobro(client, {
            empresa_id,
            tipo_movimiento: tipoMovimientoMasivo,
            fecha: normalizarFechaISO(fecha || movimientosCreados[0].fecha),
            monto: totalMonto,
            glosa: glosaComprobanteUnico,
            cuenta_banco_id: cuentaBancoId,
            cuenta_contraparte_id: cuentaContraparteId,
            rut_tercero:
              movimientosCreados.length === 1
                ? movimientosCreados[0].rut_tercero
                : "",
            nombre_tercero:
              movimientosCreados.length === 1
                ? movimientosCreados[0].nombre_tercero
                : "",
            folio:
              movimientosCreados.length === 1
                ? movimientosCreados[0].folio
                : "",
            documentos_detalle: movimientosCreados.map((movimiento) => ({
              monto: movimiento.monto,
              glosa: movimiento.glosa,
              folio: movimiento.folio,
              rut_tercero: movimiento.rut_tercero,
            })),
          });

          await client.query(
            `
            UPDATE pagos_cobros
            SET contabilizado = true,
                comprobante_id = $1
            WHERE id = ANY($2::int[])
            `,
            [comprobanteUnico.id, idsMovimientos]
          );

          comprobantesCreados = 1;
        } else {
          for (const movimiento of movimientosCreados) {
            const glosaComprobante = movimiento.glosa;

            const comprobante = await crearComprobantePagoCobro(client, {
              empresa_id,
              tipo_movimiento: tipoMovimientoMasivo,
              fecha: normalizarFechaISO(
                movimiento.fecha_documento || movimiento.fecha
              ),
              monto: Number(movimiento.monto || 0),
              glosa: glosaComprobante,
              cuenta_banco_id: cuentaBancoId,
              cuenta_contraparte_id: cuentaContraparteId,
              rut_tercero: movimiento.rut_tercero,
              nombre_tercero: movimiento.nombre_tercero,
              folio: movimiento.folio,
            });

            await client.query(
              `
              UPDATE pagos_cobros
              SET contabilizado = true,
                  comprobante_id = $1
              WHERE id = $2
              `,
              [comprobante.id, movimiento.id]
            );

            comprobantesCreados++;
          }
        }
      }

      await registrarAuditoria({
        client,
        req,
        empresaId: Number(empresa_id),
        modulo: "Pagos y Cobros",
        accion: "Cobro/Pago masivo",
        detalle: `${tipoMovimientoMasivo} masivo (${movimientosCreados.length} documento(s))`,
        tablaAfectada: "pagos_cobros",
        registroId: Number(movimientosCreados[0]?.id || 0) || null,
        datos: {
          total_documentos: movimientosCreados.length,
          total_monto: totalMonto,
          comprobantes_creados: comprobantesCreados,
          modo_comprobante: modoComprobante,
        },
      });

      await client.query("COMMIT");

      return res.status(201).json({
        mensaje: contabilizarAutomatico
          ? `Movimientos registrados y contabilizados (${movimientosCreados.length} documentos, ${comprobantesCreados} comprobante(s))`
          : `Movimientos registrados (${movimientosCreados.length} documentos)`,
        masivo: true,
        total_documentos: movimientosCreados.length,
        total_monto: totalMonto,
        comprobantes_creados: comprobantesCreados,
        movimientos: movimientosCreados,
        comprobante: comprobanteUnico,
      });
    }

    if (!tipo_movimiento || !fecha || !monto) {
      return res.status(400).json({
        error: "Empresa, tipo de movimiento, fecha y monto son obligatorios",
      });
    }

    const montoNum = Number(monto || 0);

    if (montoNum <= 0) {
      return res.status(400).json({
        error: "El monto debe ser mayor a cero",
      });
    }

    const operacionDocumento =
      tipo_operacion || tipoOperacionDesdeDocumento(tipo_movimiento, tipo_documento);
    let documentoOrigen = null;

    if (documento_id && operacionDocumento) {
      const documentosOrigen = await obtenerDocumentosPendientesPorOperacion(
        client,
        empresa_id,
        operacionDocumento,
        [documento_id]
      );
      documentoOrigen = documentosOrigen[0] || null;

      // La busqueda ya acota por empresa. Si no aparecio, el documento es de
      // otra empresa o no esta pendiente, y el movimiento no debe guardarse
      // apuntando a el: los saldos por cobrar y por pagar se calculan uniendo
      // por documento_id, asi que la referencia cruzada altera las cifras de
      // dos clientes a la vez.
      if (!documentoOrigen) {
        return res.status(404).json({
          error:
            "El documento indicado no existe en esta empresa o no tiene saldo pendiente",
        });
      }
    }

    const periodo = obtenerPeriodo(fecha);
    const rutTerceroNormalizado = normalizarRutDocumentoOpcional(
      rut_tercero || documentoOrigen?.rut_tercero
    );
    const nombreTercero = normalizarNombreTercero(
      nombre_tercero || documentoOrigen?.nombre_tercero
    );
    const folioMovimiento = texto(folio || documentoOrigen?.folio);
    const glosaMovimiento = documentoOrigen
      ? glosaDocumentoMovimiento(tipo_movimiento, documentoOrigen)
      : texto(glosa) ||
        `${tipo_movimiento} ${tipo_documento || ""} folio ${
          folioMovimiento || ""
        } ${nombreTercero || ""}`.trim();

    await client.query("BEGIN");

    const movimientoResult = await client.query(
      `
      INSERT INTO pagos_cobros
      (
        empresa_id,
        tipo_movimiento,
        tipo_documento,
        documento_id,
        fecha,
        periodo,
        rut_tercero,
        nombre_tercero,
        folio,
        glosa,
        monto,
        cuenta_banco_id,
        cuenta_contraparte_id,
        estado,
        contabilizado
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'vigente',false)
      RETURNING *
      `,
      [
        empresa_id,
        tipo_movimiento,
        tipo_documento || "",
        documento_id || null,
        fecha,
        periodo,
        rutTerceroNormalizado,
        nombreTercero,
        folioMovimiento,
        glosaMovimiento,
        montoNum,
        cuentaBancoId,
        cuentaContraparteId,
      ]
    );

    const movimiento = movimientoResult.rows[0];
    let comprobante = null;

    if (contabilizarAutomatico) {
      const glosaComprobante = glosaMovimiento;

      comprobante = await crearComprobantePagoCobro(client, {
        empresa_id,
        tipo_movimiento,
        fecha: normalizarFechaISO(fecha),
        monto: montoNum,
        glosa: glosaComprobante,
        cuenta_banco_id: cuentaBancoId,
        cuenta_contraparte_id: cuentaContraparteId,
        rut_tercero: rutTerceroNormalizado,
        nombre_tercero: nombreTercero,
        folio: folioMovimiento,
      });

      await client.query(
        `
        UPDATE pagos_cobros
        SET contabilizado = true,
            comprobante_id = $1
        WHERE id = $2
        `,
        [comprobante.id, movimiento.id]
      );
    }

    await registrarAuditoria({
      client,
      req,
      empresaId: Number(empresa_id),
      modulo: "Pagos y Cobros",
      accion: "Cobro/Pago",
      detalle: glosaMovimiento,
      tablaAfectada: "pagos_cobros",
      registroId: Number(movimiento.id),
      datos: {
        fecha,
        monto: montoNum,
        contabilizado: Boolean(contabilizarAutomatico),
      },
    });

    await client.query("COMMIT");

    return res.status(201).json({
      mensaje: contabilizarAutomatico
        ? "Movimiento registrado y contabilizado correctamente"
        : "Movimiento registrado correctamente",
      movimiento,
      comprobante,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error al registrar pago/cobro:", error);

    return res.status(error.statusCode || 500).json({
      // El mensaje de PostgreSQL no vuelve al cliente.
      error: error.statusCode ? error.message : "Error interno al registrar pago/cobro",
    });
  } finally {
    client.release();
  }
}

async function anularPagoCobro(req, res) {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { empresa_id } = req.body;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    await client.query("BEGIN");

    const existe = await client.query(
      `
      SELECT *
      FROM pagos_cobros
      WHERE id = $1
        AND empresa_id = $2
      FOR UPDATE
      `,
      [id, empresa_id]
    );

    if (existe.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "Movimiento no encontrado",
      });
    }

    const movimiento = existe.rows[0];

    if (movimiento.estado !== "vigente") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "El movimiento ya se encuentra anulado",
      });
    }

    if (movimiento.contabilizado && movimiento.comprobante_id) {
      const comprobanteId = Number(movimiento.comprobante_id);

      await client.query(
        `
        UPDATE comprobantes
        SET estado = 'anulado'
        WHERE id = $1
          AND empresa_id = $2
          AND estado = 'vigente'
        `,
        [comprobanteId, empresa_id]
      );

      const anulados = await client.query(
        `
        UPDATE pagos_cobros
        SET estado = 'anulado',
            anulado_en = NOW(), anulado_por = NULLIF(current_setting('app.usuario_id', true), '')::integer,
            contabilizado = false
        WHERE empresa_id = $1
          AND comprobante_id = $2
          AND estado = 'vigente'
        RETURNING id
        `,
        [empresa_id, comprobanteId]
      );

      await registrarAuditoria({
        client,
        req,
        empresaId: Number(empresa_id),
        modulo: "Pagos y Cobros",
        accion: "Deshacer cobro/pago",
        detalle: `Se anulo asiento asociado a comprobante ${comprobanteId}`,
        tablaAfectada: "pagos_cobros",
        registroId: Number(id),
        datos: {
          comprobante_id: comprobanteId,
          movimientos_anulados: anulados.rows.length,
        },
      });

      await client.query("COMMIT");

      return res.json({
        mensaje:
          anulados.rows.length > 1
            ? `Se deshizo el asiento y se anularon ${anulados.rows.length} movimientos asociados`
            : "Movimiento y asiento anulados correctamente",
        anulados: anulados.rows.map((fila) => fila.id),
      });
    }

    const resultado = await client.query(
      `
      UPDATE pagos_cobros
      SET estado = 'anulado',
          anulado_en = NOW(), anulado_por = NULLIF(current_setting('app.usuario_id', true), '')::integer
      WHERE id = $1
        AND empresa_id = $2
      RETURNING *
      `,
      [id, empresa_id]
    );

    await registrarAuditoria({
      client,
      req,
      empresaId: Number(empresa_id),
      modulo: "Pagos y Cobros",
      accion: "Deshacer cobro/pago",
      detalle: "Movimiento anulado correctamente",
      tablaAfectada: "pagos_cobros",
      registroId: Number(id),
      datos: {},
    });

    await client.query("COMMIT");

    return res.json({
      mensaje: "Movimiento anulado correctamente",
      movimiento: resultado.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al anular pago/cobro:", error);

    return res.status(500).json({
      error: "Error interno al anular pago/cobro",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  listarDocumentosPendientes,
  listarPagosCobros,
  registrarPagoCobro,
  anularPagoCobro,
};


