const pool = require("../database/db");
const { signoDocumento } = require("./documentoTributario.helper");
const { exigirPeriodoAbierto } = require("./periodo.helper");

const {
  normalizarRutDocumentoOpcional,
} = require("./trazabilidadRut.helper");

function texto(valor = "") {
  return String(valor || "").trim();
}

async function obtenerSiguienteNumeroComprobante(client, empresaId, tipo = "") {
  // Bloqueo transaccional por empresa: evita que dos procesos automaticos
  // tomen el mismo correlativo cuando se contabiliza en paralelo.
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `comprobantes:${empresaId}`,
  ]);

  const resultado = await client.query(
    `
    SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente
    FROM comprobantes
    WHERE empresa_id = $1
    `,
    [empresaId]
  );

  return Number(resultado.rows[0]?.siguiente || 1);
}

/**
 * Invierte debe y haber de cada línea cuando el documento resta.
 *
 * Una nota de crédito rebaja la operación que corrige: su asiento es el inverso
 * del de la factura (artículos 21 y 57 del DL 825). Antes el generador no
 * miraba el tipo de documento y una nota de crédito de compra debitaba gasto e
 * IVA crédito igual que una factura: el F29 la restaba (fase 4) pero la
 * contabilidad la sumaba.
 */
function aplicarSignoALineas(detalles, signo) {
  if (signo >= 0) return detalles;

  return detalles.map((linea) => ({
    ...linea,
    debe: Number(linea.haber || 0),
    haber: Number(linea.debe || 0),
  }));
}

async function crearComprobanteAutomaticoVenta(client, venta, configuracion) {
  const {
    empresa_id,
    periodo,
    fecha,
    folio,
    rut_cliente,
    razon_social_cliente,
    neto,
    exento,
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
  const exentoNum = Number(exento || 0);
  const ivaNum = Number(iva || 0);
  const totalNum = Number(total || netoNum + exentoNum + ivaNum);

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

  const folioDocumento = texto(folio);
  const rutAuxiliar = normalizarRutDocumentoOpcional(rut_cliente);
  const signo = signoDocumento(venta);
  const glosa = `${signo < 0 ? "NC " : ""}Folio ${folioDocumento || ""} ${
    razon_social_cliente || ""
  }`.trim();

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
      folio: folioDocumento,
      rut_auxiliar: rutAuxiliar,
    },
    {
      cuenta_id: cuentaIngreso,
      glosa,
      debe: 0,
      haber: netoNum + exentoNum,
      folio: folioDocumento,
    },
    {
      cuenta_id: cuentaIvaDebito,
      glosa,
      debe: 0,
      haber: ivaNum,
      folio: folioDocumento,
    },
  ];

  await insertarDetallesComprobante(
    client,
    comprobante.id,
    aplicarSignoALineas(detalles, signo)
  );
  return comprobante;
}

