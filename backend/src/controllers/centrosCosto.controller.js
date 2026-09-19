const pool = require("../database/db");
const { exigirDeEmpresa } = require("../helpers/empresa.helper");
const { categoriaResultadoPorTipo } = require("../helpers/tipoCuenta.helper");

function responderError(res, error, mensaje) {
  return res.status(error.statusCode || 500).json({
    // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
    // columnas y restricciones. Los errores de validacion propios
    // si conservan su mensaje y su codigo.
    error: error.statusCode ? error.message : mensaje,
  });
}

function texto(valor, maximo) {
  return String(valor === null || valor === undefined ? "" : valor)
    .trim()
    .slice(0, maximo);
}

function numero(valor) {
  return Number(valor || 0);
}

async function listarCentrosCosto(req, res) {
  try {
    const { empresa_id, estado } = req.query;

    if (!empresa_id) {
      return res.status(400).json({ error: "Debe indicar empresa_id" });
    }

    const valores = [empresa_id];
    let query = `
      SELECT cc.*,
             (SELECT COUNT(*)::int FROM comprobante_detalle cd WHERE cd.centro_costo_id = cc.id) AS movimientos,
             (SELECT COUNT(*)::int FROM trabajadores t WHERE t.centro_costo_id = cc.id) AS trabajadores
      FROM centros_costo cc
      WHERE cc.empresa_id = $1
    `;

    if (estado === "vigente" || estado === "inactivo") {
      valores.push(estado);
      query += ` AND cc.estado = $${valores.length}`;
    }

    query += ` ORDER BY cc.codigo ASC`;

    const resultado = await pool.query(query, valores);

    return res.json({
      total: resultado.rows.length,
      centros: resultado.rows,
    });
  } catch (error) {
    console.error("Error al listar centros de costo:", error);

    return responderError(res, error, "Error interno al listar centros de costo");
  }
}

