const pool = require("../database/db");

let columnaRecurrenteAsegurada = false;

function esPeriodoValido(periodo) {
  return /^\d{4}-\d{2}$/.test(String(periodo || ""));
}

function esVerdadero(valor) {
  if (typeof valor === "boolean") return valor;
  return ["true", "1", "si", "sí", "yes"].includes(
    String(valor || "")
      .trim()
      .toLowerCase()
  );
}

function obtenerTotalesDesdeItems(items = []) {
  return items.reduce(
    (acc, item) => {
      const monto = Number(item.monto || 0);

      if (item.tipo === "HABER_IMPONIBLE") {
        acc.haberes_imponibles += monto;
      }

      if (item.tipo === "HABER_NO_IMPONIBLE") {
        acc.haberes_no_imponibles += monto;
      }

      if (item.tipo === "DESCUENTO") {
        acc.descuentos += monto;
      }

      acc.total_general += monto;

      return acc;
    },
    {
      haberes_imponibles: 0,
      haberes_no_imponibles: 0,
      descuentos: 0,
      total_general: 0,
    }
  );
}

async function asegurarColumnaRecurrente() {
  if (columnaRecurrenteAsegurada) return;

  await pool.query(`
    ALTER TABLE haberes_descuentos_remuneraciones
    ADD COLUMN IF NOT EXISTS recurrente BOOLEAN DEFAULT false
  `);

  columnaRecurrenteAsegurada = true;
}

async function calcularTotalesConceptos({
  empresaId,
  trabajadorId,
  periodo,
  incluirRecurrentes = true,
}) {
  const query = `
    SELECT
      tipo,
      COALESCE(SUM(monto), 0) AS total
    FROM haberes_descuentos_remuneraciones
    WHERE empresa_id = $1
      AND trabajador_id = $2
      AND estado = 'vigente'
      AND (
        periodo = $3
        OR (
          $4 = true
          AND COALESCE(recurrente, false) = true
          AND periodo <= $3
        )
      )
    GROUP BY tipo
  `;

  const resultado = await pool.query(query, [
    empresaId,
    trabajadorId,
    periodo,
    incluirRecurrentes,
  ]);

  const totales = {
    haberes_imponibles: 0,
    haberes_no_imponibles: 0,
    descuentos: 0,
    total_general: 0,
  };

  for (const item of resultado.rows) {
    const monto = Number(item.total || 0);

    if (item.tipo === "HABER_IMPONIBLE") {
      totales.haberes_imponibles += monto;
    }

    if (item.tipo === "HABER_NO_IMPONIBLE") {
      totales.haberes_no_imponibles += monto;
    }

    if (item.tipo === "DESCUENTO") {
      totales.descuentos += monto;
    }

    totales.total_general += monto;
  }

  return totales;
}

