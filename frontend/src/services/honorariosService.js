import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function crearHonorario(datos) {
  return peticion(`${API_URL}/honorarios`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al crear honorario" });
}

export async function listarHonorarios(empresaId, fechaDesde, fechaHasta) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  params.append("fecha_desde", fechaDesde);
  params.append("fecha_hasta", fechaHasta);

  return peticion(`${API_URL}/honorarios?${params.toString()}`, { mensajeError: "Error al listar honorarios" });
}

export async function anularHonorario(id, empresaId) {
  return peticion(`${API_URL}/honorarios/${id}/anular`, { metodo: "PUT", cuerpo: {
      empresa_id: empresaId,
    }, mensajeError: "Error al anular honorario" });
}

export async function contabilizarHonorario(id, empresaId) {
  return peticion(`${API_URL}/honorarios/${id}/contabilizar`, { metodo: "PUT", cuerpo: {
      empresa_id: empresaId,
    }, mensajeError: "Error al contabilizar honorario" });
}