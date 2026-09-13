const { parse } = require("csv-parse/sync");
const zlib = require("zlib");

const pool = require("../database/db");
const {
  convertirFechaSII,
  convertirNumeroSII,
  obtenerPeriodoDesdeFecha,
  mapearTipoDocumentoSII,
} = require("../helpers/siiCsv.helper");
const { crearComprobanteAutomaticoVenta } = require("../helpers/comprobante.helper");
const { registrarAuditoria } = require("../helpers/auditoria.helper");

function normalizarClave(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizarTexto(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function valorFila(fila, aliases = []) {
  const mapa = new Map(
    Object.entries(fila || {}).map(([clave, valor]) => [normalizarClave(clave), valor])
  );

  for (const alias of aliases) {
    const valor = mapa.get(normalizarClave(alias));
    if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
      return valor;
    }
  }

  return "";
}

function convertirMonto(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;

  const limpio = String(valor)
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\(([^)]+)\)/, "-$1")
    .trim();

  return convertirNumeroSII(limpio);
}

function convertirFechaFlexible(valor) {
  if (!valor) return null;

  const limpio = String(valor).trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(limpio)) {
    return limpio.substring(0, 10);
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(limpio)) {
    const [dia, mes, anio] = limpio.split("-");
    return `${anio}-${mes}-${dia}`;
  }

  return convertirFechaSII(limpio);
}

function decodificarArchivo(file) {
  const buffer = file?.buffer || Buffer.alloc(0);
  const nombre = String(file?.originalname || "").toLowerCase();
  const contenido = nombre.endsWith(".gz") ? zlib.gunzipSync(buffer) : buffer;

  return contenido.toString("utf8");
}

function detectarDelimitador(texto) {
  const primeraLinea =
    String(texto || "")
      .split(/\r?\n/)
      .find((linea) => linea.trim().length > 0) || "";

  const candidatos = [";", "\t", ","];
  return candidatos
    .map((delimitador) => ({
      delimitador,
      cantidad: primeraLinea.split(delimitador).length,
    }))
    .sort((a, b) => b.cantidad - a.cantidad)[0].delimitador;
}

function parsearArchivoBoletas(file) {
  const texto = decodificarArchivo(file);
  const delimiter = detectarDelimitador(texto);

  return parse(texto, {
    columns: true,
    delimiter,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_column_count: true,
  });
}

function obtenerTipoBoleta(fila) {
  const tipoDocRaw = valorFila(fila, [
    "Tipo Doc",
    "Tipo Documento",
    "Tipo Docto",
    "Tipo DTE",
    "Codigo Tipo Doc",
    "Codigo Tipo Documento",
    "Cod Tipo Doc",
  ]);
  const tipoTexto = valorFila(fila, [
    "Documento",
    "Tipo",
    "Tipo documento",
    "Nombre documento",
    "Tipo Documento SII",
  ]);

  let codigo = String(tipoDocRaw || "").replace(/\D/g, "").trim();
  const textoNormalizado = normalizarTexto(tipoTexto);

  if (!codigo && textoNormalizado.includes("exent")) {
    codigo = "41";
  }

  if (!codigo) {
    codigo = "39";
  }

  const esBoleta =
    ["39", "41"].includes(codigo) ||
    textoNormalizado.includes("boleta") ||
    textoNormalizado === "";

  return {
    codigo,
    esBoleta,
    esExenta: codigo === "41" || textoNormalizado.includes("exent"),
    nombre: mapearTipoDocumentoSII(codigo),
  };
}

async function obtenerCuentaIngresoDefecto(client, empresaId) {
  const resultado = await client.query(
    `
    SELECT id
    FROM plan_cuentas
    WHERE empresa_id = $1
      AND COALESCE(LOWER(estado), 'activa') IN ('activa', 'vigente')
      AND LOWER(COALESCE(tipo, '')) IN ('ingreso', 'ganancia')
    ORDER BY codigo
    LIMIT 1
    `,
    [empresaId]
  );

  return resultado.rows[0]?.id || null;
}

