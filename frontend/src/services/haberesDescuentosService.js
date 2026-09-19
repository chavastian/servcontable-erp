import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function listarHaberesDescuentos(
  empresaId,
  periodo,
  trabajadorId = "",
  incluirRecurrentes = true
) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  params.append("periodo", periodo);
  params.append("incluir_recurrentes", incluirRecurrentes ? "true" : "false");

  if (trabajadorId) {
    params.append("trabajador_id", trabajadorId);
  }

  return peticion(`${API_URL}/haberes-descuentos?${params.toString()}`, { mensajeError: "Error al listar haberes/descuentos" });
}

export async function crearHaberDescuento(datos) {
  return peticion(`${API_URL}/haberes-descuentos`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al crear haber/descuento" });
}

export async function actualizarHaberDescuento(id, datos) {
  return peticion(`${API_URL}/haberes-descuentos/${id}`, { metodo: "PUT", cuerpo: datos, mensajeError: "Error al actualizar haber/descuento" });
}

export async function cambiarRecurrenteHaberDescuento(id, empresaId, recurrente) {
  const body = { empresa_id: empresaId };
  if (typeof recurrente === "boolean") {
    body.recurrente = recurrente;
  }

  return peticion(`${API_URL}/haberes-descuentos/${id}/recurrente`, { metodo: "PUT", cuerpo: body, mensajeError: "Error al actualizar recurrencia" });
}

export async function obtenerResumenHaberesLiquidacion(
  empresaId,
  trabajadorId,
  periodo,
  incluirRecurrentes = true
) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  params.append("trabajador_id", trabajadorId);
  params.append("periodo", periodo);
  params.append("incluir_recurrentes", incluirRecurrentes ? "true" : "false");

  return peticion(`${API_URL}/haberes-descuentos/resumen-liquidacion?${params.toString()}`, { mensajeError: "Error al obtener resumen de haberes/descuentos" });
}

export async function eliminarHaberDescuento(id, empresaId) {
  return peticion(`${API_URL}/haberes-descuentos/${id}/eliminar`, { metodo: "PUT", cuerpo: {
      empresa_id: empresaId,
    }, mensajeError: "Error al eliminar haber/descuento" });
}
