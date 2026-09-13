import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const JsPDF = jsPDF?.jsPDF || jsPDF;

export const DOCUMENT_THEME = {
  font: "courier",
  fontFamilyCss: "'Courier New', 'Liberation Mono', monospace",
  color: {
    black: [0, 0, 0],
    dark: [30, 30, 30],
    white: [255, 255, 255],
    veryLight: [248, 248, 248],
  },
  line: {
    normal: 0.2,
    strong: 0.45,
  },
  size: {
    title: 13,
    section: 9.5,
    text: 9,
    table: 7,
    tableSmall: 6,
    note: 8,
  },
  margin: {
    a4: 10,
    a4Wide: 8,
  },
};

export function crearPDFClasico({
  orientation = "p",
  format = "a4",
  unit = "mm",
} = {}) {
  const doc = new JsPDF(orientation, unit, format);
  doc.setFont(DOCUMENT_THEME.font, "normal");
  doc.setTextColor(...DOCUMENT_THEME.color.black);
  doc.setDrawColor(...DOCUMENT_THEME.color.black);
  return doc;
}

export function paginaPDF(doc) {
  return {
    ancho: doc.internal.pageSize.getWidth(),
    alto: doc.internal.pageSize.getHeight(),
  };
}

export function fechaEmisionCL() {
  return new Date().toLocaleDateString("es-CL");
}

export function textoSeguro(valor, respaldo = "-") {
  const texto = String(valor ?? "").replace(/\s+/g, " ").trim();
  return texto || respaldo;
}

export function formatoMontoDocumento(valor, prefijo = "") {
  const numero = Number(valor || 0);
  return `${prefijo}${numero.toLocaleString("es-CL")}`;
}

function altoTexto(doc, texto, ancho, lineHeight = 4) {
  return doc.splitTextToSize(textoSeguro(texto), ancho).length * lineHeight;
}

export function encabezadoPDFClasico(
  doc,
  {
    titulo,
    empresa,
    rut,
    periodo,
    fechaDesde,
    fechaHasta,
    fechaEmision = fechaEmisionCL(),
    usuario,
    margenX,
    y = 10,
  } = {}
) {
  const { ancho } = paginaPDF(doc);
  const margen = margenX ?? DOCUMENT_THEME.margin.a4;
  const anchoUtil = ancho - margen * 2;
  const empresaTexto = textoSeguro(empresa || "");
  const lineasEmpresa = doc.splitTextToSize(empresaTexto, Math.max(70, anchoUtil * 0.48));
  const datosDerecha = [
    periodo ? `PERIODO: ${periodo}` : "",
    fechaDesde ? `DESDE: ${fechaDesde}` : "",
    fechaHasta ? `HASTA: ${fechaHasta}` : "",
    `EMISION: ${fechaEmision}`,
    usuario ? `USUARIO: ${usuario}` : "",
  ].filter(Boolean);
  const altoInfo = Math.max(
    22,
    8 + Math.max(lineasEmpresa.length + 1, datosDerecha.length) * 4.4
  );

  doc.setDrawColor(...DOCUMENT_THEME.color.black);
  doc.setLineWidth(DOCUMENT_THEME.line.strong);
  doc.rect(margen, y, anchoUtil, altoInfo + 11);

  doc.setFont(DOCUMENT_THEME.font, "bold");
  doc.setFontSize(DOCUMENT_THEME.size.title);
  doc.setTextColor(...DOCUMENT_THEME.color.black);
  doc.text(textoSeguro(titulo, "REPORTE").toUpperCase(), ancho / 2, y + 7, {
    align: "center",
  });

  doc.setLineWidth(DOCUMENT_THEME.line.normal);
  doc.line(margen, y + 11, ancho - margen, y + 11);

  doc.setFontSize(DOCUMENT_THEME.size.text);
  doc.text("EMPRESA:", margen + 3, y + 18);
  doc.setFont(DOCUMENT_THEME.font, "normal");
  doc.text(lineasEmpresa, margen + 22, y + 18);

  doc.setFont(DOCUMENT_THEME.font, "bold");
  doc.text("RUT:", margen + 3, y + 23);
  doc.setFont(DOCUMENT_THEME.font, "normal");
  doc.text(textoSeguro(rut || ""), margen + 15, y + 23);

  let yDerecha = y + 18;
  doc.setFont(DOCUMENT_THEME.font, "normal");
  for (const linea of datosDerecha) {
    doc.text(linea, ancho - margen - 3, yDerecha, { align: "right" });
    yDerecha += 4.4;
  }

  return y + altoInfo + 15;
}

