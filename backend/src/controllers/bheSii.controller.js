/**
 * Importación y cruce de boletas de honorarios electrónicas del SII.
 *
 * El orden importa: primero se revisa, después se importa. La revisión no
 * escribe nada y dice tres cosas que el usuario necesita antes de decidir:
 * qué columnas se reconocieron, qué boletas hay de diferencia contra lo ya
 * registrado, y qué filas del archivo no se pueden leer.
 *
 * Si falta una columna esencial no se importa nada: se devuelven los
 * encabezados del archivo para que la persona los asigne. Importar con montos
 * en cero porque un nombre de columna no calzó es exactamente el error que el
 * registro de compras ya tuvo (hallazgo C-10).
 */

const { parse } = require("csv-parse/sync");
const pool = require("../database/db");
const { detectarColumnas, leerFila, normalizarClave } = require("../helpers/bheSii.helper");
const { leerMapeoManual } = require("../helpers/siiCsv.helper");
const { resolverTercerosEnLote, claveRut } = require("../helpers/terceros.helper");
const { conPuntoDeGuardado, describirErrorFila } = require("../helpers/importacion.helper");
const { registrarAuditoria } = require("../helpers/auditoria.helper");

function responderError(res, error, mensaje) {
  return res.status(error.statusCode || 500).json({
    // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
    // columnas y restricciones. Los errores de validacion propios
    // si conservan su mensaje y su codigo.
    error: error.statusCode ? error.message : mensaje,
  });
}

function periodoDe(fecha) {
  return String(fecha || "").slice(0, 7);
}

/**
 * Lee el archivo y devuelve columnas detectadas, boletas legibles y errores.
 */
function analizarArchivo(buffer, mapeoManual) {
  const contenido = buffer.toString("utf8");

  const registros = parse(contenido, {
    columns: true,
    delimiter: [";", ","],
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  });

  if (registros.length === 0) {
    throw Object.assign(new Error("El archivo no tiene filas de datos."), { statusCode: 400 });
  }

  const encabezados = Object.keys(registros[0]);
  const columnas = detectarColumnas(encabezados, mapeoManual);

  if (columnas.faltan_obligatorios.length > 0) {
    return { encabezados, columnas, registros, boletas: [], errores: [], avisos: [] };
  }

  const boletas = [];
  const errores = [];
  const avisos = [];

  registros.forEach((fila, indice) => {
    const resultado = leerFila(fila, columnas.mapeo, indice);

    if (resultado.error) {
      errores.push(resultado.error);
      return;
    }

    boletas.push(resultado.boleta);
    avisos.push(...(resultado.avisos || []));
  });

  return { encabezados, columnas, registros, boletas, errores, avisos };
}

/**
 * Cruza las boletas del archivo con las registradas: lo que falta, lo que
 * sobra y lo que difiere en monto.
 */
async function cruzar(cliente, empresaId, boletas) {
  const { rows: registradas } = await cliente.query(
    `SELECT id, rut_prestador, folio, bruto, retencion, estado, origen, fecha_emision
     FROM honorarios
     WHERE empresa_id = $1`,
    [empresaId]
  );

  const clave = (rut, folio) => `${claveRut(rut)}|${String(folio || "").trim()}`;
  const porClave = new Map(registradas.map((h) => [clave(h.rut_prestador, h.folio), h]));
  const clavesArchivo = new Set(boletas.map((b) => clave(b.rut_prestador, b.folio)));

  const nuevas = [];
  const coinciden = [];
  const difieren = [];

  for (const boleta of boletas) {
    const existente = porClave.get(clave(boleta.rut_prestador, boleta.folio));

    if (!existente) {
      nuevas.push(boleta);
      continue;
    }

    const diferenciaBruto = Math.round(Number(existente.bruto || 0)) - boleta.bruto;
    const diferenciaRetencion = Math.round(Number(existente.retencion || 0)) - boleta.retencion;

    if (diferenciaBruto !== 0 || diferenciaRetencion !== 0) {
      difieren.push({
        ...boleta,
        honorario_id: existente.id,
        bruto_registrado: Math.round(Number(existente.bruto || 0)),
        retencion_registrada: Math.round(Number(existente.retencion || 0)),
        diferencia_bruto: diferenciaBruto,
        diferencia_retencion: diferenciaRetencion,
      });
    } else {
      coinciden.push({ ...boleta, honorario_id: existente.id });
    }
  }

  // Lo registrado que el SII no tiene: o es un error de digitación, o una
  // boleta que el prestador anuló.
  const soloEnSistema = registradas
    .filter((h) => h.estado === "vigente" && !clavesArchivo.has(clave(h.rut_prestador, h.folio)))
    .map((h) => ({
      honorario_id: h.id,
      rut_prestador: h.rut_prestador,
      folio: h.folio,
      fecha_emision: h.fecha_emision,
      bruto: Math.round(Number(h.bruto || 0)),
      origen: h.origen,
    }));

  return { nuevas, coinciden, difieren, solo_en_sistema: soloEnSistema };
}

