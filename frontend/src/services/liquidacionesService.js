import { obtenerToken } from "./authService";

import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function calcularLiquidacion(datos) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/liquidaciones/calcular`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(datos),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al calcular liquidación");
  }

  return data;
}

export async function guardarLiquidacion(datos) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/liquidaciones`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(datos),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al guardar liquidación");
  }

  return data;
}

export async function actualizarLiquidacion(id, datos) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/liquidaciones/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(datos),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al actualizar liquidacion");
  }

  return data;
}

export async function eliminarLiquidacion(id, empresaId) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/liquidaciones/${id}/eliminar`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      empresa_id: empresaId,
    }),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al eliminar liquidacion");
  }

  return data;
}

export async function listarLiquidaciones(empresaId, periodo = "") {
  const token = obtenerToken();

  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);

  if (periodo) {
    params.append("periodo", periodo);
  }

  const respuesta = await fetch(`${API_URL}/liquidaciones?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al listar liquidaciones");
  }

  return data;
}

export async function contabilizarLiquidaciones(empresaId, periodo) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/liquidaciones/contabilizar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      empresa_id: empresaId,
      periodo,
    }),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al contabilizar liquidaciones");
  }

  return data;
}

/**
 * Descarga el Libro de Remuneraciones Electrónico del período como CSV.
 * Devuelve el Blob; la página decide cómo ofrecerlo.
 */
export async function descargarLre(empresaId, periodo) {
  const token = obtenerToken();
  const params = new URLSearchParams({ empresa_id: empresaId, periodo });

  const respuesta = await fetch(`${API_URL}/liquidaciones/lre?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!respuesta.ok) {
    const data = await respuesta.json().catch(() => ({}));
    throw new Error(data.error || "Error al exportar el libro electrónico");
  }

  return respuesta.blob();
}
