/**
 * Proveedores y clientes como entidades (módulo 12).
 *
 * El RUT no viaja al editar: una vez que hay documentos emitidos no se cambia.
 */

import { peticion } from "./http";

export async function listarTerceros({ empresaId, tipo = "", buscar = "", estado = "", limite, pagina } = {}) {
  const params = new URLSearchParams({ empresa_id: empresaId });

  if (tipo) params.append("tipo", tipo);
  if (buscar) params.append("buscar", buscar);
  if (estado) params.append("estado", estado);
  if (limite) params.append("limite", limite);
  if (pagina) params.append("pagina", pagina);

  return peticion(`/terceros?${params.toString()}`, {
    mensajeError: "Error al listar proveedores y clientes",
  });
}

export async function obtenerTercero(id, empresaId) {
  return peticion(`/terceros/${id}?empresa_id=${empresaId}`, {
    mensajeError: "Error al obtener el proveedor o cliente",
  });
}

export async function crearTercero(datos) {
  return peticion("/terceros", {
    metodo: "POST",
    cuerpo: datos,
    mensajeError: "Error al crear el proveedor o cliente",
  });
}

export async function actualizarTercero(id, datos) {
  return peticion(`/terceros/${id}`, {
    metodo: "PUT",
    cuerpo: datos,
    mensajeError: "Error al actualizar el proveedor o cliente",
  });
}

export async function cambiarEstadoTercero(id, empresaId, estado) {
  return peticion(`/terceros/${id}/estado`, {
    metodo: "PUT",
    cuerpo: { empresa_id: empresaId, estado },
    mensajeError: "Error al cambiar el estado",
  });
}
