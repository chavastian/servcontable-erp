/**
 * F29: cálculo completo y registro del formulario presentado.
 *
 * El cálculo vive en el servidor; esta pantalla no decide nada. Registrar lo
 * presentado fija el remanente del período para el mes siguiente.
 */

import { obtenerToken } from "./authService";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

async function pedir(ruta) {
  const respuesta = await fetch(`${API_URL}${ruta}`, {
    headers: { Authorization: `Bearer ${obtenerToken()}` },
  });
  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    throw new Error(datos.error || "No se pudo obtener la información del F29");
  }

  return datos;
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
  const respuesta = await fetch(`${API_URL}/f29/presentada`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${obtenerToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(datos),
  });
  const cuerpo = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    throw new Error(cuerpo.error || "No se pudo registrar el F29");
  }

  return cuerpo;
}
