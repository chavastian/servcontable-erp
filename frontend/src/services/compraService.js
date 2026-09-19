import { obtenerToken } from "./authService";

import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function crearCompra(datosCompra) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/compras`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(datosCompra),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al registrar compra");
  }

  return data;
}

export async function listarCompras(empresaId, fechaDesde = "", fechaHasta = "") {
  const token = obtenerToken();

  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);

  if (fechaDesde) {
    params.append("fecha_desde", fechaDesde);
  }

  if (fechaHasta) {
    params.append("fecha_hasta", fechaHasta);
  }

  const respuesta = await fetch(`${API_URL}/compras?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al listar compras");
  }

  return data;
}

export async function importarComprasSII(
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

  const respuesta = await fetch(`${API_URL}/compras/importar-sii`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al importar compras SII");
  }

  return data;
}


/**
 * Editar regenera el asiento en el servidor; anular es logico y pide motivo.
 * Ninguna de las dos existia: una factura mal digitada solo se "arreglaba"
 * anulando su asiento, y el documento seguia sumando en el F29.
 */
export async function actualizarCompra(id, datos) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/compras/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(datos),
  });

  const data = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al actualizar compra");
  }

  return data;
}

export async function anularCompra(id, empresaId, motivo) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/compras/${id}/anular`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ empresa_id: empresaId, motivo }),
  });

  const data = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al anular compra");
  }

  return data;
}
