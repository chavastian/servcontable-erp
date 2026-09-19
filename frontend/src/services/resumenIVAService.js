import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function obtenerResumenIVA(empresaId, periodo) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  params.append("periodo", periodo);

  return peticion(`${API_URL}/resumen-iva?${params.toString()}`, { mensajeError: "Error al obtener resumen IVA" });
}