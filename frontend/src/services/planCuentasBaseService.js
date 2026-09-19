import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function cargarPlanCuentasBase({ empresa_id, reemplazar = false }) {
  return peticion(`${API_URL}/plan-cuentas-base/cargar`, { metodo: "POST", cuerpo: {
      empresa_id,
      reemplazar,
    }, mensajeError: "Error al cargar plan de cuentas base" });
}