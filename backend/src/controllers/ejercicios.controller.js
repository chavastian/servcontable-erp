const pool = require("../database/db");
const {
  generarAsientosDeCierre,
  asegurarEjercicioSiguiente,
  anularAsientosDeCierre,
} = require("../helpers/ejercicio.helper");

function numero(valor) {
  return Number(valor || 0);
}

function responderError(res, error, mensaje) {
  return res.status(error.statusCode || 500).json({
    // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
    // columnas y restricciones. Los errores de validacion propios
    // si conservan su mensaje y su codigo.
    error: error.statusCode ? error.message : mensaje,
  });
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

    return responderError(res, error, "Error interno al crear año de trabajo");
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
      SELECT e.*,
             uc.nombre AS cerrado_por_nombre,
             ur.nombre AS reabierto_por_nombre,
             cc.numero AS comprobante_cierre_numero,
             ca.numero AS comprobante_apertura_numero
      FROM ejercicios_contables e
      LEFT JOIN usuarios uc ON uc.id = e.cerrado_por
      LEFT JOIN usuarios ur ON ur.id = e.reabierto_por
      LEFT JOIN comprobantes cc ON cc.id = e.comprobante_cierre_id
      LEFT JOIN comprobantes ca ON ca.id = e.comprobante_apertura_id
      WHERE e.empresa_id = $1
      ORDER BY e.anio DESC
      `,
      [empresa_id]
    );

    return res.json({
      ejercicios: resultado.rows,
    });
  } catch (error) {
    console.error("Error al listar ejercicios:", error);

    return responderError(res, error, "Error interno al listar años de trabajo");
  }
}

/**
 * Cierra el año: genera el asiento de cierre de resultados y el de apertura
 * del año siguiente, y deja registrado quién cerró. Antes solo cambiaba el
 * estado y el balance del año siguiente arrancaba sin saldos.
 *
 * Con `sin_asientos: true` se cierra solo el estado, para empresas que llevan
 * el cierre en otro sistema. Queda anotado en la observación.
 */
async function cerrarEjercicio(req, res) {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { empresa_id, observacion, sin_asientos } = req.body;
    const usuarioId = req.usuario?.id || null;

    if (!id || !empresa_id) {
      return res.status(400).json({
        error: "Debe indicar id y empresa_id",
      });
    }

    await client.query("BEGIN");

    const ejercicioResult = await client.query(
      `
      SELECT *
      FROM ejercicios_contables
      WHERE id = $1
        AND empresa_id = $2
      FOR UPDATE
      `,
      [id, empresa_id]
    );

    if (ejercicioResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Año de trabajo no encontrado",
      });
    }

    const ejercicio = ejercicioResult.rows[0];

    if (ejercicio.estado === "cerrado") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "Este año ya está cerrado",
      });
    }

    // No se cierra un año con el anterior abierto: la apertura del que se
    // cierra depende del cierre del anterior.
    const anteriorAbierto = await client.query(
      `SELECT anio FROM ejercicios_contables
       WHERE empresa_id = $1 AND anio < $2 AND estado <> 'cerrado'
       ORDER BY anio LIMIT 1`,
      [empresa_id, ejercicio.anio]
    );

    if (anteriorAbierto.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error: `Primero debes cerrar el año ${anteriorAbierto.rows[0].anio}.`,
      });
    }

    const omitirAsientos = sin_asientos === true || sin_asientos === "true";
    let asientos = { cierre: null, apertura: null, resultadoEjercicio: null };

    if (!omitirAsientos) {
      asientos = await generarAsientosDeCierre(client, empresa_id, Number(ejercicio.anio), usuarioId);
      await asegurarEjercicioSiguiente(client, empresa_id, Number(ejercicio.anio));
    }

    const observacionFinal = [
      observacion || ejercicio.observacion || "",
      omitirAsientos ? "Cerrado sin asientos de cierre y apertura." : "",
    ]
      .filter(Boolean)
      .join(" ");

    const resultado = await client.query(
      `
      UPDATE ejercicios_contables
      SET estado = 'cerrado',
          fecha_cierre = NOW(),
          cerrado_por = $4,
          comprobante_cierre_id = $5,
          comprobante_apertura_id = $6,
          reabierto_por = NULL,
          reabierto_en = NULL,
          motivo_reapertura = NULL,
          observacion = $1,
          actualizado_en = NOW()
      WHERE id = $2
        AND empresa_id = $3
      RETURNING *
      `,
      [
        observacionFinal,
        id,
        empresa_id,
        usuarioId,
        asientos.cierre?.id || null,
        asientos.apertura?.id || null,
      ]
    );

    await client.query("COMMIT");

    return res.json({
      mensaje: omitirAsientos
        ? "Año de trabajo cerrado sin asientos"
        : "Año de trabajo cerrado: se generaron los asientos de cierre y apertura",
      ejercicio: resultado.rows[0],
      comprobante_cierre: asientos.cierre,
      comprobante_apertura: asientos.apertura,
      resultado_ejercicio: asientos.resultadoEjercicio,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error al cerrar ejercicio:", error);

    return responderError(res, error, "Error interno al cerrar año de trabajo");
  } finally {
    client.release();
  }
}

/**
 * Reabre el año con motivo obligatorio y autor. Anula los asientos de cierre
 * y apertura que se generaron al cerrar, para que el año siguiente no quede
 * con una apertura que ya no calza.
 */
async function reabrirEjercicio(req, res) {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { empresa_id, motivo } = req.body;
    const usuarioId = req.usuario?.id || null;

    if (!id || !empresa_id) {
      return res.status(400).json({
        error: "Debe indicar id y empresa_id",
      });
    }

    const motivoLimpio = String(motivo || "").trim();

    if (motivoLimpio.length < 5) {
      return res.status(400).json({
        error: "Debes indicar el motivo de la reapertura (mínimo 5 caracteres).",
      });
    }

    await client.query("BEGIN");

    const ejercicioResult = await client.query(
      `SELECT * FROM ejercicios_contables WHERE id = $1 AND empresa_id = $2 FOR UPDATE`,
      [id, empresa_id]
    );

    if (ejercicioResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Año de trabajo no encontrado",
      });
    }

    const ejercicio = ejercicioResult.rows[0];

    if (ejercicio.estado !== "cerrado") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "Este año no está cerrado",
      });
    }

    // Un año cerrado con el siguiente ya cerrado no se reabre solo: la
    // apertura del siguiente se anularía y su cierre quedaría colgando.
    const siguienteCerrado = await client.query(
      `SELECT anio FROM ejercicios_contables
       WHERE empresa_id = $1 AND anio > $2 AND estado = 'cerrado'
       ORDER BY anio LIMIT 1`,
      [empresa_id, ejercicio.anio]
    );

    if (siguienteCerrado.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error: `Primero debes reabrir el año ${siguienteCerrado.rows[0].anio}.`,
      });
    }

    await anularAsientosDeCierre(client, empresa_id, ejercicio, usuarioId, motivoLimpio);

    const resultado = await client.query(
      `
      UPDATE ejercicios_contables
      SET estado = 'abierto',
          fecha_cierre = NULL,
          reabierto_por = $3,
          reabierto_en = NOW(),
          motivo_reapertura = $4,
          comprobante_cierre_id = NULL,
          comprobante_apertura_id = NULL,
          actualizado_en = NOW()
      WHERE id = $1
        AND empresa_id = $2
      RETURNING *
      `,
      [id, empresa_id, usuarioId, motivoLimpio]
    );

    await client.query("COMMIT");

    return res.json({
      mensaje: "Año de trabajo reabierto; los asientos de cierre y apertura quedaron anulados",
      ejercicio: resultado.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error al reabrir ejercicio:", error);

    return responderError(res, error, "Error interno al reabrir año de trabajo");
  } finally {
    client.release();
  }
}

module.exports = {
  crearEjercicio,
  listarEjercicios,
  cerrarEjercicio,
  reabrirEjercicio,
};
