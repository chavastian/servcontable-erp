const pool = require("../database/db");
const {
  leerPaginacion,
  aplicarPaginacion,
  fragmentoPaginacion,
  valoresPaginacion,
  recortarPagina,
} = require("../helpers/paginacion.helper");

const {
  crearComprobanteAutomaticoCompra,
  actualizarComprobanteAutomaticoCompra,
} = require("../helpers/comprobante.helper");
const { registrarAuditoria } = require("../helpers/auditoria.helper");
const {
  historialCuentasProveedor,
  normalizarRut: normalizarRutHistorial,
} = require("../helpers/sugerenciaCuenta.helper");
const {
  normalizarRutDocumento,
  normalizarNombreTercero,
} = require("../helpers/trazabilidadRut.helper");
const { validarCuentaOperativa } = require("../helpers/cuentas.helper");

const { parse } = require("csv-parse/sync");
const {
  recorrerFilas,
  resumirImportacion,
} = require("../helpers/importacion.helper");

const {
  convertirFechaSII,
  convertirNumeroSII,
  obtenerPeriodoDesdeFecha,
  mapearTipoDocumentoSII,
  codigoSiiDesdeTipoDocumento,
  leerColumnasRcv,
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

  // Sin cuenta de gasto no se adivina. Antes se tomaba la primera cuenta de
  // Activo, que en el plan base es CAJA: todas las compras de una empresa sin
  // configurar quedaban imputadas a caja, con asiento y todo.

  return null;
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

/**
 * Escribe las columnas del RCV en la compra ya insertada o actualizada. Va
 * aparte del INSERT para no tocar las sentencias que la reimportacion
 * idempotente usa para decidir si un documento cambio.
 */
async function guardarColumnasRcv(client, compraId, extras) {
  if (!extras) return;

  await client.query(
    `UPDATE compras
     SET tipo_compra = $2,
         codigo_iva_no_rec = $3,
         iva_uso_comun = $4,
         neto_activo_fijo = $5,
         iva_activo_fijo = $6,
         iva_no_retenido = $7,
         codigo_otro_impuesto = $8,
         tasa_otro_impuesto = $9,
         fecha_recepcion = COALESCE($10, fecha_recepcion)
     WHERE id = $1`,
    [
      compraId,
      extras.tipo_compra,
      extras.codigo_iva_no_rec,
      Number(extras.iva_uso_comun || 0),
      Number(extras.neto_activo_fijo || 0),
      Number(extras.iva_activo_fijo || 0),
      Number(extras.iva_no_retenido || 0),
      extras.codigo_otro_impuesto,
      extras.tasa_otro_impuesto,
      extras.fecha_recepcion,
    ]
  );
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
      fecha_vencimiento,
      ref_sii_tipo_doc,
      ref_folio,
      ref_fecha,
    } = req.body;

    if (!empresa_id || !fecha || !tipo_documento) {
      return res.status(400).json({
        error: "Empresa, fecha y tipo de documento son obligatorios",
      });
    }

    if (!String(folio || "").trim()) {
      return res.status(400).json({
        error: "Debes ingresar el folio del documento.",
      });
    }

    if (!String(razon_social_proveedor || "").trim()) {
      return res.status(400).json({
        error: "Debes ingresar la razon social del proveedor.",
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
    const cuentaGastoId = convertirCuentaId(cuenta_gasto_id);
    const rutProveedorNormalizado = normalizarRutDocumento(
      rut_proveedor,
      "RUT del proveedor"
    );
    const razonSocialProveedor = normalizarNombreTercero(razon_social_proveedor);


    await client.query("BEGIN");

    if (cuentaGastoId) {
      await validarCuentaOperativa(client, {
        empresaId: empresa_id,
        cuentaId: cuentaGastoId,
        etiqueta: "cuenta de gasto/activo",
      });
    }

    if (cuentaOtrosImpuestosId) {
      await validarCuentaOperativa(client, {
        empresaId: empresa_id,
        cuentaId: cuentaOtrosImpuestosId,
        etiqueta: "cuenta de otros impuestos",
      });
    }

    // El codigo SII se deriva del tipo: sin el, el indice unico de compras
    // no aplicaba a las manuales y la misma factura entraba dos veces.
    const siiTipoDocManual = codigoSiiDesdeTipoDocumento(tipo_documento);

    const compraResult = await client.query(
      `INSERT INTO compras
       (empresa_id, periodo, fecha, tipo_documento, folio, rut_proveedor,
         razon_social_proveedor, neto, exento, iva_credito, iva_no_recuperable,
         otros_impuestos, total, cuenta_gasto_id, cuenta_otros_impuestos_id,
         sii_tipo_doc, fecha_vencimiento, ref_sii_tipo_doc, ref_folio, ref_fecha)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
               $17, $18, $19, $20)
       RETURNING *`,
      [
        empresa_id,
        periodoCompra,
        fecha,
        tipo_documento,
        folio || "",
        rutProveedorNormalizado,
        razonSocialProveedor,
        netoNum,
        exentoNum,
        ivaCreditoNum,
        ivaNoRecNum,
        otrosImpuestosNum,
        totalNum,
        cuentaGastoId,
        cuentaOtrosImpuestosId,
        siiTipoDocManual,
        fecha_vencimiento || null,
        ref_sii_tipo_doc || null,
        ref_folio || null,
        ref_fecha || null,
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
        cuenta_gasto_id: cuentaGastoId,
        comprobante_id: compra.comprobante_id || null,
        rut_proveedor: rutProveedorNormalizado,
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

    // El indice unico por proveedor, tipo y folio rechaza la misma factura dos
    // veces. Es una respuesta esperada, no un error interno.
    if (error.code === "23505") {
      return res.status(409).json({
        error:
          "Ya existe una compra vigente con ese proveedor, tipo de documento y folio.",
      });
    }

    console.error("Error al crear compra:", error);

    return res.status(error.statusCode || 500).json({
      // El mensaje de PostgreSQL no vuelve al cliente.
      error: error.statusCode ? error.message : "Error interno al crear compra",
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
        comp.numero AS comprobante_numero,
        comp.glosa AS comprobante_glosa,
        comp.fecha AS comprobante_fecha,
        pc.codigo AS cuenta_codigo,
        pc.nombre AS cuenta_nombre
      FROM compras c
      LEFT JOIN comprobantes comp ON comp.id = c.comprobante_id
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
    const paginacion = leerPaginacion(req.query);
    query = aplicarPaginacion(query, valores, paginacion);

    const resultado = await pool.query(query, valores);
    const pagina = recortarPagina(resultado.rows, paginacion);
    resultado.rows = pagina.filas;

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
      paginacion: pagina.paginacion,
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

    // Cuenta que esta empresa uso antes para cada proveedor del archivo.
    //
    // Antes toda factura importada caia en la cuenta de gasto por defecto y
    // alguien tenia que reclasificarlas una por una: cien facturas del SII, cien
    // ediciones. La empresa ya decidio en que cuenta va cada proveedor cuando
    // clasifico los documentos anteriores del mismo RUT; esto lee esa decision y
    // la repite. Solo cuenta con dos o mas documentos previos, para no confundir
    // una casualidad con un criterio.
    const cuentasPorProveedor = await historialCuentasProveedor(
      client,
      empresa_id,
      registros.map((fila) => fila["RUT Proveedor"])
    );
    let clasificadasPorHistorial = 0;

    await client.query("BEGIN");

    let insertadas = 0;
    let actualizadas = 0;
    let omitidas = 0;
    let comprobantesCreados = 0;
    // Situaciones que no impiden importar la fila pero el usuario debe saber.
    const avisos = [];
    // Un punto de guardado por fila. Antes un solo documento con problemas
    // abortaba la transaccion entera y el COMMIT final se volvia un ROLLBACK
    // silencioso, mientras la respuesta informaba las filas como insertadas.
    const { errores } = await recorrerFilas(
      client,
      registros,
      async (fila) => {
        const siiTipoDoc = String(fila["Tipo Doc"] || "").trim();
        const folio = String(fila["Folio"] || "").trim();

        if (!folio || !siiTipoDoc) {
          omitidas += 1;
          return null;
        }

        const rutProveedorNormalizado = normalizarRutDocumento(
          fila["RUT Proveedor"],
          "RUT del proveedor"
        );
        const razonSocialProveedor = normalizarNombreTercero(fila["Razon Social"]);
        const fecha = convertirFechaSII(fila["Fecha Docto"]);

        if (!fecha) {
          const error = new Error("fecha invalida");
          error.esValidacion = true;
          throw error;
        }

        const periodoCompra = periodo || obtenerPeriodoDesdeFecha(fecha);
        const neto = convertirNumeroSII(fila["Monto Neto"]);
        const exento = convertirNumeroSII(fila["Monto Exento"]);
        const ivaCredito = convertirNumeroSII(fila["Monto IVA Recuperable"]);
        const ivaNoRecuperable = convertirNumeroSII(
          fila["Monto Iva No Recuperable"]
        );
        const total = convertirNumeroSII(fila["Monto Total"]);
        // Tipo de compra, codigo de IVA no recuperable, uso comun, activo fijo,
        // IVA no retenido, otros impuestos y fecha de recepcion. Sin esto no hay
        // proporcionalidad, 27 bis ni credito con recepcion tardia.
        const extrasRcv = leerColumnasRcv(fila);
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
          avisos.push(
            `Folio ${folio}: se importo con otros impuestos, pero falta configurar su cuenta contable en Configuracion Contable para generar o actualizar el comprobante`
          );
        }

        // El folio lo asigna el proveedor: el mismo folio en dos proveedores son
        // dos documentos. Sin el RUT en la busqueda, el segundo se tomaba como
        // reimportacion del primero y lo sobrescribia.
        const existe = await client.query(
          `SELECT *
           FROM compras
           WHERE empresa_id = $1
             AND sii_tipo_doc = $2
             AND folio = $3
             AND UPPER(REPLACE(REPLACE(COALESCE(rut_proveedor, ''), '.', ''), ' ', '')) = $4
           LIMIT 1`,
          [
            empresa_id,
            siiTipoDoc,
            folio,
            String(rutProveedorNormalizado || "").toUpperCase().replace(/[.\s]/g, ""),
          ]
        );

        if (existe.rows.length > 0) {
          const compraPrevia = existe.rows[0];

          // Un documento anulado no se resucita ni recibe un asiento nuevo.
          if (String(compraPrevia.estado || "vigente") !== "vigente") {
            omitidas += 1;
            return null;
          }

          // Si el archivo no trae montos distintos, el documento no se toca.
          // Eso deja intactas las correcciones manuales de razon social o RUT,
          // y evita reconstruir el comprobante: reconstruirlo borra y reescribe
          // las lineas del asiento, perdiendo cualquier ajuste del contador.
          const mismosMontos =
            Number(compraPrevia.neto) === Number(neto) &&
            Number(compraPrevia.exento) === Number(exento) &&
            Number(compraPrevia.iva_credito) === Number(ivaCredito) &&
            Number(compraPrevia.iva_no_recuperable) === Number(ivaNoRecuperable) &&
            Number(compraPrevia.otros_impuestos || 0) === Number(otrosImpuestos) &&
            Number(compraPrevia.total) === Number(total);

          if (mismosMontos) {
            omitidas += 1;

            // Lo unico que si falta completar: el asiento, si nunca se genero.
            if (
              generarComprobante &&
              !faltaCuentaOtrosImpuestos &&
              !compraPrevia.comprobante_id
            ) {
              const comprobanteNuevo = await crearComprobanteAutomaticoCompra(
                client,
                compraPrevia,
                configuracion
              );

              await client.query(
                `UPDATE compras
                 SET comprobante_id = $1
                 WHERE id = $2`,
                [comprobanteNuevo.id, compraPrevia.id]
              );

              comprobantesCreados += 1;
            }

            return null;
          }

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
              rutProveedorNormalizado,
              razonSocialProveedor,
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
          actualizadas += 1;

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

          await guardarColumnasRcv(client, compraExistente.id, extrasRcv);
          return compraExistente;
        }

        // La cuenta del historial manda sobre la cuenta por defecto: la segunda
        // es una caja donde todo cae sin clasificar. El comprobante automatico
        // usa la cuenta del documento, asi que el asiento tambien queda bien.
        const sugerenciaProveedor =
          cuentasPorProveedor[normalizarRutHistorial(rutProveedorNormalizado)] || null;
        const cuentaGastoDelHistorial = sugerenciaProveedor
          ? sugerenciaProveedor.cuenta_id
          : null;

        if (cuentaGastoDelHistorial) {
          clasificadasPorHistorial += 1;
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
            rutProveedorNormalizado,
            razonSocialProveedor,
            neto,
            exento,
            ivaCredito,
            ivaNoRecuperable,
            otrosImpuestos,
            total,
            cuentaGastoDelHistorial || configuracion.cuenta_gasto_defecto_id || null,
            cuentaOtrosImpuestosConfig,
          ]
        );

        const compra = compraResult.rows[0];
        insertadas += 1;

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

          comprobantesCreados += 1;
        }

        await guardarColumnasRcv(client, compra.id, extrasRcv);
        return compra;
      },
      {
        identificarFila: (fila) => `Folio ${fila["Folio"] || "sin folio"}`,
      }
    );

    errores.push(...avisos);

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
        clasificadas_por_historial: clasificadasPorHistorial,
      },
    });

    await client.query("COMMIT");

    return res.json({
      mensaje: "Importacion de compras SII finalizada",
      ...resumirImportacion({
        totalFilas: registros.length,
        insertadas,
        actualizadas,
        omitidas,
        comprobantesCreados,
        errores,
      }),
      clasificadas_por_historial: clasificadasPorHistorial,
      detalle_clasificacion:
        clasificadasPorHistorial > 0
          ? `${clasificadasPorHistorial} documento(s) quedaron en la cuenta que esta empresa ya usaba para ese proveedor.`
          : "Ningun proveedor del archivo tenia historial suficiente: los documentos quedaron en la cuenta por defecto.",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error al importar compras SII:", error);

    // El mensaje crudo de PostgreSQL no vuelve al cliente.
    return res.status(error.statusCode || 500).json({
      error: error.statusCode
        ? error.message
        : "Error interno al importar compras SII",
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

