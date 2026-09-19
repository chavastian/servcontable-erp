import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function obtenerControlRemanenteIVA(empresaId, periodo) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  params.append("periodo", periodo);

  return peticion(`${API_URL}/remanente-iva?${params.toString()}`, { mensajeError: "Error al obtener remanente IVA" });
}

export async function guardarControlRemanenteIVA(datos) {
  return peticion(`${API_URL}/remanente-iva`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al guardar remanente IVA" });
}

export async function listarHistorialRemanenteIVA(empresaId) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);

  return peticion(`${API_URL}/remanente-iva/historial?${params.toString()}`, { mensajeError: "Error al listar historial IVA" });
}