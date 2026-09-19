import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function obtenerEstadoResultados(
  empresaId,
  fechaDesde,
  fechaHasta,
  incluirSinMovimiento = false
) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  params.append("fecha_desde", fechaDesde);
  params.append("fecha_hasta", fechaHasta);
  params.append("incluir_sin_movimiento", incluirSinMovimiento ? "1" : "0");

  return peticion(`${API_URL}/estado-resultados?${params.toString()}`, { mensajeError: "Error al obtener estado de resultados" });
}
