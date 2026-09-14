import { API_BASE_URL } from "./apiConfig";
import { obtenerToken } from "./authService";

const API_URL = `${API_BASE_URL}/admin-suscripciones`;

async function leerRespuesta(respuesta) {
  try {
    return await respuesta.json();
  } catch {
    return {};
  }
}

async function request(ruta, opciones = {}) {
  const token = obtenerToken();
  const respuesta = await fetch(`${API_URL}${ruta}`, {
    ...opciones,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opciones.headers || {}),
    },
  });
  const data = await leerRespuesta(respuesta);

  if (!respuesta.ok) {
    throw new Error(data.error || "No se pudo completar la operacion.");
  }

  return data;
}

export function obtenerDashboardSuscripciones() {
  return request("/dashboard");
}

export function listarClientesSuscripciones(filtros = {}) {
  const params = new URLSearchParams();

  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
      params.append(clave, valor);
    }
  });

  return request(`/clientes${params.toString() ? `?${params.toString()}` : ""}`);
}

export function obtenerClienteSuscripcion(id) {
  return request(`/clientes/${id}`);
}

export function ejecutarAccionSuscripcion(id, datos) {
  return request(`/clientes/${id}/acciones`, {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function registrarPagoSuscripcion(id, datos) {
  return request(`/clientes/${id}/pagos`, {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function listarPlanesSuscripcion() {
  return request("/planes");
}

export function guardarPlanSuscripcion(plan) {
  const id = plan.id || "";
  return request(id ? `/planes/${id}` : "/planes", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(plan),
  });
}

export function obtenerConfiguracionSuscripciones() {
  return request("/configuracion");
}

export function guardarConfiguracionSuscripciones(configuracion) {
  return request("/configuracion", {
    method: "PATCH",
    body: JSON.stringify({ configuracion }),
  });
}

export function listarAuditoriaSuscripciones() {
  return request("/auditoria");
}

export function listarNotificacionesSuscripciones() {
  return request("/notificaciones");
}

export function listarSolicitudesWebSuscripciones(filtros = {}) {
  const params = new URLSearchParams();

  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
      params.append(clave, valor);
    }
  });

  return request(`/solicitudes-web${params.toString() ? `?${params.toString()}` : ""}`);
}

export function obtenerDetalleSolicitudWebSuscripcion(tipo, id) {
  return request(`/solicitudes-web/${tipo}/${id}`);
}

export function ejecutarAccionSolicitudWebSuscripcion(tipo, id, datos) {
  return request(`/solicitudes-web/${tipo}/${id}/acciones`, {
    method: "POST",
    body: JSON.stringify(datos),
  });
}
