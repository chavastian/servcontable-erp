import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function obtenerAnalisisCuentas({
  empresa_id,
  fecha_desde,
  fecha_hasta,
  cuenta_id = "",
}) {
  const params = new URLSearchParams();

  params.append("empresa_id", empresa_id);
  params.append("fecha_desde", fecha_desde);
  params.append("fecha_hasta", fecha_hasta);

  if (cuenta_id) {
    params.append("cuenta_id", cuenta_id);
  }

  return peticion(`${API_URL}/analisis-cuentas?${params.toString()}`, { mensajeError: "Error al obtener análisis de cuentas" });
}

export async function obtenerMovimientosCuentaAnalisis({
  empresa_id,
  fecha_desde,
  fecha_hasta,
  cuenta_id,
}) {
  const params = new URLSearchParams();

  params.append("empresa_id", empresa_id);
  params.append("fecha_desde", fecha_desde);
  params.append("fecha_hasta", fecha_hasta);
  params.append("cuenta_id", cuenta_id);

  return peticion(`${API_URL}/analisis-cuentas/movimientos?${params.toString()}`, { mensajeError: "Error al obtener movimientos de la cuenta" });
}
