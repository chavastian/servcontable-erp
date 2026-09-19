import { peticion } from "./http";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

function agregarParametro(params, nombre, valor) {
  if (valor === undefined || valor === null || valor === "") return;
  params.append(nombre, valor);
}

export async function obtenerCartolaRut(filtros) {
  const params = new URLSearchParams();

  agregarParametro(params, "empresa_id", filtros.empresaId);
  agregarParametro(params, "busqueda", filtros.busqueda);
  agregarParametro(params, "fecha_desde", filtros.fechaDesde);
  agregarParametro(params, "fecha_hasta", filtros.fechaHasta);
  agregarParametro(params, "vista", filtros.vista);
  agregarParametro(params, "origen", filtros.origen);
  agregarParametro(params, "estado", filtros.estado);
  agregarParametro(params, "rol", filtros.rol);
  agregarParametro(params, "solo_pendientes", filtros.soloPendientes ? "true" : "");
  agregarParametro(params, "page", filtros.pagina);
  agregarParametro(params, "limit", filtros.limite);

  return peticion(`${API_URL}/cartola-rut?${params.toString()}`, { mensajeError: "Error al obtener cartola por RUT" });
}

export async function buscarTercerosCartola(empresaId, busqueda, limite = 20) {
  const params = new URLSearchParams();

  agregarParametro(params, "empresa_id", empresaId);
  agregarParametro(params, "q", busqueda);
  agregarParametro(params, "limit", limite);

  return peticion(`${API_URL}/cartola-rut/terceros?${params.toString()}`, { mensajeError: "Error al buscar terceros" });
}