/**
 * Revisa el archivo sin escribir nada.
 */
async function revisarBhe(req, res) {
  try {
    const { empresa_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "Debe adjuntar el archivo CSV de boletas del SII" });
    }

    const analisis = analizarArchivo(req.file.buffer, leerMapeoManual(req.body.mapeo));

    if (analisis.columnas.faltan_obligatorios.length > 0) {
      return res.status(400).json({
        error:
          "No se reconocieron todas las columnas necesarias. Asigna las que faltan y vuelve a intentarlo: sin eso la importación entraría con montos en cero.",
        encabezados_del_archivo: analisis.encabezados,
        columnas: analisis.columnas,
      });
    }

    const cruce = await cruzar(pool, empresa_id, analisis.boletas);

    return res.json({
      encabezados_del_archivo: analisis.encabezados,
      columnas: analisis.columnas,
      filas_leidas: analisis.boletas.length,
      filas_con_error: analisis.errores.length,
      errores: analisis.errores.slice(0, 50),
      avisos: [...new Set(analisis.avisos)].slice(0, 50),
      cruce: {
        nuevas: cruce.nuevas.length,
        coinciden: cruce.coinciden.length,
        difieren: cruce.difieren.length,
        solo_en_sistema: cruce.solo_en_sistema.length,
      },
      detalle: {
        nuevas: cruce.nuevas.slice(0, 200),
        difieren: cruce.difieren.slice(0, 200),
        solo_en_sistema: cruce.solo_en_sistema.slice(0, 200),
      },
    });
  } catch (error) {
    console.error("Error al revisar el archivo de boletas del SII:", error);

    return responderError(res, error, "Error interno al revisar el archivo");
  }
}

/**
 * Importa las boletas que no estaban. Lo que difiere no se pisa: corregir un
 * monto ya registrado es una decisión, no un efecto secundario de importar.
 */