async function crearHaberDescuento(req, res) {
  try {
    await asegurarColumnaRecurrente();

    const {
      empresa_id,
      trabajador_id,
      periodo,
      nombre,
      tipo,
      monto,
      imponible = false,
      tributable = false,
      afecta_descuentos = false,
      observacion,
      recurrente = false,
    } = req.body;

    if (!empresa_id || !trabajador_id || !periodo || !nombre || !tipo) {
      return res.status(400).json({
        error: "Empresa, trabajador, periodo, nombre y tipo son obligatorios",
      });
    }

    if (!esPeriodoValido(periodo)) {
      return res.status(400).json({
        error: "El periodo debe tener formato YYYY-MM",
      });
    }

    const montoNum = Number(monto || 0);

    if (montoNum <= 0) {
      return res.status(400).json({
        error: "El monto debe ser mayor a cero",
      });
    }

    const resultado = await pool.query(
      `
      INSERT INTO haberes_descuentos_remuneraciones
      (
        empresa_id,
        trabajador_id,
        periodo,
        nombre,
        tipo,
        monto,
        imponible,
        tributable,
        afecta_descuentos,
        observacion,
        recurrente,
        estado
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'vigente')
      RETURNING *
      `,
      [
        empresa_id,
        trabajador_id,
        periodo,
        nombre,
        tipo,
        montoNum,
        Boolean(imponible),
        Boolean(tributable),
        Boolean(afecta_descuentos),
        observacion || "",
        Boolean(recurrente),
      ]
    );

    return res.status(201).json({
      mensaje: "Haber/descuento registrado correctamente",
      item: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al crear haber/descuento:", error);

    return res.status(500).json({
      error: error.message || "Error interno al crear haber/descuento",
    });
  }
}

async function listarHaberesDescuentos(req, res) {
  try {
    await asegurarColumnaRecurrente();

    const { empresa_id, periodo, trabajador_id, incluir_recurrentes } =
      req.query;

    if (!empresa_id || !periodo) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y periodo",
      });
    }

    if (!esPeriodoValido(periodo)) {
      return res.status(400).json({
        error: "El periodo debe tener formato YYYY-MM",
      });
    }

    const incluirRecurrentes = incluir_recurrentes !== "false";

    let query = `
      SELECT
        hd.*,
        COALESCE(hd.recurrente, false) AS recurrente,
        t.rut,
        t.nombres,
        t.apellidos,
        t.cargo
      FROM haberes_descuentos_remuneraciones hd
      INNER JOIN trabajadores t
        ON t.id = hd.trabajador_id
      WHERE hd.empresa_id = $1
        AND hd.estado = 'vigente'
        AND (
          hd.periodo = $2
          OR (
            $3 = true
            AND COALESCE(hd.recurrente, false) = true
            AND hd.periodo <= $2
          )
        )
    `;

    const valores = [empresa_id, periodo, incluirRecurrentes];
    let posicion = 4;

    if (trabajador_id) {
      query += ` AND hd.trabajador_id = $${posicion}`;
      valores.push(trabajador_id);
      posicion += 1;
    }

    query += `
      ORDER BY t.apellidos ASC, t.nombres ASC, hd.tipo ASC, hd.nombre ASC
    `;

    const resultado = await pool.query(query, valores);

    const totales = obtenerTotalesDesdeItems(resultado.rows);

    return res.json({
      total: resultado.rows.length,
      items: resultado.rows,
      totales,
    });
  } catch (error) {
    console.error("Error al listar haberes/descuentos:", error);

    return res.status(500).json({
      error: "Error interno al listar haberes/descuentos",
    });
  }
}

async function obtenerResumenLiquidacion(req, res) {
  try {
    await asegurarColumnaRecurrente();

    const { empresa_id, trabajador_id, periodo, incluir_recurrentes } =
      req.query;

    if (!empresa_id || !trabajador_id || !periodo) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, trabajador_id y periodo",
      });
    }

    if (!esPeriodoValido(periodo)) {
      return res.status(400).json({
        error: "El periodo debe tener formato YYYY-MM",
      });
    }

    const incluirRecurrentes =
      incluir_recurrentes === undefined
        ? true
        : esVerdadero(incluir_recurrentes);

    const totales = await calcularTotalesConceptos({
      empresaId: empresa_id,
      trabajadorId: trabajador_id,
      periodo,
      incluirRecurrentes,
    });

    return res.json({
      empresa_id: Number(empresa_id),
      trabajador_id: Number(trabajador_id),
      periodo,
      incluir_recurrentes: incluirRecurrentes,
      totales,
    });
  } catch (error) {
    console.error("Error al obtener resumen de haberes/descuentos:", error);

    return res.status(500).json({
      error: "Error interno al obtener resumen de haberes/descuentos",
    });
  }
}

