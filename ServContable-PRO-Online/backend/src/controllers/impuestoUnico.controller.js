const pool = require("../database/db");

async function listarTramosImpuestoUnico(req, res) {
  try {
    const { empresa_id, periodo } = req.query;

    if (!empresa_id || !periodo) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y periodo",
      });
    }

    const resultado = await pool.query(
      `
      SELECT *
      FROM impuesto_unico_tramos
      WHERE empresa_id = $1
        AND periodo = $2
        AND activo = true
      ORDER BY desde ASC
      `,
      [empresa_id, periodo]
    );

    return res.json({
      total: resultado.rows.length,
      tramos: resultado.rows,
    });
  } catch (error) {
    console.error("Error al listar tramos impuesto único:", error);

    return res.status(500).json({
      error: "Error interno al listar tramos de impuesto único",
    });
  }
}

async function guardarTramoImpuestoUnico(req, res) {
  try {
    const { empresa_id, periodo, desde, hasta, factor, rebaja } = req.body;

    if (!empresa_id || !periodo) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y periodo",
      });
    }

    const resultado = await pool.query(
      `
      INSERT INTO impuesto_unico_tramos
      (
        empresa_id,
        periodo,
        desde,
        hasta,
        factor,
        rebaja,
        activo
      )
      VALUES ($1,$2,$3,$4,$5,$6,true)
      RETURNING *
      `,
      [
        empresa_id,
        periodo,
        Number(desde || 0),
        Number(hasta || 0),
        Number(factor || 0),
        Number(rebaja || 0),
      ]
    );

    return res.status(201).json({
      mensaje: "Tramo de impuesto único guardado correctamente",
      tramo: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al guardar tramo impuesto único:", error);

    return res.status(500).json({
      error: error.message || "Error interno al guardar tramo de impuesto único",
    });
  }
}

async function eliminarTramoImpuestoUnico(req, res) {
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
      UPDATE impuesto_unico_tramos
      SET activo = false
      WHERE id = $1
        AND empresa_id = $2
      RETURNING *
      `,
      [id, empresa_id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        error: "Tramo no encontrado",
      });
    }

    return res.json({
      mensaje: "Tramo eliminado correctamente",
      tramo: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al eliminar tramo impuesto único:", error);

    return res.status(500).json({
      error: "Error interno al eliminar tramo de impuesto único",
    });
  }
}

async function eliminarTramosPeriodo(req, res) {
  try {
    const { empresa_id, periodo } = req.body;

    if (!empresa_id || !periodo) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y periodo",
      });
    }

    await pool.query(
      `
      UPDATE impuesto_unico_tramos
      SET activo = false
      WHERE empresa_id = $1
        AND periodo = $2
        AND activo = true
      `,
      [empresa_id, periodo]
    );

    return res.json({
      mensaje: "Tramos del período eliminados correctamente",
    });
  } catch (error) {
    console.error("Error al eliminar tramos del período:", error);

    return res.status(500).json({
      error: "Error interno al eliminar tramos del período",
    });
  }
}

module.exports = {
  listarTramosImpuestoUnico,
  guardarTramoImpuestoUnico,
  eliminarTramoImpuestoUnico,
  eliminarTramosPeriodo,
};