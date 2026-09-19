/**
 * Verificacion de que una fila referida pertenece a la empresa de la peticion.
 *
 * El sistema recibe identificadores de trabajadores, documentos y cuentas en el
 * cuerpo de las peticiones. Filtrar la consulta principal por empresa_id no
 * alcanza: si el trabajador_id viene de otra empresa, la liquidacion se crea
 * con datos de un cliente distinto, y los saldos de dos empresas se mezclan.
 * Los identificadores son enteros consecutivos, asi que adivinarlos es trivial.
 *
 * Uso:
 *   const trabajador = await exigirDeEmpresa(client, "trabajadores", id, empresaId);
 *   await exigirTodosDeEmpresa(client, "plan_cuentas", [cuentaId, otraId], empresaId);
 */

class ErrorEmpresaAjena extends Error {
  constructor(tabla, id) {
    super(`El registro ${id} de ${tabla} no pertenece a la empresa indicada`);
    this.name = "ErrorEmpresaAjena";
    this.tabla = tabla;
    this.registroId = id;
    this.statusHttp = 403;
    // Los catch de los controladores miran statusCode para decidir si el
    // mensaje vuelve al cliente; sin esto respondian 500 "error interno".
    this.statusCode = 403;
  }
}

// Tablas cuyo dueno es la empresa directamente.
const COLUMNA_EMPRESA = "empresa_id";

// Tablas que no llevan empresa_id y heredan el dueno de otra tabla.
const HEREDADAS = {
  comprobante_detalle: { via: "comprobantes", columna: "comprobante_id" },
  liquidacion_detalle: { via: "liquidaciones", columna: "liquidacion_id" },
};

function normalizarId(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === "") {
    return null;
  }

  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : NaN;
}

/**
 * Devuelve la fila si pertenece a la empresa. Si el id viene vacio devuelve
 * null, porque hay referencias opcionales. Si no pertenece, lanza.
 */
async function exigirDeEmpresa(cliente, tabla, id, empresaId, columnas = "*") {
  const registroId = normalizarId(id);

  if (registroId === null) {
    return null;
  }

  if (Number.isNaN(registroId)) {
    throw new ErrorEmpresaAjena(tabla, id);
  }

  if (!Number.isInteger(Number(empresaId)) || Number(empresaId) <= 0) {
    throw new ErrorEmpresaAjena(tabla, id);
  }

  const heredada = HEREDADAS[tabla];

  const consulta = heredada
    ? `SELECT hijo.${columnas === "*" ? "*" : columnas}
       FROM ${tabla} hijo
       JOIN ${heredada.via} padre ON padre.id = hijo.${heredada.columna}
       WHERE hijo.id = $1 AND padre.${COLUMNA_EMPRESA} = $2
       LIMIT 1`
    : `SELECT ${columnas}
       FROM ${tabla}
       WHERE id = $1 AND ${COLUMNA_EMPRESA} = $2
       LIMIT 1`;

  const { rows } = await cliente.query(consulta, [registroId, Number(empresaId)]);

  if (rows.length === 0) {
    throw new ErrorEmpresaAjena(tabla, registroId);
  }

  return rows[0];
}

/**
 * Igual que exigirDeEmpresa para varios identificadores. Ignora los vacios y
 * los repetidos. Una sola consulta.
 */
async function exigirTodosDeEmpresa(cliente, tabla, ids, empresaId) {
  const unicos = [...new Set((ids || []).map(normalizarId).filter((id) => id !== null))];

  if (unicos.length === 0) {
    return [];
  }

  if (unicos.some((id) => Number.isNaN(id))) {
    throw new ErrorEmpresaAjena(tabla, "invalido");
  }

  const heredada = HEREDADAS[tabla];

  const consulta = heredada
    ? `SELECT hijo.id
       FROM ${tabla} hijo
       JOIN ${heredada.via} padre ON padre.id = hijo.${heredada.columna}
       WHERE hijo.id = ANY($1::int[]) AND padre.${COLUMNA_EMPRESA} = $2`
    : `SELECT id
       FROM ${tabla}
       WHERE id = ANY($1::int[]) AND ${COLUMNA_EMPRESA} = $2`;

  const { rows } = await cliente.query(consulta, [unicos, Number(empresaId)]);
  const encontrados = new Set(rows.map((fila) => Number(fila.id)));
  const ajeno = unicos.find((id) => !encontrados.has(id));

  if (ajeno !== undefined) {
    throw new ErrorEmpresaAjena(tabla, ajeno);
  }

  return unicos;
}

/**
 * Traduce el error a una respuesta HTTP. Devuelve true si respondio.
 * Se usa mientras los controladores no pasen por un manejador de errores
 * central; la respuesta es 403 y nunca revela si el registro existe en otra
 * empresa.
 */
function responderSiEmpresaAjena(error, res) {
  if (error instanceof ErrorEmpresaAjena) {
    res.status(403).json({
      error: "El registro indicado no pertenece a la empresa seleccionada",
    });
    return true;
  }

  return false;
}

module.exports = {
  ErrorEmpresaAjena,
  exigirDeEmpresa,
  exigirTodosDeEmpresa,
  responderSiEmpresaAjena,
};
