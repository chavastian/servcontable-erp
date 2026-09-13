const pool = require("../database/db");

async function obtenerSiguienteNumeroComprobante(client, empresaId, tipo) {
  const resultado = await client.query(
    `
    SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente
    FROM comprobantes
    WHERE empresa_id = $1
      AND tipo = $2
      AND estado = 'vigente'
    `,
    [empresaId, tipo]
  );

  return Number(resultado.rows[0]?.siguiente || 1);
}

async function crearComprobanteAutomaticoVenta(client, venta, configuracion) {
  const {
    empresa_id,
    periodo,
    fecha,
    folio,
    razon_social_cliente,
    neto,
    iva,
    total,
    cuenta_ingreso_id,
  } = venta;

  const cuentaClientes =
    configuracion.cuenta_clientes_id || configuracion.cuenta_caja_banco_id;

  const cuentaIngreso =
    cuenta_ingreso_id || configuracion.cuenta_ingreso_defecto_id;

  const cuentaIvaDebito = configuracion.cuenta_iva_debito_id;

  const netoNum = Number(neto || 0);
  const ivaNum = Number(iva || 0);
  const totalNum = Number(total || netoNum + ivaNum);

  if (!cuentaClientes || !cuentaIngreso || (ivaNum > 0 && !cuentaIvaDebito)) {
    throw new Error(
      "Falta configuracion contable para generar asiento automatico de venta"
    );
  }

  const tipo = "Venta";

  const numero = await obtenerSiguienteNumeroComprobante(
    client,
    empresa_id,
    tipo
  );

  const glosa = `Folio ${folio || ""} ${razon_social_cliente || ""}`.trim();

  const comprobanteResult = await client.query(
    `
    INSERT INTO comprobantes
    (empresa_id, periodo, fecha, tipo, numero, glosa, total_debe, total_haber, estado)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'vigente')
    RETURNING *
    `,
    [
      empresa_id,
      periodo,
      fecha,
      tipo,
      numero,
      glosa,
      totalNum,
      totalNum,
    ]
  );

  const comprobante = comprobanteResult.rows[0];

  const detalles = [
    {
      cuenta_id: cuentaClientes,
      glosa,
      debe: totalNum,
      haber: 0,
    },
    {
      cuenta_id: cuentaIngreso,
      glosa,
      debe: 0,
      haber: netoNum,
    },
    {
      cuenta_id: cuentaIvaDebito,
      glosa,
      debe: 0,
      haber: ivaNum,
    },
  ];

  await insertarDetallesComprobante(client, comprobante.id, detalles);
  return comprobante;
}

function construirAsientoCompra(compra, configuracion = {}) {
  const {
    empresa_id,
    periodo,
    fecha,
    folio,
    razon_social_proveedor,
    neto,
    exento,
    iva_credito,
    iva_no_recuperable,
    otros_impuestos,
    total,
    cuenta_gasto_id,
    cuenta_otros_impuestos_id,
  } = compra;

  const cuentaProveedores =
    configuracion.cuenta_proveedores_id || configuracion.cuenta_caja_banco_id;
  const cuentaGasto = cuenta_gasto_id || configuracion.cuenta_gasto_defecto_id;
  const cuentaIvaCredito = configuracion.cuenta_iva_credito_id;
  const cuentaOtrosImpuestos =
    cuenta_otros_impuestos_id ||
    configuracion.cuenta_otros_impuestos_id ||
    null;

  if (!cuentaProveedores || !cuentaGasto || !cuentaIvaCredito) {
    throw new Error(
      "Falta configuracion contable para generar asiento automatico de compra"
    );
  }

  const netoNum = Number(neto || 0);
  const exentoNum = Number(exento || 0);
  const ivaCreditoNum = Number(iva_credito || 0);
  const ivaNoRecNum = Number(iva_no_recuperable || 0);
  const otrosImpuestosNum = Number(otros_impuestos || 0);
  const totalNum = Number(
    total ||
      netoNum +
        exentoNum +
        ivaCreditoNum +
        ivaNoRecNum +
        otrosImpuestosNum
  );

  if (otrosImpuestosNum > 0 && !cuentaOtrosImpuestos) {
    throw new Error(
      "Falta configurar la cuenta de otros impuestos para compras"
    );
  }

  const totalDebe =
    netoNum + exentoNum + ivaCreditoNum + ivaNoRecNum + otrosImpuestosNum;
  const glosa = `Folio ${folio || ""} ${razon_social_proveedor || ""}`.trim();

  return {
    empresa_id,
    periodo,
    fecha,
    tipo: "Compra",
    glosa,
    totalDebe,
    totalHaber: totalNum,
    detalles: [
      {
        cuenta_id: cuentaGasto,
        glosa,
        debe: netoNum + exentoNum + ivaNoRecNum,
        haber: 0,
      },
      {
        cuenta_id: cuentaIvaCredito,
        glosa,
        debe: ivaCreditoNum,
        haber: 0,
      },
      {
        cuenta_id: cuentaOtrosImpuestos,
        glosa,
        debe: otrosImpuestosNum,
        haber: 0,
      },
      {
        cuenta_id: cuentaProveedores,
        glosa,
        debe: 0,
        haber: totalNum,
      },
    ],
  };
}

