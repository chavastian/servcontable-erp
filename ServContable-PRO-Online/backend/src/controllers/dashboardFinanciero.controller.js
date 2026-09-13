const pool = require("../database/db");

async function obtenerDashboardFinanciero(req, res) {
  try {
    const { empresa_id, fecha_desde, fecha_hasta } = req.query;

    if (!empresa_id || !fecha_desde || !fecha_hasta) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, fecha_desde y fecha_hasta",
      });
    }

    const ventasResult = await pool.query(
      `
      SELECT
        COALESCE(SUM(neto), 0) AS neto,
        COALESCE(SUM(exento), 0) AS exento,
        COALESCE(SUM(iva), 0) AS iva,
        COALESCE(SUM(total), 0) AS total,
        COUNT(*) AS cantidad
      FROM ventas
      WHERE empresa_id = $1
        AND estado = 'vigente'
        AND fecha BETWEEN $2 AND $3
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const comprasResult = await pool.query(
      `
      SELECT
        COALESCE(SUM(neto), 0) AS neto,
        COALESCE(SUM(exento), 0) AS exento,
        COALESCE(SUM(iva_credito), 0) AS iva_credito,
        COALESCE(SUM(iva_no_recuperable), 0) AS iva_no_recuperable,
        COALESCE(SUM(total), 0) AS total,
        COUNT(*) AS cantidad
      FROM compras
      WHERE empresa_id = $1
        AND estado = 'vigente'
        AND fecha BETWEEN $2 AND $3
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const honorariosResult = await pool.query(
      `
      SELECT
        COALESCE(SUM(bruto), 0) AS bruto,
        COALESCE(SUM(retencion), 0) AS retencion,
        COALESCE(SUM(liquido), 0) AS liquido,
        COUNT(*) AS cantidad
      FROM honorarios
      WHERE empresa_id = $1
        AND estado = 'vigente'
        AND fecha_emision BETWEEN $2 AND $3
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const cobrosPagosResult = await pool.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN tipo_movimiento = 'Cobro' THEN monto ELSE 0 END), 0) AS total_cobros,
        COALESCE(SUM(CASE WHEN tipo_movimiento = 'Pago' THEN monto ELSE 0 END), 0) AS total_pagos,
        COUNT(*) AS cantidad
      FROM pagos_cobros
      WHERE empresa_id = $1
        AND estado = 'vigente'
        AND fecha BETWEEN $2 AND $3
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const cuentasPorCobrarResult = await pool.query(
      `
      SELECT
        COALESCE(SUM(saldo), 0) AS saldo_pendiente,
        COUNT(*) AS cantidad
      FROM (
        SELECT
          v.id,
          v.total - COALESCE(SUM(pc.monto), 0) AS saldo
        FROM ventas v
        LEFT JOIN pagos_cobros pc
          ON pc.empresa_id = v.empresa_id
         AND pc.tipo_documento = 'Venta'
         AND pc.documento_id = v.id
         AND pc.estado = 'vigente'
        WHERE v.empresa_id = $1
          AND v.estado = 'vigente'
          AND v.fecha BETWEEN $2 AND $3
        GROUP BY v.id, v.total
        HAVING v.total - COALESCE(SUM(pc.monto), 0) > 0
      ) pendientes
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const cuentasPorPagarComprasResult = await pool.query(
      `
      SELECT
        COALESCE(SUM(saldo), 0) AS saldo_pendiente,
        COUNT(*) AS cantidad
      FROM (
        SELECT
          c.id,
          c.total - COALESCE(SUM(pc.monto), 0) AS saldo
        FROM compras c
        LEFT JOIN pagos_cobros pc
          ON pc.empresa_id = c.empresa_id
         AND pc.tipo_documento = 'Compra'
         AND pc.documento_id = c.id
         AND pc.estado = 'vigente'
        WHERE c.empresa_id = $1
          AND c.estado = 'vigente'
          AND c.fecha BETWEEN $2 AND $3
        GROUP BY c.id, c.total
        HAVING c.total - COALESCE(SUM(pc.monto), 0) > 0
      ) pendientes
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const cuentasPorPagarHonorariosResult = await pool.query(
      `
      SELECT
        COALESCE(SUM(saldo), 0) AS saldo_pendiente,
        COUNT(*) AS cantidad
      FROM (
        SELECT
          h.id,
          h.liquido - COALESCE(SUM(pc.monto), 0) AS saldo
        FROM honorarios h
        LEFT JOIN pagos_cobros pc
          ON pc.empresa_id = h.empresa_id
         AND pc.tipo_documento = 'Honorario'
         AND pc.documento_id = h.id
         AND pc.estado = 'vigente'
        WHERE h.empresa_id = $1
          AND h.estado = 'vigente'
          AND h.fecha_emision BETWEEN $2 AND $3
        GROUP BY h.id, h.liquido
        HAVING h.liquido - COALESCE(SUM(pc.monto), 0) > 0
      ) pendientes
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const resultadoResult = await pool.query(
      `
      SELECT
        pc.tipo,
        COALESCE(SUM(cd.debe), 0) AS debitos,
        COALESCE(SUM(cd.haber), 0) AS creditos
      FROM plan_cuentas pc
      LEFT JOIN comprobante_detalle cd
        ON cd.cuenta_id = pc.id
      LEFT JOIN comprobantes c
        ON c.id = cd.comprobante_id
       AND c.empresa_id = pc.empresa_id
       AND c.estado = 'vigente'
       AND c.fecha BETWEEN $2 AND $3
      WHERE pc.empresa_id = $1
        AND pc.activo = true
        AND pc.tipo IN ('Ingreso', 'Costo', 'Gasto')
      GROUP BY pc.tipo
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const comprobantesResult = await pool.query(
      `
      SELECT
        COUNT(*) AS cantidad,
        COALESCE(SUM(total_debe), 0) AS total_debe,
        COALESCE(SUM(total_haber), 0) AS total_haber
      FROM comprobantes
      WHERE empresa_id = $1
        AND estado = 'vigente'
        AND fecha BETWEEN $2 AND $3
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const ultimosMovimientosResult = await pool.query(
      `
      SELECT
        fecha,
        tipo_movimiento,
        tipo_documento,
        folio,
        nombre_tercero,
        monto,
        contabilizado,
        comprobante_id
      FROM pagos_cobros
      WHERE empresa_id = $1
        AND estado = 'vigente'
      ORDER BY fecha DESC, id DESC
      LIMIT 8
      `,
      [empresa_id]
    );

    const ventas = ventasResult.rows[0];
    const compras = comprasResult.rows[0];
    const honorarios = honorariosResult.rows[0];
    const pagosCobros = cobrosPagosResult.rows[0];
    const cuentasCobrar = cuentasPorCobrarResult.rows[0];
    const pagarCompras = cuentasPorPagarComprasResult.rows[0];
    const pagarHonorarios = cuentasPorPagarHonorariosResult.rows[0];
    const comprobantes = comprobantesResult.rows[0];

    let totalIngresos = 0;
    let totalCostos = 0;
    let totalGastos = 0;

    for (const fila of resultadoResult.rows) {
      const debitos = Number(fila.debitos || 0);
      const creditos = Number(fila.creditos || 0);

      if (fila.tipo === "Ingreso") {
        totalIngresos += creditos - debitos;
      }

      if (fila.tipo === "Costo") {
        totalCostos += debitos - creditos;
      }

      if (fila.tipo === "Gasto") {
        totalGastos += debitos - creditos;
      }
    }

    const margenBruto = totalIngresos - totalCostos;
    const resultadoEjercicio = margenBruto - totalGastos;

    const ivaDebito = Number(ventas.iva || 0);
    const ivaCredito = Number(compras.iva_credito || 0);
    const ivaDeterminado = ivaDebito - ivaCredito;

    const totalCuentasPagar =
      Number(pagarCompras.saldo_pendiente || 0) +
      Number(pagarHonorarios.saldo_pendiente || 0);

    const saldoCajaBancoEstimado =
      Number(pagosCobros.total_cobros || 0) -
      Number(pagosCobros.total_pagos || 0);

    return res.json({
      filtros: {
        fecha_desde,
        fecha_hasta,
      },
      ventas: {
        neto: Number(ventas.neto || 0),
        exento: Number(ventas.exento || 0),
        iva: Number(ventas.iva || 0),
        total: Number(ventas.total || 0),
        cantidad: Number(ventas.cantidad || 0),
      },
      compras: {
        neto: Number(compras.neto || 0),
        exento: Number(compras.exento || 0),
        iva_credito: Number(compras.iva_credito || 0),
        iva_no_recuperable: Number(compras.iva_no_recuperable || 0),
        total: Number(compras.total || 0),
        cantidad: Number(compras.cantidad || 0),
      },
      honorarios: {
        bruto: Number(honorarios.bruto || 0),
        retencion: Number(honorarios.retencion || 0),
        liquido: Number(honorarios.liquido || 0),
        cantidad: Number(honorarios.cantidad || 0),
      },
      iva: {
        debito: ivaDebito,
        credito: ivaCredito,
        determinado: ivaDeterminado,
        iva_a_pagar: ivaDeterminado > 0 ? ivaDeterminado : 0,
        remanente_estimado: ivaDeterminado < 0 ? Math.abs(ivaDeterminado) : 0,
      },
      cuentas: {
        por_cobrar: Number(cuentasCobrar.saldo_pendiente || 0),
        por_cobrar_cantidad: Number(cuentasCobrar.cantidad || 0),
        por_pagar: totalCuentasPagar,
        por_pagar_compras: Number(pagarCompras.saldo_pendiente || 0),
        por_pagar_honorarios: Number(pagarHonorarios.saldo_pendiente || 0),
        por_pagar_cantidad:
          Number(pagarCompras.cantidad || 0) +
          Number(pagarHonorarios.cantidad || 0),
      },
      flujo: {
        cobros: Number(pagosCobros.total_cobros || 0),
        pagos: Number(pagosCobros.total_pagos || 0),
        saldo_estimado: saldoCajaBancoEstimado,
        cantidad: Number(pagosCobros.cantidad || 0),
      },
      resultado: {
        ingresos: totalIngresos,
        costos: totalCostos,
        gastos: totalGastos,
        margen_bruto: margenBruto,
        resultado_ejercicio: resultadoEjercicio,
      },
      comprobantes: {
        cantidad: Number(comprobantes.cantidad || 0),
        total_debe: Number(comprobantes.total_debe || 0),
        total_haber: Number(comprobantes.total_haber || 0),
        diferencia:
          Number(comprobantes.total_debe || 0) -
          Number(comprobantes.total_haber || 0),
      },
      ultimos_movimientos: ultimosMovimientosResult.rows,
    });
  } catch (error) {
    console.error("Error al obtener dashboard financiero:", error);

    return res.status(500).json({
      error: "Error interno al obtener dashboard financiero",
    });
  }
}

module.exports = {
  obtenerDashboardFinanciero,
};