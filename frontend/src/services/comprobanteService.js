import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function crearComprobante(datosComprobante) {
  return peticion(`${API_URL}/comprobantes`, { metodo: "POST", cuerpo: datosComprobante, mensajeError: "Error al crear comprobante" });
}

export async function listarComprobantes(empresaId, filtros = {}) {
  const params = new URLSearchParams();

  params.append("empresa_id", empresaId);

  if (filtros.anio) {
    params.append("anio", filtros.anio);
  }

  if (filtros.periodo) {
    params.append("periodo", filtros.periodo);
  }

  if (filtros.fecha_desde) {
    params.append("fecha_desde", filtros.fecha_desde);
  }

  if (filtros.fecha_hasta) {
    params.append("fecha_hasta", filtros.fecha_hasta);
  }

  return peticion(`${API_URL}/comprobantes?${params.toString()}`, { mensajeError: "Error al listar comprobantes" });
}

export async function obtenerComprobante(id) {
  return peticion(`${API_URL}/comprobantes/${id}`, { mensajeError: "Error al obtener comprobante" });
}

export async function actualizarComprobante(id, datosComprobante) {
  return peticion(`${API_URL}/comprobantes/${id}`, { metodo: "PUT", cuerpo: datosComprobante, mensajeError: "Error al actualizar comprobante" });
}

export async function obtenerSiguienteNumeroComprobante(empresaId, tipo) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  params.append("tipo", tipo);

  return peticion(`${API_URL}/comprobantes/siguiente-numero?${params.toString()}`, { mensajeError: "Error al obtener siguiente numero" });
}
export async function anularComprobante(id, empresaId) {
  return peticion(`${API_URL}/comprobantes/${id}`, { metodo: "DELETE", cuerpo: { empresa_id: empresaId }, mensajeError: "Error al eliminar comprobante" });
}
