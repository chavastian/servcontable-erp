import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function listarVacacionesAusencias(filtros) {
  const params = new URLSearchParams();

  params.append("empresa_id", filtros.empresa_id);

  if (filtros.periodo) params.append("periodo", filtros.periodo);
  if (filtros.trabajador_id) params.append("trabajador_id", filtros.trabajador_id);
  if (filtros.tipo) params.append("tipo", filtros.tipo);

  return peticion(`${API_URL}/vacaciones-ausencias?${params.toString()}`, { mensajeError: "Error al listar vacaciones y ausencias" });
}

export async function crearVacacionAusencia(datos) {
  return peticion(`${API_URL}/vacaciones-ausencias`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al guardar registro" });
}

export async function obtenerResumenVacacionesAusenciasTrabajador(filtros) {
  const params = new URLSearchParams();

  params.append("empresa_id", filtros.empresa_id);
  params.append("trabajador_id", filtros.trabajador_id);

  if (filtros.periodo) {
    params.append("periodo", filtros.periodo);
  }

  return peticion(`${API_URL}/vacaciones-ausencias/resumen-trabajador?${params.toString()}`, { mensajeError: "Error al obtener resumen del trabajador" });
}

export async function eliminarVacacionAusencia(id, empresaId) {
  return peticion(`${API_URL}/vacaciones-ausencias/${id}`, { metodo: "DELETE", cuerpo: {
      empresa_id: empresaId,
    }, mensajeError: "Error al eliminar registro" });
}