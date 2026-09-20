/**
 * Corrección monetaria y capital propio tributario (módulo 8).
 *
 * Lo que este controlador cuida, más allá de la aritmética: que nada se
 * contabilice sin que alguien haya confirmado la clasificación de las cuentas y
 * declarado el criterio. La corrección monetaria es de las cosas que un
 * fiscalizador revisa línea por línea, así que queda guardada con su factor,
 * sus líneas y el criterio escrito por quien la hizo.
 */

const pool = require("../database/db");
const { exigirDeEmpresa } = require("../helpers/empresa.helper");
const {
  proponerCorreccion,
  clasificacionSugerida,
  saldosParaCorreccion,
} = require("../helpers/correccionMonetaria.helper");
const {
  obtenerSiguienteNumeroComprobante,
  insertarDetallesComprobante,
} = require("../helpers/comprobante.helper");
const { registrarAuditoria } = require("../helpers/auditoria.helper");

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

function leerAnio(valor) {
  const anio = Math.trunc(Number(valor));

  return Number.isInteger(anio) && anio >= 2000 && anio <= 2100 ? anio : null;
}

async function obtenerCorreccion(req, res) {
  try {
    const { empresa_id } = req.query;
    const anio = leerAnio(req.query.anio);

    if (!empresa_id || !anio) {
      return res.status(400).json({ error: "Debe indicar empresa_id y anio" });
    }

    const propuesta = await proponerCorreccion(pool, empresa_id, anio);

    const registrada = await pool.query(
      `SELECT cm.*, c.numero AS comprobante_numero
       FROM correcciones_monetarias cm
       LEFT JOIN comprobantes c ON c.id = cm.comprobante_id
       WHERE cm.empresa_id = $1 AND cm.anio = $2 AND cm.estado = 'vigente'
       LIMIT 1`,
      [empresa_id, anio]
    );

    return res.json({
      ...propuesta,
      correccion_registrada: registrada.rows[0] || null,
    });
  } catch (err) {
    console.error("Error al obtener la corrección monetaria:", err);

    return responderError(res, err, "Error interno al calcular la corrección monetaria");
  }
}

/**
 * Guarda la clasificación de las cuentas: monetaria, no monetaria o patrimonio.
 *
 * Se guarda en el plan de cuentas porque es una característica de la cuenta y
 * no del año: se decide una vez y vale para siempre.
 */
async function clasificarCuentas(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id, clasificaciones } = req.body;

    if (!Array.isArray(clasificaciones) || clasificaciones.length === 0) {
      return res.status(400).json({
        error: "Debe indicar al menos una cuenta con su clasificación.",
      });
    }

    const validas = ["monetaria", "no_monetaria", "patrimonio"];

    await client.query("BEGIN");

    let actualizadas = 0;

    for (const item of clasificaciones) {
      if (!validas.includes(item.clasificacion)) {
        throw error(
          `La clasificación "${item.clasificacion}" no es válida. Debe ser monetaria, no_monetaria o patrimonio.`,
          400
        );
      }

      // Una cuenta de otra empresa no se toca.
      await exigirDeEmpresa(client, "plan_cuentas", item.cuenta_id, empresa_id, "id");

      const resultado = await client.query(
        `UPDATE plan_cuentas SET clasificacion_correccion = $3
         WHERE id = $1 AND empresa_id = $2`,
        [item.cuenta_id, empresa_id, item.clasificacion]
      );

      actualizadas += resultado.rowCount;
    }

    await client.query("COMMIT");

    return res.json({
      mensaje: `${actualizadas} cuenta(s) clasificadas`,
      actualizadas,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error al clasificar las cuentas:", err);

    return responderError(res, err, "Error interno al clasificar las cuentas");
  } finally {
    client.release();
  }
}

/**
 * Propuesta de clasificación para las cuentas que no la tienen, para que la
 * persona confirme en bloque en lugar de una por una.
 */
async function sugerirClasificaciones(req, res) {
  try {
    const { empresa_id } = req.query;
    const anio = leerAnio(req.query.anio) || new Date().getFullYear();

    if (!empresa_id) {
      return res.status(400).json({ error: "Debe indicar empresa_id" });
    }

    const cuentas = await saldosParaCorreccion(pool, empresa_id, anio);
    const sinConfirmar = cuentas.filter((c) => !c.clasificacion_confirmada && c.clasificacion);

    return res.json({
      total: cuentas.length,
      sin_confirmar: sinConfirmar.length,
      sugerencias: sinConfirmar.map((c) => ({
        cuenta_id: c.cuenta_id,
        codigo: c.codigo,
        nombre: c.nombre,
        tipo: c.tipo,
        saldo_inicial: c.saldo_inicial,
        clasificacion_sugerida: c.clasificacion,
      })),
      aviso:
        "La sugerencia sale del tipo y del nombre de la cuenta. REQUIERE VALIDACIÓN TRIBUTARIA: la clasificación la decide el contador.",
    });
  } catch (err) {
    console.error("Error al sugerir clasificaciones:", err);

    return responderError(res, err, "Error interno al sugerir clasificaciones");
  }
}

