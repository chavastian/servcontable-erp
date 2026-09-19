/**
 * Terceros: proveedores y clientes como entidades.
 *
 * Antes cada documento repetía el RUT y la razón social como texto. Eso sirve
 * para el libro, pero no para lo que un estudio necesita todos los días: la
 * condición de pago (de la que sale el vencimiento real), la cuenta habitual
 * del tercero, su giro y cómo contactarlo.
 *
 * El documento sigue guardando el RUT y el nombre con que fue emitido. El
 * tercero es un enlace que se resuelve por RUT normalizado; si no existe, se
 * crea, porque la importación del registro del SII no puede detenerse a
 * preguntar por un proveedor nuevo.
 */

// La versión opcional no lanza: un RUT ilegible del registro del SII no puede
// abortar la importación de las demás filas.
const {
  normalizarRutDocumentoOpcional,
  normalizarNombreTercero,
} = require("./trazabilidadRut.helper");
const { aFechaISO, sumarDiasAFecha } = require("./fecha.helper");

/**
 * Clave de comparación: la misma que usan los índices de compras y ventas.
 */
function claveRut(valor) {
  return String(valor || "")
    .toUpperCase()
    .replace(/[.\s]/g, "");
}

/**
 * Busca el tercero por RUT y lo crea si no está.
 *
 * `tipo` es "proveedor" o "cliente": marca la bandera que corresponde sin
 * borrar la otra, porque un RUT puede ser las dos cosas.
 *
 * Devuelve `null` cuando el documento no trae RUT (una boleta al público, por
 * ejemplo): el documento se guarda igual, sin tercero.
 */
async function resolverTercero(client, empresaId, { rut, razon_social, tipo = "proveedor" }) {
  const clave = claveRut(rut);

  if (!clave) return null;

  const columna = tipo === "cliente" ? "es_cliente" : "es_proveedor";

  const existente = await client.query(
    `SELECT * FROM terceros
     WHERE empresa_id = $1
       AND UPPER(REPLACE(REPLACE(COALESCE(rut, ''), '.', ''), ' ', '')) = $2
     LIMIT 1`,
    [empresaId, clave]
  );

  if (existente.rows[0]) {
    const tercero = existente.rows[0];

    // La bandera se agrega la primera vez que el tercero aparece del otro
    // lado; el nombre no se sobrescribe, porque el del catálogo lo pudo
    // corregir una persona.
    if (!tercero[columna]) {
      const actualizado = await client.query(
        `UPDATE terceros SET ${columna} = true, actualizado_en = NOW() WHERE id = $1 RETURNING *`,
        [tercero.id]
      );

      return actualizado.rows[0];
    }

    return tercero;
  }

  const rutNormalizado = normalizarRutDocumentoOpcional(rut) || String(rut).trim();
  const nombre = normalizarNombreTercero(razon_social) || rutNormalizado;

  const creado = await client.query(
    `INSERT INTO terceros (empresa_id, rut, razon_social, ${columna})
     VALUES ($1, $2, $3, true)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [empresaId, rutNormalizado, nombre]
  );

  if (creado.rows[0]) return creado.rows[0];

  // Otra transacción lo creó entre la consulta y el insert.
  const segundo = await client.query(
    `SELECT * FROM terceros
     WHERE empresa_id = $1
       AND UPPER(REPLACE(REPLACE(COALESCE(rut, ''), '.', ''), ' ', '')) = $2
     LIMIT 1`,
    [empresaId, clave]
  );

  return segundo.rows[0] || null;
}

/**
 * Resuelve muchos terceros de una vez, para la importación del registro del
 * SII: una consulta para los que existen y un insert para los que faltan, en
 * lugar de dos consultas por fila.
 *
 * Devuelve un mapa de RUT normalizado a tercero.
 */
async function resolverTercerosEnLote(client, empresaId, documentos = [], tipo = "proveedor") {
  const columna = tipo === "cliente" ? "es_cliente" : "es_proveedor";
  const porClave = new Map();

  for (const documento of documentos) {
    const clave = claveRut(documento.rut);

    if (clave && !porClave.has(clave)) porClave.set(clave, documento);
  }

  if (porClave.size === 0) return {};

  const claves = [...porClave.keys()];

  const { rows: existentes } = await client.query(
    `SELECT * FROM terceros
     WHERE empresa_id = $1
       AND UPPER(REPLACE(REPLACE(COALESCE(rut, ''), '.', ''), ' ', '')) = ANY($2::text[])`,
    [empresaId, claves]
  );

  const mapa = {};
  const vistos = new Set();

  for (const tercero of existentes) {
    mapa[claveRut(tercero.rut)] = tercero;
    vistos.add(claveRut(tercero.rut));
  }

  const faltantes = claves.filter((clave) => !vistos.has(clave));

  if (faltantes.length > 0) {
    const ruts = [];
    const nombres = [];

    for (const clave of faltantes) {
      const documento = porClave.get(clave);
      const rutNormalizado = normalizarRutDocumentoOpcional(documento.rut) || String(documento.rut).trim();

      ruts.push(rutNormalizado);
      nombres.push(normalizarNombreTercero(documento.razon_social) || rutNormalizado);
    }

    const { rows: creados } = await client.query(
      `INSERT INTO terceros (empresa_id, rut, razon_social, ${columna})
       SELECT $1, datos.rut, datos.nombre, true
       FROM UNNEST($2::text[], $3::text[]) AS datos(rut, nombre)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [empresaId, ruts, nombres]
    );

    for (const tercero of creados) mapa[claveRut(tercero.rut)] = tercero;
  }

  // Marcar la bandera de los que ya existían sin ella.
  const sinBandera = Object.values(mapa)
    .filter((tercero) => !tercero[columna])
    .map((tercero) => tercero.id);

  if (sinBandera.length > 0) {
    const { rows } = await client.query(
      `UPDATE terceros SET ${columna} = true, actualizado_en = NOW()
       WHERE id = ANY($1::int[]) RETURNING *`,
      [sinBandera]
    );

    for (const tercero of rows) mapa[claveRut(tercero.rut)] = tercero;
  }

  return mapa;
}

/**
 * Vencimiento del documento según la condición de pago del tercero.
 *
 * Solo se usa cuando el documento no trae vencimiento propio. Con la condición
 * en blanco devuelve null: es mejor que el informe use su plazo convencional y
 * lo diga, que inventar una fecha.
 */
function vencimientoSegunCondicion(fecha, condicionPagoDias) {
  const base = aFechaISO(fecha);

  if (!base) return null;
  if (condicionPagoDias === null || condicionPagoDias === undefined || condicionPagoDias === "") {
    return null;
  }

  const dias = Number(condicionPagoDias);

  if (!Number.isFinite(dias) || dias < 0) return null;

  return sumarDiasAFecha(base, dias);
}

module.exports = {
  claveRut,
  resolverTercero,
  resolverTercerosEnLote,
  vencimientoSegunCondicion,
};
