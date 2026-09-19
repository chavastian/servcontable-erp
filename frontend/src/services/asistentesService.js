/**
 * Las seis consultas nuevas: panel del estudio, cierre mensual, calce bancario,
 * sugerencia de cuenta, calendario tributario y flujo de caja.
 *
 * Van juntas porque comparten la misma forma: leen, no escriben, y la única que
 * escribe (aplicar sugerencias) lo hace sobre lo que la persona confirmó.
 */

import { obtenerToken } from "./authService";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

async function pedir(ruta, parametros = {}) {
  const token = obtenerToken();
  const params = new URLSearchParams();

  Object.entries(parametros).forEach(([clave, valor]) => {
    if (valor !== undefined && valor !== null && valor !== "") {
      params.append(clave, valor);
    }
  });

  const consulta = params.toString();
  const respuesta = await fetch(`${API_URL}${ruta}${consulta ? `?${consulta}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    throw new Error(datos.error || "No se pudo obtener la información");
  }

  return datos;
}

async function enviar(ruta, cuerpo) {
  const token = obtenerToken();

  const respuesta = await fetch(`${API_URL}${ruta}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cuerpo),
  });

  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    throw new Error(datos.error || "No se pudo guardar el cambio");
  }

  return datos;
}

export function obtenerPanelEstudio(periodo) {
  return pedir("/panel-estudio", { periodo });
}

export function obtenerCierreMensual(empresaId, periodo) {
  return pedir("/cierre-mensual", { empresa_id: empresaId, periodo });
}

export function obtenerEstadoDelPeriodo(empresaId, periodo) {
  return pedir("/cierre-mensual/estado", { empresa_id: empresaId, periodo });
}

export function obtenerSugerenciasDeCalce(empresaId, periodo) {
  return pedir("/conciliacion-bancaria/sugerencias", {
    empresa_id: empresaId,
    periodo,
  });
}

export function obtenerSugerenciasDeCuenta(empresaId, periodo) {
  return pedir("/sugerencias-cuenta", { empresa_id: empresaId, periodo });
}

export function obtenerSugerenciaPorRut(empresaId, rut, libro = "compras") {
  return pedir("/sugerencias-cuenta/por-rut", { empresa_id: empresaId, rut, libro });
}

export function aplicarSugerenciasDeCuenta(empresaId, documentos) {
  return enviar("/sugerencias-cuenta/aplicar", {
    empresa_id: empresaId,
    documentos,
  });
}

export function obtenerCalendarioTributario(periodo, opciones = {}) {
  return pedir("/calendario-tributario", {
    periodo,
    empresa_id: opciones.empresaId,
    facturador_electronico: opciones.facturadorElectronico,
    previred_electronico: opciones.previredElectronico,
  });
}

export function obtenerFlujoCaja(empresaId, { plazoDias, semanas } = {}) {
  return pedir("/flujo-caja", {
    empresa_id: empresaId,
    plazo_dias: plazoDias,
    semanas,
  });
}
