/**
 * F29: cálculo completo y registro del formulario presentado.
 *
 * Registrar lo presentado (folio del SII, fecha, monto) es lo que permite que el
 * cierre mensual cruce lo calculado con lo declarado. Sin eso, un período
 * declarado seguía siendo un cálculo que cualquiera podía cambiar.
 */

const pool = require("../database/db");
const { calcularF29 } = require("../helpers/f29.helper");
const { registrarAuditoria } = require("../helpers/auditoria.helper");

async function obtenerF29(req, res) {
  try {
    const { empresa_id, periodo, tasa_ppm } = req.query;

    if (!periodo || !/^\d{4}-\d{2}$/.test(String(periodo))) {
      return res.status(400).json({ error: "Debe indicar periodo con formato AAAA-MM" });
    }

    const resultado = await calcularF29(pool, Number(empresa_id), String(periodo), {
      tasa_ppm,
    });

    return res.json(resultado);
  } catch (error) {
    console.error("Error al calcular el F29:", error);

    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Error interno al calcular el F29",
    });
  }
}

async function registrarPresentada(req, res) {
  const client = await pool.connect();

  try {
    const {
      empresa_id,
      periodo,
      folio_sii,
      fecha_presentacion,
      total_pagado,
      observacion,
      rectifica = false,
    } = req.body;

    if (!periodo || !/^\d{4}-\d{2}$/.test(String(periodo))) {
      return res.status(400).json({ error: "Debe indicar periodo con formato AAAA-MM" });
    }

    if (!fecha_presentacion) {
      return res.status(400).json({ error: "Debe indicar la fecha de presentación" });
    }

    await client.query("BEGIN");

    const vigente = await client.query(
      `SELECT id FROM declaraciones_f29 WHERE empresa_id = $1 AND periodo = $2 AND estado = 'vigente' FOR UPDATE`,
      [empresa_id, periodo]
    );

    let rectificaA = null;

    if (vigente.rows.length > 0) {
      if (!rectifica) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          error:
            "Ya hay un F29 registrado para este período. Si presentaste una rectificatoria, márcalo como tal.",
        });
      }

      rectificaA = vigente.rows[0].id;
      await client.query(`UPDATE declaraciones_f29 SET estado = 'rectificada' WHERE id = $1`, [
        rectificaA,
      ]);
    }

    // Lo calculado en el momento de registrar queda guardado junto al folio:
    // es la foto contra la que se compara después.
    const calculado = await calcularF29(client, Number(empresa_id), String(periodo));

    const { rows } = await client.query(
      `INSERT INTO declaraciones_f29
         (empresa_id, periodo, folio_sii, fecha_presentacion, iva_determinado,
          remanente_utilizado, ppm, retenciones_honorarios, iva_retenido, total_pagado,
          estado, rectifica_a_id, observacion, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'vigente', $11, $12, $13)
       RETURNING *`,
      [
        empresa_id,
        periodo,
        folio_sii || null,
        String(fecha_presentacion).slice(0, 10),
        calculado.iva.iva_determinado,
        calculado.iva.remanente_anterior,
        calculado.ppm.monto_ppm,
        calculado.honorarios.retencion,
        calculado.iva.iva_retenido,
        total_pagado !== undefined && total_pagado !== null && total_pagado !== ""
          ? Number(total_pagado)
          : calculado.total_f29_estimado,
        rectificaA,
        observacion || null,
        req.usuario?.id || null,
      ]
    );

    // El remanente del período queda fijado al presentar: es lo que arrastra el
    // mes siguiente. Se guarda en UTM.
    await client.query(
      `INSERT INTO remanente_iva
         (empresa_id, periodo, remanente_anterior, iva_debito, iva_credito, iva_disponible,
          iva_determinado, iva_pagar, remanente_siguiente, remanente_anterior_utm,
          remanente_siguiente_utm, valor_utm, ppm, retenciones_honorarios, iva_retenido,
          total_f29, observacion, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
       ON CONFLICT (empresa_id, periodo) DO UPDATE SET
         remanente_anterior = EXCLUDED.remanente_anterior,
         iva_debito = EXCLUDED.iva_debito,
         iva_credito = EXCLUDED.iva_credito,
         iva_disponible = EXCLUDED.iva_disponible,
         iva_determinado = EXCLUDED.iva_determinado,
         iva_pagar = EXCLUDED.iva_pagar,
         remanente_siguiente = EXCLUDED.remanente_siguiente,
         remanente_anterior_utm = EXCLUDED.remanente_anterior_utm,
         remanente_siguiente_utm = EXCLUDED.remanente_siguiente_utm,
         valor_utm = EXCLUDED.valor_utm,
         ppm = EXCLUDED.ppm,
         retenciones_honorarios = EXCLUDED.retenciones_honorarios,
         iva_retenido = EXCLUDED.iva_retenido,
         total_f29 = EXCLUDED.total_f29,
         observacion = EXCLUDED.observacion,
         actualizado_en = NOW()`,
      [
        empresa_id,
        periodo,
        calculado.iva.remanente_anterior,
        calculado.iva.iva_debito,
        calculado.iva.iva_credito,
        calculado.iva.iva_disponible,
        calculado.iva.iva_determinado,
        calculado.iva.iva_pagar,
        calculado.iva.remanente_siguiente,
        calculado.iva.remanente_anterior_utm,
        calculado.iva.remanente_siguiente_utm,
        calculado.valor_utm,
        calculado.ppm.monto_ppm,
        calculado.honorarios.retencion,
        calculado.iva.iva_retenido,
        calculado.total_f29_estimado,
        `F29 ${folio_sii ? `folio ${folio_sii}` : "sin folio"} presentado el ${String(
          fecha_presentacion
        ).slice(0, 10)}`,
      ]
    );

    await registrarAuditoria({
      client,
      req,
      empresaId: Number(empresa_id),
      modulo: "F29",
      accion: rectificaA ? "Registrar F29 rectificatorio" : "Registrar F29 presentado",
      detalle: `F29 ${periodo} ${folio_sii ? `folio ${folio_sii}` : ""}`.trim(),
      tablaAfectada: "declaraciones_f29",
      registroId: Number(rows[0].id),
      datos: { periodo, folio_sii, total_pagado: rows[0].total_pagado, calculado: calculado.total_f29_estimado },
    });

    await client.query("COMMIT");

    return res.status(201).json({
      mensaje: rectificaA
        ? "F29 rectificatorio registrado."
        : "F29 registrado. El remanente del período queda fijado para el mes siguiente.",
      declaracion: rows[0],
      calculado,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error al registrar el F29 presentado:", error);

    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Error interno al registrar el F29",
    });
  } finally {
    client.release();
  }
}

async function listarPresentadas(req, res) {
  try {
    const { empresa_id } = req.query;

    const { rows } = await pool.query(
      `SELECT * FROM declaraciones_f29 WHERE empresa_id = $1 ORDER BY periodo DESC, id DESC`,
      [empresa_id]
    );

    return res.json({ total: rows.length, declaraciones: rows });
  } catch (error) {
    console.error("Error al listar F29 presentados:", error);

    return res.status(500).json({ error: "Error interno al listar los F29" });
  }
}

module.exports = { obtenerF29, registrarPresentada, listarPresentadas };