async function actualizarHaberDescuento(req, res) {
  try {
    await asegurarColumnaRecurrente();

    const { id } = req.params;
    const {
      empresa_id,
      trabajador_id,
      periodo,
      nombre,
      tipo,
      monto,
      imponible,
      tributable,
      afecta_descuentos,
      observacion,
      recurrente,
    } = req.body;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    const existenteResult = await pool.query(
      `
      SELECT *
      FROM haberes_descuentos_remuneraciones
      WHERE id = $1
        AND empresa_id = $2
        AND estado = 'vigente'
      `,
      [id, empresa_id]
    );

    if (existenteResult.rows.length === 0) {
      return res.status(404).json({
        error: "Registro no encontrado",
      });
    }

    const actual = existenteResult.rows[0];

    const periodoFinal = periodo || actual.periodo;
    const nombreFinal = String(nombre ?? actual.nombre ?? "").trim();
    const tipoFinal = tipo || actual.tipo;
    const montoFinal = Number(
      monto !== undefined && monto !== null ? monto : actual.monto
    );

    if (!periodoFinal || !esPeriodoValido(periodoFinal)) {
      return res.status(400).json({
        error: "El periodo debe tener formato YYYY-MM",
      });
    }

    if (!nombreFinal || !tipoFinal) {
      return res.status(400).json({
        error: "Nombre y tipo son obligatorios",
      });
    }

    if (montoFinal <= 0) {
      return res.status(400).json({
        error: "El monto debe ser mayor a cero",
      });
    }

    const resultado = await pool.query(
      `
      UPDATE haberes_descuentos_remuneraciones
      SET trabajador_id = $3,
          periodo = $4,
          nombre = $5,
          tipo = $6,
          monto = $7,
          imponible = $8,
          tributable = $9,
          afecta_descuentos = $10,
          observacion = $11,
          recurrente = $12
      WHERE id = $1
        AND empresa_id = $2
      RETURNING *
      `,
      [
        id,
        empresa_id,
        trabajador_id || actual.trabajador_id,
        periodoFinal,
        nombreFinal,
        tipoFinal,
        montoFinal,
        imponible === undefined ? Boolean(actual.imponible) : Boolean(imponible),
        tributable === undefined
          ? Boolean(actual.tributable)
          : Boolean(tributable),
        afecta_descuentos === undefined
          ? Boolean(actual.afecta_descuentos)
          : Boolean(afecta_descuentos),
        observacion !== undefined ? observacion || "" : actual.observacion || "",
        recurrente === undefined ? Boolean(actual.recurrente) : Boolean(recurrente),
      ]
    );

    return res.json({
      mensaje: "Haber/descuento actualizado correctamente",
      item: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al actualizar haber/descuento:", error);

    return res.status(500).json({
      error: "Error interno al actualizar haber/descuento",
    });
  }
}

async function actualizarRecurrenteHaberDescuento(req, res) {
  try {
    await asegurarColumnaRecurrente();

    const { id } = req.params;
    const { empresa_id, recurrente } = req.body;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    const tieneValorExplicito = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "recurrente"
    );

    const query = tieneValorExplicito
      ? `
        UPDATE haberes_descuentos_remuneraciones
        SET recurrente = $3
        WHERE id = $1
          AND empresa_id = $2
          AND estado = 'vigente'
        RETURNING *
      `
      : `
        UPDATE haberes_descuentos_remuneraciones
        SET recurrente = NOT COALESCE(recurrente, false)
        WHERE id = $1
          AND empresa_id = $2
          AND estado = 'vigente'
        RETURNING *
      `;

    const valores = tieneValorExplicito
      ? [id, empresa_id, Boolean(recurrente)]
      : [id, empresa_id];

    const resultado = await pool.query(query, valores);

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        error: "Registro no encontrado",
      });
    }

    const activo = Boolean(resultado.rows[0].recurrente);

    return res.json({
      mensaje: activo
        ? "Concepto fijo todos los meses activado"
        : "Concepto fijo todos los meses desactivado",
      item: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al actualizar recurrencia:", error);

    return res.status(500).json({
      error: "Error interno al actualizar recurrencia",
    });
  }
}

async function eliminarHaberDescuento(req, res) {
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
      UPDATE haberes_descuentos_remuneraciones
      SET estado = 'eliminado'
      WHERE id = $1
        AND empresa_id = $2
      RETURNING *
      `,
      [id, empresa_id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        error: "Registro no encontrado",
      });
    }

    return res.json({
      mensaje: "Haber/descuento eliminado correctamente",
      item: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al eliminar haber/descuento:", error);

    return res.status(500).json({
      error: "Error interno al eliminar haber/descuento",
    });
  }
}

module.exports = {
  crearHaberDescuento,
  listarHaberesDescuentos,
  obtenerResumenLiquidacion,
  actualizarHaberDescuento,
  actualizarRecurrenteHaberDescuento,
  eliminarHaberDescuento,
};

