import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function obtenerLibroDiario(empresaId, fechaDesde, fechaHasta) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  params.append("fecha_desde", fechaDesde);
  params.append("fecha_hasta", fechaHasta);

  return peticion(`${API_URL}/libro-diario?${params.toString()}`, { mensajeError: "Error al obtener libro diario" });
}