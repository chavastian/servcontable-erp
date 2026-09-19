/**
 * Declaraciones juradas anuales (módulo 10 de la revisión del 19-09-2026).
 *
 * Todos los datos ya estaban en el sistema y había que sacarlos a mano cada
 * marzo: los honorarios con su retención para la 1879, y las liquidaciones con
 * su impuesto único para la 1887. Acá se arman los dos resúmenes por
 * contribuyente y el archivo de carga.
 *
 * REQUIERE VALIDACIÓN TRIBUTARIA, y esto no es una formalidad: el SII cambia el
 * formato y los códigos de columna de las declaraciones juradas casi todos los
 * años por resolución. Las columnas de aquí siguen la estructura de los
 * formularios 1879 y 1887, y hay que cotejarlas con la resolución del año
 * tributario que se está declarando antes de subir el archivo.
 *
 * Dos criterios que quedan explícitos porque cambian el resultado:
 *
 * - **1879: por fecha de pago.** La retención se declara en el año en que se
 *   pagó la boleta, no en el que se emitió (artículo 74 N°2 de la Ley de la
 *   Renta). Una boleta sin fecha de pago se cuenta por su emisión y se avisa,
 *   igual que en el F29.
 * - **1887: por período de la liquidación.** Se toman las liquidaciones
 *   emitidas de los doce meses del año comercial.
 */

const { aFechaISO } = require("./fecha.helper");

function redondear(valor) {
  return Math.round(Number(valor || 0));
}

/**
 * Resumen de la 1879 por prestador: lo que se le pagó y lo que se le retuvo.
 *
 * El año tributario es el siguiente al comercial: la 1879 del AT 2027 declara
 * lo pagado durante 2026.
 */
async function resumen1879(cliente, empresaId, anioComercial) {
  const desde = `${anioComercial}-01-01`;
  const hasta = `${anioComercial}-12-31`;

  const { rows } = await cliente.query(
    `
    SELECT UPPER(REPLACE(REPLACE(h.rut_prestador, '.', ''), ' ', '')) AS rut,
           MAX(COALESCE(NULLIF(TRIM(t.razon_social), ''), h.nombre_prestador)) AS nombre,
           COUNT(*)::int AS documentos,
           SUM(h.bruto) AS bruto,
           SUM(h.retencion) AS retencion,
           COUNT(*) FILTER (WHERE h.fecha_pago IS NULL)::int AS sin_fecha_pago,
           MIN(COALESCE(h.fecha_pago, h.fecha_emision)) AS primera,
           MAX(COALESCE(h.fecha_pago, h.fecha_emision)) AS ultima
    FROM honorarios h
    LEFT JOIN terceros t ON t.id = h.tercero_id
    WHERE h.empresa_id = $1
      AND h.estado = 'vigente'
      AND COALESCE(h.fecha_pago, h.fecha_emision) BETWEEN $2 AND $3
    GROUP BY 1
    ORDER BY 2
    `,
    [empresaId, desde, hasta]
  );

  const avisos = [];
  const sinFecha = rows.reduce((suma, fila) => suma + fila.sin_fecha_pago, 0);

  if (sinFecha > 0) {
    avisos.push(
      `${sinFecha} boleta(s) de honorarios sin fecha de pago: se declararon por su fecha de emisión. La 1879 va por fecha de pago (artículo 74 N°2). REQUIERE VALIDACIÓN.`
    );
  }

  const detalle = rows.map((fila) => ({
    rut: fila.rut,
    nombre: fila.nombre || fila.rut,
    documentos: fila.documentos,
    // Los montos de la declaración van en pesos enteros.
    honorarios_brutos: redondear(fila.bruto),
    retencion: redondear(fila.retencion),
    sin_fecha_pago: fila.sin_fecha_pago,
    primer_pago: aFechaISO(fila.primera),
    ultimo_pago: aFechaISO(fila.ultima),
  }));

  return {
    anio_comercial: Number(anioComercial),
    anio_tributario: Number(anioComercial) + 1,
    detalle,
    totales: detalle.reduce(
      (acc, fila) => ({
        prestadores: acc.prestadores + 1,
        documentos: acc.documentos + fila.documentos,
        honorarios_brutos: acc.honorarios_brutos + fila.honorarios_brutos,
        retencion: acc.retencion + fila.retencion,
      }),
      { prestadores: 0, documentos: 0, honorarios_brutos: 0, retencion: 0 }
    ),
    avisos,
  };
}

/**
 * Resumen de la 1887 por trabajador, con el detalle mensual que el certificado
 * necesita.
 *
 * La renta imponible del año es la suma de las bases imponibles, y el impuesto
 * retenido la suma del impuesto único. Las rentas no gravadas van aparte: no se
 * suman a la imponible.
 */
