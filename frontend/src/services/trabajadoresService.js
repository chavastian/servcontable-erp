import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function listarTrabajadores(empresaId, estado = "") {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);

  if (estado) {
    params.append("estado", estado);
  }

  return peticion(`${API_URL}/trabajadores?${params.toString()}`, { mensajeError: "Error al listar trabajadores" });
}

export async function crearTrabajador(datos) {
  return peticion(`${API_URL}/trabajadores`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al crear trabajador" });
}

export async function actualizarTrabajador(id, datos) {
  return peticion(`${API_URL}/trabajadores/${id}`, { metodo: "PUT", cuerpo: datos, mensajeError: "Error al actualizar trabajador" });
}

export async function eliminarTrabajador(id, empresaId) {
  return peticion(`${API_URL}/trabajadores/${id}/eliminar`, { metodo: "PUT", cuerpo: {
      empresa_id: empresaId,
    }, mensajeError: "Error al eliminar trabajador" });
}