/**
 * Sugerencia de cuenta según el historial del proveedor o del cliente.
 *
 * Cuando se importan cien facturas del SII, todas quedan con la cuenta de gasto
 * por defecto y alguien tiene que entrar a cambiarlas una por una. Pero la
 * empresa ya decidió antes en qué cuenta va cada proveedor: la luz va a
 * Suministros, el arriendo a Arriendos, el contador a Honorarios. Esa decisión
 * está registrada en los documentos anteriores del mismo RUT.
 *
 * Lo que hace esto es leer ese historial y proponer la cuenta que la empresa
 * misma usó antes. No inventa clasificaciones: repite la de la empresa.
 *
 * Reglas para no equivocarse:
 *
 *   - Solo se sugiere si el mismo RUT tuvo cuenta asignada antes.
 *   - Se elige la cuenta más usada. Si hay empate, la del documento más
 *     reciente, porque un cambio de criterio es más probable que un empate real.
 *   - Se informa en cuántos documentos se basa, para que quien revise sepa si
 *     confiar.
 *
 * No hay nada de inteligencia artificial aquí: es un conteo sobre los datos de
 * la propia empresa.
 */

// Con un solo documento anterior la "historia" es una casualidad. Dos ya es un
// criterio repetido.
const MINIMO_DOCUMENTOS = 2;

function normalizarRut(valor) {
  return String(valor || "")
    .toUpperCase()
    .replace(/[.\s]/g, "")
    .trim();
}

/**
 * Cuenta que la empresa usó históricamente para cada RUT de proveedor.
 *
 * Devuelve un mapa RUT normalizado -> { cuenta_id, codigo, nombre, usos }.
 * Una sola consulta para todos los RUT, porque esto corre dentro de una
 * importación de cientos de filas.
 */
async function historialCuentasProveedor(cliente, empresaId, ruts = []) {
  const normalizados = [...new Set(ruts.map(normalizarRut).filter(Boolean))];

  if (normalizados.length === 0) return {};

  const { rows } = await cliente.query(
    `
    SELECT rut, cuenta_id, codigo, nombre, usos
    FROM (
      SELECT UPPER(REPLACE(REPLACE(c.rut_proveedor, '.', ''), ' ', '')) AS rut,
             c.cuenta_gasto_id AS cuenta_id,
             pc.codigo,
             pc.nombre,
             COUNT(*)::int AS usos,
             MAX(c.fecha) AS ultima,
             ROW_NUMBER() OVER (
               PARTITION BY UPPER(REPLACE(REPLACE(c.rut_proveedor, '.', ''), ' ', ''))
               ORDER BY COUNT(*) DESC, MAX(c.fecha) DESC
             ) AS puesto
      FROM compras c
      JOIN plan_cuentas pc ON pc.id = c.cuenta_gasto_id
      WHERE c.empresa_id = $1
        AND c.estado = 'vigente'
        AND c.cuenta_gasto_id IS NOT NULL
        AND UPPER(REPLACE(REPLACE(c.rut_proveedor, '.', ''), ' ', '')) = ANY($2::text[])
      GROUP BY 1, 2, 3, 4
    ) h
    WHERE h.puesto = 1
      AND h.usos >= $3
    `,
    [empresaId, normalizados, MINIMO_DOCUMENTOS]
  );

  return rows.reduce((mapa, fila) => {
    mapa[fila.rut] = {
      cuenta_id: Number(fila.cuenta_id),
      codigo: fila.codigo,
      nombre: fila.nombre,
      usos: Number(fila.usos),
    };
    return mapa;
  }, {});
}

/**
 * Igual que la anterior, pero para cuentas de ingreso por RUT de cliente.
 */
async function historialCuentasCliente(cliente, empresaId, ruts = []) {
  const normalizados = [...new Set(ruts.map(normalizarRut).filter(Boolean))];

  if (normalizados.length === 0) return {};

  const { rows } = await cliente.query(
    `
    SELECT rut, cuenta_id, codigo, nombre, usos
    FROM (
      SELECT UPPER(REPLACE(REPLACE(v.rut_cliente, '.', ''), ' ', '')) AS rut,
             v.cuenta_ingreso_id AS cuenta_id,
             pc.codigo,
             pc.nombre,
             COUNT(*)::int AS usos,
             MAX(v.fecha) AS ultima,
             ROW_NUMBER() OVER (
               PARTITION BY UPPER(REPLACE(REPLACE(v.rut_cliente, '.', ''), ' ', ''))
               ORDER BY COUNT(*) DESC, MAX(v.fecha) DESC
             ) AS puesto
      FROM ventas v
      JOIN plan_cuentas pc ON pc.id = v.cuenta_ingreso_id
      WHERE v.empresa_id = $1
        AND v.estado = 'vigente'
        AND v.cuenta_ingreso_id IS NOT NULL
        AND UPPER(REPLACE(REPLACE(v.rut_cliente, '.', ''), ' ', '')) = ANY($2::text[])
      GROUP BY 1, 2, 3, 4
    ) h
    WHERE h.puesto = 1
      AND h.usos >= $3
    `,
    [empresaId, normalizados, MINIMO_DOCUMENTOS]
  );

  return rows.reduce((mapa, fila) => {
    mapa[fila.rut] = {
      cuenta_id: Number(fila.cuenta_id),
      codigo: fila.codigo,
      nombre: fila.nombre,
      usos: Number(fila.usos),
    };
    return mapa;
  }, {});
}

