const pool = require("../database/db");

async function asegurarColumnaOtrosImpuestosConfig() {
  await pool.query(`
    ALTER TABLE configuracion_contable
    ADD COLUMN IF NOT EXISTS cuenta_otros_impuestos_id INTEGER
  `);
}

async function obtenerConfiguracionContable(req, res) {
  try {
    const { empresa_id } = req.query;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    await asegurarColumnaOtrosImpuestosConfig();

    const resultado = await pool.query(
      `
      SELECT *
      FROM configuracion_contable
      WHERE empresa_id = $1
      `,
      [empresa_id]
    );

    if (resultado.rows.length === 0) {
      return res.json({
        configuracion: null,
      });
    }

    return res.json({
      configuracion: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al obtener configuración contable:", error);

    return res.status(500).json({
      error: "Error interno al obtener configuración contable",
    });
  }
}

async function guardarConfiguracionContable(req, res) {
  try {
    const {
      empresa_id,

      cuenta_clientes_id,
      cuenta_proveedores_id,
      cuenta_caja_banco_id,

      cuenta_iva_debito_id,
      cuenta_iva_credito_id,

      cuenta_ingreso_defecto_id,
      cuenta_gasto_defecto_id,
      cuenta_otros_impuestos_id,

      cuenta_gasto_honorarios_id,
      cuenta_retencion_honorarios_id,
      cuenta_pago_honorarios_id,
    } = req.body;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    await asegurarColumnaOtrosImpuestosConfig();

    const existe = await pool.query(
      `
      SELECT id
      FROM configuracion_contable
      WHERE empresa_id = $1
      `,
      [empresa_id]
    );

    let resultado;

    if (existe.rows.length > 0) {
      resultado = await pool.query(
        `
        UPDATE configuracion_contable
        SET
          cuenta_clientes_id = $2,
          cuenta_proveedores_id = $3,
          cuenta_caja_banco_id = $4,
          cuenta_iva_debito_id = $5,
          cuenta_iva_credito_id = $6,
          cuenta_ingreso_defecto_id = $7,
          cuenta_gasto_defecto_id = $8,
          cuenta_otros_impuestos_id = $9,
          cuenta_gasto_honorarios_id = $10,
          cuenta_retencion_honorarios_id = $11,
          cuenta_pago_honorarios_id = $12,
          actualizado_en = NOW()
        WHERE empresa_id = $1
        RETURNING *
        `,
        [
          empresa_id,
          cuenta_clientes_id || null,
          cuenta_proveedores_id || null,
          cuenta_caja_banco_id || null,
          cuenta_iva_debito_id || null,
          cuenta_iva_credito_id || null,
          cuenta_ingreso_defecto_id || null,
          cuenta_gasto_defecto_id || null,
          cuenta_otros_impuestos_id || null,
          cuenta_gasto_honorarios_id || null,
          cuenta_retencion_honorarios_id || null,
          cuenta_pago_honorarios_id || null,
        ]
      );
    } else {
      resultado = await pool.query(
        `
        INSERT INTO configuracion_contable
        (
          empresa_id,
          cuenta_clientes_id,
          cuenta_proveedores_id,
          cuenta_caja_banco_id,
          cuenta_iva_debito_id,
          cuenta_iva_credito_id,
          cuenta_ingreso_defecto_id,
          cuenta_gasto_defecto_id,
          cuenta_otros_impuestos_id,
          cuenta_gasto_honorarios_id,
          cuenta_retencion_honorarios_id,
          cuenta_pago_honorarios_id
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *
        `,
        [
          empresa_id,
          cuenta_clientes_id || null,
          cuenta_proveedores_id || null,
          cuenta_caja_banco_id || null,
          cuenta_iva_debito_id || null,
          cuenta_iva_credito_id || null,
          cuenta_ingreso_defecto_id || null,
          cuenta_gasto_defecto_id || null,
          cuenta_otros_impuestos_id || null,
          cuenta_gasto_honorarios_id || null,
          cuenta_retencion_honorarios_id || null,
          cuenta_pago_honorarios_id || null,
        ]
      );
    }

    return res.json({
      mensaje: "Configuración contable guardada correctamente",
      configuracion: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al guardar configuración contable:", error);

    return res.status(500).json({
      error: error.message || "Error interno al guardar configuración contable",
    });
  }
}

module.exports = {
  obtenerConfiguracionContable,
  guardarConfiguracionContable,
};