async function crearCentroCosto(req, res) {
  try {
    const { empresa_id } = req.body;
    const codigo = texto(req.body.codigo, 30).toUpperCase();
    const nombre = texto(req.body.nombre, 150);

    if (!codigo || !nombre) {
      return res.status(400).json({ error: "Debe indicar código y nombre del centro de costo." });
    }

    const resultado = await pool.query(
      `INSERT INTO centros_costo (empresa_id, codigo, nombre, descripcion)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [empresa_id, codigo, nombre, texto(req.body.descripcion, 1000)]
    );

    return res.status(201).json({
      mensaje: "Centro de costo creado correctamente",
      centro: resultado.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Ya existe un centro de costo con ese código." });
    }

    console.error("Error al crear centro de costo:", error);

    return responderError(res, error, "Error interno al crear el centro de costo");
  }
}

async function actualizarCentroCosto(req, res) {
  try {
    const { id } = req.params;
    const { empresa_id } = req.body;

    await exigirDeEmpresa(pool, "centros_costo", id, empresa_id, "id");

    const codigo = texto(req.body.codigo, 30).toUpperCase();
    const nombre = texto(req.body.nombre, 150);

    if (!codigo || !nombre) {
      return res.status(400).json({ error: "Debe indicar código y nombre del centro de costo." });
    }

    const resultado = await pool.query(
      `UPDATE centros_costo
       SET codigo = $3, nombre = $4, descripcion = $5, actualizado_en = NOW()
       WHERE id = $1 AND empresa_id = $2
       RETURNING *`,
      [id, empresa_id, codigo, nombre, texto(req.body.descripcion, 1000)]
    );

    return res.json({
      mensaje: "Centro de costo actualizado correctamente",
      centro: resultado.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Ya existe un centro de costo con ese código." });
    }

    console.error("Error al actualizar centro de costo:", error);

    return responderError(res, error, "Error interno al actualizar el centro de costo");
  }
}

/**
 * Inactivar y no borrar: el centro está enlazado a líneas de asientos que no
 * se tocan.
 */
async function cambiarEstadoCentroCosto(req, res) {
  try {
    const { id } = req.params;
    const { empresa_id, estado } = req.body;

    if (!["vigente", "inactivo"].includes(estado)) {
      return res.status(400).json({ error: "El estado debe ser vigente o inactivo." });
    }

    const resultado = await pool.query(
      `UPDATE centros_costo SET estado = $3, actualizado_en = NOW()
       WHERE id = $1 AND empresa_id = $2
       RETURNING *`,
      [id, empresa_id, estado]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: "Centro de costo no encontrado" });
    }

    return res.json({
      mensaje: estado === "vigente" ? "Centro de costo reactivado" : "Centro de costo inactivado",
      centro: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al cambiar estado del centro de costo:", error);

    return responderError(res, error, "Error interno al cambiar el estado del centro de costo");
  }
}

/**
 * Resultado por centro de costo: la razón por la que una empresa con dos
 * locales pide esta funcionalidad.
 *
 * Solo cuentas de resultado, que son las que se reparten entre centros. Lo que
 * quedó sin centro se informa aparte en lugar de repartirse: repartir un gasto
 * común entre locales es una decisión del contador, no del sistema.
 */
async function informePorCentroCosto(req, res) {
  try {
    const { empresa_id, fecha_desde, fecha_hasta } = req.query;

    if (!empresa_id || !fecha_desde || !fecha_hasta) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, fecha_desde y fecha_hasta",
      });
    }

    const { rows } = await pool.query(
      `
      SELECT cc.id AS centro_id,
             cc.codigo AS centro_codigo,
             cc.nombre AS centro_nombre,
             pc.id AS cuenta_id,
             pc.codigo AS cuenta_codigo,
             pc.nombre AS cuenta_nombre,
             pc.tipo AS cuenta_tipo,
             COALESCE(SUM(cd.debe), 0) AS debe,
             COALESCE(SUM(cd.haber), 0) AS haber
      FROM comprobante_detalle cd
      JOIN comprobantes c ON c.id = cd.comprobante_id
      JOIN plan_cuentas pc ON pc.id = cd.cuenta_id
      LEFT JOIN centros_costo cc ON cc.id = cd.centro_costo_id
      WHERE c.empresa_id = $1
        AND c.estado = 'vigente'
        AND c.fecha BETWEEN $2 AND $3
      GROUP BY cc.id, cc.codigo, cc.nombre, pc.id, pc.codigo, pc.nombre, pc.tipo
      HAVING COALESCE(SUM(cd.debe), 0) <> 0 OR COALESCE(SUM(cd.haber), 0) <> 0
      ORDER BY cc.codigo NULLS LAST, pc.codigo
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const centros = new Map();

    for (const fila of rows) {
      const categoria = categoriaResultadoPorTipo(fila.cuenta_tipo);

      // Solo resultado: activo, pasivo y patrimonio no se reparten.
      if (categoria === null || categoria === undefined) continue;

      const clave = fila.centro_id === null ? "sin_centro" : String(fila.centro_id);

      if (!centros.has(clave)) {
        centros.set(clave, {
          centro_id: fila.centro_id,
          codigo: fila.centro_codigo || "",
          nombre: fila.centro_nombre || "Sin centro de costo",
          ingresos: 0,
          costos: 0,
          gastos: 0,
          resultado: 0,
          cuentas: [],
        });
      }

      const centro = centros.get(clave);
      const debe = numero(fila.debe);
      const haber = numero(fila.haber);
      // Un ingreso tiene saldo acreedor; un gasto, deudor. Se guarda en
      // positivo dentro de su columna.
      const monto = categoria === "ingreso" ? haber - debe : debe - haber;

      if (categoria === "ingreso") centro.ingresos += monto;
      if (categoria === "costo") centro.costos += monto;
      if (categoria === "gasto") centro.gastos += monto;

      centro.resultado = centro.ingresos - centro.costos - centro.gastos;
      centro.cuentas.push({
        cuenta_id: fila.cuenta_id,
        codigo: fila.cuenta_codigo,
        nombre: fila.cuenta_nombre,
        tipo: fila.cuenta_tipo,
        categoria,
        monto: Math.round(monto),
      });
    }

    const lista = [...centros.values()].map((centro) => ({
      ...centro,
      ingresos: Math.round(centro.ingresos),
      costos: Math.round(centro.costos),
      gastos: Math.round(centro.gastos),
      resultado: Math.round(centro.resultado),
    }));

    const totales = lista.reduce(
      (acc, centro) => {
        acc.ingresos += centro.ingresos;
        acc.costos += centro.costos;
        acc.gastos += centro.gastos;
        acc.resultado += centro.resultado;
        return acc;
      },
      { ingresos: 0, costos: 0, gastos: 0, resultado: 0 }
    );

    return res.json({
      fecha_desde,
      fecha_hasta,
      centros: lista,
      totales,
      // El resultado por centro solo cuadra con el estado de resultados si
      // todo lo de resultado tiene centro asignado.
      hay_sin_centro: lista.some((centro) => centro.centro_id === null),
    });
  } catch (error) {
    console.error("Error al obtener el informe por centro de costo:", error);

    return responderError(res, error, "Error interno al obtener el informe por centro de costo");
  }
}

module.exports = {
  listarCentrosCosto,
  crearCentroCosto,
  actualizarCentroCosto,
  cambiarEstadoCentroCosto,
  informePorCentroCosto,
};
