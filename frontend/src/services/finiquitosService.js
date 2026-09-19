import { obtenerToken } from "./authService";

import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function listarFiniquitos(empresaId, periodo = "") {
  const token = obtenerToken();

  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);

  if (periodo) {
    params.append("periodo", periodo);
  }

  const respuesta = await fetch(`${API_URL}/finiquitos?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al listar finiquitos");
  }

  return data;
}

export async function crearFiniquito(datos) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/finiquitos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(datos),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al crear finiquito");
  }

  return data;
}

/**
 * Cálculo completo del finiquito en el servidor, sin guardarlo.
 */
export async function calcularFiniquito(datos) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/finiquitos/calcular`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(datos),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al calcular finiquito");
  }

  return data;
}

export async function calcularVacacionesFiniquito({
  empresaId,
  trabajadorId,
  fechaTermino,
  sueldoBase,
}) {
  const token = obtenerToken();
  const params = new URLSearchParams();

  params.append("empresa_id", empresaId);
  params.append("trabajador_id", trabajadorId);
  params.append("fecha_termino", fechaTermino);

  if (sueldoBase !== undefined && sueldoBase !== null && sueldoBase !== "") {
    params.append("sueldo_base", sueldoBase);
  }

  const respuesta = await fetch(
    `${API_URL}/finiquitos/calcular-vacaciones?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al calcular vacaciones finiquito");
  }

  return data;
}

export async function obtenerFiniquito(id, empresaId) {
  const token = obtenerToken();

  const respuesta = await fetch(
    `${API_URL}/finiquitos/${id}?empresa_id=${empresaId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al obtener finiquito");
  }

  return data;
}

export async function eliminarFiniquito(id, empresaId) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/finiquitos/${id}`, {
    method: "DELETE",
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
    throw new Error(data.error || "Error al eliminar finiquito");
  }

  return data;
}

export async function contabilizarFiniquito(id, empresaId) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/finiquitos/${id}/contabilizar`, {
    method: "POST",
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
    throw new Error(data.error || "Error al contabilizar finiquito");
  }

  return data;
}

export async function pagarFiniquito(id, datos) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/finiquitos/${id}/pagar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(datos),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al registrar pago de finiquito");
  }

  return data;
}
