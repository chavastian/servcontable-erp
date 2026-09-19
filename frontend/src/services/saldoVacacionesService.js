import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function obtenerSaldoVacaciones({
  empresa_id,
  periodo,
  trabajador_id = "",
}) {
  const params = new URLSearchParams();

  params.append("empresa_id", empresa_id);
  params.append("periodo", periodo);

  if (trabajador_id) {
    params.append("trabajador_id", trabajador_id);
  }

  return peticion(`${API_URL}/saldo-vacaciones?${params.toString()}`, { mensajeError: "Error al obtener saldo de vacaciones" });
}

export async function obtenerHistorialVacacionesTrabajador({
  empresa_id,
  trabajador_id,
}) {
  const params = new URLSearchParams();

  params.append("empresa_id", empresa_id);
  params.append("trabajador_id", trabajador_id);

  return peticion(`${API_URL}/saldo-vacaciones/historial?${params.toString()}`, { mensajeError: "Error al obtener historial de vacaciones" });
}