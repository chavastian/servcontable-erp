/**
 * Ajuste del IVA de uso común no recuperable.
 *
 * El bloque 3 dejó el cálculo: el factor de proporcionalidad acumulado del año
 * reparte el IVA de uso común entre lo recuperable y lo que no (artículo 43 del
 * reglamento del DL 825). Pero eso solo se informaba en el F29. Contablemente
 * el IVA de uso común entra completo como crédito fiscal, y la parte que la
 * empresa no puede recuperar tiene que salir de esa cuenta e irse a gasto: si
 * no, el crédito fiscal contable queda inflado para siempre.
 *
 * Esto NO se hace solo. Se calcula, se muestra y alguien lo confirma, porque
 * el momento del ajuste —cada mes con el factor acumulado, o una vez en
 * diciembre con el definitivo— es criterio del contador.
 */

const pool = require("../database/db");
const { calcularF29 } = require("../helpers/f29.helper");
const {
  obtenerSiguienteNumeroComprobante,
  insertarDetallesComprobante,
} = require("../helpers/comprobante.helper");
const { registrarAuditoria } = require("../helpers/auditoria.helper");

const AVISO_CRITERIO =
  "El momento del ajuste (mensual con el factor acumulado, o una sola vez en diciembre con el factor definitivo) es criterio contable. REQUIERE VALIDACIÓN CONTABLE.";

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

function redondear(valor) {
  return Math.round(Number(valor || 0));
}

async function calculoDelPeriodo(cliente, empresaId, periodo) {
  const f29 = await calcularF29(cliente, empresaId, periodo);

  return {
    iva_uso_comun: redondear(f29.compras.iva_uso_comun),
    credito_recuperable: redondear(f29.compras.credito_uso_comun),
    no_recuperable: redondear(f29.compras.uso_comun_no_recuperable),
    proporcionalidad: f29.proporcionalidad,
  };
}

async function obtenerAjuste(req, res) {
  try {
    const { empresa_id, periodo } = req.query;

    if (!empresa_id || !/^\d{4}-\d{2}$/.test(String(periodo || ""))) {
      return res.status(400).json({ error: "Debe indicar empresa_id y periodo AAAA-MM" });
    }

    const calculo = await calculoDelPeriodo(pool, empresa_id, periodo);

    const registrado = await pool.query(
      `SELECT a.*, c.numero AS comprobante_numero
       FROM ajustes_iva_uso_comun a
       LEFT JOIN comprobantes c ON c.id = a.comprobante_id
       WHERE a.empresa_id = $1 AND a.periodo = $2 AND a.estado = 'vigente'
       LIMIT 1`,
      [empresa_id, periodo]
    );

    const avisos = [AVISO_CRITERIO];

    if (calculo.iva_uso_comun > 0 && calculo.no_recuperable === 0) {
      avisos.push(
        "Todo el IVA de uso común quedó como crédito recuperable porque el período no registra ventas exentas en el año."
      );
    }

    return res.json({
      periodo,
      ...calculo,
      ajuste_registrado: registrado.rows[0] || null,
      avisos,
    });
  } catch (err) {
    console.error("Error al obtener el ajuste de IVA de uso común:", err);

    return responderError(res, err, "Error interno al calcular el ajuste de IVA de uso común");
  }
}

/**
 * Lleva a gasto la parte no recuperable: debita la cuenta de gasto configurada
 * y abona el IVA crédito fiscal.
 */
