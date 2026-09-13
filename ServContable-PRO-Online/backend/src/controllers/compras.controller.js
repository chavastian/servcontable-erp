const pool = require("../database/db");

const {
  crearComprobanteAutomaticoCompra,
  actualizarComprobanteAutomaticoCompra,
} = require("../helpers/comprobante.helper");
const { registrarAuditoria } = require("../helpers/auditoria.helper");

const { parse } = require("csv-parse/sync");

const {
  convertirFechaSII,
  convertirNumeroSII,
  obtenerPeriodoDesdeFecha,
  mapearTipoDocumentoSII,
} = require("../helpers/siiCsv.helper");

function esVerdadero(valor) {
  return String(valor).toLowerCase() === "true";
}

async function obtenerCuentaPorTipos(client, empresaId, tipos = []) {
  if (!Array.isArray(tipos) || tipos.length === 0) return null;

  const cuentaResult = await client.query(
    `
    SELECT id
    FROM plan_cuentas
    WHERE empresa_id = $1
      AND tipo = ANY($2::text[])
    ORDER BY array_position($2::text[], tipo) ASC, codigo ASC, id ASC
    LIMIT 1
    `,
    [empresaId, tipos]
  );

  return cuentaResult.rows[0]?.id || null;
}

async function obtenerCuentaPorPatronesTipo(client, empresaId, patrones = []) {
  if (!Array.isArray(patrones) || patrones.length === 0) return null;

  const cuentaResult = await client.query(
    `
    SELECT id
    FROM plan_cuentas
    WHERE empresa_id = $1
      AND tipo ILIKE ANY($2::text[])
    ORDER BY codigo ASC, id ASC
    LIMIT 1
    `,
    [empresaId, patrones]
  );

  return cuentaResult.rows[0]?.id || null;
}

async function obtenerCuentaGastoFallback(client, empresaId) {
  const cuentaGastoCosto = await obtenerCuentaPorTipos(client, empresaId, [
    "Gasto",
    "Costo",
  ]);
  if (cuentaGastoCosto) return cuentaGastoCosto;

  const cuentaPerdida = await obtenerCuentaPorPatronesTipo(client, empresaId, [
    "%rdida%",
  ]);
  if (cuentaPerdida) return cuentaPerdida;

  const cuentaActivo = await obtenerCuentaPorTipos(client, empresaId, ["Activo"]);
  if (cuentaActivo) return cuentaActivo;

  return null;
}

async function asegurarColumnasCompraExtras(client) {
  await client.query(`
    ALTER TABLE compras
    ADD COLUMN IF NOT EXISTS otros_impuestos NUMERIC DEFAULT 0
  `);

  await client.query(`
    ALTER TABLE compras
    ADD COLUMN IF NOT EXISTS cuenta_otros_impuestos_id INTEGER
  `);
}

