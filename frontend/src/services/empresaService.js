import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function crearEmpresa(datosEmpresa) {
  return peticion(`${API_URL}/empresas`, { metodo: "POST", cuerpo: datosEmpresa, mensajeError: "Error al crear empresa" });
}

export async function listarEmpresas() {
  return peticion(`${API_URL}/empresas`, { mensajeError: "Error al listar empresas" });
}

export async function actualizarEmpresa(id, datosEmpresa) {
  return peticion(`${API_URL}/empresas/${id}`, { metodo: "PATCH", cuerpo: datosEmpresa, mensajeError: "Error al actualizar empresa" });
}

export async function eliminarEmpresa(id) {
  return peticion(`${API_URL}/empresas/${id}`, { metodo: "DELETE", mensajeError: "Error al eliminar empresa" });
}

export function guardarEmpresaActiva(empresa) {
  sessionStorage.setItem("empresaActiva", JSON.stringify(empresa));
  localStorage.removeItem("empresaActiva");
}

export function obtenerEmpresaActiva() {
  localStorage.removeItem("empresaActiva");
  const empresaGuardada = sessionStorage.getItem("empresaActiva");

  if (!empresaGuardada) {
    return null;
  }

  try {
    return JSON.parse(empresaGuardada);
  } catch {
    eliminarEmpresaActiva();
    return null;
  }
}

export function eliminarEmpresaActiva() {
  sessionStorage.removeItem("empresaActiva");
  localStorage.removeItem("empresaActiva");
}



