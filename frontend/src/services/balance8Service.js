import { obtenerToken } from "./authService";

import { API_BASE_URL } from "./apiConfig";

const API_URL = API_BASE_URL;

export async function obtenerBalance8Columnas(
  empresaId,
  fechaDesde,
  fechaHasta,
  soloMovimientos = false
) {
  const token = obtenerToken();

  const params = new URLSearchParams();
  params.append("empresa_id", empresaId);
  params.append("fecha_desde", fechaDesde);
  params.append("fecha_hasta", fechaHasta);
  params.append("solo_movimientos", soloMovimientos ? "true" : "false");

  const respuesta = await fetch(
    `${API_URL}/balance-8-columnas?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const texto = await respuesta.text();

  let data;
  try {
    data = JSON.parse(texto);
  } catch (causa) {
    console.error("Respuesta no JSON del backend:", texto);
    throw new Error(
      "El backend no devolvió JSON. Revisa la ruta del balance o si el backend está activo.",
      { cause: causa }
    );
  }

  if (!respuesta.ok) {
    throw new Error(data.error || "Error al obtener balance 8 columnas");
  }

  return data;
}