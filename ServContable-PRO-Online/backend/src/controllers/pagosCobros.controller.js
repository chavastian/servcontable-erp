const pool = require("../database/db");

const { registrarAuditoria } = require("../helpers/auditoria.helper");

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

  return Number(resultado.rows[0]?.siguiente || 1);
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
  } = datos;

  const montoNum = Number(monto || 0);
  const periodo = obtenerPeriodo(fecha);
  const tipoComprobante = tipo_movimiento === "Cobro" ? "Ingreso" : "Egreso";
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

  if (tipo_movimiento === "Cobro") {
    detalles = [
      {
        cuenta_id: cuenta_banco_id,
        debe: montoNum,
        haber: 0,
      },
      {
        cuenta_id: cuenta_contraparte_id,
        debe: 0,
        haber: montoNum,
      },
    ];
  } else {
    detalles = [
      {
        cuenta_id: cuenta_contraparte_id,
        debe: montoNum,
        haber: 0,
      },
      {
        cuenta_id: cuenta_banco_id,
        debe: 0,
        haber: montoNum,
      },
    ];
  }

  for (const detalle of detalles) {
    await client.query(
      `
      INSERT INTO comprobante_detalle
      (comprobante_id, cuenta_id, glosa, debe, haber)
      VALUES ($1,$2,$3,$4,$5)
      `,
      [
        comprobante.id,
        detalle.cuenta_id,
        glosa || "",
        Number(detalle.debe || 0),
        Number(detalle.haber || 0),
      ]
    );
  }

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

    const resultado = await pool.query(
      `
      SELECT
        pc.*,
        cb.codigo AS banco_codigo,
        cb.nombre AS banco_nombre,
        cc.codigo AS contraparte_codigo,
        cc.nombre AS contraparte_nombre
      FROM pagos_cobros pc
      LEFT JOIN plan_cuentas cb
        ON cb.id = pc.cuenta_banco_id
      LEFT JOIN plan_cuentas cc
        ON cc.id = pc.cuenta_contraparte_id
      WHERE pc.empresa_id = $1
        AND ($4::boolean = true OR pc.estado = 'vigente')
        AND pc.fecha BETWEEN $2 AND $3
      ORDER BY pc.fecha DESC, pc.id DESC
      `,
      [empresa_id, fecha_desde, fecha_hasta, incluirAnulados]
    );

    const movimientos = resultado.rows;

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
        const glosaMovimiento =
          glosa ||
          `${tipoMovimientoMasivo} ${doc.tipo_documento} folio ${
            doc.folio || ""
          } ${doc.nombre_tercero || ""}`.trim();

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
            doc.rut_tercero || "",
            doc.nombre_tercero || "",
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
          const glosaComprobanteUnico =
            glosa ||
            `${tipoMovimientoMasivo} masivo (${movimientosCreados.length} documentos)`;

          comprobanteUnico = await crearComprobantePagoCobro(client, {
            empresa_id,
            tipo_movimiento: tipoMovimientoMasivo,
            fecha: normalizarFechaISO(fecha || movimientosCreados[0].fecha),
            monto: totalMonto,
            glosa: glosaComprobanteUnico,
            cuenta_banco_id: cuentaBancoId,
            cuenta_contraparte_id: cuentaContraparteId,
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
            const glosaComprobante =
              movimiento.glosa ||
              `${tipoMovimientoMasivo} ${movimiento.tipo_documento} folio ${
                movimiento.folio || ""
              } ${movimiento.nombre_tercero || ""}`.trim();

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

    const periodo = obtenerPeriodo(fecha);

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
        rut_tercero || "",
        nombre_tercero || "",
        folio || "",
        glosa || "",
        montoNum,
        cuentaBancoId,
        cuentaContraparteId,
      ]
    );

    const movimiento = movimientoResult.rows[0];
    let comprobante = null;

    if (contabilizarAutomatico) {
      const glosaComprobante =
        glosa ||
        `${tipo_movimiento} ${tipo_documento || ""} folio ${
          folio || ""
        } ${nombre_tercero || ""}`.trim();

      comprobante = await crearComprobantePagoCobro(client, {
        empresa_id,
        tipo_movimiento,
        fecha: normalizarFechaISO(fecha),
        monto: montoNum,
        glosa: glosaComprobante,
        cuenta_banco_id: cuentaBancoId,
        cuenta_contraparte_id: cuentaContraparteId,
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
      detalle: `${tipo_movimiento} ${tipo_documento || ""} folio ${folio || ""}`.trim(),
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

    return res.status(500).json({
      error: error.message || "Error interno al registrar pago/cobro",
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
      SET estado = 'anulado'
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


