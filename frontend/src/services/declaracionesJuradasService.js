/**
 * Declaraciones juradas anuales (módulo 10) y sus certificados.
 *
 * El año que se pide es el comercial: la declaración del AT 2027 se arma con
 * el año comercial 2026.
 */

import { peticion } from "./http";

export async function obtenerDeclaracion(tipo, empresaId, anio) {
  const params = new URLSearchParams({ empresa_id: empresaId, anio });

  return peticion(`/declaraciones-juradas/${tipo}?${params.toString()}`, {
    mensajeError: `Error al obtener la declaración jurada ${tipo}`,
  });
}

export async function descargarDeclaracion(tipo, empresaId, anio) {
  const params = new URLSearchParams({ empresa_id: empresaId, anio, tipo });

  const respuesta = await peticion(`/declaraciones-juradas/exportar?${params.toString()}`, {
    crudo: true,
    mensajeError: `Error al exportar la declaración jurada ${tipo}`,
  });

  return respuesta.blob();
}

export async function obtenerCertificado({ tipo, empresaId, anio, rut }) {
  const params = new URLSearchParams({ empresa_id: empresaId, anio, tipo, rut });

  return peticion(`/declaraciones-juradas/certificado?${params.toString()}`, {
    mensajeError: "Error al obtener el certificado",
  });
}
