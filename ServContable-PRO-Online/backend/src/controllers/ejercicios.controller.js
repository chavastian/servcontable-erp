const pool = require("../database/db");

function numero(valor) {
  return Number(valor || 0);
}

async function crearEjercicio(req, res) {
  try {
    const { empresa_id, anio, observacion } = req.body;

    if (!empresa_id || !anio) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y año",
      });
    }

    const anioNumero = numero(anio);

    if (anioNumero < 2000 || anioNumero > 2100) {
      return res.status(400).json({
        error: "El año ingresado no es válido",
      });
    }

    const existe = await pool.query(
      `
      SELECT id
      FROM ejercicios_contables
      WHERE empresa_id = $1
        AND anio = $2
      LIMIT 1
      `,
      [empresa_id, anioNumero]
    );

    if (existe.rows.length > 0) {
      return res.status(400).json({
        error: "Ya existe este año para la empresa seleccionada",
      });
    }

    const resultado = await pool.query(
      `
      INSERT INTO ejercicios_contables
      (
        empresa_id,
        anio,
        estado,
        fecha_inicio,
        fecha_termino,
        observacion
      )
      VALUES ($1,$2,'abierto',$3,$4,$5)
      RETURNING *
      `,
      [
        empresa_id,
        anioNumero,
        `${anioNumero}-01-01`,
        `${anioNumero}-12-31`,
        observacion || "",
      ]
    );

    return res.status(201).json({
      mensaje: "Año de trabajo creado correctamente",
      ejercicio: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al crear ejercicio:", error);

    return res.status(500).json({
      error: error.message || "Error interno al crear año de trabajo",
    });
  }
}

async function listarEjercicios(req, res) {
  try {
    const { empresa_id } = req.query;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    const resultado = await pool.query(
      `
      SELECT *
      FROM ejercicios_contables
      WHERE empresa_id = $1
      ORDER BY anio DESC
      `,
      [empresa_id]
    );

    return res.json({
      ejercicios: resultado.rows,
    });
  } catch (error) {
    console.error("Error al listar ejercicios:", error);

    return res.status(500).json({
      error: error.message || "Error interno al listar años de trabajo",
    });
  }
}

async function cerrarEjercicio(req, res) {
  try {
    const { id } = req.params;
    const { empresa_id, observacion } = req.body;

    if (!id || !empresa_id) {
      return res.status(400).json({
        error: "Debe indicar id y empresa_id",
      });
    }

    const ejercicioResult = await pool.query(
      `
      SELECT *
      FROM ejercicios_contables
      WHERE id = $1
        AND empresa_id = $2
      LIMIT 1
      `,
      [id, empresa_id]
    );

    if (ejercicioResult.rows.length === 0) {
      return res.status(404).json({
        error: "Año de trabajo no encontrado",
      });
    }

    const ejercicio = ejercicioResult.rows[0];

    if (ejercicio.estado === "cerrado") {
      return res.status(400).json({
        error: "Este año ya está cerrado",
      });
    }

    const resultado = await pool.query(
      `
      UPDATE ejercicios_contables
      SET estado = 'cerrado',
          fecha_cierre = NOW(),
          observacion = COALESCE($1, observacion),
          actualizado_en = NOW()
      WHERE id = $2
        AND empresa_id = $3
      RETURNING *
      `,
      [observacion || ejercicio.observacion || "", id, empresa_id]
    );

    return res.json({
      mensaje: "Año de trabajo cerrado correctamente",
      ejercicio: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al cerrar ejercicio:", error);

    return res.status(500).json({
      error: error.message || "Error interno al cerrar año de trabajo",
    });
  }
}

async function reabrirEjercicio(req, res) {
  try {
    const { id } = req.params;
    const { empresa_id } = req.body;

    if (!id || !empresa_id) {
      return res.status(400).json({
        error: "Debe indicar id y empresa_id",
      });
    }

    const resultado = await pool.query(
      `
      UPDATE ejercicios_contables
      SET estado = 'abierto',
          fecha_cierre = NULL,
          actualizado_en = NOW()
      WHERE id = $1
        AND empresa_id = $2
      RETURNING *
      `,
      [id, empresa_id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        error: "Año de trabajo no encontrado",
      });
    }

    return res.json({
      mensaje: "Año de trabajo reabierto correctamente",
      ejercicio: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al reabrir ejercicio:", error);

    return res.status(500).json({
      error: error.message || "Error interno al reabrir año de trabajo",
    });
  }
}

module.exports = {
  crearEjercicio,
  listarEjercicios,
  cerrarEjercicio,
  reabrirEjercicio,
};