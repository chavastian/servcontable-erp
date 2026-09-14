import { crearUrlApi } from "./apiConfig";
import { obtenerToken } from "./authService";
import {
  activarDemoSolicitud,
  actualizarSolicitudContacto,
  listarSolicitudesContacto,
} from "./solicitudesContactoService";

async function leerRespuesta(respuesta, mensajeError) {
  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || mensajeError);
  }

  return data;
}

export async function listarSolicitudesWeb() {
  const token = obtenerToken();

  const [contactosResultado, pagosResultado] = await Promise.allSettled([
    listarSolicitudesContacto(),
    fetch(crearUrlApi("/pagos-flow/contrataciones"), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }).then((respuesta) =>
      leerRespuesta(respuesta, "No se pudieron obtener las contrataciones web")
    ),
  ]);

  const contactos =
    contactosResultado.status === "fulfilled" ? contactosResultado.value : [];
  const pagos =
    pagosResultado.status === "fulfilled"
      ? pagosResultado.value?.solicitudes || []
      : [];

  if (contactosResultado.status === "rejected" && pagosResultado.status === "rejected") {
    throw new Error("No se pudieron obtener las solicitudes web.");
  }

  const solicitudes = [
    ...contactos.map(normalizarContacto),
    ...pagos.map(normalizarContratacion),
  ].sort((a, b) => new Date(b.creado_en || 0) - new Date(a.creado_en || 0));

  return {
    ok: true,
    solicitudes,
    advertencias: [
      contactosResultado.status === "rejected" ? contactosResultado.reason?.message : "",
      pagosResultado.status === "rejected" ? pagosResultado.reason?.message : "",
    ].filter(Boolean),
  };
}

function normalizarContacto(solicitud) {
  const estado = solicitud.estado || "pendiente";
  const origen = String(solicitud.origen || "").toLowerCase();
  const esPruebaGratis =
    origen.includes("prueba") || origen.includes("trial") || origen.includes("demo");
  const estadoGestion = ["contactado", "demo_activado"].includes(
    String(estado).toLowerCase()
  )
    ? "contactado"
    : "";

  return {
    ...solicitud,
    id: `contacto-${solicitud.id}`,
    id_original: solicitud.id,
    fuente: "contacto",
    tipo_solicitud: esPruebaGratis ? "Prueba gratis" : "Contacto",
    periodicidad: solicitud.interes || "Solicitud web",
    total: 0,
    monto_neto: 0,
    iva: 0,
    gestion: estadoGestion ? { estado: estadoGestion } : null,
    pago_flow: null,
  };
}

function normalizarContratacion(solicitud) {
  return {
    ...solicitud,
    id: `pago-${solicitud.id}`,
    id_original: solicitud.id,
    fuente: "flow",
    tipo_solicitud: "Contratacion",
  };
}

export async function marcarSolicitudContactada(solicitud) {
  if (solicitud?.fuente === "contacto") {
    return actualizarSolicitudContacto(solicitud.id_original, {
      estado: "contactado",
    });
  }

  const token = obtenerToken();
  const id = solicitud?.id_original || solicitud;

  const respuesta = await fetch(
    crearUrlApi(`/pagos-flow/contrataciones/${id}/gestion`),
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ estado_gestion: "contactado" }),
    }
  );

  return leerRespuesta(respuesta, "No se pudo actualizar la solicitud web");
}

export async function activarDemoDesdeSolicitud(solicitud) {
  return activarDemoSolicitud(solicitud.id_original, 30);
}