async function listarBoletas(req, res) {
  try {
    const { empresa_id, fecha_desde, fecha_hasta } = req.query;

    if (!empresa_id) {
      return res.status(400).json({ error: "Debe indicar empresa_id" });
    }

    const params = [empresa_id];
    const condiciones = [
      "v.empresa_id = $1",
      "COALESCE(v.estado, 'vigente') = 'vigente'",
      "(v.sii_tipo_doc IN ('39', '41') OR LOWER(COALESCE(v.tipo_documento, '')) LIKE '%boleta%')",
    ];

    if (fecha_desde) {
      params.push(fecha_desde);
      condiciones.push(`v.fecha >= $${params.length}`);
    }

    if (fecha_hasta) {
      params.push(fecha_hasta);
      condiciones.push(`v.fecha <= $${params.length}`);
    }

    const resultado = await pool.query(
      `
      SELECT
        v.*,
        pc.codigo AS cuenta_codigo,
        pc.nombre AS cuenta_nombre
      FROM ventas v
      LEFT JOIN plan_cuentas pc ON pc.id = v.cuenta_ingreso_id
      WHERE ${condiciones.join(" AND ")}
      ORDER BY v.fecha DESC, v.folio DESC, v.id DESC
      `,
      params
    );

    res.json({ boletas: resultado.rows });
  } catch (error) {
    console.error("Error al listar boletas:", error);
    res.status(500).json({ error: error.message || "Error al listar boletas" });
  }
}

