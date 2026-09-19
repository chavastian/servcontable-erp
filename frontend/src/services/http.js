/**
 * Un solo camino para hablar con la API.
 *
 * Cada servicio repetía lo mismo: leer el token, armar cabeceras, hacer
 * fetch, leer JSON y lanzar con `data.error`. 129 veces, con 121 lecturas de
 * JSON sin captura: un 502 del proxy devolvía HTML y el usuario veía
 * "Unexpected token <". Aquí se lee el cuerpo como texto, se interpreta si se
 * puede, y el mensaje de error siempre es legible.
 */

import { obtenerToken } from "./authService";
import { API_BASE_URL, crearUrlApi } from "./apiConfig";

export class ErrorHttp extends Error {
  constructor(mensaje, estado = 0, datos = {}) {
    super(mensaje);
    this.name = "ErrorHttp";
    this.estado = estado;
    this.datos = datos;
  }
}

function urlDe(ruta) {
  const texto = String(ruta || "");

  if (/^https?:\/\//i.test(texto) || texto.startsWith(API_BASE_URL)) return texto;

  return crearUrlApi(texto);
}

function interpretar(texto) {
  if (!texto) return {};

  try {
    return JSON.parse(texto);
  } catch {
    return {};
  }
}

function mensajeDeError(respuesta, datos, mensajeError) {
  if (datos && typeof datos.error === "string" && datos.error) return datos.error;
  if (datos && typeof datos.mensaje === "string" && datos.mensaje) return datos.mensaje;

  if (respuesta.status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión.";
  if (respuesta.status === 403) return "No tienes permiso para esta acción.";
  if (respuesta.status === 404) return mensajeError || "No se encontró lo que pediste.";
  if (respuesta.status === 413) return "El archivo es demasiado grande.";
  if (respuesta.status === 429) return "Demasiadas solicitudes seguidas. Espera un momento.";
  if (respuesta.status >= 500) return "El servidor no respondió correctamente. Intenta de nuevo en unos segundos.";

  return mensajeError || "Error de comunicación con el servidor";
}

/**
 * Hace una petición autenticada y devuelve el JSON de la respuesta.
 *
 * - `cuerpo`: objeto que se envía como JSON.
 * - `formulario`: un FormData (archivos); no se fija Content-Type.
 * - `crudo`: devuelve la Response sin leerla (descargas). Los errores se
 *   leen igual.
 * - `mensajeError`: texto de respaldo cuando el servidor no manda `error`.
 */
export async function peticion(
  ruta,
  { metodo = "GET", cuerpo, formulario, cabeceras = {}, mensajeError, crudo = false } = {}
) {
  const token = obtenerToken();
  const headers = { ...cabeceras };

  if (token) headers.Authorization = `Bearer ${token}`;

  let body;

  if (formulario) {
    body = formulario;
  } else if (cuerpo !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(cuerpo);
  }

  let respuesta;

  try {
    respuesta = await fetch(urlDe(ruta), { method: metodo, headers, body });
  } catch {
    throw new ErrorHttp("No hay conexión con el servidor. Revisa tu red e intenta de nuevo.", 0);
  }

  if (crudo) {
    if (!respuesta.ok) {
      const datos = interpretar(await respuesta.text().catch(() => ""));
      throw new ErrorHttp(mensajeDeError(respuesta, datos, mensajeError), respuesta.status, datos);
    }

    return respuesta;
  }

  const datos = interpretar(await respuesta.text().catch(() => ""));

  if (!respuesta.ok) {
    throw new ErrorHttp(mensajeDeError(respuesta, datos, mensajeError), respuesta.status, datos);
  }

  return datos;
}

export const http = {
  get: (ruta, opciones) => peticion(ruta, { ...opciones, metodo: "GET" }),
  post: (ruta, cuerpo, opciones) => peticion(ruta, { ...opciones, metodo: "POST", cuerpo }),
  put: (ruta, cuerpo, opciones) => peticion(ruta, { ...opciones, metodo: "PUT", cuerpo }),
  patch: (ruta, cuerpo, opciones) => peticion(ruta, { ...opciones, metodo: "PATCH", cuerpo }),
  delete: (ruta, cuerpo, opciones) => peticion(ruta, { ...opciones, metodo: "DELETE", cuerpo }),
};
