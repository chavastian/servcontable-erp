/**
 * Importación de boletas de honorarios electrónicas desde el archivo del SII
 * (módulo 11 de la revisión del 19-09-2026).
 *
 * El flujo tiene dos pasos a propósito: primero `revisarBhe`, que no escribe
 * nada y dice qué columnas reconoció y qué haría; después `importarBhe`. Un
 * importador que escribe directo es cómo se llega a un libro de honorarios con
 * montos en cero sin que nadie se dé cuenta.
 */

import { peticion } from "./http";

export async function obtenerCamposBhe() {
  return peticion("/honorarios/bhe/campos", {
    mensajeError: "Error al obtener los campos del importador",
  });
}

function formularioDe(empresaId, archivo, mapeo) {
  const formulario = new FormData();

  formulario.append("empresa_id", String(empresaId));
  formulario.append("archivo", archivo);

  // El mapeo manual solo se manda si la persona corrigió algo: mandarlo vacío
  // haría que el detector automático se saltara.
  if (mapeo && Object.keys(mapeo).length > 0) {
    formulario.append("mapeo", JSON.stringify(mapeo));
  }

  return formulario;
}

export async function revisarBhe({ empresaId, archivo, mapeo }) {
  return peticion("/honorarios/bhe/revisar", {
    metodo: "POST",
    formulario: formularioDe(empresaId, archivo, mapeo),
    mensajeError: "Error al revisar el archivo de boletas",
  });
}

export async function importarBhe({ empresaId, archivo, mapeo }) {
  return peticion("/honorarios/bhe/importar", {
    metodo: "POST",
    formulario: formularioDe(empresaId, archivo, mapeo),
    mensajeError: "Error al importar las boletas",
  });
}
