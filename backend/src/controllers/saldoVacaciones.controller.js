const pool = require("../database/db");

function numero(valor) {
  return Number(valor || 0);
}

// El devengo se calcula en vacaciones.helper: 15 días hábiles al año más el
// feriado progresivo. Este controlador tenía su propio algoritmo (1,25 por
// cada 30 días corridos) y daba saldos distintos a los del finiquito.
const { calcularVacacionesDevengadas } = require("../helpers/vacaciones.helper");

function ultimoDiaDelPeriodo(periodo) {
  const [anio, mes] = String(periodo).split("-").map(Number);

  if (!anio || !mes) return null;

  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();

  return `${anio}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
}

async function obtenerSaldoVacaciones(req, res) {
  try {
    const { empresa_id, periodo, trabajador_id } = req.query;

    if (!empresa_id || !periodo) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y periodo",
      });
    }

    // `${periodo}-31` no existe en febrero, abril, junio, septiembre ni
    // noviembre: el corte era una fecha inválida y el devengo daba cero.
    const fechaCorte = ultimoDiaDelPeriodo(periodo);

    if (!fechaCorte) {
      return res.status(400).json({ error: "El periodo debe tener formato AAAA-MM" });
    }

    let queryTrabajadores = `
      SELECT
        id,
        rut,
        nombres,
        apellidos,
        cargo,
        fecha_ingreso,
        estado,
        COALESCE(anios_cotizados_previos, 0) AS anios_cotizados_previos
      FROM trabajadores
      WHERE empresa_id = $1
        AND estado = 'activo'
    `;

    const valoresTrabajadores = [empresa_id];

    if (trabajador_id && trabajador_id !== "undefined" && trabajador_id !== "null") {
      queryTrabajadores += ` AND id = $2`;
      valoresTrabajadores.push(trabajador_id);
    }

    queryTrabajadores += `
      ORDER BY apellidos ASC, nombres ASC
    `;

    const trabajadoresResult = await pool.query(
      queryTrabajadores,
      valoresTrabajadores
    );

    const trabajadores = trabajadoresResult.rows;

    const saldos = [];

    for (const trabajador of trabajadores) {
      const usadosResult = await pool.query(
        `
        SELECT
          COALESCE(SUM(dias), 0) AS dias_usados
        FROM vacaciones_ausencias
        WHERE empresa_id = $1
          AND trabajador_id = $2
          AND estado = 'vigente'
          AND descuenta_vacaciones = true
        `,
        [empresa_id, trabajador.id]
      );

      const usadosPeriodoResult = await pool.query(
        `
        SELECT
          COALESCE(SUM(dias), 0) AS dias_usados_periodo
        FROM vacaciones_ausencias
        WHERE empresa_id = $1
          AND trabajador_id = $2
          AND periodo = $3
          AND estado = 'vigente'
          AND descuenta_vacaciones = true
        `,
        [empresa_id, trabajador.id, periodo]
      );

      const historialResult = await pool.query(
        `
        SELECT
          id,
          periodo,
          tipo,
          subtipo,
          fecha_inicio,
          fecha_termino,
          dias,
          horas,
          observacion
        FROM vacaciones_ausencias
        WHERE empresa_id = $1
          AND trabajador_id = $2
          AND estado = 'vigente'
          AND descuenta_vacaciones = true
        ORDER BY fecha_inicio DESC, id DESC
        LIMIT 20
        `,
        [empresa_id, trabajador.id]
      );

      const diasDevengados = calcularVacacionesDevengadas(
        trabajador.fecha_ingreso,
        fechaCorte,
        trabajador.anios_cotizados_previos
      );

      const diasUsados = numero(usadosResult.rows[0]?.dias_usados);
      const diasUsadosPeriodo = numero(
        usadosPeriodoResult.rows[0]?.dias_usados_periodo
      );

      const diasPendientes =
        Math.round((diasDevengados - diasUsados) * 100) / 100;

      saldos.push({
        trabajador_id: trabajador.id,
        rut: trabajador.rut,
        nombres: trabajador.nombres,
        apellidos: trabajador.apellidos,
        cargo: trabajador.cargo,
        fecha_ingreso: trabajador.fecha_ingreso,
        periodo,
        fecha_corte: fechaCorte,

        dias_devengados: diasDevengados,
        dias_usados: diasUsados,
        dias_usados_periodo: diasUsadosPeriodo,
        dias_pendientes: diasPendientes,

        estado_saldo:
          diasPendientes < 0
            ? "Saldo negativo"
            : diasPendientes === 0
            ? "Sin saldo pendiente"
            : "Con saldo disponible",

        alerta_saldo_negativo: diasPendientes < 0,

        historial: historialResult.rows,
      });
    }

    const totales = saldos.reduce(
      (acc, item) => {
        acc.dias_devengados += numero(item.dias_devengados);
        acc.dias_usados += numero(item.dias_usados);
        acc.dias_usados_periodo += numero(item.dias_usados_periodo);
        acc.dias_pendientes += numero(item.dias_pendientes);

        if (item.alerta_saldo_negativo) {
          acc.trabajadores_saldo_negativo += 1;
        }

        return acc;
      },
      {
        dias_devengados: 0,
        dias_usados: 0,
        dias_usados_periodo: 0,
        dias_pendientes: 0,
        trabajadores_saldo_negativo: 0,
      }
    );

    return res.json({
      periodo,
      fecha_corte: fechaCorte,
      total_trabajadores: saldos.length,
      saldos,
      totales,
    });
  } catch (error) {
    console.error("Error al obtener saldo de vacaciones:", error);

    return res.status(error.statusCode || 500).json({
      // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
      // columnas y restricciones. Los errores de validacion propios
      // si conservan su mensaje y su codigo.
      error: error.statusCode ? error.message : "Error interno al obtener saldo de vacaciones",
    });
  }
}

async function obtenerHistorialVacacionesTrabajador(req, res) {
  try {
    const { empresa_id, trabajador_id } = req.query;

    if (!empresa_id || !trabajador_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y trabajador_id",
      });
    }

    const trabajadorResult = await pool.query(
      `
      SELECT
        id,
        rut,
        nombres,
        apellidos,
        cargo,
        fecha_ingreso
      FROM trabajadores
      WHERE empresa_id = $1
        AND id = $2
      LIMIT 1
      `,
      [empresa_id, trabajador_id]
    );

    if (trabajadorResult.rows.length === 0) {
      return res.status(404).json({
        error: "Trabajador no encontrado",
      });
    }

    const historialResult = await pool.query(
      `
      SELECT
        id,
        periodo,
        tipo,
        subtipo,
        fecha_inicio,
        fecha_termino,
        dias,
        horas,
        observacion,
        creado_en
      FROM vacaciones_ausencias
      WHERE empresa_id = $1
        AND trabajador_id = $2
        AND estado = 'vigente'
        AND descuenta_vacaciones = true
      ORDER BY fecha_inicio DESC, id DESC
      `,
      [empresa_id, trabajador_id]
    );

    const totalUsado = historialResult.rows.reduce(
      (acc, item) => acc + numero(item.dias),
      0
    );

    return res.json({
      trabajador: trabajadorResult.rows[0],
      historial: historialResult.rows,
      total_usado: totalUsado,
    });
  } catch (error) {
    console.error("Error al obtener historial de vacaciones:", error);

    return res.status(error.statusCode || 500).json({
      // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
      // columnas y restricciones. Los errores de validacion propios
      // si conservan su mensaje y su codigo.
      error: error.statusCode ? error.message : "Error interno al obtener historial",
    });
  }
}

module.exports = {
  obtenerSaldoVacaciones,
  obtenerHistorialVacacionesTrabajador,
};