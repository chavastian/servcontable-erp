const pool = require("../database/db");
const { exigirDeEmpresa } = require("../helpers/empresa.helper");
const { normalizarRut } = require("../helpers/rut.helper");
const { claveRut } = require("../helpers/terceros.helper");
const { expresionSigno } = require("../helpers/documentoTributario.helper");
const {
  leerPaginacion,
  aplicarPaginacion,
  recortarPagina,
} = require("../helpers/paginacion.helper");

function responderError(res, error, mensaje) {
  return res.status(error.statusCode || 500).json({
    // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
    // columnas y restricciones. Los errores de validacion propios
    // si conservan su mensaje y su codigo.
    error: error.statusCode ? error.message : mensaje,
  });
}

function error(mensaje, statusCode) {
  return Object.assign(new Error(mensaje), { statusCode });
}

// La comparación sin tildes se hace igual en SQL y en JavaScript para que el
// patrón y la columna se midan con la misma regla.
const ACENTOS = "ÁÉÍÓÚÜÑáéíóúüñ";
const SIN_ACENTOS = "AEIOUUNaeiouun";

const SIN_TILDES_SQL = (columna) =>
  `UPPER(TRANSLATE(COALESCE(${columna}, ''), '${ACENTOS}', '${SIN_ACENTOS}'))`;

function sinTildes(valor) {
  const texto = String(valor || "").trim();
  let salida = "";

  for (const caracter of texto) {
    const posicion = ACENTOS.indexOf(caracter);
    salida += posicion === -1 ? caracter : SIN_ACENTOS[posicion];
  }

  return salida.toUpperCase();
}

function texto(valor, maximo) {
  return String(valor === null || valor === undefined ? "" : valor)
    .trim()
    .slice(0, maximo);
}

/**
 * La condición de pago distingue tres cosas: no se sabe (null), contado (0) y
 * un plazo en días. Un texto vacío es "no se sabe", no cero.
 */
function condicionPago(valor) {
  if (valor === null || valor === undefined || valor === "") return null;

  const dias = Math.trunc(Number(valor));

  if (!Number.isFinite(dias) || dias < 0 || dias > 365) {
    throw error("La condición de pago debe ser un número de días entre 0 y 365.", 400);
  }

  return dias;
}

async function validarCuenta(client, empresaId, cuentaId) {
  if (!cuentaId) return null;

  // Una cuenta de otra empresa mezclaría los saldos de dos clientes.
  // exigirDeEmpresa lanza 403 si no es de esta empresa.
  const cuenta = await exigirDeEmpresa(client, "plan_cuentas", cuentaId, empresaId, "id");

  return cuenta ? cuenta.id : null;
}

async function listarTerceros(req, res) {
  try {
    const { empresa_id, tipo, buscar, estado } = req.query;

    if (!empresa_id) {
      return res.status(400).json({ error: "Debe indicar empresa_id" });
    }

    let query = `
      SELECT t.*,
             cg.codigo AS cuenta_gasto_codigo,
             cg.nombre AS cuenta_gasto_nombre,
             ci.codigo AS cuenta_ingreso_codigo,
             ci.nombre AS cuenta_ingreso_nombre
      FROM terceros t
      LEFT JOIN plan_cuentas cg ON cg.id = t.cuenta_gasto_id
      LEFT JOIN plan_cuentas ci ON ci.id = t.cuenta_ingreso_id
      WHERE t.empresa_id = $1
    `;
    const valores = [empresa_id];

    if (tipo === "proveedor") query += ` AND t.es_proveedor = true`;
    if (tipo === "cliente") query += ` AND t.es_cliente = true`;

    if (estado === "vigente" || estado === "inactivo") {
      valores.push(estado);
      query += ` AND t.estado = $${valores.length}`;
    }

    if (buscar && String(buscar).trim()) {
      // Sin tildes en los dos lados: en Chile nadie escribe "Ferretería" con
      // tilde en un buscador, y así "ferreteria" la encuentra.
      const patron = `%${sinTildes(buscar)}%`;
      valores.push(patron);
      query += ` AND (${SIN_TILDES_SQL("t.razon_social")} LIKE $${valores.length}
                   OR ${SIN_TILDES_SQL("t.nombre_fantasia")} LIKE $${valores.length}
                   OR UPPER(REPLACE(REPLACE(t.rut, '.', ''), ' ', '')) LIKE $${valores.length})`;
    }

    query += ` ORDER BY t.razon_social ASC, t.id ASC`;

    const paginacion = leerPaginacion(req.query);
    query = aplicarPaginacion(query, valores, paginacion);

    const resultado = await pool.query(query, valores);
    const pagina = recortarPagina(resultado.rows, paginacion);

    return res.json({
      total: pagina.filas.length,
      paginacion: pagina.paginacion,
      terceros: pagina.filas,
    });
  } catch (err) {
    console.error("Error al listar terceros:", err);

    return responderError(res, err, "Error interno al listar terceros");
  }
}

