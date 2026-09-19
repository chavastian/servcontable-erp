/**
 * Certificados anuales para entregar al contribuyente.
 *
 * El de honorarios y el de sueldos usan la misma identidad visual que el resto
 * de los documentos del sistema. Los montos vienen ya cuadrados con la
 * declaración jurada: acá no se calcula nada.
 */

import {
  crearPDFClasico,
  encabezadoPDFClasico,
  seccionPDFClasica,
  tablaPDFClasica,
  piePaginasPDFClasico,
  paginaPDF,
  formatoMontoDocumento,
  textoSeguro,
  escribirParrafoPDF,
} from "./documentTheme";

const MESES = [
  "",
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function fecha(valor) {
  if (!valor) return "";

  const iso = String(valor).slice(0, 10);
  const [anio, mes, dia] = iso.split("-");

  return dia ? `${dia}-${mes}-${anio}` : iso;
}

export function exportarCertificadoPDF(certificado) {
  const doc = crearPDFClasico({ format: "a4" });
  const margenX = 12;

  let y = encabezadoPDFClasico(doc, {
    titulo: certificado.titulo,
    empresa: certificado.empresa?.razon_social,
    rut: certificado.empresa?.rut,
    periodo: `AÑO TRIBUTARIO ${certificado.anio_tributario}`,
    margenX,
  });

  y = seccionPDFClasica(doc, "Datos del contribuyente", y, { margenX });

  tablaPDFClasica(doc, {
    startY: y,
    head: [["RUT", "Nombre"]],
    body: [[textoSeguro(certificado.receptor.rut), textoSeguro(certificado.receptor.nombre)]],
    margin: { left: margenX, right: margenX },
    styles: { fontSize: 8.5, cellPadding: 1.8 },
  });

  y = doc.lastAutoTable.finalY + 8;

  if (certificado.tipo === "honorarios") {
    y = seccionPDFClasica(doc, "Honorarios pagados y retenciones practicadas", y, { margenX });

    tablaPDFClasica(doc, {
      startY: y,
      head: [["Folio", "Emisión", "Pago", "Bruto", "Tasa", "Retención", "Líquido"]],
      body: certificado.documentos.map((documento) => [
        textoSeguro(documento.folio),
        fecha(documento.fecha_emision),
        fecha(documento.fecha_pago),
        formatoMontoDocumento(documento.bruto),
        `${Number(documento.tasa_retencion || 0)}%`,
        formatoMontoDocumento(documento.retencion),
        formatoMontoDocumento(documento.liquido),
      ]),
      foot: [
        [
          "Total",
          "",
          "",
          formatoMontoDocumento(certificado.totales.honorarios_brutos),
          "",
          formatoMontoDocumento(certificado.totales.retencion),
          formatoMontoDocumento(certificado.totales.liquido),
        ],
      ],
      margin: { left: margenX, right: margenX },
      styles: { fontSize: 8, cellPadding: 1.6 },
    });
  } else {
    y = seccionPDFClasica(doc, "Rentas pagadas e impuesto retenido", y, { margenX });

    tablaPDFClasica(doc, {
      startY: y,
      head: [["Mes", "Días", "Renta imponible", "Renta tributable", "Impuesto único", "No gravadas"]],
      body: certificado.detalle_mensual.map((mes) => [
        MESES[mes.mes] || mes.periodo,
        String(mes.dias_trabajados || ""),
        formatoMontoDocumento(mes.renta_imponible),
        formatoMontoDocumento(mes.renta_tributable),
        formatoMontoDocumento(mes.impuesto_unico),
        formatoMontoDocumento(mes.rentas_no_gravadas),
      ]),
      foot: [
        [
          `Total (${certificado.totales.meses} mes(es))`,
          "",
          formatoMontoDocumento(certificado.totales.renta_imponible),
          formatoMontoDocumento(certificado.totales.renta_tributable),
          formatoMontoDocumento(certificado.totales.impuesto_unico),
          formatoMontoDocumento(certificado.totales.rentas_no_gravadas),
        ],
      ],
      margin: { left: margenX, right: margenX },
      styles: { fontSize: 8, cellPadding: 1.6 },
    });
  }

  y = doc.lastAutoTable.finalY + 10;

  // Los avisos van impresos: quien recibe el certificado tiene que saber si
  // las cifras están reajustadas o no.
  if (Array.isArray(certificado.avisos) && certificado.avisos.length > 0) {
    y = seccionPDFClasica(doc, "Observaciones", y, { margenX });

    // Sin ancho explícito el texto no corta líneas y se sale de la hoja.
    const anchoUtil = paginaPDF(doc).ancho - margenX * 2 - 6;

    for (const aviso of certificado.avisos.filter(Boolean)) {
      y = escribirParrafoPDF(doc, `• ${aviso}`, y, { x: margenX + 2, ancho: anchoUtil }) + 1;
    }
  }

  y += 12;
  doc.setFontSize(9);
  doc.text("___________________________________", margenX + 6, y);
  doc.text(
    textoSeguro(certificado.empresa?.representante_legal || certificado.empresa?.razon_social),
    margenX + 6,
    y + 5
  );
  doc.text(
    `RUT ${textoSeguro(certificado.empresa?.rut_representante || certificado.empresa?.rut)}`,
    margenX + 6,
    y + 10
  );

  piePaginasPDFClasico(doc, { texto: certificado.titulo, margenX });

  const nombre = `Certificado_${certificado.tipo}_${certificado.receptor.rut}_${certificado.anio_comercial}`;
  doc.save(`${nombre}.pdf`);
}
