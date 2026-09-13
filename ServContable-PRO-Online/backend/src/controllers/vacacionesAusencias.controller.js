const pool = require("../database/db");

function numero(valor) {
  return Number(valor || 0);
}

function calcularDias(fechaInicio, fechaTermino) {
  if (!fechaInicio || !fechaTermino) return 0;

  const inicio = new Date(fechaInicio);
  const termino = new Date(fechaTermino);

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(termino.getTime())) {
    return 0;
  }

  const diffMs = termino.getTime() - inicio.getTime();
  const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

  return dias > 0 ? dias : 0;
}

async function crearRegistro(req, res) {
  try {
    const {
      empresa_id,
      trabajador_id,
      periodo,
      tipo,
      subtipo,
      fecha_inicio,
      fecha_termino,
      dias,
      horas,
      afecta_remuneracion,
      descuenta_vacaciones,
      monto_descuento,
      observacion,
    } = req.body;

    if (
      !empresa_id ||
      !trabajador_id ||
      !periodo ||
      !tipo ||
      !fecha_inicio ||
      !fecha_termino
    ) {
      return res.status(400).json({
        error:
          "Debe indicar empresa_id, trabajador_id, período, tipo, fecha inicio y fecha término",
      });
    }

    const diasCalculados = dias !== undefined && dias !== null && dias !== ""
      ? numero(dias)
      : calcularDias(fecha_inicio, fecha_termino);

    const resultado = await pool.query(
      `
      INSERT INTO vacaciones_ausencias
      (
        empresa_id,
        trabajador_id,
        periodo,
        tipo,
        subtipo,
        fecha_inicio,
        fecha_termino,
        dias,
        horas,
        afecta_remuneracion,
        descuenta_vacaciones,
        monto_descuento,
        observacion,
        estado
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'vigente')
      RETURNING *
      `,
      [
        empresa_id,
        trabajador_id,
        periodo,
        tipo,
        subtipo || "",
        fecha_inicio,
        fecha_termino,
        diasCalculados,
        numero(horas),
        !!afecta_remuneracion,
        !!descuenta_vacaciones,
        numero(monto_descuento),
        observacion || "",
      ]
    );

    return res.status(201).json({
      mensaje: "Registro guardado correctamente",
      registro: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al crear vacaciones/ausencias:", error);

    return res.status(500).json({
      error: error.message || "Error interno al crear registro",
    });
  }
}

async function listarRegistros(req, res) {
  try {
    const { empresa_id, periodo, trabajador_id, tipo } = req.query;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    let query = `
      SELECT
        va.*,
        t.rut AS trabajador_rut,
        t.nombres AS trabajador_nombres,
        t.apellidos AS trabajador_apellidos,
        t.cargo AS trabajador_cargo
      FROM vacaciones_ausencias va
      INNER JOIN trabajadores t ON t.id = va.trabajador_id
      WHERE va.empresa_id = $1
        AND va.estado = 'vigente'
    `;

    const valores = [empresa_id];
    let posicion = 2;

    if (periodo) {
      query += ` AND va.periodo = $${posicion}`;
      valores.push(periodo);
      posicion++;
    }

    if (trabajador_id) {
      query += ` AND va.trabajador_id = $${posicion}`;
      valores.push(trabajador_id);
      posicion++;
    }

    if (tipo) {
      query += ` AND va.tipo = $${posicion}`;
      valores.push(tipo);
      posicion++;
    }

    query += `
      ORDER BY va.fecha_inicio DESC, va.id DESC
    `;

    const resultado = await pool.query(query, valores);

    const totales = resultado.rows.reduce(
      (acc, item) => {
        const dias = numero(item.dias);
        const horas = numero(item.horas);
        const monto = numero(item.monto_descuento);

        acc.total_registros += 1;
        acc.total_dias += dias;
        acc.total_horas += horas;
        acc.total_descuentos += monto;

        if (item.tipo === "Vacaciones") {
          acc.dias_vacaciones += dias;
        }

        if (item.tipo === "Ausencia") {
          acc.dias_ausencias += dias;
        }

        if (item.tipo === "Licencia médica") {
          acc.dias_licencias += dias;
        }

        if (item.tipo === "Permiso") {
          acc.dias_permisos += dias;
        }

        if (item.descuenta_vacaciones) {
          acc.dias_descuentan_vacaciones += dias;
        }

        if (item.afecta_remuneracion) {
          acc.dias_afectan_remuneracion += dias;
        }

        return acc;
      },
      {
        total_registros: 0,
        total_dias: 0,
        total_horas: 0,
        total_descuentos: 0,
        dias_vacaciones: 0,
        dias_ausencias: 0,
        dias_licencias: 0,
        dias_permisos: 0,
        dias_descuentan_vacaciones: 0,
        dias_afectan_remuneracion: 0,
      }
    );

    return res.json({
      total_registros: resultado.rows.length,
      registros: resultado.rows,
      totales,
    });
  } catch (error) {
    console.error("Error al listar vacaciones/ausencias:", error);

    return res.status(500).json({
      error: error.message || "Error interno al listar registros",
    });
  }
}

async function obtenerResumenTrabajador(req, res) {
  try {
    const { empresa_id, trabajador_id, periodo } = req.query;

    if (!empresa_id || !trabajador_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y trabajador_id",
      });
    }

    let filtroPeriodo = "";
    const valores = [empresa_id, trabajador_id];

    if (periodo) {
      filtroPeriodo = " AND periodo = $3";
      valores.push(periodo);
    }

    const resultado = await pool.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN tipo = 'Vacaciones' THEN dias ELSE 0 END), 0) AS dias_vacaciones,
        COALESCE(SUM(CASE WHEN tipo = 'Ausencia' THEN dias ELSE 0 END), 0) AS dias_ausencias,
        COALESCE(SUM(CASE WHEN tipo = 'Licencia médica' THEN dias ELSE 0 END), 0) AS dias_licencias,
        COALESCE(SUM(CASE WHEN tipo = 'Permiso' THEN dias ELSE 0 END), 0) AS dias_permisos,
        COALESCE(SUM(CASE WHEN descuenta_vacaciones = true THEN dias ELSE 0 END), 0) AS dias_descuentan_vacaciones,
        COALESCE(SUM(CASE WHEN afecta_remuneracion = true THEN dias ELSE 0 END), 0) AS dias_afectan_remuneracion,
        COALESCE(SUM(monto_descuento), 0) AS total_descuentos
      FROM vacaciones_ausencias
      WHERE empresa_id = $1
        AND trabajador_id = $2
        AND estado = 'vigente'
        ${filtroPeriodo}
      `,
      valores
    );

    return res.json({
      resumen: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al obtener resumen trabajador:", error);

    return res.status(500).json({
      error: error.message || "Error interno al obtener resumen",
    });
  }
}

async function eliminarRegistro(req, res) {
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
      UPDATE vacaciones_ausencias
      SET estado = 'anulado',
          actualizado_en = NOW()
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
      mensaje: "Registro eliminado correctamente",
      registro: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al eliminar vacaciones/ausencias:", error);

    return res.status(500).json({
      error: error.message || "Error interno al eliminar registro",
    });
  }
}

module.exports = {
  crearRegistro,
  listarRegistros,
  obtenerResumenTrabajador,
  eliminarRegistro,
};