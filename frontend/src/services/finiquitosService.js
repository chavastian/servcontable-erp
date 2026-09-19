import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function listarFiniquitos(empresaId, periodo = "") {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);

  if (periodo) {
    params.append("periodo", periodo);
  }

  return peticion(`${API_URL}/finiquitos?${params.toString()}`, { mensajeError: "Error al listar finiquitos" });
}

export async function crearFiniquito(datos) {
  return peticion(`${API_URL}/finiquitos`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al crear finiquito" });
}

/**
 * Cálculo completo del finiquito en el servidor, sin guardarlo.
 */
export async function calcularFiniquito(datos) {
  return peticion(`${API_URL}/finiquitos/calcular`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al calcular finiquito" });
}

export async function calcularVacacionesFiniquito({
  empresaId,
  trabajadorId,
  fechaTermino,
  sueldoBase,
}) {
  const params = new URLSearchParams();

  params.append("empresa_id", empresaId);
  params.append("trabajador_id", trabajadorId);
  params.append("fecha_termino", fechaTermino);

  if (sueldoBase !== undefined && sueldoBase !== null && sueldoBase !== "") {
    params.append("sueldo_base", sueldoBase);
  }

  return peticion(`${API_URL}/finiquitos/calcular-vacaciones?${params.toString()}`, { mensajeError: "Error al calcular vacaciones finiquito" });
}

export async function obtenerFiniquito(id, empresaId) {
  return peticion(`${API_URL}/finiquitos/${id}?empresa_id=${empresaId}`, { mensajeError: "Error al obtener finiquito" });
}

export async function eliminarFiniquito(id, empresaId) {
  return peticion(`${API_URL}/finiquitos/${id}`, { metodo: "DELETE", cuerpo: {
      empresa_id: empresaId,
    }, mensajeError: "Error al eliminar finiquito" });
}

export async function contabilizarFiniquito(id, empresaId) {
  return peticion(`${API_URL}/finiquitos/${id}/contabilizar`, { metodo: "POST", cuerpo: {
      empresa_id: empresaId,
    }, mensajeError: "Error al contabilizar finiquito" });
}

export async function pagarFiniquito(id, datos) {
  return peticion(`${API_URL}/finiquitos/${id}/pagar`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al registrar pago de finiquito" });
}
