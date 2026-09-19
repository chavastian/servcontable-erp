/**
 * Interceptor de las respuestas de la API.
 *
 * Los 43 servicios del frontend llaman a `fetch` directamente, así que en lugar
 * de tocarlos uno por uno se envuelve `fetch` una sola vez al arrancar.
 *
 * Resuelve dos situaciones que antes dejaban al usuario mirando errores sueltos:
 *
 * - **402, suscripción no vigente.** El backend responde así cuando la
 *   suscripción venció. Si eso pasa a mitad de sesión, cada pantalla mostraba su
 *   propio error y la persona no entendía qué ocurría ni cómo resolverlo.
 * - **401 con la sesión cerrada.** Ahora el servidor puede invalidar un token
 *   cuando cambia la contraseña o se desactiva la cuenta. Sin esto, la
 *   aplicación seguiría reintentando con un token muerto.
 *
 * El interceptor no decide qué mostrar: avisa con un evento y la aplicación
 * reacciona. Así la lógica de pantallas queda en un solo lugar.
 */

export const EVENTO_SUSCRIPCION_BLOQUEADA = "servcontable:suscripcion-bloqueada";
export const EVENTO_SESION_CERRADA = "servcontable:sesion-cerrada";

let instalado = false;

function esLlamadaAlaApi(entrada) {
  const url = typeof entrada === "string" ? entrada : entrada?.url || "";
  return url.includes("/api/") || url.startsWith("/api");
}

/**
 * Lee el cuerpo sin consumirlo para quien llamó: se clona la respuesta.
 */
async function leerMotivo(respuesta) {
  try {
    const datos = await respuesta.clone().json();
    return datos?.error || datos?.mensaje || "";
  } catch {
    return "";
  }
}

export function instalarInterceptorHttp() {
  if (instalado || typeof window === "undefined" || !window.fetch) {
    return;
  }

  const fetchOriginal = window.fetch.bind(window);

  window.fetch = async (entrada, opciones) => {
    const respuesta = await fetchOriginal(entrada, opciones);

    if (!esLlamadaAlaApi(entrada)) {
      return respuesta;
    }

    if (respuesta.status === 402) {
      const motivo = await leerMotivo(respuesta);

      window.dispatchEvent(
        new CustomEvent(EVENTO_SUSCRIPCION_BLOQUEADA, {
          detail: { motivo },
        })
      );
    }

    if (respuesta.status === 401) {
      const motivo = await leerMotivo(respuesta);

      // Se distingue el token vencido o revocado de un login fallido: en el
      // login un 401 es una contraseña equivocada y no debe cerrar nada.
      const esLogin = String(entrada).includes("/auth/login");

      if (!esLogin) {
        window.dispatchEvent(
          new CustomEvent(EVENTO_SESION_CERRADA, { detail: { motivo } })
        );
      }
    }

    return respuesta;
  };

  instalado = true;
}
