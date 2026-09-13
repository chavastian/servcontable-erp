const pool = require("../database/db");
const {
  crearComprobanteAutomaticoVenta,
} = require("../helpers/comprobante.helper");

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

async function crearVenta(req, res) {
  const client = await pool.connect();

  try {
    const {
      empresa_id,
      periodo,
      fecha,
      tipo_documento,
      folio,
      rut_cliente,
      razon_social_cliente,
      neto,
      exento,
      iva,
      total,
      cuenta_ingreso_id,
      generar_comprobante = true,
    } = req.body;

    if (!empresa_id || !fecha || !tipo_documento) {
      return res.status(400).json({
        error: "Empresa, fecha y tipo de documento son obligatorios",
      });
    }

    const periodoVenta = periodo || obtenerPeriodoDesdeFecha(fecha);
    const netoNum = Number(neto || 0);
    const exentoNum = Number(exento || 0);
    const ivaNum = Number(iva || 0);
    const totalNum = Number(total || netoNum + exentoNum + ivaNum);

    await client.query("BEGIN");

    const ventaResult = await client.query(
      `INSERT INTO ventas
       (empresa_id, periodo, fecha, tipo_documento, folio, rut_cliente,
        razon_social_cliente, neto, exento, iva, total, cuenta_ingreso_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        empresa_id,
        periodoVenta,
        fecha,
        tipo_documento,
        folio || "",
        rut_cliente || "",
        razon_social_cliente || "",
        netoNum,
        exentoNum,
        ivaNum,
        totalNum,
        cuenta_ingreso_id || null,
      ]
    );

    const venta = ventaResult.rows[0];

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
          "Debes guardar la Configuración Contable antes de generar comprobantes automáticos"
        );
      }

      comprobante = await crearComprobanteAutomaticoVenta(
        client,
        venta,
        configResult.rows[0]
      );

      await client.query(
        `UPDATE ventas
         SET comprobante_id = $1
         WHERE id = $2`,
        [comprobante.id, venta.id]
      );

      venta.comprobante_id = comprobante.id;
    }

    await client.query("COMMIT");

    return res.status(201).json({
      mensaje: generar_comprobante
        ? "Venta registrada y comprobante automático creado correctamente"
        : "Venta registrada correctamente",
      venta,
      comprobante,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error al crear venta:", error);

    return res.status(500).json({
      error: error.message || "Error interno al crear venta",
    });
  } finally {
    client.release();
  }
}

async function listarVentas(req, res) {
  try {
    const { empresa_id, periodo, fecha_desde, fecha_hasta } = req.query;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    let query = `
      SELECT
        v.*,
        pc.codigo AS cuenta_codigo,
        pc.nombre AS cuenta_nombre
      FROM ventas v
      LEFT JOIN plan_cuentas pc ON pc.id = v.cuenta_ingreso_id
      WHERE v.empresa_id = $1
        AND v.estado = 'vigente'
    `;

    const valores = [empresa_id];

    if (periodo) {
      valores.push(periodo);
      query += ` AND v.periodo = $${valores.length}`;
    }

    if (fecha_desde) {
      valores.push(fecha_desde);
      query += ` AND v.fecha >= $${valores.length}`;
    }

    if (fecha_hasta) {
      valores.push(fecha_hasta);
      query += ` AND v.fecha <= $${valores.length}`;
    }

    query += ` ORDER BY v.fecha DESC, v.id DESC`;

    const resultado = await pool.query(query, valores);

    const totales = resultado.rows.reduce(
      (acc, venta) => {
        acc.neto += Number(venta.neto || 0);
        acc.exento += Number(venta.exento || 0);
        acc.iva += Number(venta.iva || 0);
        acc.total += Number(venta.total || 0);
        return acc;
      },
      {
        neto: 0,
        exento: 0,
        iva: 0,
        total: 0,
      }
    );

    return res.json({
      total: resultado.rows.length,
      totales,
      ventas: resultado.rows,
    });
  } catch (error) {
    console.error("Error al listar ventas:", error);

    return res.status(500).json({
      error: "Error interno al listar ventas",
    });
  }
}

async function importarVentasSII(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id, periodo, generar_comprobante = "true" } = req.body;
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

    const configResult = await client.query(
      `SELECT *
       FROM configuracion_contable
       WHERE empresa_id = $1`,
      [empresa_id]
    );

    if (configResult.rows.length === 0) {
      return res.status(400).json({
        error:
          "Debes guardar la Configuración Contable antes de importar ventas con comprobante automático",
      });
    }

    const configuracion = { ...configResult.rows[0] };

    if (generarComprobante && !configuracion.cuenta_ingreso_defecto_id) {
      configuracion.cuenta_ingreso_defecto_id = await obtenerCuentaPorTipos(
        client,
        empresa_id,
        ["Ingreso", "Ganancia"]
      );
    }

    if (generarComprobante) {
      const faltantes = [];

      if (
        !configuracion.cuenta_clientes_id &&
        !configuracion.cuenta_caja_banco_id
      ) {
        faltantes.push("Cuenta Clientes o Cuenta Caja/Banco");
      }

      if (!configuracion.cuenta_ingreso_defecto_id) {
        faltantes.push("Cuenta Ingreso por defecto");
      }

      if (!configuracion.cuenta_iva_debito_id) {
        faltantes.push("Cuenta IVA Débito Fiscal");
      }

      if (faltantes.length > 0) {
        return res.status(400).json({
          error: `No se pueden generar comprobantes automáticos. Faltan configurar: ${faltantes.join(
            ", "
          )}.`,
        });
      }
    }

    await client.query("BEGIN");

    let insertadas = 0;
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
          errores.push(`Folio ${folio}: fecha inválida`);
          omitidas++;
          continue;
        }

        const periodoVenta = periodo || obtenerPeriodoDesdeFecha(fecha);

        const existe = await client.query(
          `SELECT *
           FROM ventas
           WHERE empresa_id = $1
             AND sii_tipo_doc = $2
             AND folio = $3
           LIMIT 1`,
          [empresa_id, siiTipoDoc, folio]
        );

        if (existe.rows.length > 0) {
          const ventaExistente = existe.rows[0];

          if (generarComprobante && !ventaExistente.comprobante_id) {
            const comprobante = await crearComprobanteAutomaticoVenta(
              client,
              ventaExistente,
              configuracion
            );

            await client.query(
              `UPDATE ventas
               SET comprobante_id = $1
               WHERE id = $2`,
              [comprobante.id, ventaExistente.id]
            );

            comprobantesCreados++;
          }

          omitidas++;
          continue;
        }

        const neto = convertirNumeroSII(fila["Monto Neto"]);
        const exento = convertirNumeroSII(fila["Monto Exento"]);
        const iva = convertirNumeroSII(fila["Monto IVA"]);
        const total = convertirNumeroSII(fila["Monto total"]);

        const ventaResult = await client.query(
          `INSERT INTO ventas
           (empresa_id, periodo, fecha, tipo_documento, sii_tipo_doc, folio,
            rut_cliente, razon_social_cliente, neto, exento, iva, total,
            cuenta_ingreso_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           RETURNING *`,
          [
            empresa_id,
            periodoVenta,
            fecha,
            mapearTipoDocumentoSII(siiTipoDoc),
            siiTipoDoc,
            folio,
            fila["Rut cliente"] || "",
            fila["Razon Social"] || "",
            neto,
            exento,
            iva,
            total,
            configuracion.cuenta_ingreso_defecto_id || null,
          ]
        );

        const venta = ventaResult.rows[0];
        insertadas++;

        if (generarComprobante) {
          const comprobante = await crearComprobanteAutomaticoVenta(
            client,
            venta,
            configuracion
          );

          await client.query(
            `UPDATE ventas
             SET comprobante_id = $1
             WHERE id = $2`,
            [comprobante.id, venta.id]
          );

          comprobantesCreados++;
        }
      } catch (errorFila) {
        errores.push(`Folio ${fila["Folio"] || "sin folio"}: ${errorFila.message}`);
        omitidas++;
      }
    }

    await client.query("COMMIT");

    return res.json({
      mensaje: "Importación de ventas SII finalizada",
      total_filas: registros.length,
      insertadas,
      omitidas,
      comprobantes_creados: comprobantesCreados,
      errores,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error al importar ventas SII:", error);

    return res.status(500).json({
      error: error.message || "Error interno al importar ventas SII",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  crearVenta,
  listarVentas,
  importarVentasSII,
};
