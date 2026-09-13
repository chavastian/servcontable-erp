const pool = require("../database/db");
const { obtenerPeriodoDesdeFecha } = require("../helpers/siiCsv.helper");
const { registrarAuditoria } = require("../helpers/auditoria.helper");

async function obtenerSiguienteNumeroPorTipo(client, empresaId, tipo) {
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

async function crearComprobante(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id, periodo, fecha, tipo, numero, glosa, detalles } = req.body;

    if (!empresa_id || !fecha || !tipo) {
      return res.status(400).json({
        error: "Empresa, fecha y tipo son obligatorios",
      });
    }

    if (!Array.isArray(detalles) || detalles.length < 2) {
      return res.status(400).json({
        error: "El comprobante debe tener al menos 2 lineas",
      });
    }

    let totalDebe = 0;
    let totalHaber = 0;

    for (const detalle of detalles) {
      if (!detalle.cuenta_id) {
        return res.status(400).json({
          error: "Todas las lineas deben tener una cuenta contable",
        });
      }

      totalDebe += Number(detalle.debe || 0);
      totalHaber += Number(detalle.haber || 0);
    }

    if (Number(totalDebe.toFixed(2)) !== Number(totalHaber.toFixed(2))) {
      return res.status(400).json({
        error: "El comprobante no cuadra. Debe y Haber deben ser iguales.",
      });
    }

    const periodoComprobante = periodo || obtenerPeriodoDesdeFecha(fecha);

    await client.query("BEGIN");

    const numeroFinal =
      numero && Number(numero) > 0
        ? Number(numero)
        : await obtenerSiguienteNumeroPorTipo(client, empresa_id, tipo);

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
        periodoComprobante,
        fecha,
        tipo,
        numeroFinal,
        glosa || "",
        totalDebe,
        totalHaber,
      ]
    );

    const comprobante = comprobanteResult.rows[0];

    for (const item of detalles) {
      await client.query(
        `
        INSERT INTO comprobante_detalle
        (
          comprobante_id,
          cuenta_id,
          glosa,
          debe,
          haber,
          folio,
          centro_costo,
          rut_auxiliar
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          comprobante.id,
          Number(item.cuenta_id),
          item.glosa || "",
          Number(item.debe || 0),
          Number(item.haber || 0),
          item.folio || "",
          item.centro_costo || "",
          item.rut_auxiliar || "",
        ]
      );
    }

    await registrarAuditoria({
      client,
      req,
      empresaId: Number(empresa_id),
      modulo: "Comprobantes",
      accion: "Crear asiento",
      detalle: `Comprobante ${tipo} N° ${numeroFinal}`,
      tablaAfectada: "comprobantes",
      registroId: Number(comprobante.id),
      datos: {
        fecha,
        tipo,
        numero: numeroFinal,
        total_debe: totalDebe,
        total_haber: totalHaber,
      },
    });

    await client.query("COMMIT");

    return res.status(201).json({
      mensaje: "Comprobante creado correctamente",
      comprobante,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error al crear comprobante:", error);

    if (error.code === "23505") {
      return res.status(400).json({
        error: "Ya existe un comprobante con ese tipo y numero para esta empresa",
      });
    }

    return res.status(500).json({
      error: error.message || "Error interno al crear comprobante",
    });
  } finally {
    client.release();
  }
}

async function listarComprobantes(req, res) {
  try {
    const { empresa_id, periodo, anio, fecha_desde, fecha_hasta } = req.query;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    const anioFiltro = Number(anio || 0);

    if (anio && (!Number.isInteger(anioFiltro) || anioFiltro < 1900)) {
      return res.status(400).json({
        error: "El anio debe ser valido",
      });
    }

    let query = `
      SELECT
        c.id,
        c.empresa_id,
        c.periodo,
        c.fecha,
        c.tipo,
        c.numero,
        c.glosa,
        c.estado,
        COALESCE(SUM(cd.debe), 0) AS total_debe,
        COALESCE(SUM(cd.haber), 0) AS total_haber
      FROM comprobantes c
      LEFT JOIN comprobante_detalle cd
        ON cd.comprobante_id = c.id
      WHERE c.empresa_id = $1
        AND c.estado = 'vigente'
    `;

    const valores = [empresa_id];

    if (periodo) {
      valores.push(periodo);
      query += ` AND c.periodo = $${valores.length}`;
    }

    if (anioFiltro) {
      valores.push(`${anioFiltro}-01-01`);
      query += ` AND c.fecha >= $${valores.length}`;
      valores.push(`${anioFiltro}-12-31`);
      query += ` AND c.fecha <= $${valores.length}`;
    }

    if (fecha_desde) {
      valores.push(fecha_desde);
      query += ` AND c.fecha >= $${valores.length}`;
    }

    if (fecha_hasta) {
      valores.push(fecha_hasta);
      query += ` AND c.fecha <= $${valores.length}`;
    }

    query += `
      GROUP BY
        c.id,
        c.empresa_id,
        c.periodo,
        c.fecha,
        c.tipo,
        c.numero,
        c.glosa,
        c.estado
      ORDER BY c.fecha DESC, c.tipo ASC, c.numero DESC
    `;

    const resultado = await pool.query(query, valores);

    return res.json({
      total: resultado.rows.length,
      comprobantes: resultado.rows,
    });
  } catch (error) {
    console.error("Error al listar comprobantes:", error);

    return res.status(500).json({
      error: "Error interno al listar comprobantes",
    });
  }
}

async function obtenerComprobante(req, res) {
  try {
    const { id } = req.params;

    const comprobanteResult = await pool.query(
      `
      SELECT *
      FROM comprobantes
      WHERE id = $1
      `,
      [id]
    );

    if (comprobanteResult.rows.length === 0) {
      return res.status(404).json({
        error: "Comprobante no encontrado",
      });
    }

    const detallesResult = await pool.query(
      `
      SELECT
        cd.id,
        cd.comprobante_id,
        cd.cuenta_id,
        pc.codigo AS cuenta_codigo,
        pc.nombre AS cuenta_nombre,
        cd.glosa,
        cd.debe,
        cd.haber,
        cd.folio,
        cd.centro_costo,
        cd.rut_auxiliar
      FROM comprobante_detalle cd
      INNER JOIN plan_cuentas pc ON pc.id = cd.cuenta_id
      WHERE cd.comprobante_id = $1
      ORDER BY cd.id ASC
      `,
      [id]
    );

    return res.json({
      comprobante: comprobanteResult.rows[0],
      detalles: detallesResult.rows,
    });
  } catch (error) {
    console.error("Error al obtener comprobante:", error);

    return res.status(500).json({
      error: "Error interno al obtener comprobante",
    });
  }
}

async function actualizarComprobante(req, res) {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { empresa_id, periodo, fecha, tipo, numero, glosa, detalles } = req.body;

    if (!empresa_id || !fecha || !tipo) {
      return res.status(400).json({
        error: "Empresa, fecha y tipo son obligatorios",
      });
    }

    if (!Array.isArray(detalles) || detalles.length < 2) {
      return res.status(400).json({
        error: "El comprobante debe tener al menos 2 lineas",
      });
    }

    let totalDebe = 0;
    let totalHaber = 0;

    for (const detalle of detalles) {
      if (!detalle.cuenta_id) {
        return res.status(400).json({
          error: "Todas las lineas deben tener una cuenta contable",
        });
      }

      totalDebe += Number(detalle.debe || 0);
      totalHaber += Number(detalle.haber || 0);
    }

    if (Number(totalDebe.toFixed(2)) !== Number(totalHaber.toFixed(2))) {
      return res.status(400).json({
        error: "El comprobante no cuadra. Debe y Haber deben ser iguales.",
      });
    }

    await client.query("BEGIN");

    const existe = await client.query(
      `
      SELECT *
      FROM comprobantes
      WHERE id = $1
        AND empresa_id = $2
      `,
      [id, empresa_id]
    );

    if (existe.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "Comprobante no encontrado",
      });
    }

    const numeroFinal =
      numero && Number(numero) > 0
        ? Number(numero)
        : Number(existe.rows[0].numero);

    const periodoComprobante = periodo || obtenerPeriodoDesdeFecha(fecha);

    const actualizado = await client.query(
      `
      UPDATE comprobantes
      SET periodo = $1,
          fecha = $2,
          tipo = $3,
          numero = $4,
          glosa = $5,
          total_debe = $6,
          total_haber = $7
      WHERE id = $8
      RETURNING *
      `,
      [
        periodoComprobante,
        fecha,
        tipo,
        numeroFinal,
        glosa || "",
        totalDebe,
        totalHaber,
        id,
      ]
    );

    await client.query(
      `
      DELETE FROM comprobante_detalle
      WHERE comprobante_id = $1
      `,
      [id]
    );

    for (const detalle of detalles) {
      await client.query(
        `
        INSERT INTO comprobante_detalle
        (
          comprobante_id,
          cuenta_id,
          glosa,
          debe,
          haber,
          folio,
          centro_costo,
          rut_auxiliar
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          id,
          Number(detalle.cuenta_id),
          detalle.glosa || "",
          Number(detalle.debe || 0),
          Number(detalle.haber || 0),
          detalle.folio || "",
          detalle.centro_costo || "",
          detalle.rut_auxiliar || "",
        ]
      );
    }

    await registrarAuditoria({
      client,
      req,
      empresaId: Number(empresa_id),
      modulo: "Comprobantes",
      accion: "Editar asiento",
      detalle: `Comprobante ${tipo} N° ${numeroFinal} actualizado`,
      tablaAfectada: "comprobantes",
      registroId: Number(id),
      datos: {
        fecha,
        tipo,
        numero: numeroFinal,
        total_debe: totalDebe,
        total_haber: totalHaber,
      },
    });

    await client.query("COMMIT");

    return res.json({
      mensaje: "Comprobante actualizado correctamente",
      comprobante: actualizado.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error al actualizar comprobante:", error);

    if (error.code === "23505") {
      return res.status(400).json({
        error: "Ya existe un comprobante con ese tipo y numero para esta empresa",
      });
    }

    return res.status(500).json({
      error: error.message || "Error interno al actualizar comprobante",
    });
  } finally {
    client.release();
  }
}

