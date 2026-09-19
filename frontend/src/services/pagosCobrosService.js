import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function listarDocumentosPendientes(empresaId, tipo) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  params.append("tipo", tipo);

  return peticion(`${API_URL}/pagos-cobros/documentos-pendientes?${params.toString()}`, { mensajeError: "Error al obtener documentos pendientes" });
}

export async function listarPagosCobros(
  empresaId,
  fechaDesde,
  fechaHasta,
  incluirAnulados = false
) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  params.append("fecha_desde", fechaDesde);
  params.append("fecha_hasta", fechaHasta);
  params.append("incluir_anulados", incluirAnulados ? "true" : "false");

  return peticion(`${API_URL}/pagos-cobros?${params.toString()}`, { mensajeError: "Error al listar pagos/cobros" });
}

export async function registrarPagoCobro(datos) {
  return peticion(`${API_URL}/pagos-cobros`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al registrar pago/cobro" });
}

export async function anularPagoCobro(id, empresaId) {
  return peticion(`${API_URL}/pagos-cobros/${id}/anular`, { metodo: "PUT", cuerpo: {
      empresa_id: empresaId,
    }, mensajeError: "Error al anular pago/cobro" });
}
