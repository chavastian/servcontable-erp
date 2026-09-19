import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function obtenerConfiguracionContable(empresaId) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);

  return peticion(`${API_URL}/configuracion-contable?${params.toString()}`, { mensajeError: "Error al obtener configuración contable" });
}

export async function guardarConfiguracionContable(datos) {
  return peticion(`${API_URL}/configuracion-contable`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al guardar configuración contable" });
}