async function resumen1887(cliente, empresaId, anioComercial) {
  const { rows } = await cliente.query(
    `
    SELECT t.id AS trabajador_id,
           UPPER(REPLACE(REPLACE(t.rut, '.', ''), ' ', '')) AS rut,
           TRIM(CONCAT(t.apellidos, ' ', t.nombres)) AS nombre,
           l.periodo,
           l.total_haberes_imponibles,
           l.base_tributable,
           l.impuesto_unico,
           l.total_haberes_no_imponibles,
           l.descuento_afp,
           l.descuento_salud,
           l.descuento_afc,
           l.dias_trabajados
    FROM liquidaciones l
    JOIN trabajadores t ON t.id = l.trabajador_id AND t.empresa_id = l.empresa_id
    WHERE l.empresa_id = $1
      AND l.estado = 'emitida'
      AND l.periodo BETWEEN $2 AND $3
    ORDER BY 3, l.periodo
    `,
    [empresaId, `${anioComercial}-01`, `${anioComercial}-12`]
  );

  const porTrabajador = new Map();

  for (const fila of rows) {
    const clave = Number(fila.trabajador_id);

    if (!porTrabajador.has(clave)) {
      porTrabajador.set(clave, {
        trabajador_id: clave,
        rut: fila.rut,
        nombre: fila.nombre || fila.rut,
        meses: 0,
        renta_imponible: 0,
        renta_tributable: 0,
        impuesto_unico: 0,
        rentas_no_gravadas: 0,
        cotizaciones_previsionales: 0,
        detalle_mensual: [],
      });
    }

    const trabajador = porTrabajador.get(clave);
    const imponible = redondear(fila.total_haberes_imponibles);
    const tributable = redondear(fila.base_tributable);
    const impuesto = redondear(fila.impuesto_unico);
    const noGravadas = redondear(fila.total_haberes_no_imponibles);
    const cotizaciones =
      redondear(fila.descuento_afp) + redondear(fila.descuento_salud) + redondear(fila.descuento_afc);

    trabajador.meses += 1;
    trabajador.renta_imponible += imponible;
    trabajador.renta_tributable += tributable;
    trabajador.impuesto_unico += impuesto;
    trabajador.rentas_no_gravadas += noGravadas;
    trabajador.cotizaciones_previsionales += cotizaciones;
    trabajador.detalle_mensual.push({
      periodo: fila.periodo,
      mes: Number(String(fila.periodo).slice(5, 7)),
      dias_trabajados: Number(fila.dias_trabajados || 0),
      renta_imponible: imponible,
      renta_tributable: tributable,
      impuesto_unico: impuesto,
      rentas_no_gravadas: noGravadas,
      cotizaciones_previsionales: cotizaciones,
    });
  }

  const detalle = [...porTrabajador.values()];

  return {
    anio_comercial: Number(anioComercial),
    anio_tributario: Number(anioComercial) + 1,
    detalle,
    totales: detalle.reduce(
      (acc, fila) => ({
        trabajadores: acc.trabajadores + 1,
        renta_imponible: acc.renta_imponible + fila.renta_imponible,
        renta_tributable: acc.renta_tributable + fila.renta_tributable,
        impuesto_unico: acc.impuesto_unico + fila.impuesto_unico,
        rentas_no_gravadas: acc.rentas_no_gravadas + fila.rentas_no_gravadas,
      }),
      {
        trabajadores: 0,
        renta_imponible: 0,
        renta_tributable: 0,
        impuesto_unico: 0,
        rentas_no_gravadas: 0,
      }
    ),
    avisos: [
      "Sin reajuste de las rentas mensuales al valor de diciembre. La declaración lo exige y depende del IPC de cada mes. REQUIERE VALIDACIÓN TRIBUTARIA.",
    ],
  };
}

// Las columnas del archivo de carga, en orden. El nombre es el del formulario;
// el código, la columna del SII. REQUIERE VALIDACIÓN contra la resolución del
// año tributario que se declara.
const COLUMNAS_1879 = [
  ["RUT_RECEPTOR", (fila) => fila.rut],
  ["NOMBRE_RECEPTOR", (fila) => fila.nombre],
  ["MONTO_BRUTO", (fila) => fila.honorarios_brutos],
  ["MONTO_RETENIDO", (fila) => fila.retencion],
  ["NUMERO_DOCUMENTOS", (fila) => fila.documentos],
];

const COLUMNAS_1887 = [
  ["RUT_TRABAJADOR", (fila) => fila.rut],
  ["NOMBRE_TRABAJADOR", (fila) => fila.nombre],
  ["MESES_TRABAJADOS", (fila) => fila.meses],
  ["RENTA_IMPONIBLE_ANUAL", (fila) => fila.renta_imponible],
  ["RENTA_TRIBUTABLE_ANUAL", (fila) => fila.renta_tributable],
  ["IMPUESTO_UNICO_RETENIDO", (fila) => fila.impuesto_unico],
  ["RENTAS_NO_GRAVADAS", (fila) => fila.rentas_no_gravadas],
  ["COTIZACIONES_PREVISIONALES", (fila) => fila.cotizaciones_previsionales],
];

function celda(valor) {
  const texto = valor === null || valor === undefined ? "" : String(valor);

  return texto.includes(";") || texto.includes('"') || texto.includes("\n")
    ? `"${texto.replace(/"/g, '""')}"`
    : texto;
}

function construirCsv(columnas, filas) {
  const lineas = [columnas.map(([nombre]) => nombre).join(";")];

  for (const fila of filas) {
    lineas.push(columnas.map(([, valor]) => celda(valor(fila))).join(";"));
  }

  return `${lineas.join("\r\n")}\r\n`;
}

module.exports = {
  resumen1879,
  resumen1887,
  COLUMNAS_1879,
  COLUMNAS_1887,
  construirCsv,
};
