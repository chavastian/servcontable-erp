import { obtenerToken } from "./authService";

import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function crearVenta(datosVenta) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/ventas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(datosVenta),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al registrar venta");
  }

  return data;
}

export async function listarVentas(empresaId, fechaDesde = "", fechaHasta = "") {
  const token = obtenerToken();

  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);

  if (fechaDesde) {
    params.append("fecha_desde", fechaDesde);
  }

  if (fechaHasta) {
    params.append("fecha_hasta", fechaHasta);
  }

  const respuesta = await fetch(`${API_URL}/ventas?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al listar ventas");
  }

  return data;
}

export async function importarVentasSII(
  empresaId,
  archivo,
  generarComprobante = true
) {
  const token = obtenerToken();

  const formData = new FormData();
  formData.append("empresa_id", empresaId);
  formData.append(
  "generar_comprobante",
  generarComprobante ? "true" : "false"
  );
  formData.append("archivo", archivo);

  const respuesta = await fetch(`${API_URL}/ventas/importar-sii`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al importar ventas SII");
  }

  return data;
}


/**
 * Editar regenera el asiento en el servidor; anular es logico y pide motivo.
 * Ninguna de las dos existia: una factura mal digitada solo se "arreglaba"
 * anulando su asiento, y el documento seguia sumando en el F29.
 */
export async function actualizarVenta(id, datos) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/ventas/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(datos),
  });

  const data = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al actualizar venta");
  }

  return data;
}

export async function anularVenta(id, empresaId, motivo) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/ventas/${id}/anular`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ empresa_id: empresaId, motivo }),
  });

  const data = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al anular venta");
  }

  return data;
}
