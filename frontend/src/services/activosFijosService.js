/**
 * Activo fijo y depreciación (módulo 7).
 *
 * La depreciación normal es la que se contabiliza; la acelerada del artículo
 * 31 N°5 viaja en las mismas respuestas pero solo para efectos tributarios.
 */

import { peticion } from "./http";

export async function listarActivosFijos({ empresaId, periodo = "", estado = "", categoria = "" } = {}) {
  const params = new URLSearchParams({ empresa_id: empresaId });

  if (periodo) params.append("periodo", periodo);
  if (estado) params.append("estado", estado);
  if (categoria) params.append("categoria", categoria);

  return peticion(`/activos-fijos?${params.toString()}`, {
    mensajeError: "Error al listar los bienes del activo fijo",
  });
}

export async function obtenerActivoFijo(id, empresaId, periodo = "") {
  const params = new URLSearchParams({ empresa_id: empresaId });

  if (periodo) params.append("periodo", periodo);

  return peticion(`/activos-fijos/${id}?${params.toString()}`, {
    mensajeError: "Error al obtener el bien",
  });
}

export async function obtenerVidasUtiles() {
  return peticion("/activos-fijos/vidas-utiles", {
    mensajeError: "Error al obtener la tabla de vidas útiles",
  });
}

export async function crearActivoFijo(datos) {
  return peticion("/activos-fijos", {
    metodo: "POST",
    cuerpo: datos,
    mensajeError: "Error al registrar el bien",
  });
}

export async function actualizarActivoFijo(id, datos) {
  return peticion(`/activos-fijos/${id}`, {
    metodo: "PUT",
    cuerpo: datos,
    mensajeError: "Error al actualizar el bien",
  });
}

export async function darDeBajaActivoFijo(id, datos) {
  return peticion(`/activos-fijos/${id}/baja`, {
    metodo: "PUT",
    cuerpo: datos,
    mensajeError: "Error al dar de baja el bien",
  });
}

export async function obtenerDepreciacionPeriodo(empresaId, periodo) {
  const params = new URLSearchParams({ empresa_id: empresaId, periodo });

  return peticion(`/activos-fijos/depreciacion?${params.toString()}`, {
    mensajeError: "Error al calcular la depreciación del período",
  });
}

export async function contabilizarDepreciacion(empresaId, periodo) {
  return peticion("/activos-fijos/depreciacion/contabilizar", {
    metodo: "POST",
    cuerpo: { empresa_id: empresaId, periodo },
    mensajeError: "Error al contabilizar la depreciación",
  });
}

export async function obtenerLibroActivoFijo(empresaId, periodo) {
  const params = new URLSearchParams({ empresa_id: empresaId, periodo });

  return peticion(`/activos-fijos/informe?${params.toString()}`, {
    mensajeError: "Error al obtener el libro de activo fijo",
  });
}