export function seccionPDFClasica(doc, titulo, y, { margenX } = {}) {
  const { ancho } = paginaPDF(doc);
  const margen = margenX ?? DOCUMENT_THEME.margin.a4;

  doc.setDrawColor(...DOCUMENT_THEME.color.black);
  doc.setLineWidth(DOCUMENT_THEME.line.strong);
  doc.line(margen, y, ancho - margen, y);
  doc.setFont(DOCUMENT_THEME.font, "bold");
  doc.setFontSize(DOCUMENT_THEME.size.section);
  doc.setTextColor(...DOCUMENT_THEME.color.black);
  doc.text(textoSeguro(titulo).toUpperCase(), margen + 1, y + 4);
  doc.setLineWidth(DOCUMENT_THEME.line.normal);
  doc.line(margen, y + 6, ancho - margen, y + 6);

  return y + 9;
}

export function tablaPDFClasica(
  doc,
  {
    startY,
    head,
    body,
    margin,
    styles,
    headStyles,
    bodyStyles,
    alternateRowStyles,
    columnStyles,
    didParseCell,
    didDrawPage,
    ...rest
  }
) {
  return autoTable(doc, {
    startY,
    head,
    body,
    theme: "grid",
    margin,
    styles: {
      font: DOCUMENT_THEME.font,
      fontSize: DOCUMENT_THEME.size.table,
      cellPadding: 1.2,
      textColor: DOCUMENT_THEME.color.black,
      lineColor: DOCUMENT_THEME.color.black,
      lineWidth: DOCUMENT_THEME.line.normal,
      fillColor: DOCUMENT_THEME.color.white,
      overflow: "linebreak",
      valign: "top",
      minCellHeight: 4,
      ...styles,
    },
    headStyles: {
      font: DOCUMENT_THEME.font,
      fillColor: DOCUMENT_THEME.color.white,
      textColor: DOCUMENT_THEME.color.black,
      lineColor: DOCUMENT_THEME.color.black,
      lineWidth: DOCUMENT_THEME.line.strong,
      fontStyle: "bold",
      halign: "center",
      ...headStyles,
    },
    bodyStyles: {
      fillColor: DOCUMENT_THEME.color.white,
      textColor: DOCUMENT_THEME.color.black,
      ...bodyStyles,
    },
    alternateRowStyles: {
      fillColor: DOCUMENT_THEME.color.white,
      ...alternateRowStyles,
    },
    columnStyles,
    didParseCell(data) {
      data.cell.styles.font = DOCUMENT_THEME.font;
      data.cell.styles.textColor = DOCUMENT_THEME.color.black;

      if (didParseCell) {
        didParseCell(data);
      }
    },
    didDrawPage,
    ...rest,
  });
}

export function marcarFilaTotalPDF(data, condicion) {
  if (!condicion) return;

  data.cell.styles.fontStyle = "bold";
  data.cell.styles.fillColor = DOCUMENT_THEME.color.white;
  data.cell.styles.textColor = DOCUMENT_THEME.color.black;
  data.cell.styles.lineColor = DOCUMENT_THEME.color.black;
  data.cell.styles.lineWidth = DOCUMENT_THEME.line.strong;
}

