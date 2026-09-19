/**
 * Centros de costo como catálogo (módulo 14), con el informe de resultado por
 * centro, que es para lo que se usan.
 */

import { peticion } from "./http";

export async function listarCentrosCosto(empresaId, estado = "") {
  const params = new URLSearchParams({ empresa_id: empresaId });

  if (estado) params.append("estado", estado);

  return peticion(`/centros-costo?${params.toString()}`, {
    mensajeError: "Error al listar centros de costo",
  });
}

export async function crearCentroCosto(datos) {
  return peticion("/centros-costo", {
    metodo: "POST",
    cuerpo: datos,
    mensajeError: "Error al crear el centro de costo",
  });
}

export async function actualizarCentroCosto(id, datos) {
  return peticion(`/centros-costo/${id}`, {
    metodo: "PUT",
    cuerpo: datos,
    mensajeError: "Error al actualizar el centro de costo",
  });
}

export async function cambiarEstadoCentroCosto(id, empresaId, estado) {
  return peticion(`/centros-costo/${id}/estado`, {
    metodo: "PUT",
    cuerpo: { empresa_id: empresaId, estado },
    mensajeError: "Error al cambiar el estado del centro de costo",
  });
}

export async function obtenerInformeCentrosCosto({ empresaId, fechaDesde, fechaHasta }) {
  const params = new URLSearchParams({
    empresa_id: empresaId,
    fecha_desde: fechaDesde,
    fecha_hasta: fechaHasta,
  });

  return peticion(`/centros-costo/informe?${params.toString()}`, {
    mensajeError: "Error al obtener el informe por centro de costo",
  });
}
