/**
 * Renta líquida imponible y propuesta de F22 (módulo 9 de la revisión del
 * 19-09-2026).
 *
 * La propuesta se recalcula en cada consulta a partir del balance, pero las
 * líneas que una persona agregó se conservan: son las que el sistema no puede
 * derivar de sus propios datos.
 */

import { peticion } from "./http";

export async function obtenerRentaAnual(empresaId, anio) {
  const params = new URLSearchParams({ empresa_id: empresaId, anio });

  return peticion(`/renta-anual?${params.toString()}`, {
    mensajeError: "Error al calcular la renta anual",
  });
}

export async function obtenerPropuestaF22(empresaId, anio) {
  const params = new URLSearchParams({ empresa_id: empresaId, anio });

  return peticion(`/renta-anual/f22?${params.toString()}`, {
    mensajeError: "Error al armar la propuesta de F22",
  });
}

export async function guardarRentaAnual({ empresaId, anio, lineas, saldosIniciales, criterio }) {
  return peticion("/renta-anual", {
    metodo: "POST",
    cuerpo: {
      empresa_id: empresaId,
      anio,
      lineas,
      saldos_iniciales: saldosIniciales,
      criterio,
    },
    mensajeError: "Error al guardar la renta anual",
  });
}

export async function cerrarRentaAnual({ empresaId, anio, criterio }) {
  return peticion("/renta-anual/cerrar", {
    metodo: "POST",
    cuerpo: { empresa_id: empresaId, anio, criterio },
    mensajeError: "Error al cerrar la renta anual",
  });
}

export async function reabrirRentaAnual({ empresaId, anio, motivo }) {
  return peticion("/renta-anual/reabrir", {
    metodo: "POST",
    cuerpo: { empresa_id: empresaId, anio, motivo },
    mensajeError: "Error al reabrir la renta anual",
  });
}

export async function guardarRegimen(empresaId, regimen) {
  return peticion("/renta-anual/regimen", {
    metodo: "POST",
    cuerpo: { empresa_id: empresaId, regimen },
    mensajeError: "Error al guardar el régimen tributario",
  });
}