/**
 * Contabiliza la corrección monetaria del año.
 *
 * El asiento se arma con las líneas de la propuesta, y exige que el criterio
 * venga escrito: una corrección monetaria sin criterio declarado no se puede
 * defender ante una fiscalización.
 */
async function contabilizarCorreccion(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id, criterio } = req.body;
    const anio = leerAnio(req.body.anio);

    if (!empresa_id || !anio) {
      return res.status(400).json({ error: "Debe indicar empresa_id y anio" });
    }

    const criterioLimpio = String(criterio || "").trim();

    if (criterioLimpio.length < 10) {
      return res.status(400).json({
        error:
          "Describe el criterio de corrección que estás aplicando (mínimo 10 caracteres). Queda guardado con el cálculo.",
      });
    }

    await client.query("BEGIN");

    const yaRegistrada = await client.query(
      `SELECT id FROM correcciones_monetarias
       WHERE empresa_id = $1 AND anio = $2 AND estado = 'vigente' LIMIT 1`,
      [empresa_id, anio]
    );

    if (yaRegistrada.rows.length > 0) {
      throw error(`La corrección monetaria de ${anio} ya está contabilizada.`, 409);
    }

    const propuesta = await proponerCorreccion(client, empresa_id, anio);

    if (!propuesta.puede_calcular) {
      throw error(propuesta.motivo, 400);
    }

    if (propuesta.lineas.length === 0) {
      throw error("No hay partidas que corregir en este año.", 400);
    }

    const sinConfirmar = propuesta.cuentas.filter(
      (c) => c.clasificacion === "no_monetaria" && !c.clasificacion_confirmada
    );

    if (sinConfirmar.length > 0) {
      throw error(
        `Hay ${sinConfirmar.length} cuenta(s) no monetarias con clasificación solo sugerida: ${sinConfirmar
          .slice(0, 5)
          .map((c) => c.codigo)
          .join(", ")}. Confírmalas antes de contabilizar la corrección.`,
        409
      );
    }

    const configResult = await client.query(
      `SELECT cuenta_correccion_monetaria_id, cuenta_revalorizacion_capital_id
       FROM configuracion_contable WHERE empresa_id = $1`,
      [empresa_id]
    );
    const config = configResult.rows[0] || {};

    if (!config.cuenta_correccion_monetaria_id || !config.cuenta_revalorizacion_capital_id) {
      throw error(
        "Falta configurar las cuentas de corrección monetaria y de revalorización del capital propio en Configuración Contable.",
        400
      );
    }

    // El asiento: cada cuenta no monetaria se ajusta contra corrección
    // monetaria, y la revalorización del capital propio va a su cuenta de
    // patrimonio.
    const lineas = [];

    for (const linea of propuesta.lineas) {
      if (!linea.cuenta_id) continue;

      const esActivo = linea.efecto === "agregado";

      lineas.push({
        cuenta_id: Number(linea.cuenta_id),
        glosa: linea.concepto,
        debe: esActivo ? Math.abs(linea.correccion) : 0,
        haber: esActivo ? 0 : Math.abs(linea.correccion),
      });
    }

    const netoActivosPasivos = redondearLineas(lineas);

    if (netoActivosPasivos !== 0) {
      lineas.push({
        cuenta_id: Number(config.cuenta_correccion_monetaria_id),
        glosa: `Resultado por corrección monetaria ${anio}`,
        debe: netoActivosPasivos < 0 ? Math.abs(netoActivosPasivos) : 0,
        haber: netoActivosPasivos > 0 ? netoActivosPasivos : 0,
      });
    }

    if (propuesta.correccion_capital_propio !== 0) {
      const monto = Math.abs(propuesta.correccion_capital_propio);

      lineas.push({
        cuenta_id: Number(config.cuenta_correccion_monetaria_id),
        glosa: `Revalorización del capital propio ${anio}`,
        debe: monto,
        haber: 0,
      });
      lineas.push({
        cuenta_id: Number(config.cuenta_revalorizacion_capital_id),
        glosa: `Revalorización del capital propio ${anio}`,
        debe: 0,
        haber: monto,
      });
    }

    const totalDebe = lineas.reduce((suma, l) => suma + l.debe, 0);
    const totalHaber = lineas.reduce((suma, l) => suma + l.haber, 0);

    if (Math.round(totalDebe) !== Math.round(totalHaber)) {
      throw error(
        `El asiento de corrección monetaria no cuadra: ${totalDebe} contra ${totalHaber}.`,
        500
      );
    }

    const numero = await obtenerSiguienteNumeroComprobante(client, empresa_id, "Correccion");

    const comprobanteResult = await client.query(
      `INSERT INTO comprobantes
         (empresa_id, periodo, fecha, tipo, numero, glosa, total_debe, total_haber, estado)
       VALUES ($1, $2, $3, 'Correccion', $4, $5, $6, $7, 'vigente')
       RETURNING *`,
      [
        empresa_id,
        `${anio}-12`,
        `${anio}-12-31`,
        numero,
        `Corrección monetaria ${anio} (factor ${propuesta.factor_anual})`,
        totalDebe,
        totalHaber,
      ]
    );

    const comprobante = comprobanteResult.rows[0];

    await insertarDetallesComprobante(client, comprobante.id, lineas);

    const registro = await client.query(
      `INSERT INTO correcciones_monetarias
         (empresa_id, anio, factor_anual, capital_propio_inicial, correccion_capital_propio,
          correccion_activos, correccion_pasivos, resultado_correccion, detalle, criterio,
          comprobante_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        empresa_id,
        anio,
        propuesta.factor_anual,
        propuesta.capital_propio_inicial.capital_propio,
        propuesta.correccion_capital_propio,
        propuesta.correccion_activos,
        propuesta.correccion_pasivos,
        propuesta.resultado_correccion,
        JSON.stringify({ lineas: propuesta.lineas, porcentajes: propuesta.porcentajes_mensuales, fuente: propuesta.fuente }),
        criterioLimpio,
        comprobante.id,
      ]
    );

    await registrarAuditoria({
      client,
      req,
      empresaId: Number(empresa_id),
      modulo: "Correccion monetaria",
      accion: "Contabilizar correccion monetaria",
      detalle: `Año ${anio}, factor ${propuesta.factor_anual}, resultado ${propuesta.resultado_correccion}`,
      tablaAfectada: "correcciones_monetarias",
      registroId: Number(registro.rows[0].id),
    });

    await client.query("COMMIT");

    return res.status(201).json({
      mensaje: `Corrección monetaria de ${anio} contabilizada`,
      comprobante,
      correccion: registro.rows[0],
      avisos: propuesta.avisos,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});

    if (err.code === "23505") {
      return res.status(409).json({ error: "La corrección monetaria de este año ya estaba registrada." });
    }

    console.error("Error al contabilizar la corrección monetaria:", err);

    return responderError(res, err, "Error interno al contabilizar la corrección monetaria");
  } finally {
    client.release();
  }
}

function redondearLineas(lineas) {
  const debe = lineas.reduce((suma, l) => suma + Number(l.debe || 0), 0);
  const haber = lineas.reduce((suma, l) => suma + Number(l.haber || 0), 0);

  return Math.round(debe - haber);
}

/**
 * Carga o corrige la variación del IPC de un período en los parámetros
 * nacionales. Es un dato nacional: se carga una vez y sirve a todas las
 * empresas.
 */
async function guardarVariacionIpc(req, res) {
  try {
    const { periodo, variacion_ipc } = req.body;

    if (!/^\d{4}-\d{2}$/.test(String(periodo || ""))) {
      return res.status(400).json({ error: "El periodo debe tener formato AAAA-MM" });
    }

    const variacion = Number(variacion_ipc);

    if (!Number.isFinite(variacion) || variacion < -20 || variacion > 20) {
      return res.status(400).json({
        error: "La variación del IPC debe ser un porcentaje entre -20 y 20.",
      });
    }

    const resultado = await pool.query(
      `INSERT INTO parametros_nacionales (periodo, variacion_ipc, fuente)
       VALUES ($1, $2, 'carga manual')
       ON CONFLICT (periodo) DO UPDATE SET variacion_ipc = EXCLUDED.variacion_ipc
       RETURNING periodo, variacion_ipc`,
      [periodo, variacion]
    );

    return res.json({
      mensaje: `Variación del IPC de ${periodo} guardada`,
      parametro: resultado.rows[0],
      aviso:
        "El dato es el que publica el INE. REQUIERE VALIDACIÓN: cotéjalo con la publicación oficial del mes.",
    });
  } catch (err) {
    console.error("Error al guardar la variación del IPC:", err);

    return responderError(res, err, "Error interno al guardar la variación del IPC");
  }
}

module.exports = {
  obtenerCorreccion,
  clasificarCuentas,
  sugerirClasificaciones,
  contabilizarCorreccion,
  guardarVariacionIpc,
};
