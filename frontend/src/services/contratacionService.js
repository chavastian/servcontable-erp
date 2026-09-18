import { crearUrlApi } from "./apiConfig";

export async function crearPagoFlow(datosContratacion) {
  const respuesta = await fetch(crearUrlApi("/pagos-flow/preferencia"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(datosContratacion),
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "No se pudo crear el link de pago");
  }

  return data;
}

export async function obtenerEstadoContratacion(id, token) {
  // El token de la orden de Flow autoriza la consulta: el id por si solo es un
  // entero consecutivo.
  const respuesta = await fetch(
    crearUrlApi(`/pagos-flow/contratacion/${id}?token=${encodeURIComponent(token || "")}`)
  );
  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "No se pudo obtener la contratacion");
  }

  return data.contratacion;
}
