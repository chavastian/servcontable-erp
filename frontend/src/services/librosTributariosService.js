import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function obtenerLibroVentas(empresaId, fechaDesde, fechaHasta) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  params.append("fecha_desde", fechaDesde);
  params.append("fecha_hasta", fechaHasta);

  return peticion(`${API_URL}/libros-tributarios/ventas?${params.toString()}`, { mensajeError: "Error al obtener libro de ventas" });
}

export async function obtenerLibroCompras(empresaId, fechaDesde, fechaHasta) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  params.append("fecha_desde", fechaDesde);
  params.append("fecha_hasta", fechaHasta);

  return peticion(`${API_URL}/libros-tributarios/compras?${params.toString()}`, { mensajeError: "Error al obtener libro de compras" });
}