function convertirCuentaId(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function calcularOtrosImpuestosMonto({
  total,
  neto,
  exento,
  iva_credito,
  iva_no_recuperable,
}) {
  const totalNum = Number(total || 0);
  const baseNum =
    Number(neto || 0) +
    Number(exento || 0) +
    Number(iva_credito || 0) +
    Number(iva_no_recuperable || 0);

  const diferencia = totalNum - baseNum;
  return Math.abs(diferencia) < 1 ? 0 : diferencia;
}

async function crearCompra(req, res) {
  const client = await pool.connect();

  try {
    const {
      empresa_id,
      periodo,
      fecha,
      tipo_documento,
      folio,
      rut_proveedor,
      razon_social_proveedor,
      neto,
      exento,
      iva_credito,
      iva_no_recuperable,
      otros_impuestos,
      total,
      cuenta_gasto_id,
      cuenta_otros_impuestos_id,
      generar_comprobante = true,
    } = req.body;

    if (!empresa_id || !fecha || !tipo_documento) {
      return res.status(400).json({
        error: "Empresa, fecha y tipo de documento son obligatorios",
      });
    }

    const periodoCompra = periodo || obtenerPeriodoDesdeFecha(fecha);
    const netoNum = Number(neto || 0);
    const exentoNum = Number(exento || 0);
    const ivaCreditoNum = Number(iva_credito || 0);
    const ivaNoRecNum = Number(iva_no_recuperable || 0);
    const otrosImpuestosNum = Number(otros_impuestos || 0);
    const totalNum = Number(
      total || netoNum + exentoNum + ivaCreditoNum + ivaNoRecNum + otrosImpuestosNum
    );
    const cuentaOtrosImpuestosId = convertirCuentaId(cuenta_otros_impuestos_id);

    await asegurarColumnasCompraExtras(client);

    await client.query("BEGIN");

    const compraResult = await client.query(
      `INSERT INTO compras
       (empresa_id, periodo, fecha, tipo_documento, folio, rut_proveedor,
         razon_social_proveedor, neto, exento, iva_credito, iva_no_recuperable,
         otros_impuestos, total, cuenta_gasto_id, cuenta_otros_impuestos_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        empresa_id,
        periodoCompra,
        fecha,
        tipo_documento,
        folio || "",
        rut_proveedor || "",
        razon_social_proveedor || "",
        netoNum,
        exentoNum,
        ivaCreditoNum,
        ivaNoRecNum,
        otrosImpuestosNum,
        totalNum,
        cuenta_gasto_id || null,
        cuentaOtrosImpuestosId,
      ]
    );

    const compra = compraResult.rows[0];

    let comprobante = null;

    if (generar_comprobante) {
      const configResult = await client.query(
        `SELECT *
         FROM configuracion_contable
         WHERE empresa_id = $1`,
        [empresa_id]
      );

      if (configResult.rows.length === 0) {
        throw new Error(
          "Debes guardar la Configuracion Contable antes de generar comprobantes automaticos"
        );
      }

      comprobante = await crearComprobanteAutomaticoCompra(
        client,
        compra,
        configResult.rows[0]
      );

      await client.query(
        `UPDATE compras
         SET comprobante_id = $1
         WHERE id = $2`,
        [comprobante.id, compra.id]
      );

      compra.comprobante_id = comprobante.id;
    }

    await registrarAuditoria({
      client,
      req,
      empresaId: Number(empresa_id),
      modulo: "Compras",
      accion: "Registrar compra",
      detalle: `Compra ${tipo_documento} folio ${folio || ""}`.trim(),
      tablaAfectada: "compras",
      registroId: Number(compra.id),
      datos: {
        neto: netoNum,
        exento: exentoNum,
        iva_credito: ivaCreditoNum,
        iva_no_recuperable: ivaNoRecNum,
        otros_impuestos: otrosImpuestosNum,
        total: totalNum,
        comprobante_id: compra.comprobante_id || null,
      },
    });

    await client.query("COMMIT");

    return res.status(201).json({
      mensaje: generar_comprobante
        ? "Compra registrada y comprobante automatico creado correctamente"
        : "Compra registrada correctamente",
      compra,
      comprobante,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error al crear compra:", error);

    return res.status(500).json({
      error: error.message || "Error interno al crear compra",
    });
  } finally {
    client.release();
  }
}

async function listarCompras(req, res) {
  try {
    const { empresa_id, periodo, fecha_desde, fecha_hasta } = req.query;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    let query = `
      SELECT
        c.*,
        pc.codigo AS cuenta_codigo,
        pc.nombre AS cuenta_nombre
      FROM compras c
      LEFT JOIN plan_cuentas pc ON pc.id = c.cuenta_gasto_id
      WHERE c.empresa_id = $1
        AND c.estado = 'vigente'
    `;

    const valores = [empresa_id];

    if (periodo) {
      valores.push(periodo);
      query += ` AND c.periodo = $${valores.length}`;
    }

    if (fecha_desde) {
      valores.push(fecha_desde);
      query += ` AND c.fecha >= $${valores.length}`;
    }

    if (fecha_hasta) {
      valores.push(fecha_hasta);
      query += ` AND c.fecha <= $${valores.length}`;
    }

    query += ` ORDER BY c.fecha DESC, c.id DESC`;

    const resultado = await pool.query(query, valores);

    const totales = resultado.rows.reduce(
      (acc, compra) => {
        acc.neto += Number(compra.neto || 0);
        acc.exento += Number(compra.exento || 0);
        acc.iva_credito += Number(compra.iva_credito || 0);
        acc.iva_no_recuperable += Number(compra.iva_no_recuperable || 0);
        acc.otros_impuestos += Number(compra.otros_impuestos || 0);
        acc.total += Number(compra.total || 0);
        return acc;
      },
      {
        neto: 0,
        exento: 0,
        iva_credito: 0,
        iva_no_recuperable: 0,
        otros_impuestos: 0,
        total: 0,
      }
    );

    return res.json({
      total: resultado.rows.length,
      totales,
      compras: resultado.rows,
    });
  } catch (error) {
    console.error("Error al listar compras:", error);

    return res.status(500).json({
      error: "Error interno al listar compras",
    });
  }
}

async function importarComprasSII(req, res) {
  const client = await pool.connect();

  try {
    const {
      empresa_id,
      periodo,
      generar_comprobante = "true",
    } = req.body;
    const generarComprobante = esVerdadero(generar_comprobante);

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "Debe adjuntar un archivo CSV",
      });
    }

    const contenido = req.file.buffer.toString("utf8");

    const registros = parse(contenido, {
      columns: true,
      delimiter: ";",
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
      trim: true,
    });

    await asegurarColumnasCompraExtras(client);

    const configResult = await client.query(
      `SELECT *
       FROM configuracion_contable
       WHERE empresa_id = $1`,
      [empresa_id]
    );

    if (configResult.rows.length === 0 && generarComprobante) {
      return res.status(400).json({
        error:
          "Debes guardar la Configuracion Contable antes de importar compras con comprobante automatico",
      });
    }

    const configuracion = configResult.rows[0]
      ? { ...configResult.rows[0] }
      : {};
    const cuentaOtrosImpuestosConfig = convertirCuentaId(
      configuracion.cuenta_otros_impuestos_id
    );

    if (generarComprobante && !configuracion.cuenta_gasto_defecto_id) {
      configuracion.cuenta_gasto_defecto_id = await obtenerCuentaGastoFallback(
        client,
        empresa_id
      );
    }

    if (generarComprobante) {
      const faltantes = [];

      if (
        !configuracion.cuenta_proveedores_id &&
        !configuracion.cuenta_caja_banco_id
      ) {
        faltantes.push("Cuenta Proveedores o Cuenta Caja/Banco");
      }

      if (!configuracion.cuenta_gasto_defecto_id) {
        faltantes.push("Cuenta Gasto por defecto");
      }

      if (!configuracion.cuenta_iva_credito_id) {
        faltantes.push("Cuenta IVA Credito Fiscal");
      }

      if (faltantes.length > 0) {
        return res.status(400).json({
          error: `No se pueden generar comprobantes automaticos. Faltan configurar: ${faltantes.join(
            ", "
          )}.`,
        });
      }
    }

    await client.query("BEGIN");

    let insertadas = 0;
    let actualizadas = 0;
    let omitidas = 0;
    let comprobantesCreados = 0;
    const errores = [];

    for (const fila of registros) {
      try {
        const siiTipoDoc = String(fila["Tipo Doc"] || "").trim();
        const folio = String(fila["Folio"] || "").trim();

        if (!folio || !siiTipoDoc) {
          omitidas++;
          continue;
        }

        const fecha = convertirFechaSII(fila["Fecha Docto"]);

        if (!fecha) {
          errores.push(`Folio ${folio}: fecha invalida`);
          omitidas++;
          continue;
        }

        const periodoCompra = periodo || obtenerPeriodoDesdeFecha(fecha);
        const neto = convertirNumeroSII(fila["Monto Neto"]);
        const exento = convertirNumeroSII(fila["Monto Exento"]);
        const ivaCredito = convertirNumeroSII(fila["Monto IVA Recuperable"]);
        const ivaNoRecuperable = convertirNumeroSII(
          fila["Monto Iva No Recuperable"]
        );
        const total = convertirNumeroSII(fila["Monto Total"]);
        const otrosImpuestos = calcularOtrosImpuestosMonto({
          total,
          neto,
          exento,
          iva_credito: ivaCredito,
          iva_no_recuperable: ivaNoRecuperable,
        });

        const faltaCuentaOtrosImpuestos =
          Number(otrosImpuestos) > 0 && !cuentaOtrosImpuestosConfig;

        if (faltaCuentaOtrosImpuestos) {
          errores.push(
            `Folio ${folio}: se importo con otros impuestos, pero falta configurar su cuenta contable en Configuracion Contable para generar/actualizar comprobante`
          );
        }

        const existe = await client.query(
          `SELECT *
           FROM compras
           WHERE empresa_id = $1
             AND sii_tipo_doc = $2
             AND folio = $3
           LIMIT 1`,
          [empresa_id, siiTipoDoc, folio]
        );

        if (existe.rows.length > 0) {
          const compraActualizadaResult = await client.query(
            `UPDATE compras
             SET
               periodo = $1,
               fecha = $2,
               tipo_documento = $3,
               rut_proveedor = $4,
               razon_social_proveedor = $5,
               neto = $6,
               exento = $7,
               iva_credito = $8,
               iva_no_recuperable = $9,
               otros_impuestos = $10,
               total = $11,
               cuenta_otros_impuestos_id = $12
             WHERE id = $13
             RETURNING *`,
            [
              periodoCompra,
              fecha,
              mapearTipoDocumentoSII(siiTipoDoc),
              fila["RUT Proveedor"] || "",
              fila["Razon Social"] || "",
              neto,
              exento,
              ivaCredito,
              ivaNoRecuperable,
              otrosImpuestos,
              total,
              cuentaOtrosImpuestosConfig,
              existe.rows[0].id,
            ]
          );

          const compraExistente = compraActualizadaResult.rows[0];
          actualizadas++;

          if (generarComprobante && !faltaCuentaOtrosImpuestos) {
            if (compraExistente.comprobante_id) {
              const comprobanteActualizado =
                await actualizarComprobanteAutomaticoCompra(
                  client,
                  compraExistente,
                  configuracion,
                  compraExistente.comprobante_id
                );

              if (!comprobanteActualizado) {
                const comprobanteNuevo = await crearComprobanteAutomaticoCompra(
                  client,
                  compraExistente,
                  configuracion
                );
                await client.query(
                  `UPDATE compras
                   SET comprobante_id = $1
                   WHERE id = $2`,
                  [comprobanteNuevo.id, compraExistente.id]
                );
                comprobantesCreados++;
              }
            } else {
              const comprobanteNuevo = await crearComprobanteAutomaticoCompra(
                client,
                compraExistente,
                configuracion
              );
              await client.query(
                `UPDATE compras
                 SET comprobante_id = $1
                 WHERE id = $2`,
                [comprobanteNuevo.id, compraExistente.id]
              );
              comprobantesCreados++;
            }
          }

          continue;
        }

        const compraResult = await client.query(
          `INSERT INTO compras
           (empresa_id, periodo, fecha, tipo_documento, sii_tipo_doc, folio,
             rut_proveedor, razon_social_proveedor, neto, exento,
            iva_credito, iva_no_recuperable, otros_impuestos, total, cuenta_gasto_id,
            cuenta_otros_impuestos_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           RETURNING *`,
          [
            empresa_id,
            periodoCompra,
            fecha,
            mapearTipoDocumentoSII(siiTipoDoc),
            siiTipoDoc,
            folio,
            fila["RUT Proveedor"] || "",
            fila["Razon Social"] || "",
            neto,
            exento,
            ivaCredito,
            ivaNoRecuperable,
            otrosImpuestos,
            total,
            configuracion.cuenta_gasto_defecto_id || null,
            cuentaOtrosImpuestosConfig,
          ]
        );

        const compra = compraResult.rows[0];
        insertadas++;

          if (generarComprobante && !faltaCuentaOtrosImpuestos) {
            const comprobante = await crearComprobanteAutomaticoCompra(
              client,
              compra,
            configuracion
          );

          await client.query(
            `UPDATE compras
             SET comprobante_id = $1
             WHERE id = $2`,
            [comprobante.id, compra.id]
          );

          comprobantesCreados++;
        }
      } catch (errorFila) {
        errores.push(
          `Folio ${fila["Folio"] || "sin folio"}: ${errorFila.message}`
        );
        omitidas++;
      }
    }

    await registrarAuditoria({
      client,
      req,
      empresaId: Number(empresa_id),
      modulo: "Compras",
      accion: "Importar CSV SII",
      detalle: `Importacion finalizada: ${insertadas} insertadas, ${actualizadas} actualizadas, ${omitidas} omitidas`,
      tablaAfectada: "compras",
      registroId: null,
      datos: {
        total_filas: registros.length,
        insertadas,
        actualizadas,
        omitidas,
        comprobantes_creados: comprobantesCreados,
      },
    });

    await client.query("COMMIT");

    return res.json({
      mensaje: "Importacion de compras SII finalizada",
      total_filas: registros.length,
      insertadas,
      actualizadas,
      omitidas,
      comprobantes_creados: comprobantesCreados,
      errores,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error al importar compras SII:", error);

    return res.status(500).json({
      error: error.message || "Error interno al importar compras SII",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  crearCompra,
  listarCompras,
  importarComprasSII,
};