/**
 * Elige la cuenta para una fila que se está importando.
 *
 * El historial manda sobre la cuenta por defecto: la cuenta por defecto es una
 * caja donde todo cae sin clasificar, y el historial es una decisión que la
 * empresa ya tomó para ese proveedor.
 */
function elegirCuenta(rut, historial, cuentaPorDefecto) {
  const sugerida = historial[normalizarRut(rut)];

  if (sugerida) {
    return {
      cuenta_id: sugerida.cuenta_id,
      origen: "historial",
      detalle: `${sugerida.codigo} ${sugerida.nombre} (usada en ${sugerida.usos} documento(s) anteriores de este RUT)`,
    };
  }

  if (cuentaPorDefecto) {
    return {
      cuenta_id: Number(cuentaPorDefecto),
      origen: "por_defecto",
      detalle: "Sin historial para este RUT. Queda en la cuenta por defecto.",
    };
  }

  return { cuenta_id: null, origen: "sin_cuenta", detalle: "Hay que asignarla a mano." };
}

/**
 * Sugerencias para los documentos que hoy están sin cuenta.
 *
 * Es la versión de la sugerencia aplicada hacia atrás: los documentos que ya se
 * importaron sin clasificar. No escribe nada, solo propone.
 */
async function sugerirParaDocumentosSinCuenta(cliente, empresaId, { periodo } = {}) {
  const filtroPeriodo = periodo ? "AND c.periodo = $2" : "";
  const parametros = periodo ? [empresaId, periodo] : [empresaId];

  const { rows: compras } = await cliente.query(
    `
    SELECT c.id, c.fecha, c.folio, c.tipo_documento,
           c.rut_proveedor AS rut, c.razon_social_proveedor AS tercero, c.total
    FROM compras c
    WHERE c.empresa_id = $1
      AND c.estado = 'vigente'
      AND c.cuenta_gasto_id IS NULL
      ${filtroPeriodo}
    ORDER BY c.fecha, c.id
    LIMIT 500
    `,
    parametros
  );

  const filtroVentas = periodo ? "AND v.periodo = $2" : "";

  const { rows: ventas } = await cliente.query(
    `
    SELECT v.id, v.fecha, v.folio, v.tipo_documento,
           v.rut_cliente AS rut, v.razon_social_cliente AS tercero, v.total
    FROM ventas v
    WHERE v.empresa_id = $1
      AND v.estado = 'vigente'
      AND v.cuenta_ingreso_id IS NULL
      ${filtroVentas}
    ORDER BY v.fecha, v.id
    LIMIT 500
    `,
    parametros
  );

  const [historialProveedores, historialClientes] = await Promise.all([
    historialCuentasProveedor(cliente, empresaId, compras.map((c) => c.rut)),
    historialCuentasCliente(cliente, empresaId, ventas.map((v) => v.rut)),
  ]);

  function armar(filas, historial, libro) {
    return filas.map((fila) => {
      const sugerida = historial[normalizarRut(fila.rut)] || null;

      return {
        libro,
        id: fila.id,
        fecha: fila.fecha,
        folio: fila.folio,
        tipo_documento: fila.tipo_documento,
        rut: fila.rut,
        tercero: fila.tercero,
        total: Number(fila.total || 0),
        sugerencia: sugerida
          ? {
              cuenta_id: sugerida.cuenta_id,
              codigo: sugerida.codigo,
              nombre: sugerida.nombre,
              basada_en: sugerida.usos,
              detalle: `Este RUT se clasificó ${sugerida.usos} vez/veces en ${sugerida.codigo} ${sugerida.nombre}.`,
            }
          : null,
      };
    });
  }

  const resultado = [
    ...armar(compras, historialProveedores, "compras"),
    ...armar(ventas, historialClientes, "ventas"),
  ];

  const conSugerencia = resultado.filter((r) => r.sugerencia).length;

  return {
    periodo: periodo || null,
    documentos: resultado,
    resumen: {
      sin_cuenta: resultado.length,
      con_sugerencia: conSugerencia,
      sin_historial: resultado.length - conSugerencia,
    },
  };
}

module.exports = {
  MINIMO_DOCUMENTOS,
  normalizarRut,
  historialCuentasProveedor,
  historialCuentasCliente,
  elegirCuenta,
  sugerirParaDocumentosSinCuenta,
};