async function importarBhe(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "Debe adjuntar el archivo CSV de boletas del SII" });
    }

    const analisis = analizarArchivo(req.file.buffer, leerMapeoManual(req.body.mapeo));

    if (analisis.columnas.faltan_obligatorios.length > 0) {
      return res.status(400).json({
        error:
          "No se reconocieron todas las columnas necesarias. Asigna las que faltan antes de importar.",
        encabezados_del_archivo: analisis.encabezados,
        columnas: analisis.columnas,
      });
    }

    await client.query("BEGIN");

    const cruce = await cruzar(client, empresa_id, analisis.boletas);

    // Los prestadores nuevos entran al catálogo de terceros de una vez.
    const terceros = await resolverTercerosEnLote(
      client,
      empresa_id,
      cruce.nuevas.map((b) => ({ rut: b.rut_prestador, razon_social: b.nombre_prestador })),
      "proveedor"
    );

    let insertadas = 0;
    let anuladas = 0;
    const errores = [...analisis.errores];

    for (let indice = 0; indice < cruce.nuevas.length; indice += 1) {
      const boleta = cruce.nuevas[indice];

      const resultado = await conPuntoDeGuardado(client, `bhe_${indice}`, async () => {
        const insertada = await client.query(
          `INSERT INTO honorarios
             (empresa_id, periodo, fecha_emision, fecha_pago, tipo_documento, folio,
              rut_prestador, nombre_prestador, glosa, bruto, tasa_retencion, retencion,
              liquido, estado, contabilizado, origen, emisor_retiene, tercero_id)
           VALUES ($1,$2,$3,$4,'Boleta de Honorarios',$5,$6,$7,$8,$9,$10,$11,$12,$13,false,'sii',$14,$15)
           RETURNING id`,
          [
            empresa_id,
            periodoDe(boleta.fecha_emision),
            boleta.fecha_emision,
            boleta.fecha_pago,
            boleta.folio,
            boleta.rut_prestador,
            boleta.nombre_prestador,
            "Importada del SII",
            boleta.bruto,
            boleta.tasa_retencion,
            boleta.retencion,
            boleta.liquido,
            // Una boleta anulada en el SII entra anulada: no se declara.
            boleta.anulada ? "anulado" : "vigente",
            boleta.emisor_retiene,
            terceros[claveRut(boleta.rut_prestador)]?.id || null,
          ]
        );

        return insertada.rows[0];
      });

      if (resultado.ok) {
        insertadas += 1;
        if (boleta.anulada) anuladas += 1;
      } else {
        errores.push(
          `Folio ${boleta.folio} de ${boleta.rut_prestador}: ${describirErrorFila(resultado.error)}`
        );
      }
    }

    await registrarAuditoria({
      client,
      req,
      empresaId: Number(empresa_id),
      modulo: "Honorarios",
      accion: "Importar boletas del SII",
      detalle: `Importadas ${insertadas} boletas; ${cruce.difieren.length} con diferencia; ${cruce.solo_en_sistema.length} solo en el sistema`,
      tablaAfectada: "honorarios",
      datos: {
        filas_leidas: analisis.boletas.length,
        insertadas,
        anuladas,
        difieren: cruce.difieren.length,
        solo_en_sistema: cruce.solo_en_sistema.length,
      },
    });

    await client.query("COMMIT");

    return res.status(201).json({
      mensaje: `Importación terminada: ${insertadas} boleta(s) nueva(s)`,
      insertadas,
      anuladas,
      ya_registradas: cruce.coinciden.length,
      errores: errores.slice(0, 50),
      avisos: [...new Set(analisis.avisos)].slice(0, 50),
      // Lo que no se tocó, y por qué.
      difieren: cruce.difieren.slice(0, 200),
      solo_en_sistema: cruce.solo_en_sistema.slice(0, 200),
      aviso_diferencias:
        cruce.difieren.length > 0
          ? "Hay boletas registradas con montos distintos a los del SII. No se modificaron: corregir un monto ya registrado es una decisión contable. REQUIERE VALIDACIÓN."
          : null,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error al importar boletas del SII:", error);

    return responderError(res, error, "Error interno al importar las boletas");
  } finally {
    client.release();
  }
}

/**
 * Los campos que el importador necesita y los nombres con que los busca: la
 * pantalla los usa para armar el mapeo manual.
 */
function camposImportacion(req, res) {
  const { CAMPOS } = require("../helpers/bheSii.helper");

  return res.json({
    campos: CAMPOS.map(({ campo, etiqueta, obligatorio, alias }) => ({
      campo,
      etiqueta,
      obligatorio,
      nombres_esperados: alias,
    })),
    aviso:
      "El formato de las exportaciones del SII cambia. Si un archivo no calza, asigna las columnas a mano: no hace falta tocar el sistema.",
  });
}

module.exports = { revisarBhe, importarBhe, camposImportacion, normalizarClave };
