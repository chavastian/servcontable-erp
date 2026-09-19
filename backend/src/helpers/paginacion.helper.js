/**
 * Paginación opcional en los listados.
 *
 * Ningún listado paginaba: un libro de compras de cinco años viajaba entero
 * en cada consulta. Los clientes actuales siguen recibiendo todo si no piden
 * página; la pantalla que mande `limite` (y `pagina`) recibe ese tramo y un
 * `hay_mas` para saber si pedir el siguiente. Se pide una fila de más en vez
 * de contar el total: contar duplica el costo de la consulta.
 *
 * Los totales que cada listado calcula sobre las filas devueltas pasan a ser
 * totales de la página cuando se pagina.
 */

const LIMITE_MAXIMO = 1000;

function leerPaginacion(query = {}) {
  const limite = Math.trunc(Number(query.limite ?? query.limit ?? 0));

  if (!Number.isFinite(limite) || limite <= 0) return null;

  const pagina = Math.max(1, Math.trunc(Number(query.pagina ?? query.page ?? 1)) || 1);
  const limiteFinal = Math.min(limite, LIMITE_MAXIMO);

  return { limite: limiteFinal, pagina, desplazamiento: (pagina - 1) * limiteFinal };
}

/**
 * Agrega LIMIT/OFFSET a una consulta armada con `valores` como parámetros.
 */
function aplicarPaginacion(sql, valores, paginacion) {
  if (!paginacion) return sql;

  valores.push(paginacion.limite + 1, paginacion.desplazamiento);

  return `${sql} LIMIT $${valores.length - 1} OFFSET $${valores.length}`;
}

/**
 * Para consultas con parámetros fijos: el fragmento SQL y los valores a
 * concatenar, numerados desde `desde`.
 */
function fragmentoPaginacion(paginacion, desde) {
  return paginacion ? ` LIMIT $${desde} OFFSET $${desde + 1}` : "";
}

function valoresPaginacion(paginacion) {
  return paginacion ? [paginacion.limite + 1, paginacion.desplazamiento] : [];
}

function recortarPagina(filas, paginacion) {
  if (!paginacion) return { filas, paginacion: null };

  const hayMas = filas.length > paginacion.limite;

  return {
    filas: hayMas ? filas.slice(0, paginacion.limite) : filas,
    paginacion: {
      limite: paginacion.limite,
      pagina: paginacion.pagina,
      hay_mas: hayMas,
    },
  };
}

module.exports = {
  LIMITE_MAXIMO,
  leerPaginacion,
  aplicarPaginacion,
  fragmentoPaginacion,
  valoresPaginacion,
  recortarPagina,
};
