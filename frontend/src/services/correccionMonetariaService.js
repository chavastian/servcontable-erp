/**
 * Corrección monetaria del artículo 41 (módulo 8 de la revisión del
 * 19-09-2026).
 *
 * El cálculo depende de dos cosas que el sistema no puede adivinar: el IPC de
 * cada mes del año y qué cuentas son monetarias. Por eso hay un endpoint para
 * clasificar y otro para cargar el IPC, y el cálculo se niega a correr si
 * falta cualquiera de los dos.
 */

import { peticion } from "./http";

export async function obtenerCorreccionMonetaria(empresaId, anio) {
  const params = new URLSearchParams({ empresa_id: empresaId, anio });

  return peticion(`/correccion-monetaria?${params.toString()}`, {
    mensajeError: "Error al calcular la corrección monetaria",
  });
}

export async function obtenerClasificaciones(empresaId, anio) {
  const params = new URLSearchParams({ empresa_id: empresaId, anio });

  return peticion(`/correccion-monetaria/clasificaciones?${params.toString()}`, {
    mensajeError: "Error al obtener las clasificaciones sugeridas",
  });
}

export async function guardarClasificaciones(empresaId, clasificaciones) {
  return peticion("/correccion-monetaria/clasificaciones", {
    metodo: "POST",
    cuerpo: { empresa_id: empresaId, clasificaciones },
    mensajeError: "Error al guardar las clasificaciones",
  });
}

export async function contabilizarCorreccion({ empresaId, anio, criterio }) {
  return peticion("/correccion-monetaria/contabilizar", {
    metodo: "POST",
    cuerpo: { empresa_id: empresaId, anio, criterio },
    mensajeError: "Error al contabilizar la corrección monetaria",
  });
}

export async function guardarVariacionIpc(periodo, variacionIpc) {
  return peticion("/correccion-monetaria/ipc", {
    metodo: "POST",
    cuerpo: { periodo, variacion_ipc: variacionIpc },
    mensajeError: "Error al guardar la variación del IPC",
  });
}
