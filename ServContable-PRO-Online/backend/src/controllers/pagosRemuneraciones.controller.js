const pool = require("../database/db");

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

function obtenerDescripcionTipo(tipoPago) {
  const mapa = {
    SUELDOS: "Pago sueldos líquidos",
    AFP: "Pago AFP / SIS",
    SALUD: "Pago salud",
    AFC: "Pago AFC",
    MUTUAL: "Pago mutual",
  };

  return mapa[tipoPago] || tipoPago;
}

function obtenerCuentaDebePorTipo(config, tipoPago) {
  if (tipoPago === "SUELDOS") return config.cuenta_sueldos_por_pagar_id;
  if (tipoPago === "AFP") return config.cuenta_afp_id;
  if (tipoPago === "SALUD") return config.cuenta_salud_id;
  if (tipoPago === "AFC") return config.cuenta_afc_id;
  if (tipoPago === "MUTUAL") return config.cuenta_mutual_id;

  return null;
}

async function obtenerResumenPagosRemuneraciones(req, res) {
  try {
    const { empresa_id, periodo } = req.query;

    if (!empresa_id || !periodo) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y periodo",
      });
    }

    const liquidacionesResult = await pool.query(
      `
      SELECT
        COALESCE(SUM(liquido_pagar), 0) AS sueldos,
        COALESCE(SUM(descuento_afp + aporte_sis_empleador), 0) AS afp,
        COALESCE(SUM(descuento_salud), 0) AS salud,
        COALESCE(SUM(descuento_afc + aporte_afc_empleador), 0) AS afc,
        COALESCE(SUM(aporte_mutual_empleador), 0) AS mutual
      FROM liquidaciones
      WHERE empresa_id = $1
        AND periodo = $2
        AND estado = 'emitida'
        AND COALESCE(contabilizada, false) = true
      `,
      [empresa_id, periodo]
    );

    const pagosResult = await pool.query(
      `
      SELECT
        tipo_pago,
        COALESCE(SUM(monto), 0) AS pagado
      FROM pagos_remuneraciones
      WHERE empresa_id = $1
        AND periodo = $2
        AND estado = 'vigente'
      GROUP BY tipo_pago
      `,
      [empresa_id, periodo]
    );

    const base = liquidacionesResult.rows[0];

    const obligaciones = {
      SUELDOS: Number(base.sueldos || 0),
      AFP: Number(base.afp || 0),
      SALUD: Number(base.salud || 0),
      AFC: Number(base.afc || 0),
      MUTUAL: Number(base.mutual || 0),
    };

    const pagados = {
      SUELDOS: 0,
      AFP: 0,
      SALUD: 0,
      AFC: 0,
      MUTUAL: 0,
    };

    for (const pago of pagosResult.rows) {
      pagados[pago.tipo_pago] = Number(pago.pagado || 0);
    }

    const resumen = Object.keys(obligaciones).map((tipo) => ({
      tipo_pago: tipo,
      descripcion: obtenerDescripcionTipo(tipo),
      total_obligacion: obligaciones[tipo],
      total_pagado: pagados[tipo] || 0,
      saldo_pendiente: obligaciones[tipo] - (pagados[tipo] || 0),
    }));

    const pagosDetalleResult = await pool.query(
      `
      SELECT
        pr.*,
        cd.codigo AS cuenta_debe_codigo,
        cd.nombre AS cuenta_debe_nombre,
        ch.codigo AS cuenta_haber_codigo,
        ch.nombre AS cuenta_haber_nombre
      FROM pagos_remuneraciones pr
      LEFT JOIN plan_cuentas cd ON cd.id = pr.cuenta_debe_id
      LEFT JOIN plan_cuentas ch ON ch.id = pr.cuenta_haber_id
      WHERE pr.empresa_id = $1
        AND pr.periodo = $2
        AND pr.estado = 'vigente'
      ORDER BY pr.fecha DESC, pr.id DESC
      `,
      [empresa_id, periodo]
    );

    return res.json({
      periodo,
      resumen,
      pagos: pagosDetalleResult.rows,
    });
  } catch (error) {
    console.error("Error al obtener resumen pagos remuneraciones:", error);

    return res.status(500).json({
      error: "Error interno al obtener pagos de remuneraciones",
    });
  }
}

