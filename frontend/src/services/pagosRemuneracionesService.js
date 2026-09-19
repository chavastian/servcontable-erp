import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function obtenerPagosRemuneraciones(empresaId, periodo) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  params.append("periodo", periodo);

  return peticion(`${API_URL}/pagos-remuneraciones?${params.toString()}`, { mensajeError: "Error al obtener pagos remuneraciones" });
}

export async function registrarPagoRemuneracion(datos) {
  return peticion(`${API_URL}/pagos-remuneraciones`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al registrar pago remuneración" });
}

export async function anularPagoRemuneracion(id, empresaId) {
  return peticion(`${API_URL}/pagos-remuneraciones/${id}/anular`, { metodo: "PUT", cuerpo: {
        empresa_id: empresaId,
      }, mensajeError: "Error al anular pago remuneración" });
}