async function importarBoletasSII(req, res) {
  const client = await pool.connect();

  try {
    const empresaId = req.body.empresa_id;
    const generarComprobante = String(req.body.generar_comprobante || "false") === "true";

    if (!empresaId) {
      return res.status(400).json({ error: "Debe indicar empresa_id" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Debe adjuntar un archivo CSV o GZ" });
    }

    const filas = parsearArchivoBoletas(req.file);
    let configuracion = {};
    let cuentaIngresoId = null;

    if (generarComprobante) {
      const configResult = await client.query(
        "SELECT * FROM configuracion_contable WHERE empresa_id = $1",
        [empresaId]
      );
      configuracion = configResult.rows[0] || {};
      cuentaIngresoId =
        configuracion.cuenta_ingreso_defecto_id ||
        (await obtenerCuentaIngresoDefecto(client, empresaId));

      if (!cuentaIngresoId) {
        return res.status(400).json({
          error:
            "Para generar comprobantes de boletas debes configurar una cuenta de ingreso.",
        });
      }
    }

    const resumen = {
      total_filas: filas.length,
      insertadas: 0,
      omitidas: 0,
      comprobantes_creados: 0,
      neto: 0,
      exento: 0,
      iva: 0,
      total: 0,
      errores: [],
    };

    await client.query("BEGIN");

    for (let index = 0; index < filas.length; index += 1) {
      const fila = filas[index];
      const tipoBoleta = obtenerTipoBoleta(fila);

      if (!tipoBoleta.esBoleta) {
        resumen.omitidas += 1;
        resumen.errores.push(`Fila ${index + 1}: no corresponde a boleta SII.`);
        continue;
      }

      const fecha = convertirFechaFlexible(
        valorFila(fila, [
          "Fecha Docto",
          "Fecha Documento",
          "Fecha Emision",
          "Fecha de Emision",
          "Fecha emisión",
          "Fecha Boleta",
          "Fecha",
        ])
      );

      if (!fecha) {
        resumen.omitidas += 1;
        resumen.errores.push(`Fila ${index + 1}: fecha no valida.`);
        continue;
      }

      const folio =
        String(
          valorFila(fila, [
            "Folio",
            "Nro Folio",
            "Numero Folio",
            "Número Folio",
            "Numero Boleta",
            "Nro Boleta",
            "Nro Documento",
            "Numero Documento",
          ]) || `sin-folio-${index + 1}`
        )
          .trim()
          .replace(/\s+/g, " ");

      const rutCliente =
        String(
          valorFila(fila, [
            "RUT Cliente",
            "Rut Cliente",
            "RUT receptor",
            "Rut receptor",
            "RUT",
          ]) || "66.666.666-6"
        ).trim() || "66.666.666-6";
      const razonCliente =
        String(
          valorFila(fila, [
            "Razon Social",
            "Razón Social",
            "Razon Social Cliente",
            "Cliente",
            "Receptor",
          ]) || "Consumidor final"
        ).trim() || "Consumidor final";

      let neto = convertirMonto(
        valorFila(fila, ["Monto Neto", "Neto", "Monto Neto Afecto", "Monto Afecto"])
      );
      let exento = convertirMonto(
        valorFila(fila, ["Monto Exento", "Exento", "Monto No Afecto", "Monto Exento Boleta"])
      );
      let iva = convertirMonto(
        valorFila(fila, ["Monto IVA", "IVA", "IVA Debito", "IVA Débito", "Monto Iva"])
      );
      let total = convertirMonto(
        valorFila(fila, [
          "Monto Total",
          "Total",
          "Total Boleta",
          "Monto Documento",
          "Monto",
          "Total Documento",
        ])
      );

      if (tipoBoleta.esExenta) {
        exento = exento || total;
        neto = 0;
        iva = 0;
      } else if (total > 0 && neto === 0 && iva === 0) {
        neto = Math.round(total / 1.19);
        iva = total - neto;
      }

      if (total === 0) {
        total = neto + exento + iva;
      }

      if (total === 0) {
        resumen.omitidas += 1;
        resumen.errores.push(`Fila ${index + 1}: monto total en cero.`);
        continue;
      }

      const periodo = req.body.periodo || obtenerPeriodoDesdeFecha(fecha);

      const existente = await client.query(
        `
        SELECT *
        FROM ventas
        WHERE empresa_id = $1
          AND sii_tipo_doc = $2
          AND folio = $3
          AND COALESCE(estado, 'vigente') = 'vigente'
        LIMIT 1
        `,
        [empresaId, tipoBoleta.codigo, folio]
      );

      if (existente.rows.length > 0) {
        const ventaExistente = existente.rows[0];

        if (generarComprobante && !ventaExistente.comprobante_id) {
          const comprobante = await crearComprobanteAutomaticoVenta(
            client,
            {
              ...ventaExistente,
              cuenta_ingreso_id: ventaExistente.cuenta_ingreso_id || cuentaIngresoId,
            },
            {
              ...configuracion,
              cuenta_ingreso_defecto_id: cuentaIngresoId,
            }
          );

          await client.query(
            "UPDATE ventas SET comprobante_id = $1 WHERE id = $2",
            [comprobante.id, ventaExistente.id]
          );

          resumen.comprobantes_creados += 1;
        }

        resumen.omitidas += 1;
        continue;
      }

      const insertResult = await client.query(
        `
        INSERT INTO ventas
        (
          empresa_id, periodo, fecha, tipo_documento, sii_tipo_doc, folio,
          rut_cliente, razon_social_cliente, neto, exento, iva, total,
          cuenta_ingreso_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
        `,
        [
          empresaId,
          periodo,
          fecha,
          tipoBoleta.nombre,
          tipoBoleta.codigo,
          folio,
          rutCliente,
          razonCliente,
          neto,
          exento,
          iva,
          total,
          cuentaIngresoId,
        ]
      );

      const ventaCreada = insertResult.rows[0];

      if (generarComprobante) {
        const comprobante = await crearComprobanteAutomaticoVenta(
          client,
          ventaCreada,
          {
            ...configuracion,
            cuenta_ingreso_defecto_id: cuentaIngresoId,
          }
        );

        await client.query("UPDATE ventas SET comprobante_id = $1 WHERE id = $2", [
          comprobante.id,
          ventaCreada.id,
        ]);

        resumen.comprobantes_creados += 1;
      }

      resumen.insertadas += 1;
      resumen.neto += Number(neto || 0);
      resumen.exento += Number(exento || 0);
      resumen.iva += Number(iva || 0);
      resumen.total += Number(total || 0);
    }

    await client.query("COMMIT");

    await registrarAuditoria({
      req,
      empresaId,
      modulo: "Registro de boletas",
      accion: "Importar boletas SII",
      detalle: `Importacion de boletas: ${resumen.insertadas} insertadas, ${resumen.omitidas} omitidas.`,
      tablaAfectada: "ventas",
      datos: resumen,
    });

    res.json({
      mensaje: "Importacion de boletas finalizada",
      resumen,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error al importar boletas:", error);
    res.status(500).json({
      error: error.message || "Error al importar boletas",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  listarBoletas,
  importarBoletasSII,
};
