import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import {
  obtenerLibroVentas,
  obtenerLibroCompras,
} from "../services/librosTributariosService";
import * as XLSX from "xlsx";
import {
  crearPDFClasico,
  encabezadoPDFClasico,
  marcarFilaTotalPDF,
  paginaPDF,
  piePaginasPDFClasico,
  seccionPDFClasica,
  tablaPDFClasica,
} from "../utils/documentTheme";
import { obtenerRangoAnualTrabajo } from "../services/periodoTrabajoService";

export default function LibrosCompraVenta() {
  const empresaActiva = obtenerEmpresaActiva();
  const rangoInicial = obtenerRangoAnualTrabajo();

  const [fechaDesde, setFechaDesde] = useState(rangoInicial.fechaDesde);
  const [fechaHasta, setFechaHasta] = useState(rangoInicial.fechaHasta);

  const [ventas, setVentas] = useState([]);
  const [compras, setCompras] = useState([]);

  const [totalesVentas, setTotalesVentas] = useState({
    exento: 0,
    neto: 0,
    iva: 0,
    total: 0,
  });

  const [totalesCompras, setTotalesCompras] = useState({
    exento: 0,
    neto: 0,
    iva_credito: 0,
    iva_no_recuperable: 0,
    total: 0,
  });

  const [resumenVentas, setResumenVentas] = useState([]);
  const [resumenCompras, setResumenCompras] = useState([]);

  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (empresaActiva) {
      cargarDatos();
    }
  }, []);

  async function cargarDatos() {
    try {
      setError("");
      setMensaje("");

      const ventasData = await obtenerLibroVentas(
        empresaActiva.id,
        fechaDesde,
        fechaHasta
      );

      const comprasData = await obtenerLibroCompras(
        empresaActiva.id,
        fechaDesde,
        fechaHasta
      );

      setVentas(ventasData.ventas || []);
      setTotalesVentas(
        ventasData.totales || {
          exento: 0,
          neto: 0,
          iva: 0,
          total: 0,
        }
      );
      setResumenVentas(ventasData.resumen_tipo_documento || []);

      setCompras(comprasData.compras || []);
      setTotalesCompras(
        comprasData.totales || {
          exento: 0,
          neto: 0,
          iva_credito: 0,
          iva_no_recuperable: 0,
          total: 0,
        }
      );
      setResumenCompras(comprasData.resumen_tipo_documento || []);

      setMensaje("Libros actualizados correctamente.");
    } catch (err) {
      setError(err.message);
    }
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  function fechaCL(fecha) {
    if (!fecha) return "";
    const texto = String(fecha).substring(0, 10);
    const partes = texto.split("-");
    if (partes.length !== 3) return texto;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  function exportarVentasExcel() {
    const data = [];

    data.push(["LIBRO DE VENTAS"]);
    data.push([`Empresa: ${empresaActiva?.razon_social || ""}`]);
    data.push([`RUT: ${empresaActiva?.rut || ""}`]);
    data.push([`Desde: ${fechaDesde}`]);
    data.push([`Hasta: ${fechaHasta}`]);
    data.push([]);

    data.push([
      "Nro",
      "Tipo Venta",
      "Tipo Doc",
      "Fecha Docto",
      "RUT Cliente",
      "Razon Social",
      "Folio",
      "Monto Exento",
      "Monto Neto",
      "IVA",
      "Monto Total",
      "Comprobante",
    ]);

    ventas.forEach((item, index) => {
      data.push([
        index + 1,
        "Del Giro",
        item.sii_tipo_doc || item.tipo_documento || "",
        fechaCL(item.fecha),
        item.rut_cliente || "",
        item.razon_social_cliente || "",
        item.folio || "",
        Number(item.exento || 0),
        Number(item.neto || 0),
        Number(item.iva || 0),
        Number(item.total || 0),
        item.comprobante_id ? "Creado" : "Sin comprobante",
      ]);
    });

    data.push([]);
    data.push([
      "Total",
      "",
      "",
      "",
      "",
      "",
      "",
      Number(totalesVentas.exento || 0),
      Number(totalesVentas.neto || 0),
      Number(totalesVentas.iva || 0),
      Number(totalesVentas.total || 0),
      "",
    ]);

    data.push([]);
    data.push(["RESUMEN GENERAL POR TIPO DE DOCUMENTO"]);
    data.push(["Tipo Doc", "Cantidad", "Exento", "Neto", "IVA", "Total"]);

    resumenVentas.forEach((item) => {
      data.push([
        item.tipo_doc,
        item.cantidad,
        Number(item.exento || 0),
        Number(item.neto || 0),
        Number(item.iva || 0),
        Number(item.total || 0),
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws["!cols"] = [
      { wch: 8 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      { wch: 16 },
      { wch: 35 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Libro Ventas");
    XLSX.writeFile(wb, `Libro_Ventas_${fechaDesde}_${fechaHasta}.xlsx`);
  }

  function exportarComprasExcel() {
    const data = [];

    data.push(["LIBRO DE COMPRAS"]);
    data.push([`Empresa: ${empresaActiva?.razon_social || ""}`]);
    data.push([`RUT: ${empresaActiva?.rut || ""}`]);
    data.push([`Desde: ${fechaDesde}`]);
    data.push([`Hasta: ${fechaHasta}`]);
    data.push([]);

    data.push([
      "Nro",
      "Tipo Compra",
      "Tipo Doc",
      "Fecha Docto",
      "RUT Proveedor",
      "Razon Social",
      "Folio",
      "Monto Exento",
      "Monto Neto",
      "Credito Fiscal",
      "IVA No Recuperable",
      "Monto Total",
      "Comprobante",
    ]);

    compras.forEach((item, index) => {
      data.push([
        index + 1,
        "Del Giro",
        item.sii_tipo_doc || item.tipo_documento || "",
        fechaCL(item.fecha),
        item.rut_proveedor || "",
        item.razon_social_proveedor || "",
        item.folio || "",
        Number(item.exento || 0),
        Number(item.neto || 0),
        Number(item.iva_credito || 0),
        Number(item.iva_no_recuperable || 0),
        Number(item.total || 0),
        item.comprobante_id ? "Creado" : "Sin comprobante",
      ]);
    });

    data.push([]);
    data.push([
      "Total",
      "",
      "",
      "",
      "",
      "",
      "",
      Number(totalesCompras.exento || 0),
      Number(totalesCompras.neto || 0),
      Number(totalesCompras.iva_credito || 0),
      Number(totalesCompras.iva_no_recuperable || 0),
      Number(totalesCompras.total || 0),
      "",
    ]);

    data.push([]);
    data.push(["RESUMEN GENERAL POR TIPO DE DOCUMENTO"]);
    data.push([
      "Tipo Doc",
      "Cantidad",
      "Exento",
      "Neto",
      "IVA",
      "IVA No Recuperable",
      "Total",
    ]);

    resumenCompras.forEach((item) => {
      data.push([
        item.tipo_doc,
        item.cantidad,
        Number(item.exento || 0),
        Number(item.neto || 0),
        Number(item.iva || 0),
        Number(item.iva_no_recuperable || 0),
        Number(item.total || 0),
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws["!cols"] = [
      { wch: 8 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      { wch: 16 },
      { wch: 35 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 18 },
      { wch: 15 },
      { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Libro Compras");
    XLSX.writeFile(wb, `Libro_Compras_${fechaDesde}_${fechaHasta}.xlsx`);
  }

  function crearPDFBase(titulo) {
    const doc = crearPDFClasico({ orientation: "l", format: "a4" });
    const margenX = 8;
    const { alto: altoPagina } = paginaPDF(doc);
    const yInicio = encabezadoPDFClasico(doc, {
      titulo,
      empresa: empresaActiva?.razon_social,
      rut: empresaActiva?.rut,
      fechaDesde,
      fechaHasta,
      margenX,
    });

    return {
      doc,
      margenX,
      altoPagina,
      yInicio,
    };
  }

  function agregarPaginacion(doc, titulo, margenX) {
    piePaginasPDFClasico(doc, { texto: titulo, margenX });
  }

  function exportarVentasPDF() {
    const { doc, margenX, altoPagina, yInicio } = crearPDFBase("Libro de Ventas");

    const body = ventas.map((item, index) => [
      index + 1,
      "Del Giro",
      item.sii_tipo_doc || item.tipo_documento || "",
      fechaCL(item.fecha),
      item.rut_cliente || "",
      item.razon_social_cliente || "",
      item.folio || "",
      Number(item.exento || 0).toLocaleString("es-CL"),
      Number(item.neto || 0).toLocaleString("es-CL"),
      Number(item.iva || 0).toLocaleString("es-CL"),
      Number(item.total || 0).toLocaleString("es-CL"),
    ]);

    body.push([
      "Total",
      "",
      "",
      "",
      "",
      "",
      "",
      Number(totalesVentas.exento || 0).toLocaleString("es-CL"),
      Number(totalesVentas.neto || 0).toLocaleString("es-CL"),
      Number(totalesVentas.iva || 0).toLocaleString("es-CL"),
      Number(totalesVentas.total || 0).toLocaleString("es-CL"),
    ]);

    tablaPDFClasica(doc, {
      startY: yInicio + 1,
      head: [
        [
          "Nro",
          "Tipo Venta",
          "Tipo Doc",
          "Fecha",
          "RUT Cliente",
          "Razón Social",
          "Folio",
          "Exento",
          "Neto",
          "IVA",
          "Total",
        ],
      ],
      body,
      margin: { left: margenX, right: margenX },
      styles: {
        fontSize: 5.7,
        cellPadding: 0.95,
      },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 16 },
        2: { cellWidth: 15 },
        3: { cellWidth: 18 },
        4: { cellWidth: 24 },
        5: { cellWidth: 64 },
        6: { cellWidth: 17 },
        7: { cellWidth: 25, halign: "right" },
        8: { cellWidth: 25, halign: "right" },
        9: { cellWidth: 25, halign: "right" },
        10: { cellWidth: 28, halign: "right" },
      },
      didParseCell(data) {
        marcarFilaTotalPDF(data, data.row.raw?.[0] === "Total");
      },
    });

    let y = doc.lastAutoTable.finalY + 5;

    if (y > altoPagina - 45) {
      doc.addPage();
      y = encabezadoPDFClasico(doc, {
        titulo: "Libro de Ventas",
        empresa: empresaActiva?.razon_social,
        rut: empresaActiva?.rut,
        fechaDesde,
        fechaHasta,
        margenX,
      });
    }

    y = seccionPDFClasica(doc, "Resumen General por Tipo de Documento", y, {
      margenX,
    });

    tablaPDFClasica(doc, {
      startY: y,
      head: [["Tipo Doc", "Cantidad", "Exento", "Neto", "IVA", "Total"]],
      body: resumenVentas.map((item) => [
        item.tipo_doc,
        item.cantidad,
        Number(item.exento || 0).toLocaleString("es-CL"),
        Number(item.neto || 0).toLocaleString("es-CL"),
        Number(item.iva || 0).toLocaleString("es-CL"),
        Number(item.total || 0).toLocaleString("es-CL"),
      ]),
      margin: { left: margenX, right: margenX },
      styles: {
        fontSize: 6.6,
        cellPadding: 1.3,
      },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 22, halign: "center" },
        2: { cellWidth: 35, halign: "right" },
        3: { cellWidth: 35, halign: "right" },
        4: { cellWidth: 35, halign: "right" },
        5: { cellWidth: 35, halign: "right" },
      },
    });

    agregarPaginacion(doc, "Libro de Ventas", margenX);
    doc.save(`Libro_Ventas_${fechaDesde}_${fechaHasta}.pdf`);
  }

  function exportarComprasPDF() {
    const { doc, margenX, altoPagina, yInicio } =
      crearPDFBase("Libro de Compras");

    const body = compras.map((item, index) => [
      index + 1,
      "Del Giro",
      item.sii_tipo_doc || item.tipo_documento || "",
      fechaCL(item.fecha),
      item.rut_proveedor || "",
      item.razon_social_proveedor || "",
      item.folio || "",
      Number(item.exento || 0).toLocaleString("es-CL"),
      Number(item.neto || 0).toLocaleString("es-CL"),
      Number(item.iva_credito || 0).toLocaleString("es-CL"),
      Number(item.iva_no_recuperable || 0).toLocaleString("es-CL"),
      Number(item.total || 0).toLocaleString("es-CL"),
    ]);

    body.push([
      "Total",
      "",
      "",
      "",
      "",
      "",
      "",
      Number(totalesCompras.exento || 0).toLocaleString("es-CL"),
      Number(totalesCompras.neto || 0).toLocaleString("es-CL"),
      Number(totalesCompras.iva_credito || 0).toLocaleString("es-CL"),
      Number(totalesCompras.iva_no_recuperable || 0).toLocaleString("es-CL"),
      Number(totalesCompras.total || 0).toLocaleString("es-CL"),
    ]);

    tablaPDFClasica(doc, {
      startY: yInicio + 1,
      head: [
        [
          "Nro",
          "Tipo Compra",
          "Tipo Doc",
          "Fecha",
          "RUT Proveedor",
          "Razón Social",
          "Folio",
          "Exento",
          "Neto",
          "Crédito Fiscal",
          "IVA No Rec.",
          "Total",
        ],
      ],
      body,
      margin: { left: margenX, right: margenX },
      styles: {
        fontSize: 5.35,
        cellPadding: 0.9,
      },
      columnStyles: {
        0: { cellWidth: 7 },
        1: { cellWidth: 15 },
        2: { cellWidth: 14 },
        3: { cellWidth: 16 },
        4: { cellWidth: 24 },
        5: { cellWidth: 56 },
        6: { cellWidth: 15 },
        7: { cellWidth: 23, halign: "right" },
        8: { cellWidth: 23, halign: "right" },
        9: { cellWidth: 28, halign: "right" },
        10: { cellWidth: 28, halign: "right" },
        11: { cellWidth: 25, halign: "right" },
      },
      didParseCell(data) {
        marcarFilaTotalPDF(data, data.row.raw?.[0] === "Total");
      },
    });

    let y = doc.lastAutoTable.finalY + 5;

    if (y > altoPagina - 45) {
      doc.addPage();
      y = encabezadoPDFClasico(doc, {
        titulo: "Libro de Compras",
        empresa: empresaActiva?.razon_social,
        rut: empresaActiva?.rut,
        fechaDesde,
        fechaHasta,
        margenX,
      });
    }

    y = seccionPDFClasica(doc, "Resumen General por Tipo de Documento", y, {
      margenX,
    });

    tablaPDFClasica(doc, {
      startY: y,
      head: [["Tipo Doc", "Cantidad", "Exento", "Neto", "IVA", "IVA No Rec.", "Total"]],
      body: resumenCompras.map((item) => [
        item.tipo_doc,
        item.cantidad,
        Number(item.exento || 0).toLocaleString("es-CL"),
        Number(item.neto || 0).toLocaleString("es-CL"),
        Number(item.iva || 0).toLocaleString("es-CL"),
        Number(item.iva_no_recuperable || 0).toLocaleString("es-CL"),
        Number(item.total || 0).toLocaleString("es-CL"),
      ]),
      margin: { left: margenX, right: margenX },
      styles: {
        fontSize: 6.3,
        cellPadding: 1.2,
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 20, halign: "center" },
        2: { cellWidth: 28, halign: "right" },
        3: { cellWidth: 28, halign: "right" },
        4: { cellWidth: 28, halign: "right" },
        5: { cellWidth: 30, halign: "right" },
        6: { cellWidth: 30, halign: "right" },
      },
    });

    agregarPaginacion(doc, "Libro de Compras", margenX);
    doc.save(`Libro_Compras_${fechaDesde}_${fechaHasta}.pdf`);
  }

  if (!empresaActiva) {
    return (
      <div>
        <h1 style={titulo}>Libros de Compra y Venta</h1>
        <div style={alerta}>
          Debes seleccionar una empresa activa antes de ver los libros.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={titulo}>Libros de Compra y Venta</h1>

      <p style={subtitulo}>
        Empresa activa: <strong>{empresaActiva.razon_social}</strong>
      </p>

      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <div style={filtrosBox}>
        <div>
          <label style={label}>Fecha desde</label>
          <input
            style={input}
            type="date"
            min={rangoInicial.fechaDesde}
            max={rangoInicial.fechaHasta}
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
          />
        </div>

        <div>
          <label style={label}>Fecha hasta</label>
          <input
            style={input}
            type="date"
            min={rangoInicial.fechaDesde}
            max={rangoInicial.fechaHasta}
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
          />
        </div>

        <button type="button" style={botonBuscar} onClick={cargarDatos}>
          Buscar
        </button>
      </div>

      <div style={gridResumen}>
        <div style={card}>
          <strong>Ventas netas</strong>
          <span>{formato(totalesVentas.neto)}</span>
        </div>

        <div style={card}>
          <strong>IVA débito</strong>
          <span>{formato(totalesVentas.iva)}</span>
        </div>

        <div style={card}>
          <strong>Total ventas</strong>
          <span>{formato(totalesVentas.total)}</span>
        </div>

        <div style={card}>
          <strong>Compras netas</strong>
          <span>{formato(totalesCompras.neto)}</span>
        </div>

        <div style={card}>
          <strong>IVA crédito</strong>
          <span>{formato(totalesCompras.iva_credito)}</span>
        </div>

        <div style={card}>
          <strong>Total compras</strong>
          <span>{formato(totalesCompras.total)}</span>
        </div>
      </div>

      <div style={seccionBox}>
        <div style={seccionHeader}>
          <h2 style={tituloSeccion}>Libro de Ventas</h2>

          <div style={acciones}>
            <button type="button" style={botonExcel} onClick={exportarVentasExcel}>
              Exportar Ventas Excel
            </button>

            <button type="button" style={botonPDF} onClick={exportarVentasPDF}>
              Exportar Ventas PDF
            </button>
          </div>
        </div>

        <TablaVentas ventas={ventas} formato={formato} fechaCL={fechaCL} />
      </div>

      <div style={seccionBox}>
        <div style={seccionHeader}>
          <h2 style={tituloSeccion}>Libro de Compras</h2>

          <div style={acciones}>
            <button type="button" style={botonExcel} onClick={exportarComprasExcel}>
              Exportar Compras Excel
            </button>

            <button type="button" style={botonPDF} onClick={exportarComprasPDF}>
              Exportar Compras PDF
            </button>
          </div>
        </div>

        <TablaCompras compras={compras} formato={formato} fechaCL={fechaCL} />
      </div>
    </div>
  );
}

function TablaVentas({ ventas, formato, fechaCL }) {
  return (
    <div style={tablaBox}>
      <table style={tabla}>
        <thead>
          <tr>
            <th style={th}>Nro</th>
            <th style={th}>Tipo Doc</th>
            <th style={th}>Fecha</th>
            <th style={th}>RUT Cliente</th>
            <th style={th}>Razón Social</th>
            <th style={th}>Folio</th>
            <th style={thNumero}>Exento</th>
            <th style={thNumero}>Neto</th>
            <th style={thNumero}>IVA</th>
            <th style={thNumero}>Total</th>
          </tr>
        </thead>

        <tbody>
          {ventas.map((item, index) => (
            <tr key={item.id}>
              <td style={td}>{index + 1}</td>
              <td style={td}>{item.sii_tipo_doc || item.tipo_documento}</td>
              <td style={td}>{fechaCL(item.fecha)}</td>
              <td style={td}>{item.rut_cliente}</td>
              <td style={td}>{item.razon_social_cliente}</td>
              <td style={td}>{item.folio}</td>
              <td style={tdNumero}>{formato(item.exento)}</td>
              <td style={tdNumero}>{formato(item.neto)}</td>
              <td style={tdNumero}>{formato(item.iva)}</td>
              <td style={tdNumero}>{formato(item.total)}</td>
            </tr>
          ))}

          {ventas.length === 0 && (
            <tr>
              <td style={td} colSpan="10">
                No hay ventas para el rango seleccionado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TablaCompras({ compras, formato, fechaCL }) {
  return (
    <div style={tablaBox}>
      <table style={tabla}>
        <thead>
          <tr>
            <th style={th}>Nro</th>
            <th style={th}>Tipo Doc</th>
            <th style={th}>Fecha</th>
            <th style={th}>RUT Proveedor</th>
            <th style={th}>Razón Social</th>
            <th style={th}>Folio</th>
            <th style={thNumero}>Exento</th>
            <th style={thNumero}>Neto</th>
            <th style={thNumero}>IVA Crédito</th>
            <th style={thNumero}>IVA No Rec.</th>
            <th style={thNumero}>Total</th>
          </tr>
        </thead>

        <tbody>
          {compras.map((item, index) => (
            <tr key={item.id}>
              <td style={td}>{index + 1}</td>
              <td style={td}>{item.sii_tipo_doc || item.tipo_documento}</td>
              <td style={td}>{fechaCL(item.fecha)}</td>
              <td style={td}>{item.rut_proveedor}</td>
              <td style={td}>{item.razon_social_proveedor}</td>
              <td style={td}>{item.folio}</td>
              <td style={tdNumero}>{formato(item.exento)}</td>
              <td style={tdNumero}>{formato(item.neto)}</td>
              <td style={tdNumero}>{formato(item.iva_credito)}</td>
              <td style={tdNumero}>{formato(item.iva_no_recuperable)}</td>
              <td style={tdNumero}>{formato(item.total)}</td>
            </tr>
          ))}

          {compras.length === 0 && (
            <tr>
              <td style={td} colSpan="11">
                No hay compras para el rango seleccionado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const titulo = {
  fontSize: "34px",
  color: "var(--sc-ink)",
  marginBottom: "5px",
};

const subtitulo = {
  color: "var(--sc-gris)",
  marginBottom: "18px",
};

const filtrosBox = {
  display: "flex",
  alignItems: "end",
  gap: "12px",
  background: "white",
  padding: "18px",
  borderRadius: "16px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "18px",
  flexWrap: "wrap",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-text)",
  marginBottom: "5px",
};

const input = {
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "10px",
  minWidth: "170px",
  height: "40px",
  boxSizing: "border-box",
};

const botonBuscar = {
  background: "var(--sc-azul)",
  color: "white",
  border: "none",
  padding: "10px 20px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const gridResumen = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
  marginBottom: "18px",
};

const card = {
  background: "white",
  borderRadius: "16px",
  padding: "16px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  color: "var(--sc-text)",
};

const seccionBox = {
  background: "white",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "22px",
};

const seccionHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "12px",
};

const tituloSeccion = {
  color: "var(--sc-azul)",
  margin: 0,
};

const acciones = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
};

const botonExcel = {
  background: "var(--sc-teal)",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonPDF = {
  background: "var(--sc-danger)",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
};

const tablaBox = {
  overflowX: "auto",
};

const tabla = {
  width: "100%",
  borderCollapse: "collapse",
};

const th = {
  textAlign: "left",
  padding: "10px",
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  color: "var(--sc-azul)",
  whiteSpace: "nowrap",
};

const thNumero = {
  ...th,
  textAlign: "right",
};

const td = {
  padding: "9px",
  borderBottom: "1px solid var(--sc-borde-claro)",
  color: "var(--sc-text)",
  verticalAlign: "top",
};

const tdNumero = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const ok = {
  color: "var(--sc-teal)",
  fontWeight: "bold",
};

const err = {
  color: "var(--sc-danger)",
  fontWeight: "bold",
};

const alerta = {
  marginTop: "25px",
  background: "var(--sc-naranja-fondo)",
  border: "1px solid #fed7aa",
  color: "var(--sc-naranja-texto)",
  padding: "16px",
  borderRadius: "14px",
  fontWeight: "bold",
};
