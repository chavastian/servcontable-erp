import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function listarCuentas(empresaId, incluirInactivas = false, opciones = {}) {
  if (typeof incluirInactivas === "object" && incluirInactivas !== null) {
    opciones = incluirInactivas;
    incluirInactivas = Boolean(opciones.incluirInactivas);
  }

  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  if (incluirInactivas) {
    params.append("incluir_inactivas", "true");
  }
  if (opciones.buscar) {
    params.append("buscar", opciones.buscar);
  }
  if (opciones.tipos) {
    params.append(
      "tipos",
      Array.isArray(opciones.tipos) ? opciones.tipos.join(",") : opciones.tipos
    );
  }
  if (opciones.soloImputables) {
    params.append("solo_imputables", "true");
  }
  if (opciones.limit) {
    params.append("limit", opciones.limit);
  }

  return peticion(`${API_URL}/cuentas?${params.toString()}`, { mensajeError: "Error al listar cuentas" });
}

export async function crearCuenta(datosCuenta) {
  return peticion(`${API_URL}/cuentas`, { metodo: "POST", cuerpo: datosCuenta, mensajeError: "Error al crear cuenta" });
}

export async function cargarPlanBase(empresaId) {
  return peticion(`${API_URL}/cuentas/plan-base`, { metodo: "POST", cuerpo: { empresa_id: empresaId }, mensajeError: "Error al cargar plan base" });
}

export async function actualizarCuenta(id, datos) {
  return peticion(`${API_URL}/cuentas/${id}`, { metodo: "PUT", cuerpo: datos, mensajeError: "Error al actualizar cuenta" });
}

export async function cambiarEstadoCuenta(id, empresaId, activo) {
  return peticion(`${API_URL}/cuentas/${id}/estado`, { metodo: "PATCH", cuerpo: {
      empresa_id: empresaId,
      activo,
    }, mensajeError: "Error al cambiar estado de la cuenta" });
}