async function registrarPagoRemuneracion(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id, periodo, fecha, tipo_pago, monto, descripcion } =
      req.body;

    if (!empresa_id || !periodo || !fecha || !tipo_pago || !monto) {
      return res.status(400).json({
        error: "Empresa, período, fecha, tipo de pago y monto son obligatorios",
      });
    }

    await client.query("BEGIN");

    const configResult = await client.query(
      `
      SELECT *
      FROM configuracion_remuneraciones
      WHERE empresa_id = $1
        AND periodo = $2
      `,
      [empresa_id, periodo]
    );

    if (configResult.rows.length === 0) {
      throw new Error(
        "No existe configuración de remuneraciones para este período"
      );
    }

    const config = configResult.rows[0];

    if (!config.cuenta_banco_pago_id) {
      throw new Error(
        "Falta configurar la cuenta banco pago remuneraciones en Configuración Remuneraciones"
      );
    }

    const cuentaDebeId = obtenerCuentaDebePorTipo(config, tipo_pago);
    const cuentaHaberId = config.cuenta_banco_pago_id;

    if (!cuentaDebeId) {
      throw new Error(`No existe cuenta configurada para el pago ${tipo_pago}`);
    }

    const montoNum = Number(monto || 0);

    if (montoNum <= 0) {
      throw new Error("El monto del pago debe ser mayor a cero");
    }

    const tipoComprobante = "PagoRemuneracion";
    const numero = await obtenerSiguienteNumeroComprobante(
      client,
      empresa_id,
      tipoComprobante
    );

    const glosa =
      descripcion ||
      `${obtenerDescripcionTipo(tipo_pago)} período ${periodo}`;

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
        glosa,
        montoNum,
        montoNum,
      ]
    );

    const comprobante = comprobanteResult.rows[0];

    await client.query(
      `
      INSERT INTO comprobante_detalle
      (
        comprobante_id,
        cuenta_id,
        glosa,
        debe,
        haber
      )
      VALUES ($1,$2,$3,$4,$5)
      `,
      [comprobante.id, cuentaDebeId, glosa, montoNum, 0]
    );

    await client.query(
      `
      INSERT INTO comprobante_detalle
      (
        comprobante_id,
        cuenta_id,
        glosa,
        debe,
        haber
      )
      VALUES ($1,$2,$3,$4,$5)
      `,
      [comprobante.id, cuentaHaberId, glosa, 0, montoNum]
    );

    const pagoResult = await client.query(
      `
      INSERT INTO pagos_remuneraciones
      (
        empresa_id,
        periodo,
        fecha,
        tipo_pago,
        descripcion,
        monto,
        cuenta_debe_id,
        cuenta_haber_id,
        comprobante_id,
        contabilizado,
        estado
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'vigente')
      RETURNING *
      `,
      [
        empresa_id,
        periodo,
        fecha,
        tipo_pago,
        glosa,
        montoNum,
        cuentaDebeId,
        cuentaHaberId,
        comprobante.id,
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      mensaje: "Pago de remuneraciones registrado y contabilizado correctamente",
      pago: pagoResult.rows[0],
      comprobante,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error al registrar pago remuneración:", error);

    return res.status(500).json({
      error: error.message || "Error interno al registrar pago remuneración",
    });
  } finally {
    client.release();
  }
}

async function anularPagoRemuneracion(req, res) {
  try {
    const { id } = req.params;
    const { empresa_id } = req.body;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    const resultado = await pool.query(
      `
      UPDATE pagos_remuneraciones
      SET estado = 'anulado'
      WHERE id = $1
        AND empresa_id = $2
      RETURNING *
      `,
      [id, empresa_id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        error: "Pago no encontrado",
      });
    }

    return res.json({
      mensaje:
        "Pago anulado. Recuerda revisar o reversar manualmente el comprobante asociado si corresponde.",
      pago: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al anular pago remuneración:", error);

    return res.status(500).json({
      error: "Error interno al anular pago remuneración",
    });
  }
}

module.exports = {
  obtenerResumenPagosRemuneraciones,
  registrarPagoRemuneracion,
  anularPagoRemuneracion,
};
