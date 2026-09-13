import { obtenerToken } from "./authService";

import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function obtenerConfiguracionRemuneraciones(empresaId, periodo) {
  const token = obtenerToken();

  const respuesta = await fetch(
    `${API_URL}/configuracion-remuneraciones?empresa_id=${empresaId}&periodo=${periodo}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(
      data.error || "Error al obtener configuración de remuneraciones"
    );
  }

  return data;
}

export async function guardarConfiguracionRemuneraciones(datos) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/configuracion-remuneraciones`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(datos),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(
      data.error || "Error al guardar configuración de remuneraciones"
    );
  }

  return data;
}

export async function guardarAFP(datos) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/configuracion-remuneraciones/afp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(datos),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al guardar AFP del período");
  }

  return data;
}

export async function importarIndicadoresPrevisionales(empresaId, periodo, archivo) {
  const token = obtenerToken();
  const formData = new FormData();
  formData.append("archivo", archivo);

  const params = new URLSearchParams({
    empresa_id: empresaId,
    periodo,
  });

  const respuesta = await fetch(
    `${API_URL}/configuracion-remuneraciones/importar-indicadores?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al importar indicadores previsionales");
  }

  return data;
}

export async function eliminarAFP(id, empresaId) {
  const token = obtenerToken();

  const respuesta = await fetch(
    `${API_URL}/configuracion-remuneraciones/afp/${id}/eliminar`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        empresa_id: empresaId,
      }),
    }
  );

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al eliminar AFP");
  }

  return data;
}
