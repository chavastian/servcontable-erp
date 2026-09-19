import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function listarMovimientosConciliacion(
  empresaId,
  fechaDesde = "",
  fechaHasta = ""
) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  if (fechaDesde) params.append("fecha_desde", fechaDesde);
  if (fechaHasta) params.append("fecha_hasta", fechaHasta);

  return peticion(`${API_URL}/conciliacion-bancaria?${params.toString()}`, { mensajeError: "Error al listar conciliacion bancaria" });
}

export async function importarCartolaBancaria(empresaId, archivo) {
  const formData = new FormData();
  formData.append("empresa_id", empresaId);
  formData.append("archivo", archivo);

  return peticion(`${API_URL}/conciliacion-bancaria/importar`, { metodo: "POST", formulario: formData, mensajeError: "Error al importar cartola bancaria" });
}

export async function actualizarEstadoConciliacion(
  id,
  empresaId,
  estado,
  comprobanteId = null
) {
  return peticion(`${API_URL}/conciliacion-bancaria/${id}/estado`, { metodo: "PUT", cuerpo: {
      empresa_id: empresaId,
      estado,
      // Con que asiento quedo conciliado, cuando se sabe. Sin esto, marcar un
      // movimiento como conciliado no deja rastro de contra que se concilio.
      comprobante_id: comprobanteId,
    }, mensajeError: "Error al actualizar movimiento bancario" });
}