function construirAsientoCompra(compra, configuracion = {}) {
  const {
    empresa_id,
    periodo,
    fecha,
    folio,
    rut_proveedor,
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
  const folioDocumento = texto(folio);
  const rutAuxiliar = normalizarRutDocumentoOpcional(rut_proveedor);
  const signo = signoDocumento(compra);
  const glosa = `${signo < 0 ? "NC " : ""}Folio ${folioDocumento || ""} ${
    razon_social_proveedor || ""
  }`.trim();

  return {
    empresa_id,
    periodo,
    fecha,
    tipo: "Compra",
    glosa,
    totalDebe,
    totalHaber: totalNum,
    signo,
    detalles: aplicarSignoALineas([
      {
        cuenta_id: cuentaGasto,
        glosa,
        debe: netoNum + exentoNum + ivaNoRecNum,
        haber: 0,
        folio: folioDocumento,
      },
      {
        cuenta_id: cuentaIvaCredito,
        glosa,
        debe: ivaCreditoNum,
        haber: 0,
        folio: folioDocumento,
      },
      {
        cuenta_id: cuentaOtrosImpuestos,
        glosa,
        debe: otrosImpuestosNum,
        haber: 0,
        folio: folioDocumento,
      },
      {
        cuenta_id: cuentaProveedores,
        glosa,
        debe: 0,
        haber: totalNum,
        folio: folioDocumento,
        rut_auxiliar: rutAuxiliar,
      },
    ], signo),
  };
}

/**
 * Escribe las lineas de un asiento.
 *
 * Es el punto por donde pasa toda la contabilidad del sistema, asi que aca se
 * comprueba que cada cuenta imputada pertenezca a la empresa del comprobante.
 * La empresa no se recibe por parametro sino que se lee del comprobante: asi
 * ninguna de las rutas que llaman a esta funcion puede omitir la verificacion.
 *
 * Sin esto, un identificador de cuenta de otra empresa en el cuerpo de la
 * peticion quedaba imputado en el asiento, y los saldos de dos clientes se
 * mezclaban. Los identificadores son enteros consecutivos.
 */
async function insertarDetallesComprobante(client, comprobanteId, detalles = []) {
  const conMonto = (detalles || []).filter(
    (detalle) => Number(detalle.debe || 0) !== 0 || Number(detalle.haber || 0) !== 0
  );

  if (conMonto.length === 0) {
    return;
  }

  const duenoComprobante = await client.query(
    "SELECT empresa_id, fecha FROM comprobantes WHERE id = $1 LIMIT 1",
    [comprobanteId]
  );

  if (duenoComprobante.rows.length === 0) {
    const error = new Error("El comprobante indicado no existe");
    error.statusCode = 400;
    throw error;
  }

  const empresaId = Number(duenoComprobante.rows[0].empresa_id);

  // Un ejercicio cerrado no admite asientos nuevos. La comprobacion vive aca,
  // en el punto por donde pasan todas las lineas contables, para que ninguna
  // ruta pueda escribir en un periodo firme.
  await exigirPeriodoAbierto(client, empresaId, duenoComprobante.rows[0].fecha);
  const cuentas = [...new Set(conMonto.map((detalle) => Number(detalle.cuenta_id)))];

  if (cuentas.some((cuenta) => !Number.isInteger(cuenta) || cuenta <= 0)) {
    const error = new Error("Hay lineas sin cuenta contable valida");
    error.statusCode = 400;
    throw error;
  }

  const propias = await client.query(
    `SELECT id FROM plan_cuentas WHERE id = ANY($1::int[]) AND empresa_id = $2`,
    [cuentas, empresaId]
  );

  if (propias.rows.length !== cuentas.length) {
    const error = new Error(
      "Alguna cuenta imputada no pertenece a la empresa del comprobante"
    );
    error.statusCode = 400;
    throw error;
  }

  // Una sentencia por asiento en lugar de una por linea.
  await client.query(
    `
    INSERT INTO comprobante_detalle
      (comprobante_id, cuenta_id, glosa, debe, haber, folio, centro_costo, rut_auxiliar)
    SELECT $1, linea.cuenta_id, linea.glosa, linea.debe, linea.haber,
           linea.folio, linea.centro_costo, linea.rut_auxiliar
    FROM UNNEST(
      $2::int[], $3::text[], $4::numeric[], $5::numeric[],
      $6::text[], $7::text[], $8::text[]
    ) AS linea(cuenta_id, glosa, debe, haber, folio, centro_costo, rut_auxiliar)
    `,
    [
      comprobanteId,
      conMonto.map((detalle) => Number(detalle.cuenta_id)),
      conMonto.map((detalle) => detalle.glosa ?? null),
      conMonto.map((detalle) => Number(detalle.debe || 0)),
      conMonto.map((detalle) => Number(detalle.haber || 0)),
      conMonto.map((detalle) => texto(detalle.folio)),
      conMonto.map((detalle) => texto(detalle.centro_costo)),
      conMonto.map((detalle) => normalizarRutDocumentoOpcional(detalle.rut_auxiliar)),
    ]
  );
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
  insertarDetallesComprobante,
  crearComprobanteAutomaticoVenta,
  crearComprobanteAutomaticoCompra,
  actualizarComprobanteAutomaticoCompra,
  __comprobanteInternals: {
    construirAsientoCompra,
    normalizarRutDocumentoOpcional,
  },
};

