import { peticion } from "./http";
import { crearUrlApi } from "./apiConfig";

export async function crearPagoFlow(datosContratacion) {
  return peticion(crearUrlApi("/pagos-flow/preferencia"), { metodo: "POST", cuerpo: datosContratacion, mensajeError: "No se pudo crear el link de pago" });
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
