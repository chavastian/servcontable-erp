import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function crearCompra(datosCompra) {
  return peticion(`${API_URL}/compras`, { metodo: "POST", cuerpo: datosCompra, mensajeError: "Error al registrar compra" });
}

export async function listarCompras(empresaId, fechaDesde = "", fechaHasta = "") {
  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);

  if (fechaDesde) {
    params.append("fecha_desde", fechaDesde);
  }

  if (fechaHasta) {
    params.append("fecha_hasta", fechaHasta);
  }

  return peticion(`${API_URL}/compras?${params.toString()}`, { mensajeError: "Error al listar compras" });
}

export async function importarComprasSII(
  empresaId,
  archivo,
  generarComprobante = true
) {
  const formData = new FormData();
  formData.append("empresa_id", empresaId);
  formData.append(
    "generar_comprobante",
    generarComprobante ? "true" : "false"
  );
  formData.append("archivo", archivo);

  return peticion(`${API_URL}/compras/importar-sii`, { metodo: "POST", formulario: formData, mensajeError: "Error al importar compras SII" });
}


/**
 * Editar regenera el asiento en el servidor; anular es logico y pide motivo.
 * Ninguna de las dos existia: una factura mal digitada solo se "arreglaba"
 * anulando su asiento, y el documento seguia sumando en el F29.
 */
export async function actualizarCompra(id, datos) {
  return peticion(`${API_URL}/compras/${id}`, { metodo: "PUT", cuerpo: datos, mensajeError: "Error al actualizar compra" });
}

export async function anularCompra(id, empresaId, motivo) {
  return peticion(`${API_URL}/compras/${id}/anular`, { metodo: "PUT", cuerpo: { empresa_id: empresaId, motivo }, mensajeError: "Error al anular compra" });
}