export function piePaginasPDFClasico(
  doc,
  { texto = "ServContable PRO", margenX = DOCUMENT_THEME.margin.a4 } = {}
) {
  const totalPaginas = doc.getNumberOfPages();
  const { ancho, alto } = paginaPDF(doc);

  for (let i = 1; i <= totalPaginas; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...DOCUMENT_THEME.color.black);
    doc.setLineWidth(DOCUMENT_THEME.line.normal);
    doc.line(margenX, alto - 11, ancho - margenX, alto - 11);
    doc.setFont(DOCUMENT_THEME.font, "normal");
    doc.setFontSize(DOCUMENT_THEME.size.note);
    doc.setTextColor(...DOCUMENT_THEME.color.black);
    doc.text(textoSeguro(texto, ""), margenX, alto - 6);
    doc.text(`PAGINA ${i} DE ${totalPaginas}`, ancho - margenX, alto - 6, {
      align: "right",
    });
  }
}

export function asegurarEspacioPDF(doc, y, altoNecesario, margenInferior = 16) {
  const { alto } = paginaPDF(doc);
  if (y + altoNecesario <= alto - margenInferior) return y;
  doc.addPage();
  return DOCUMENT_THEME.margin.a4;
}

export function escribirParrafoPDF(doc, texto, y, { x, ancho, lineHeight = 4.3 } = {}) {
  const lineas = doc.splitTextToSize(textoSeguro(texto, ""), ancho);
  doc.setFont(DOCUMENT_THEME.font, "normal");
  doc.setFontSize(DOCUMENT_THEME.size.text);
  doc.setTextColor(...DOCUMENT_THEME.color.black);

  for (const linea of lineas) {
    y = asegurarEspacioPDF(doc, y, lineHeight);
    doc.text(linea, x, y);
    y += lineHeight;
  }

  return y + 2;
}

export function altoParrafoPDF(doc, texto, ancho, lineHeight = 4.3) {
  return altoTexto(doc, texto, ancho, lineHeight);
}

export const PRINT_STYLE_CLASICO = `
  @page {
    size: A4;
    margin: 10mm;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: white;
    color: #000;
    font-family: ${DOCUMENT_THEME.fontFamilyCss};
    font-size: 10pt;
    line-height: 1.25;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .pagina {
    background: white;
    color: #000;
    width: 100%;
  }

  .bloque {
    border: 1px solid #000;
    margin-bottom: 8px;
    padding: 7px;
  }

  .titulo-documento {
    border: 1px solid #000;
    font-size: 13pt;
    font-weight: 700;
    margin: 0 0 8px;
    padding: 6px;
    text-align: center;
    text-transform: uppercase;
  }

  .fila {
    display: flex;
    gap: 8px;
    justify-content: space-between;
  }

  .label {
    font-weight: 700;
  }

  table {
    border-collapse: collapse;
    table-layout: fixed;
    width: 100%;
  }

  thead {
    display: table-header-group;
  }

  tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  th,
  td {
    border: 1px solid #000;
    padding: 4px 5px;
    vertical-align: top;
    word-break: break-word;
  }

  th {
    background: white;
    color: #000;
    font-weight: 700;
    text-align: center;
  }

  .monto {
    text-align: right;
    white-space: nowrap;
  }

  .total td,
  .total {
    border-top: 2px solid #000;
    border-bottom: 2px solid #000;
    font-weight: 700;
  }

  .firma {
    border: 1px solid #000;
    min-height: 72px;
    padding: 28px 16px 10px;
    text-align: center;
  }

  .linea-firma {
    border-top: 1px solid #000;
    margin: 0 auto 8px;
    max-width: 280px;
  }

  @media screen {
    body {
      padding: 18px;
    }

    .pagina {
      border: 1px solid #000;
      margin: 0 auto;
      max-width: 1050px;
      padding: 14px;
    }
  }
`;
