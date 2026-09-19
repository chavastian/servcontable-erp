import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function calcularLiquidacion(datos) {
  return peticion(`${API_URL}/liquidaciones/calcular`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al calcular liquidación" });
}

export async function guardarLiquidacion(datos) {
  return peticion(`${API_URL}/liquidaciones`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al guardar liquidación" });
}

export async function actualizarLiquidacion(id, datos) {
  return peticion(`${API_URL}/liquidaciones/${id}`, { metodo: "PUT", cuerpo: datos, mensajeError: "Error al actualizar liquidacion" });
}

export async function eliminarLiquidacion(id, empresaId) {
  return peticion(`${API_URL}/liquidaciones/${id}/eliminar`, { metodo: "PUT", cuerpo: {
      empresa_id: empresaId,
    }, mensajeError: "Error al eliminar liquidacion" });
}

export async function listarLiquidaciones(empresaId, periodo = "") {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);

  if (periodo) {
    params.append("periodo", periodo);
  }

  return peticion(`${API_URL}/liquidaciones?${params.toString()}`, { mensajeError: "Error al listar liquidaciones" });
}

export async function contabilizarLiquidaciones(empresaId, periodo) {
  return peticion(`${API_URL}/liquidaciones/contabilizar`, { metodo: "POST", cuerpo: {
      empresa_id: empresaId,
      periodo,
    }, mensajeError: "Error al contabilizar liquidaciones" });
}

/**
 * Descarga el Libro de Remuneraciones Electrónico del período como CSV.
 * Devuelve el Blob; la página decide cómo ofrecerlo.
 */
export async function descargarLre(empresaId, periodo) {
  const params = new URLSearchParams({ empresa_id: empresaId, periodo });
  const respuesta = await peticion(`${API_URL}/liquidaciones/lre?${params.toString()}`, {
    crudo: true,
    mensajeError: "Error al exportar el libro electrónico",
  });

  return respuesta.blob();
}
