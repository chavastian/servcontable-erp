import { obtenerToken } from "./authService";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function listarMovimientosConciliacion(
  empresaId,
  fechaDesde = "",
  fechaHasta = ""
) {
  const token = obtenerToken();
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  if (fechaDesde) params.append("fecha_desde", fechaDesde);
  if (fechaHasta) params.append("fecha_hasta", fechaHasta);

  const respuesta = await fetch(
    `${API_URL}/conciliacion-bancaria?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al listar conciliacion bancaria");
  }

  return data;
}

export async function importarCartolaBancaria(empresaId, archivo) {
  const token = obtenerToken();
  const formData = new FormData();
  formData.append("empresa_id", empresaId);
  formData.append("archivo", archivo);

  const respuesta = await fetch(`${API_URL}/conciliacion-bancaria/importar`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al importar cartola bancaria");
  }

  return data;
}

export async function actualizarEstadoConciliacion(
  id,
  empresaId,
  estado,
  comprobanteId = null
) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/conciliacion-bancaria/${id}/estado`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      empresa_id: empresaId,
      estado,
      // Con que asiento quedo conciliado, cuando se sabe. Sin esto, marcar un
      // movimiento como conciliado no deja rastro de contra que se concilio.
      comprobante_id: comprobanteId,
    }),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al actualizar movimiento bancario");
  }

  return data;
}
