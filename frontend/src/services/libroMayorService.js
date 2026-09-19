import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/libro-mayor`;

export async function obtenerLibroMayor({
  empresa_id,
  fecha_desde,
  fecha_hasta,
  cuenta_id = "",
}) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresa_id);
  params.append("fecha_desde", fecha_desde);
  params.append("fecha_hasta", fecha_hasta);

  if (cuenta_id) {
    params.append("cuenta_id", cuenta_id);
  }

  return peticion(`${API_URL}?${params.toString()}`, { mensajeError: "Error al obtener libro mayor" });
}