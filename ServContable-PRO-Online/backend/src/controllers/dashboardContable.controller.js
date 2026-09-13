const pool = require("../database/db");

function numero(valor) {
  return Number(valor || 0);
}

function periodoDesdeFecha(fecha) {
  return String(fecha || "").substring(0, 7);
}

function obtenerRangoDesdePeriodo(periodo) {
  const [anioTxt, mesTxt] = String(periodo || "").split("-");
  const anio = Number(anioTxt);
  const mes = Number(mesTxt);

  if (!anio || !mes) {
    return { fechaDesde: "", fechaHasta: "" };
  }

  const mesNormalizado = String(mes).padStart(2, "0");
  const ultimoDia = String(new Date(anio, mes, 0).getDate()).padStart(2, "0");

  return {
    fechaDesde: `${anio}-${mesNormalizado}-01`,
    fechaHasta: `${anio}-${mesNormalizado}-${ultimoDia}`,
  };
}

async function existeTabla(client, nombreTabla) {
  const resultado = await client.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
    ) AS existe
    `,
    [nombreTabla]
  );

  return resultado.rows[0]?.existe === true;
}

async function obtenerDashboardContable(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id, fecha_desde, fecha_hasta, periodo } = req.query;

    if (!empresa_id || (!periodo && (!fecha_desde || !fecha_hasta))) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y fecha_desde/fecha_hasta",
      });
    }

    const rangoPeriodo = obtenerRangoDesdePeriodo(periodo);
    const fechaDesde = fecha_desde || rangoPeriodo.fechaDesde;
    const fechaHasta = fecha_hasta || rangoPeriodo.fechaHasta;

    if (!fechaDesde || !fechaHasta) {
      return res.status(400).json({
        error: "Rango de fechas invalido",
      });
    }
    const periodoInicio = periodoDesdeFecha(fechaDesde);
    const periodoFin = periodoDesdeFecha(fechaHasta);

    const existeVentas = await existeTabla(client, "ventas");
    const existeCompras = await existeTabla(client, "compras");
    const existeHonorarios = await existeTabla(client, "honorarios");
    const existeLiquidaciones = await existeTabla(client, "liquidaciones");
    const existeFiniquitos = await existeTabla(client, "finiquitos");

    let ventas = {
      total_neto: 0,
      total_iva: 0,
      total_bruto: 0,
      cantidad: 0,
    };

    let compras = {
      total_neto: 0,
      total_iva: 0,
      total_bruto: 0,
      cantidad: 0,
    };

    let honorarios = {
      total_bruto: 0,
      total_retencion: 0,
      total_liquido: 0,
      cantidad: 0,
    };

    let remuneraciones = {
      total_haberes: 0,
      total_descuentos: 0,
      liquido_pagar: 0,
      costo_empresa: 0,
      contabilizadas: 0,
      pendientes: 0,
    };

    let finiquitos = {
      total_finiquito: 0,
      contabilizados: 0,
      pendientes: 0,
    };

    if (existeVentas) {
      const ventasResult = await client.query(
        `
        SELECT
          COALESCE(SUM(neto), 0) AS total_neto,
          COALESCE(SUM(iva), 0) AS total_iva,
          COALESCE(SUM(total), 0) AS total_bruto,
          COUNT(*)::INTEGER AS cantidad
        FROM ventas
        WHERE empresa_id = $1
          AND fecha >= $2
          AND fecha <= $3
          AND COALESCE(estado, 'vigente') <> 'eliminada'
        `,
        [empresa_id, fechaDesde, fechaHasta]
      );

      ventas = ventasResult.rows[0] || ventas;
    }

    if (existeCompras) {
      const comprasResult = await client.query(
        `
        SELECT
          COALESCE(SUM(neto), 0) AS total_neto,
          COALESCE(SUM(iva_credito), 0) AS total_iva,
          COALESCE(SUM(total), 0) AS total_bruto,
          COUNT(*)::INTEGER AS cantidad
        FROM compras
        WHERE empresa_id = $1
          AND fecha >= $2
          AND fecha <= $3
          AND COALESCE(estado, 'vigente') <> 'eliminada'
        `,
        [empresa_id, fechaDesde, fechaHasta]
      );

      compras = comprasResult.rows[0] || compras;
    }

    if (existeHonorarios) {
      const honorariosResult = await client.query(
        `
        SELECT
          COALESCE(SUM(bruto), 0) AS total_bruto,
          COALESCE(SUM(retencion), 0) AS total_retencion,
          COALESCE(SUM(liquido), 0) AS total_liquido,
          COUNT(*)::INTEGER AS cantidad
        FROM honorarios
        WHERE empresa_id = $1
          AND fecha_emision >= $2
          AND fecha_emision <= $3
          AND COALESCE(estado, 'vigente') <> 'eliminada'
        `,
        [empresa_id, fechaDesde, fechaHasta]
      );

      honorarios = honorariosResult.rows[0] || honorarios;
    }

    if (existeLiquidaciones) {
      const liquidacionesResult = await client.query(
        `
        SELECT
          COALESCE(SUM(total_haberes), 0) AS total_haberes,
          COALESCE(SUM(total_descuentos), 0) AS total_descuentos,
          COALESCE(SUM(liquido_pagar), 0) AS liquido_pagar,
          COALESCE(SUM(costo_empresa), 0) AS costo_empresa,
          COUNT(*) FILTER (WHERE contabilizada = true)::INTEGER AS contabilizadas,
          COUNT(*) FILTER (WHERE COALESCE(contabilizada, false) = false)::INTEGER AS pendientes
        FROM liquidaciones
        WHERE empresa_id = $1
          AND periodo >= $2
          AND periodo <= $3
          AND estado <> 'eliminada'
        `,
        [empresa_id, periodoInicio, periodoFin]
      );

      remuneraciones = liquidacionesResult.rows[0] || remuneraciones;
    }

    if (existeFiniquitos) {
      const finiquitosResult = await client.query(
        `
        SELECT
          COALESCE(SUM(total_finiquito), 0) AS total_finiquito,
          COUNT(*) FILTER (WHERE contabilizado = true)::INTEGER AS contabilizados,
          COUNT(*) FILTER (WHERE COALESCE(contabilizado, false) = false)::INTEGER AS pendientes
        FROM finiquitos
        WHERE empresa_id = $1
          AND periodo >= $2
          AND periodo <= $3
          AND estado = 'vigente'
        `,
        [empresa_id, periodoInicio, periodoFin]
      );

      finiquitos = finiquitosResult.rows[0] || finiquitos;
    }

    const comprobantesResult = await client.query(
      `
      SELECT
        COUNT(*)::INTEGER AS cantidad,
        COALESCE(SUM(total_debe), 0) AS total_debe,
        COALESCE(SUM(total_haber), 0) AS total_haber
      FROM comprobantes
      WHERE empresa_id = $1
        AND fecha >= $2
        AND fecha <= $3
        AND estado = 'vigente'
      `,
      [empresa_id, fechaDesde, fechaHasta]
    );

    const ultimosComprobantesResult = await client.query(
      `
      SELECT
        id,
        fecha,
        tipo,
        numero,
        glosa,
        total_debe,
        total_haber
      FROM comprobantes
      WHERE empresa_id = $1
        AND fecha >= $2
        AND fecha <= $3
        AND estado = 'vigente'
      ORDER BY fecha DESC, id DESC
      LIMIT 10
      `,
      [empresa_id, fechaDesde, fechaHasta]
    );

    const resultadoContableResult = await client.query(
      `
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN pc.tipo = 'Ingreso' THEN cd.haber - cd.debe
              ELSE 0
            END
          ),
          0
        ) AS ingresos,
        COALESCE(
          SUM(
            CASE
              WHEN pc.tipo = 'Gasto' THEN cd.debe - cd.haber
              ELSE 0
            END
          ),
          0
        ) AS gastos
      FROM comprobante_detalle cd
      INNER JOIN comprobantes c ON c.id = cd.comprobante_id
      INNER JOIN plan_cuentas pc ON pc.id = cd.cuenta_id
      WHERE c.empresa_id = $1
        AND c.fecha >= $2
        AND c.fecha <= $3
        AND c.estado = 'vigente'
      `,
      [empresa_id, fechaDesde, fechaHasta]
    );

    const comprobantes = comprobantesResult.rows[0] || {
      cantidad: 0,
      total_debe: 0,
      total_haber: 0,
    };

    const resultadoContable = resultadoContableResult.rows[0] || {
      ingresos: 0,
      gastos: 0,
    };

    const ivaDebito = numero(ventas.total_iva);
    const ivaCredito = numero(compras.total_iva);
    const ivaDeterminado = ivaDebito - ivaCredito;

    const ingresos = numero(resultadoContable.ingresos);
    const gastos = numero(resultadoContable.gastos);
    const resultadoPeriodo = ingresos - gastos;

    return res.json({
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      periodo:
        periodoInicio === periodoFin
          ? periodoInicio
          : `${periodoInicio} a ${periodoFin}`,
      ventas: {
        cantidad: numero(ventas.cantidad),
        neto: numero(ventas.total_neto),
        iva: ivaDebito,
        total: numero(ventas.total_bruto),
      },
      compras: {
        cantidad: numero(compras.cantidad),
        neto: numero(compras.total_neto),
        iva: ivaCredito,
        total: numero(compras.total_bruto),
      },
      iva: {
        debito: ivaDebito,
        credito: ivaCredito,
        determinado: ivaDeterminado,
        estado:
          ivaDeterminado > 0
            ? "IVA a pagar"
            : ivaDeterminado < 0
            ? "Remanente credito fiscal"
            : "Sin diferencia",
      },
      honorarios: {
        cantidad: numero(honorarios.cantidad),
        bruto: numero(honorarios.total_bruto),
        retencion: numero(honorarios.total_retencion),
        liquido: numero(honorarios.total_liquido),
      },
      remuneraciones: {
        total_haberes: numero(remuneraciones.total_haberes),
        total_descuentos: numero(remuneraciones.total_descuentos),
        liquido_pagar: numero(remuneraciones.liquido_pagar),
        costo_empresa: numero(remuneraciones.costo_empresa),
        contabilizadas: numero(remuneraciones.contabilizadas),
        pendientes: numero(remuneraciones.pendientes),
      },
      finiquitos: {
        total_finiquito: numero(finiquitos.total_finiquito),
        contabilizados: numero(finiquitos.contabilizados),
        pendientes: numero(finiquitos.pendientes),
      },
      comprobantes: {
        cantidad: numero(comprobantes.cantidad),
        total_debe: numero(comprobantes.total_debe),
        total_haber: numero(comprobantes.total_haber),
        diferencia:
          numero(comprobantes.total_debe) - numero(comprobantes.total_haber),
      },
      resultado: {
        ingresos,
        gastos,
        resultado_periodo: resultadoPeriodo,
      },
      ultimos_comprobantes: ultimosComprobantesResult.rows,
    });
  } catch (error) {
    console.error("Error al obtener dashboard contable:", error);

    return res.status(500).json({
      error: error.message || "Error interno al obtener dashboard contable",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  obtenerDashboardContable,
};
