import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function obtenerConfiguracionRemuneraciones(empresaId, periodo) {
  return peticion(`${API_URL}/configuracion-remuneraciones?empresa_id=${empresaId}&periodo=${periodo}`, { mensajeError: "Error al obtener configuración de remuneraciones" });
}

export async function guardarConfiguracionRemuneraciones(datos) {
  return peticion(`${API_URL}/configuracion-remuneraciones`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al guardar configuración de remuneraciones" });
}

export async function guardarAFP(datos) {
  return peticion(`${API_URL}/configuracion-remuneraciones/afp`, { metodo: "POST", cuerpo: datos, mensajeError: "Error al guardar AFP del período" });
}

export async function importarIndicadoresPrevisionales(empresaId, periodo, archivo) {
  const formData = new FormData();
  formData.append("archivo", archivo);

  const params = new URLSearchParams({
    empresa_id: empresaId,
    periodo,
  });

  return peticion(`${API_URL}/configuracion-remuneraciones/importar-indicadores?${params.toString()}`, { metodo: "POST", formulario: formData, mensajeError: "Error al importar indicadores previsionales" });
}

export async function eliminarAFP(id, empresaId) {
  return peticion(`${API_URL}/configuracion-remuneraciones/afp/${id}/eliminar`, { metodo: "PUT", cuerpo: {
        empresa_id: empresaId,
      }, mensajeError: "Error al eliminar AFP" });
}