/**
 * Un tercero con lo que se le compró o vendió y lo que queda pendiente. Es la
 * pantalla que el usuario abre antes de llamar por teléfono.
 */
async function obtenerTercero(req, res) {
  try {
    const { id } = req.params;
    const { empresa_id } = req.query;

    if (!empresa_id) {
      return res.status(400).json({ error: "Debe indicar empresa_id" });
    }

    const tercero = await exigirDeEmpresa(pool, "terceros", id, empresa_id);

    const signoCompra = expresionSigno("c");
    const signoVenta = expresionSigno("v");

    const [compras, ventas, honorarios] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS documentos,
                COALESCE(SUM((${signoCompra}) * c.total), 0) AS total,
                MAX(c.fecha) AS ultima
         FROM compras c
         WHERE c.empresa_id = $1 AND c.tercero_id = $2 AND c.estado = 'vigente'`,
        [empresa_id, tercero.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS documentos,
                COALESCE(SUM((${signoVenta}) * v.total), 0) AS total,
                MAX(v.fecha) AS ultima
         FROM ventas v
         WHERE v.empresa_id = $1 AND v.tercero_id = $2 AND v.estado = 'vigente'`,
        [empresa_id, tercero.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS documentos, COALESCE(SUM(bruto), 0) AS total, MAX(fecha_emision) AS ultima
         FROM honorarios
         WHERE empresa_id = $1 AND tercero_id = $2 AND estado = 'vigente'`,
        [empresa_id, tercero.id]
      ),
    ]);

    return res.json({
      tercero,
      resumen: {
        compras: compras.rows[0],
        ventas: ventas.rows[0],
        honorarios: honorarios.rows[0],
      },
    });
  } catch (err) {
    console.error("Error al obtener tercero:", err);

    return responderError(res, err, "Error interno al obtener el tercero");
  }
}

async function crearTercero(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id } = req.body;
    const rutValidado = normalizarRut(req.body.rut);

    if (!rutValidado.valido) {
      return res.status(400).json({ error: rutValidado.error || "El RUT no es válido." });
    }

    const razonSocial = texto(req.body.razon_social, 200);

    if (!razonSocial) {
      return res.status(400).json({ error: "Debe indicar la razón social." });
    }

    await client.query("BEGIN");

    const cuentaGasto = await validarCuenta(client, empresa_id, req.body.cuenta_gasto_id);
    const cuentaIngreso = await validarCuenta(client, empresa_id, req.body.cuenta_ingreso_id);

    const resultado = await client.query(
      `INSERT INTO terceros
         (empresa_id, rut, razon_social, nombre_fantasia, giro, direccion, comuna, ciudad,
          email, telefono, contacto, es_proveedor, es_cliente, condicion_pago_dias,
          cuenta_gasto_id, cuenta_ingreso_id, observacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        empresa_id,
        rutValidado.rut,
        razonSocial,
        texto(req.body.nombre_fantasia, 200),
        texto(req.body.giro, 500),
        texto(req.body.direccion, 500),
        texto(req.body.comuna, 120),
        texto(req.body.ciudad, 120),
        texto(req.body.email, 150),
        texto(req.body.telefono, 50),
        texto(req.body.contacto, 150),
        req.body.es_proveedor !== false && req.body.es_proveedor !== "false",
        Boolean(req.body.es_cliente) && req.body.es_cliente !== "false",
        condicionPago(req.body.condicion_pago_dias),
        cuentaGasto,
        cuentaIngreso,
        texto(req.body.observacion, 1000),
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      mensaje: "Tercero creado correctamente",
      tercero: resultado.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});

    if (err.code === "23505") {
      return res.status(409).json({
        error: "Ya existe un proveedor o cliente con este RUT en la empresa.",
      });
    }

    console.error("Error al crear tercero:", err);

    return responderError(res, err, "Error interno al crear el tercero");
  } finally {
    client.release();
  }
}

