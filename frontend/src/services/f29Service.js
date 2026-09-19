import { peticion } from "./http";
/**
 * F29: cálculo completo y registro del formulario presentado.
 *
 * El cálculo vive en el servidor; esta pantalla no decide nada. Registrar lo
 * presentado fija el remanente del período para el mes siguiente.
 */

import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

async function pedir(ruta) {
  return peticion(`${API_URL}${ruta}`, { mensajeError: "No se pudo obtener la información del F29" });
}

export function obtenerF29(empresaId, periodo) {
  const params = new URLSearchParams({ empresa_id: empresaId, periodo });

  return pedir(`/f29?${params.toString()}`);
}

export function listarF29Presentadas(empresaId) {
  const params = new URLSearchParams({ empresa_id: empresaId });

  return pedir(`/f29/presentadas?${params.toString()}`);
}

export async function registrarF29Presentada(datos) {
  return peticion(`${API_URL}/f29/presentada`, { metodo: "POST", cuerpo: datos, mensajeError: "No se pudo registrar el F29" });
}
