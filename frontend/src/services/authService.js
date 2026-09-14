import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;
const CLAVES_SESION = ["token", "usuario", "moduloActivo", "empresaActiva", "ejercicioActivo"];

function guardarDatoSesion(clave, valor) {
  sessionStorage.setItem(clave, valor);
  localStorage.removeItem(clave);
}

export function limpiarDatosPersistidos() {
  CLAVES_SESION.forEach((clave) => localStorage.removeItem(clave));
}

export function limpiarContextoSesion() {
  ["moduloActivo", "empresaActiva", "ejercicioActivo"].forEach((clave) => {
    sessionStorage.removeItem(clave);
    localStorage.removeItem(clave);
  });
}

export async function registrarUsuario(nombre, email, password) {
  const respuesta = await fetch(`${API_URL}/auth/registro`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ nombre, email, password }),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al registrar usuario");
  }

  return data;
}

export async function loginUsuario(email, password) {
  const respuesta = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al iniciar sesion");
  }

  guardarDatoSesion("token", data.token);
  guardarDatoSesion("usuario", JSON.stringify(data.usuario));

  return data;
}

export async function loginDemo(email, password) {
  const respuesta = await fetch(API_URL + "/auth/demo-login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al iniciar demo");
  }

  guardarDatoSesion("token", data.token);
  guardarDatoSesion("usuario", JSON.stringify(data.usuario));

  return data;
}

export async function obtenerSesionActualizada() {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al obtener sesion");
  }

  guardarDatoSesion("usuario", JSON.stringify(data.usuario));

  return data.usuario;
}

export async function listarUsuariosSistema(empresaId = "") {
  const token = obtenerToken();
  const params = new URLSearchParams();

  if (empresaId) {
    params.append("empresa_id", empresaId);
  }

  const url = `${API_URL}/auth/usuarios${
    params.toString() ? `?${params.toString()}` : ""
  }`;

  const respuesta = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al listar usuarios");
  }

  return data;
}

export async function crearUsuarioSistema(datosUsuario) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/auth/usuarios`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(datosUsuario),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al crear usuario");
  }

  return data;
}

export async function crearPruebaGratis(datos) {
  const respuesta = await fetch(`${API_URL}/contacto/prueba-gratis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(datos),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "No se pudo crear la prueba gratis");
  }

  if (data.token && data.usuario) {
    guardarSesionAutenticada(data.token, data.usuario);
  }

  return data;
}

export function guardarSesionAutenticada(token, usuario) {
  guardarDatoSesion("token", token);
  guardarDatoSesion("usuario", JSON.stringify(usuario));
}

export async function actualizarUsuarioSistema(id, datosUsuario) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/auth/usuarios/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(datosUsuario),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al actualizar usuario");
  }

  return data;
}

export async function cambiarEstadoUsuario(id, activo) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/auth/usuarios/${id}/estado`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ activo }),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al cambiar estado del usuario");
  }

  return data;
}

export async function resetearPasswordUsuario(id, password) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}/auth/usuarios/${id}/password`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ password }),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al actualizar contrasena");
  }

  return data;
}

export async function solicitarRecuperacionPassword(email) {
  const respuesta = await fetch(`${API_URL}/auth/recuperar-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al solicitar recuperacion de contrasena");
  }

  return data;
}

export async function resetearPasswordConToken(token, password) {
  const respuesta = await fetch(`${API_URL}/auth/resetear-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, password }),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al actualizar contrasena");
  }

  return data;
}

export function obtenerUsuarioActual() {
  limpiarDatosPersistidos();

  const usuarioGuardado = sessionStorage.getItem("usuario");

  if (!usuarioGuardado) {
    return null;
  }

  try {
    return JSON.parse(usuarioGuardado);
  } catch {
    cerrarSesion();
    return null;
  }
}

export function obtenerToken() {
  limpiarDatosPersistidos();
  return sessionStorage.getItem("token");
}

export function cerrarSesion() {
  CLAVES_SESION.forEach((clave) => {
    sessionStorage.removeItem(clave);
    localStorage.removeItem(clave);
  });
}
