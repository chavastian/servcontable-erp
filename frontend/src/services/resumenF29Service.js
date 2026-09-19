import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function obtenerResumenF29(empresaId, periodo, tasaPPM) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  params.append("periodo", periodo);
  params.append("tasa_ppm", tasaPPM);

  return peticion(`${API_URL}/resumen-f29?${params.toString()}`, { mensajeError: "Error al obtener resumen F29" });
}