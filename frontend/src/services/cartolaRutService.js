import { obtenerToken } from "./authService";
import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

function agregarParametro(params, nombre, valor) {
  if (valor === undefined || valor === null || valor === "") return;
  params.append(nombre, valor);
}

export async function obtenerCartolaRut(filtros) {
  const token = obtenerToken();
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

  const respuesta = await fetch(`${API_URL}/cartola-rut?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al obtener cartola por RUT");
  }

  return data;
}

export async function buscarTercerosCartola(empresaId, busqueda, limite = 20) {
  const token = obtenerToken();
  const params = new URLSearchParams();

  agregarParametro(params, "empresa_id", empresaId);
  agregarParametro(params, "q", busqueda);
  agregarParametro(params, "limit", limite);

  const respuesta = await fetch(
    `${API_URL}/cartola-rut/terceros?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al buscar terceros");
  }

  return data;
}