async function contabilizarAjuste(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id, periodo } = req.body;

    if (!empresa_id || !/^\d{4}-\d{2}$/.test(String(periodo || ""))) {
      return res.status(400).json({ error: "Debe indicar empresa_id y periodo AAAA-MM" });
    }

    await client.query("BEGIN");

    const yaRegistrado = await client.query(
      `SELECT id FROM ajustes_iva_uso_comun
       WHERE empresa_id = $1 AND periodo = $2 AND estado = 'vigente' LIMIT 1`,
      [empresa_id, periodo]
    );

    if (yaRegistrado.rows.length > 0) {
      throw error(`El ajuste de ${periodo} ya está contabilizado.`, 409);
    }

    const calculo = await calculoDelPeriodo(client, empresa_id, periodo);

    if (calculo.no_recuperable <= 0) {
      throw error(
        "No hay IVA de uso común no recuperable en este período: no hay nada que ajustar.",
        400
      );
    }

    const configResult = await client.query(
      `SELECT cuenta_iva_credito_id, cuenta_iva_uso_comun_no_rec_id, cuenta_gasto_defecto_id
       FROM configuracion_contable WHERE empresa_id = $1`,
      [empresa_id]
    );
    const config = configResult.rows[0] || {};
    const cuentaGasto = config.cuenta_iva_uso_comun_no_rec_id;
    const cuentaIvaCredito = config.cuenta_iva_credito_id;

    if (!cuentaGasto) {
      throw error(
        "Falta configurar la cuenta de IVA de uso común no recuperable en Configuración Contable.",
        400
      );
    }

    if (!cuentaIvaCredito) {
      throw error("Falta configurar la cuenta de IVA crédito fiscal en Configuración Contable.", 400);
    }

    const [anio, mes] = periodo.split("-").map(Number);
    const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    const fecha = `${periodo}-${String(ultimoDia).padStart(2, "0")}`;
    const glosa = `IVA de uso común no recuperable ${periodo} (factor ${Number(
      calculo.proporcionalidad?.factor || 0
    ).toFixed(4)})`;

    const numero = await obtenerSiguienteNumeroComprobante(client, empresa_id, "Ajuste");

    const comprobanteResult = await client.query(
      `INSERT INTO comprobantes
         (empresa_id, periodo, fecha, tipo, numero, glosa, total_debe, total_haber, estado)
       VALUES ($1, $2, $3, 'Ajuste', $4, $5, $6, $6, 'vigente')
       RETURNING *`,
      [empresa_id, periodo, fecha, numero, glosa, calculo.no_recuperable]
    );

    const comprobante = comprobanteResult.rows[0];

    await insertarDetallesComprobante(client, comprobante.id, [
      { cuenta_id: Number(cuentaGasto), glosa, debe: calculo.no_recuperable, haber: 0 },
      { cuenta_id: Number(cuentaIvaCredito), glosa, debe: 0, haber: calculo.no_recuperable },
    ]);

    const ajuste = await client.query(
      `INSERT INTO ajustes_iva_uso_comun
         (empresa_id, periodo, iva_uso_comun, factor, credito_recuperable, no_recuperable,
          comprobante_id, observacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        empresa_id,
        periodo,
        calculo.iva_uso_comun,
        Number(calculo.proporcionalidad?.factor || 0),
        calculo.credito_recuperable,
        calculo.no_recuperable,
        comprobante.id,
        AVISO_CRITERIO,
      ]
    );

    await registrarAuditoria({
      client,
      req,
      empresaId: Number(empresa_id),
      modulo: "IVA de uso comun",
      accion: "Contabilizar ajuste",
      detalle: `${periodo}: ${calculo.no_recuperable} no recuperable con factor ${Number(
        calculo.proporcionalidad?.factor || 0
      ).toFixed(4)}`,
      tablaAfectada: "ajustes_iva_uso_comun",
      registroId: Number(ajuste.rows[0].id),
    });

    await client.query("COMMIT");

    return res.status(201).json({
      mensaje: `Ajuste de IVA de uso común de ${periodo} contabilizado`,
      comprobante,
      ajuste: ajuste.rows[0],
      avisos: [AVISO_CRITERIO],
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});

    if (err.code === "23505") {
      return res.status(409).json({ error: "El ajuste de este período ya estaba registrado." });
    }

    console.error("Error al contabilizar el ajuste de IVA de uso común:", err);

    return responderError(res, err, "Error interno al contabilizar el ajuste");
  } finally {
    client.release();
  }
}

module.exports = { obtenerAjuste, contabilizarAjuste };
