import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function listarTramosImpuestoUnico(empresaId, periodo) {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  params.append("periodo", periodo);

  return peticion(`${API_URL}/impuesto-unico?${params.toString()}`, { mensajeError: "Error al listar tramos de impuesto único" });
}

export async function guardarTramoImpuestoUnico(datos) {
  return peticion(`${API_URL}/impuesto-unico`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al guardar tramo de impuesto único" });
}

export async function eliminarTramoImpuestoUnico(id, empresaId) {
  return peticion(`${API_URL}/impuesto-unico/${id}/eliminar`, { metodo: "PUT", cuerpo: {
      empresa_id: empresaId,
    }, mensajeError: "Error al eliminar tramo de impuesto único" });
}

export async function eliminarTramosPeriodo(empresaId, periodo) {
  return peticion(`${API_URL}/impuesto-unico/periodo/eliminar`, { metodo: "PUT", cuerpo: {
      empresa_id: empresaId,
      periodo,
    }, mensajeError: "Error al eliminar tramos del período" });
}