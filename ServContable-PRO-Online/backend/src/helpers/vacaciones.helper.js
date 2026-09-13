const pool = require("../database/db");

function numero(valor) {
  return Number(valor || 0);
}

function parseFechaLocal(fecha) {
  if (!fecha) return null;

  if (fecha instanceof Date) {
    return new Date(
      fecha.getFullYear(),
      fecha.getMonth(),
      fecha.getDate(),
      12,
      0,
      0
    );
  }

  const [anio, mes, dia] = String(fecha)
    .substring(0, 10)
    .split("-")
    .map(Number);

  if (!anio || !mes || !dia) return null;

  return new Date(anio, mes - 1, dia, 12, 0, 0);
}

function calcularMesesLaborales(fechaIngreso, fechaCorte) {
  const inicio = parseFechaLocal(fechaIngreso);
  const corte = parseFechaLocal(fechaCorte);

  if (!inicio || !corte || corte < inicio) return 0;

  const mesesBase =
    (corte.getFullYear() - inicio.getFullYear()) * 12 +
    (corte.getMonth() - inicio.getMonth());

  const incluyeMesTermino = corte.getDate() >= inicio.getDate() ? 1 : 0;

  return Math.max(0, mesesBase + incluyeMesTermino);
}

function calcularVacacionesDevengadas(fechaIngreso, fechaCorte) {
  const mesesTrabajados = calcularMesesLaborales(fechaIngreso, fechaCorte);

  if (mesesTrabajados <= 0) return 0;

  const diasDevengados = mesesTrabajados * 1.25;

  return Math.round(diasDevengados * 100) / 100;
}

async function calcularVacacionesPendientesFiniquito({
  empresa_id,
  trabajador_id,
  fecha_termino,
  sueldo_base,
}) {
  const trabajadorResult = await pool.query(
    `
    SELECT
      id,
      rut,
      nombres,
      apellidos,
      cargo,
      fecha_ingreso,
      sueldo_base
    FROM trabajadores
    WHERE empresa_id = $1
      AND id = $2
    LIMIT 1
    `,
    [empresa_id, trabajador_id]
  );

  if (trabajadorResult.rows.length === 0) {
    throw new Error("Trabajador no encontrado para calcular vacaciones");
  }

  const trabajador = trabajadorResult.rows[0];

  const fechaCorte = fecha_termino || new Date().toISOString().substring(0, 10);

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
    [empresa_id, trabajador_id]
  );

  const diasDevengados = calcularVacacionesDevengadas(
    trabajador.fecha_ingreso,
    fechaCorte
  );

  const diasUsados = numero(usadosResult.rows[0]?.dias_usados);
  const diasPendientes = Math.round((diasDevengados - diasUsados) * 100) / 100;

  const sueldoBaseCalculo = numero(sueldo_base || trabajador.sueldo_base);
  const valorDia = Math.round(sueldoBaseCalculo / 30);

  const diasAPagar = diasPendientes > 0 ? diasPendientes : 0;
  const montoVacaciones = Math.round(valorDia * diasAPagar);

  return {
    fecha_corte: fechaCorte,
    fecha_ingreso: trabajador.fecha_ingreso,
    dias_devengados: diasDevengados,
    dias_usados: diasUsados,
    dias_pendientes: diasPendientes,
    dias_a_pagar: diasAPagar,
    valor_dia_vacaciones: valorDia,
    monto_vacaciones_pendientes: montoVacaciones,
    alerta_saldo_negativo: diasPendientes < 0,
  };
}

module.exports = {
  calcularMesesLaborales,
  calcularVacacionesDevengadas,
  calcularVacacionesPendientesFiniquito,
};
