const pool = require("../database/db");

function numero(valor) {
  return Number(valor || 0);
}

async function obtenerAusenciasLiquidacion({
  empresa_id,
  trabajador_id,
  periodo,
  sueldo_base,
}) {
  const resultado = await pool.query(
    `
    SELECT
      COALESCE(SUM(dias), 0) AS dias_ausencia,
      COALESCE(SUM(horas), 0) AS horas_ausencia,
      COALESCE(SUM(monto_descuento), 0) AS monto_descuento_ausencias
    FROM vacaciones_ausencias
    WHERE empresa_id = $1
      AND trabajador_id = $2
      AND periodo = $3
      AND estado = 'vigente'
      AND (
        afecta_remuneracion = true
        OR monto_descuento > 0
      )
    `,
    [empresa_id, trabajador_id, periodo]
  );

  const fila = resultado.rows[0] || {};

  const diasAusencia = numero(fila.dias_ausencia);
  const horasAusencia = numero(fila.horas_ausencia);
  const descuentoManual = numero(fila.monto_descuento_ausencias);

  const valorDia = numero(sueldo_base) / 30;
  const descuentoDias = Math.round(valorDia * diasAusencia);

  const descuentoAusenciasTotal = descuentoDias + descuentoManual;

  return {
    dias_ausencia: diasAusencia,
    horas_ausencia: horasAusencia,
    descuento_ausencias: descuentoAusenciasTotal,
    descuento_dias_ausencia: descuentoDias,
    descuento_manual_ausencias: descuentoManual,
  };
}

module.exports = {
  obtenerAusenciasLiquidacion,
};