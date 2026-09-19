import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function listarBoletas(empresaId, fechaDesde = "", fechaHasta = "") {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);

  if (fechaDesde) params.append("fecha_desde", fechaDesde);
  if (fechaHasta) params.append("fecha_hasta", fechaHasta);

  return peticion(`${API_URL}/boletas?${params.toString()}`, { mensajeError: "Error al listar boletas" });
}

export async function importarBoletas(
  empresaId,
  archivo,
  generarComprobante = true,
  periodo = ""
) {
  const formData = new FormData();
  formData.append("empresa_id", empresaId);
  formData.append("generar_comprobante", generarComprobante ? "true" : "false");
  if (periodo) formData.append("periodo", periodo);
  formData.append("archivo", archivo);

  return peticion(`${API_URL}/boletas/importar-sii`, { metodo: "POST", formulario: formData, mensajeError: "Error al importar boletas SII" });
}