async function anularComprobante(req, res) {
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

    const comprobanteResult = await client.query(
      `
      SELECT *
      FROM comprobantes
      WHERE id = $1
        AND empresa_id = $2
      FOR UPDATE
      `,
      [id, empresa_id]
    );

    if (comprobanteResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "Comprobante no encontrado",
      });
    }

    const comprobante = comprobanteResult.rows[0];

    if (comprobante.estado !== "vigente") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "El comprobante ya se encuentra anulado",
      });
    }

    await client.query(
      `
      UPDATE comprobantes
      SET estado = 'anulado'
      WHERE id = $1
      `,
      [id]
    );

    await client.query(
      `
      UPDATE compras
      SET comprobante_id = NULL
      WHERE empresa_id = $1
        AND comprobante_id = $2
      `,
      [empresa_id, id]
    );

    await client.query(
      `
      UPDATE ventas
      SET comprobante_id = NULL
      WHERE empresa_id = $1
        AND comprobante_id = $2
      `,
      [empresa_id, id]
    );

    await client.query(
      `
      UPDATE honorarios
      SET comprobante_id = NULL,
          contabilizado = false
      WHERE empresa_id = $1
        AND comprobante_id = $2
      `,
      [empresa_id, id]
    );

    const pagosAnulados = await client.query(
      `
      UPDATE pagos_cobros
      SET estado = 'anulado',
          contabilizado = false
      WHERE empresa_id = $1
        AND comprobante_id = $2
        AND estado = 'vigente'
      RETURNING id
      `,
      [empresa_id, id]
    );

    await registrarAuditoria({
      client,
      req,
      empresaId: Number(empresa_id),
      modulo: "Comprobantes",
      accion: "Eliminar asiento",
      detalle: `Comprobante ${comprobante.tipo} N° ${comprobante.numero} anulado`,
      tablaAfectada: "comprobantes",
      registroId: Number(id),
      datos: {
        tipo: comprobante.tipo,
        numero: comprobante.numero,
        fecha: comprobante.fecha,
        pagos_cobros_anulados: pagosAnulados.rows.length,
      },
    });

    await client.query("COMMIT");

    return res.json({
      mensaje:
        pagosAnulados.rows.length > 0
          ? `Asiento eliminado. ${pagosAnulados.rows.length} pago(s)/cobro(s) anulados y documentos regresados a pendiente`
          : "Asiento eliminado correctamente",
      pagos_cobros_anulados: pagosAnulados.rows.length,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al eliminar comprobante:", error);

    return res.status(500).json({
      error: error.message || "Error interno al eliminar comprobante",
    });
  } finally {
    client.release();
  }
}

async function obtenerSiguienteNumero(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id, tipo } = req.query;

    if (!empresa_id || !tipo) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y tipo",
      });
    }

    const siguiente = await obtenerSiguienteNumeroPorTipo(client, empresa_id, tipo);

    return res.json({
      tipo,
      siguiente,
    });
  } catch (error) {
    console.error("Error al obtener siguiente numero:", error);

    return res.status(500).json({
      error: "Error interno al obtener siguiente numero",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  crearComprobante,
  listarComprobantes,
  obtenerComprobante,
  actualizarComprobante,
  anularComprobante,
  obtenerSiguienteNumero,
  obtenerSiguienteNumeroPorTipo,
};