async function actualizarTercero(req, res) {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { empresa_id } = req.body;

    await client.query("BEGIN");

    const tercero = await exigirDeEmpresa(client, "terceros", id, empresa_id);

    // El RUT no se cambia: los documentos ya emitidos lo llevan escrito y
    // cambiarlo aquí desalinearía el catálogo del libro. Si el RUT estaba mal,
    // se crea el correcto y se inactiva este.
    const razonSocial = texto(req.body.razon_social, 200) || tercero.razon_social;
    const cuentaGasto = await validarCuenta(client, empresa_id, req.body.cuenta_gasto_id);
    const cuentaIngreso = await validarCuenta(client, empresa_id, req.body.cuenta_ingreso_id);

    const resultado = await client.query(
      `UPDATE terceros SET
         razon_social = $3,
         nombre_fantasia = $4,
         giro = $5,
         direccion = $6,
         comuna = $7,
         ciudad = $8,
         email = $9,
         telefono = $10,
         contacto = $11,
         es_proveedor = $12,
         es_cliente = $13,
         condicion_pago_dias = $14,
         cuenta_gasto_id = $15,
         cuenta_ingreso_id = $16,
         observacion = $17,
         actualizado_en = NOW()
       WHERE id = $1 AND empresa_id = $2
       RETURNING *`,
      [
        id,
        empresa_id,
        razonSocial,
        texto(req.body.nombre_fantasia, 200),
        texto(req.body.giro, 500),
        texto(req.body.direccion, 500),
        texto(req.body.comuna, 120),
        texto(req.body.ciudad, 120),
        texto(req.body.email, 150),
        texto(req.body.telefono, 50),
        texto(req.body.contacto, 150),
        req.body.es_proveedor !== false && req.body.es_proveedor !== "false",
        Boolean(req.body.es_cliente) && req.body.es_cliente !== "false",
        condicionPago(req.body.condicion_pago_dias),
        cuentaGasto,
        cuentaIngreso,
        texto(req.body.observacion, 1000),
      ]
    );

    await client.query("COMMIT");

    return res.json({
      mensaje: "Tercero actualizado correctamente",
      tercero: resultado.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error al actualizar tercero:", err);

    return responderError(res, err, "Error interno al actualizar el tercero");
  } finally {
    client.release();
  }
}

/**
 * Inactivar en lugar de borrar: el tercero está enlazado a documentos que no
 * se tocan. Un tercero inactivo no se ofrece al registrar, pero sus documentos
 * siguen mostrándolo.
 */
async function cambiarEstadoTercero(req, res) {
  try {
    const { id } = req.params;
    const { empresa_id, estado } = req.body;

    if (!["vigente", "inactivo"].includes(estado)) {
      return res.status(400).json({ error: "El estado debe ser vigente o inactivo." });
    }

    const resultado = await pool.query(
      `UPDATE terceros SET estado = $3, actualizado_en = NOW()
       WHERE id = $1 AND empresa_id = $2
       RETURNING *`,
      [id, empresa_id, estado]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: "Tercero no encontrado" });
    }

    return res.json({
      mensaje: estado === "vigente" ? "Tercero reactivado" : "Tercero inactivado",
      tercero: resultado.rows[0],
    });
  } catch (err) {
    console.error("Error al cambiar estado del tercero:", err);

    return responderError(res, err, "Error interno al cambiar el estado del tercero");
  }
}

module.exports = {
  claveRut,
  listarTerceros,
  obtenerTercero,
  crearTercero,
  actualizarTercero,
  cambiarEstadoTercero,
};
