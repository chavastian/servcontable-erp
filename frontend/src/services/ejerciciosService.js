import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function listarEjercicios(empresa_id) {
  return peticion(`${API_URL}/ejercicios?empresa_id=${empresa_id}`, { mensajeError: "Error al listar años de trabajo" });
}

export async function crearEjercicio(datos) {
  return peticion(`${API_URL}/ejercicios`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al crear año de trabajo" });
}

export async function cerrarEjercicio(id, datos) {
  return peticion(`${API_URL}/ejercicios/${id}/cerrar`, { metodo: "PUT", cuerpo: datos, mensajeError: "Error al cerrar año de trabajo" });
}

export async function reabrirEjercicio(id, datos) {
  return peticion(`${API_URL}/ejercicios/${id}/reabrir`, { metodo: "PUT", cuerpo: datos, mensajeError: "Error al reabrir año de trabajo" });
}

export function guardarEjercicioActivo(ejercicio) {
  sessionStorage.setItem("ejercicioActivo", JSON.stringify(ejercicio));
  localStorage.removeItem("ejercicioActivo");
}

export function obtenerEjercicioActivo() {
  localStorage.removeItem("ejercicioActivo");
  const raw = sessionStorage.getItem("ejercicioActivo");

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function limpiarEjercicioActivo() {
  sessionStorage.removeItem("ejercicioActivo");
  localStorage.removeItem("ejercicioActivo");
}