async function insertarDetallesComprobante(client, comprobanteId, detalles = []) {
  for (const detalle of detalles) {
    if (Number(detalle.debe || 0) === 0 && Number(detalle.haber || 0) === 0) {
      continue;
    }

    await client.query(
      `
      INSERT INTO comprobante_detalle
      (comprobante_id, cuenta_id, glosa, debe, haber)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        comprobanteId,
        detalle.cuenta_id,
        detalle.glosa,
        Number(detalle.debe || 0),
        Number(detalle.haber || 0),
      ]
    );
  }
}

async function crearComprobanteAutomaticoCompra(client, compra, configuracion) {
  const asiento = construirAsientoCompra(compra, configuracion);
  const numero = await obtenerSiguienteNumeroComprobante(
    client,
    asiento.empresa_id,
    asiento.tipo
  );

  const comprobanteResult = await client.query(
    `
    INSERT INTO comprobantes
    (empresa_id, periodo, fecha, tipo, numero, glosa, total_debe, total_haber, estado)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'vigente')
    RETURNING *
    `,
    [
      asiento.empresa_id,
      asiento.periodo,
      asiento.fecha,
      asiento.tipo,
      numero,
      asiento.glosa,
      asiento.totalDebe,
      asiento.totalHaber,
    ]
  );

  const comprobante = comprobanteResult.rows[0];
  await insertarDetallesComprobante(client, comprobante.id, asiento.detalles);
  return comprobante;
}

async function actualizarComprobanteAutomaticoCompra(
  client,
  compra,
  configuracion,
  comprobanteId
) {
  const asiento = construirAsientoCompra(compra, configuracion);

  const actualizado = await client.query(
    `
    UPDATE comprobantes
    SET
      periodo = $1,
      fecha = $2,
      tipo = $3,
      glosa = $4,
      total_debe = $5,
      total_haber = $6
    WHERE id = $7
      AND empresa_id = $8
      AND estado = 'vigente'
    RETURNING *
    `,
    [
      asiento.periodo,
      asiento.fecha,
      asiento.tipo,
      asiento.glosa,
      asiento.totalDebe,
      asiento.totalHaber,
      comprobanteId,
      asiento.empresa_id,
    ]
  );

  if (actualizado.rows.length === 0) {
    return null;
  }

  await client.query(
    `
    DELETE FROM comprobante_detalle
    WHERE comprobante_id = $1
    `,
    [comprobanteId]
  );

  await insertarDetallesComprobante(client, comprobanteId, asiento.detalles);
  return actualizado.rows[0];
}

module.exports = {
  obtenerSiguienteNumeroComprobante,
  crearComprobanteAutomaticoVenta,
  crearComprobanteAutomaticoCompra,
  actualizarComprobanteAutomaticoCompra,
};

