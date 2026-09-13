const pool = require("../database/db");

function obtenerPeriodo(fecha) {
  if (!fecha) return "";
  return String(fecha).substring(0, 7);
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

async function crearHonorario(req, res) {
  try {
    const {
      empresa_id,
      fecha_emision,
      fecha_pago,
      tipo_documento,
      folio,
      rut_prestador,
      nombre_prestador,
      glosa,
      bruto,
      tasa_retencion,
    } = req.body;

    if (!empresa_id || !fecha_emision || !rut_prestador || !nombre_prestador) {
      return res.status(400).json({
        error:
          "Empresa, fecha de emisión, RUT y nombre del prestador son obligatorios",
      });
    }

    const brutoNum = Number(bruto || 0);
    const tasaNum = Number(tasa_retencion || 0);

    if (brutoNum <= 0) {
      return res.status(400).json({
        error: "El monto bruto debe ser mayor a cero",
      });
    }

    const retencionNum = Math.round(brutoNum * (tasaNum / 100));
    const liquidoNum = brutoNum - retencionNum;
    const periodo = obtenerPeriodo(fecha_emision);

    const resultado = await pool.query(
      `
      INSERT INTO honorarios
      (
        empresa_id,
        periodo,
        fecha_emision,
        fecha_pago,
        tipo_documento,
        folio,
        rut_prestador,
        nombre_prestador,
        glosa,
        bruto,
        tasa_retencion,
        retencion,
        liquido,
        estado,
        contabilizado
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'vigente', false)
      RETURNING *
      `,
      [
        empresa_id,
        periodo,
        fecha_emision,
        fecha_pago || null,
        tipo_documento || "Boleta de Honorarios",
        folio || "",
        rut_prestador || "",
        nombre_prestador || "",
        glosa || "",
        brutoNum,
        tasaNum,
        retencionNum,
        liquidoNum,
      ]
    );

    return res.status(201).json({
      mensaje: "Honorario registrado correctamente",
      honorario: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al crear honorario:", error);

    if (error.code === "23505") {
      return res.status(400).json({
        error:
          "Ya existe un honorario vigente con ese RUT prestador y folio para esta empresa",
      });
    }

    return res.status(500).json({
      error: error.message || "Error interno al crear honorario",
    });
  }
}

async function listarHonorarios(req, res) {
  try {
    const { empresa_id, fecha_desde, fecha_hasta } = req.query;

    if (!empresa_id || !fecha_desde || !fecha_hasta) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, fecha_desde y fecha_hasta",
      });
    }

    const resultado = await pool.query(
      `
      SELECT *
      FROM honorarios
      WHERE empresa_id = $1
        AND estado = 'vigente'
        AND fecha_emision BETWEEN $2 AND $3
      ORDER BY fecha_emision ASC, id ASC
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const honorarios = resultado.rows;

    const totales = honorarios.reduce(
      (acc, item) => {
        acc.bruto += Number(item.bruto || 0);
        acc.retencion += Number(item.retencion || 0);
        acc.liquido += Number(item.liquido || 0);
        return acc;
      },
      {
        bruto: 0,
        retencion: 0,
        liquido: 0,
      }
    );

    return res.json({
      total: honorarios.length,
      honorarios,
      totales,
      filtros: {
        fecha_desde,
        fecha_hasta,
      },
    });
  } catch (error) {
    console.error("Error al listar honorarios:", error);

    return res.status(500).json({
      error: "Error interno al listar honorarios",
    });
  }
}

async function contabilizarHonorario(req, res) {
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

    const honorarioResult = await client.query(
      `
      SELECT *
      FROM honorarios
      WHERE id = $1
        AND empresa_id = $2
        AND estado = 'vigente'
      `,
      [id, empresa_id]
    );

    if (honorarioResult.rows.length === 0) {
      throw new Error("Honorario no encontrado");
    }

    const honorario = honorarioResult.rows[0];

    if (honorario.contabilizado && honorario.comprobante_id) {
      throw new Error("Este honorario ya fue contabilizado");
    }

    const configResult = await client.query(
      `
      SELECT *
      FROM configuracion_contable
      WHERE empresa_id = $1
      `,
      [empresa_id]
    );

    if (configResult.rows.length === 0) {
      throw new Error(
        "Debes guardar la Configuración Contable antes de contabilizar honorarios"
      );
    }

    const config = configResult.rows[0];

    const cuentaGasto =
      config.cuenta_gasto_honorarios_id || config.cuenta_gasto_defecto_id;

    const cuentaRetencion = config.cuenta_retencion_honorarios_id;

    const cuentaPago =
      config.cuenta_pago_honorarios_id ||
      config.cuenta_proveedores_id ||
      config.cuenta_caja_banco_id;

    if (!cuentaGasto || !cuentaRetencion || !cuentaPago) {
      throw new Error(
        "Faltan cuentas en Configuración Contable: gasto honorarios, retención honorarios y pago honorarios"
      );
    }

    const tipo = "Honorario";
    const numero = await obtenerSiguienteNumeroComprobante(
      client,
      empresa_id,
      tipo
    );

    const bruto = Number(honorario.bruto || 0);
    const retencion = Number(honorario.retencion || 0);
    const liquido = Number(honorario.liquido || 0);

    const glosa = `Honorario folio ${honorario.folio || ""} ${
      honorario.nombre_prestador || ""
    }`.trim();

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
        honorario.periodo,
        honorario.fecha_emision,
        tipo,
        numero,
        glosa,
        bruto,
        bruto,
      ]
    );

    const comprobante = comprobanteResult.rows[0];

    const detalles = [
      {
        cuenta_id: cuentaGasto,
        glosa,
        debe: bruto,
        haber: 0,
      },
      {
        cuenta_id: cuentaRetencion,
        glosa,
        debe: 0,
        haber: retencion,
      },
      {
        cuenta_id: cuentaPago,
        glosa,
        debe: 0,
        haber: liquido,
      },
    ];

    for (const detalle of detalles) {
      if (Number(detalle.debe || 0) === 0 && Number(detalle.haber || 0) === 0) {
        continue;
      }

      await client.query(
        `
        INSERT INTO comprobante_detalle
        (comprobante_id, cuenta_id, glosa, debe, haber)
        VALUES ($1,$2,$3,$4,$5)
        `,
        [
          comprobante.id,
          detalle.cuenta_id,
          detalle.glosa,
          Number(detalle.debe || 0),
          Number(detalle.haber || 0),
        ]
      );
    }

    await client.query(
      `
      UPDATE honorarios
      SET contabilizado = true,
          comprobante_id = $1
      WHERE id = $2
        AND empresa_id = $3
      `,
      [comprobante.id, id, empresa_id]
    );

    await client.query("COMMIT");

    return res.json({
      mensaje: "Honorario contabilizado correctamente",
      comprobante,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error al contabilizar honorario:", error);

    return res.status(500).json({
      error: error.message || "Error interno al contabilizar honorario",
    });
  } finally {
    client.release();
  }
}

async function anularHonorario(req, res) {
  try {
    const { id } = req.params;
    const { empresa_id } = req.body;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    const existe = await pool.query(
      `
      SELECT *
      FROM honorarios
      WHERE id = $1
        AND empresa_id = $2
      `,
      [id, empresa_id]
    );

    if (existe.rows.length === 0) {
      return res.status(404).json({
        error: "Honorario no encontrado",
      });
    }

    if (existe.rows[0].contabilizado) {
      return res.status(400).json({
        error:
          "No puedes anular este honorario porque ya fue contabilizado. Primero debes reversar o anular el comprobante contable.",
      });
    }

    const resultado = await pool.query(
      `
      UPDATE honorarios
      SET estado = 'anulado'
      WHERE id = $1
        AND empresa_id = $2
      RETURNING *
      `,
      [id, empresa_id]
    );

    return res.json({
      mensaje: "Honorario anulado correctamente",
      honorario: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al anular honorario:", error);

    return res.status(500).json({
      error: "Error interno al anular honorario",
    });
  }
}

module.exports = {
  crearHonorario,
  listarHonorarios,
  contabilizarHonorario,
  anularHonorario,
};
