import * as XLSX from "xlsx";
import {
  crearPDFClasico,
  encabezadoPDFClasico,
  piePaginasPDFClasico,
  tablaPDFClasica,
} from "./documentTheme";

export function exportarExcel(nombreArchivo, filas) {
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(libro, hoja, "Reporte");

  XLSX.writeFile(libro, `${nombreArchivo}.xlsx`);
}

export function exportarPDF(nombreArchivo, titulo, columnas, filas) {
  const doc = crearPDFClasico({ orientation: "l", format: "a4" });
  const margenX = 8;
  const y = encabezadoPDFClasico(doc, {
    titulo,
    margenX,
  });

  tablaPDFClasica(doc, {
    startY: y,
    head: [columnas],
    body: filas,
    margin: { left: margenX, right: margenX },
    styles: {
      fontSize: 7,
      cellPadding: 1.4,
    },
  });

  piePaginasPDFClasico(doc, { texto: titulo, margenX });
  doc.save(`${nombreArchivo}.pdf`);
}
