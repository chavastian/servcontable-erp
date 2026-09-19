/**
 * Parámetros nacionales por período: UF, UTM, UTA, ingreso mínimo, topes y
 * tasas que son iguales para todas las empresas del país.
 *
 * Hasta ahora cada empresa cargaba lo suyo cada mes. Dos empresas podían
 * liquidar el mismo mes con tablas distintas sin que nada lo detectara, y un
 * cambio de tasa había que corregirlo empresa por empresa.
 *
 * La configuración por empresa sigue existiendo y manda cuando trae valor: lo
 * nacional rellena lo que falte. Así una empresa con su propia mutual o sus
 * propias cuentas no pierde nada.
 */

const MESES = 86400000 * 31;

function periodoAnterior(periodo) {
  const anio = Number(String(periodo).slice(0, 4));
  const mes = Number(String(periodo).slice(5, 7));
  const d = new Date(Date.UTC(anio, mes - 2, 1));

  return d.toISOString().slice(0, 7);
}

async function obtenerParametros(cliente, periodo) {
  const { rows } = await cliente.query(
    `SELECT * FROM parametros_nacionales WHERE periodo = $1`,
    [periodo]
  );

  return rows[0] || null;
}

/**
 * Parámetros del período, o los del último período conocido anterior cuando el
 * pedido no existe. Devuelve también de qué período salieron, para avisar.
 */
async function obtenerParametrosOAnteriores(cliente, periodo) {
  const exacto = await obtenerParametros(cliente, periodo);

  if (exacto) return { parametros: exacto, periodo_origen: periodo, exacto: true };

  const { rows } = await cliente.query(
    `SELECT * FROM parametros_nacionales WHERE periodo < $1 ORDER BY periodo DESC LIMIT 1`,
    [periodo]
  );

  if (rows.length === 0) return { parametros: null, periodo_origen: null, exacto: false };

  return { parametros: rows[0], periodo_origen: rows[0].periodo, exacto: false };
}

/**
 * UTM del período. Es lo que el F29 necesita para el remanente y el impuesto
 * único para sus tramos. Null si no se conoce: quien llama decide qué hacer.
 */
async function utmDelPeriodo(cliente, periodo) {
  const { parametros } = await obtenerParametrosOAnteriores(cliente, periodo);
  const utm = Number(parametros?.valor_utm || 0);

  return utm > 0 ? utm : null;
}

/**
 * Rellena en la configuración de una empresa lo que no trae, con lo nacional.
 */
function completarConNacional(configuracion, nacional) {
  if (!configuracion || !nacional) return configuracion;

  const salida = { ...configuracion };
  const mapa = {
    valor_uf: "valor_uf",
    ingreso_minimo: "ingreso_minimo",
    tope_imponible_uf: "tope_imponible_afp_uf",
    tasa_sis: "tasa_sis",
  };

  for (const [campoEmpresa, campoNacional] of Object.entries(mapa)) {
    if (!Number(salida[campoEmpresa]) && Number(nacional[campoNacional])) {
      salida[campoEmpresa] = Number(nacional[campoNacional]);
    }
  }

  const indicadores = { ...(salida.indicadores_previsionales || {}) };

  if (!Number(indicadores.valor_utm) && Number(nacional.valor_utm)) {
    indicadores.valor_utm = Number(nacional.valor_utm);
  }

  if (!Number(indicadores.valor_uta) && Number(nacional.valor_uta)) {
    indicadores.valor_uta = Number(nacional.valor_uta);
  }

  if (!Number(indicadores.renta_tope_seguro_cesantia_uf) && Number(nacional.tope_afc_uf)) {
    indicadores.renta_tope_seguro_cesantia_uf = Number(nacional.tope_afc_uf);
  }

  salida.indicadores_previsionales = indicadores;
  salida.tasa_seguro_social_empleador_nacional = Number(nacional.tasa_seguro_social_empleador) || null;

  return salida;
}

module.exports = {
  periodoAnterior,
  obtenerParametros,
  obtenerParametrosOAnteriores,
  utmDelPeriodo,
  completarConNacional,
};
