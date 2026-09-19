import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import {
  obtenerCuentasPorCobrar,
  obtenerCuentasPorPagar,
} from "../services/cuentasPendientesService";
import {
  anularPagoCobro,
  listarPagosCobros,
} from "../services/pagosCobrosService";
import * as XLSX from "xlsx";
import { obtenerRangoAnualTrabajo } from "../services/periodoTrabajoService";
import {
  crearPDFClasico,
  encabezadoPDFClasico,
  marcarFilaTotalPDF,
  paginaPDF,
  piePaginasPDFClasico,
  seccionPDFClasica,
  tablaPDFClasica,
} from "../utils/documentTheme";

export default function CuentasPendientes({ irVista }) {
  const empresaActiva = obtenerEmpresaActiva();
  const rangoInicial = obtenerRangoAnualTrabajo();

  const [fechaDesde, setFechaDesde] = useState(rangoInicial.fechaDesde);
  const [fechaHasta, setFechaHasta] = useState(rangoInicial.fechaHasta);

  const [porCobrar, setPorCobrar] = useState([]);
  const [porPagar, setPorPagar] = useState([]);
  const [movimientos, setMovimientos] = useState([]);

  const [totalesCobrar, setTotalesCobrar] = useState({
    total_documentos: 0,
    total_pagado: 0,
    saldo_pendiente: 0,
  });

  const [totalesPagar, setTotalesPagar] = useState({
    total_documentos: 0,
    total_pagado: 0,
    saldo_pendiente: 0,
    saldo_compras: 0,
    saldo_honorarios: 0,
  });

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (empresaActiva) {
      cargarDatos();
    }
  }, []);

  async function cargarDatos() {
    try {
      setMensaje("");
      setError("");

      const cobrarData = await obtenerCuentasPorCobrar(
        empresaActiva.id,
        fechaDesde,
        fechaHasta
      );

      const pagarData = await obtenerCuentasPorPagar(
        empresaActiva.id,
        fechaDesde,
        fechaHasta
      );

      const movimientosData = await listarPagosCobros(
        empresaActiva.id,
        fechaDesde,
        fechaHasta,
        true
      );

      setPorCobrar(cobrarData.documentos || []);
      setTotalesCobrar(
        cobrarData.totales || {
          total_documentos: 0,
          total_pagado: 0,
          saldo_pendiente: 0,
        }
      );

      setPorPagar(pagarData.documentos || []);
      setTotalesPagar(
        pagarData.totales || {
          total_documentos: 0,
          total_pagado: 0,
          saldo_pendiente: 0,
          saldo_compras: 0,
          saldo_honorarios: 0,
        }
      );
      setMovimientos(movimientosData.movimientos || []);

      setMensaje("Cuentas pendientes actualizadas correctamente.");
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

  function porcentajePagado(item) {
    const total = Number(item.total_documento || 0);
    const pagado = Number(item.total_pagado || 0);

    if (total <= 0) return 0;

    return Math.round((pagado / total) * 100);
  }

  function exportarExcel() {
    const data = [];

    data.push(["CUENTAS POR COBRAR Y POR PAGAR"]);
    data.push([`Empresa: ${empresaActiva?.razon_social || ""}`]);
    data.push([`RUT: ${empresaActiva?.rut || ""}`]);
    data.push([`Desde: ${fechaDesde}`]);
    data.push([`Hasta: ${fechaHasta}`]);
    data.push([]);

    data.push(["CUENTAS POR COBRAR"]);
    data.push([
      "Fecha",
      "Tipo",
      "Documento",
      "Folio",
      "RUT",
      "Tercero",
      "Total Documento",
      "Cobrado",
      "Saldo Pendiente",
      "% Cobrado",
    ]);

    porCobrar.forEach((item) => {
      data.push([
        fechaCL(item.fecha),
        item.tipo_documento,
        item.documento_origen || "",
        item.folio || "",
        item.rut_tercero || "",
        item.nombre_tercero || "",
        Number(item.total_documento || 0),
        Number(item.total_pagado || 0),
        Number(item.saldo_pendiente || 0),
        `${porcentajePagado(item)}%`,
      ]);
    });

    data.push([
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      Number(totalesCobrar.total_documentos || 0),
      Number(totalesCobrar.total_pagado || 0),
      Number(totalesCobrar.saldo_pendiente || 0),
      "",
    ]);

    data.push([]);
    data.push(["CUENTAS POR PAGAR"]);
    data.push([
      "Fecha",
      "Tipo",
      "Documento",
      "Folio",
      "RUT",
      "Tercero",
      "Total Documento",
      "Pagado",
      "Saldo Pendiente",
      "% Pagado",
    ]);

    porPagar.forEach((item) => {
      data.push([
        fechaCL(item.fecha),
        item.tipo_documento,
        item.documento_origen || "",
        item.folio || "",
        item.rut_tercero || "",
        item.nombre_tercero || "",
        Number(item.total_documento || 0),
        Number(item.total_pagado || 0),
        Number(item.saldo_pendiente || 0),
        `${porcentajePagado(item)}%`,
      ]);
    });

    data.push([
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      Number(totalesPagar.total_documentos || 0),
      Number(totalesPagar.total_pagado || 0),
      Number(totalesPagar.saldo_pendiente || 0),
      "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws["!cols"] = [
      { wch: 14 },
      { wch: 14 },
      { wch: 22 },
      { wch: 12 },
      { wch: 16 },
      { wch: 35 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 12 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cuentas Pendientes");

    XLSX.writeFile(
      wb,
      `Cuentas_Pendientes_${fechaDesde}_${fechaHasta}.xlsx`
    );
  }

  function exportarPDF() {
    const doc = crearPDFClasico({ orientation: "l", format: "a4" });
    const margenX = 8;
    const { alto: altoPagina } = paginaPDF(doc);
    let y = encabezadoPDFClasico(doc, {
      titulo: "Cuentas por Cobrar y por Pagar",
      empresa: empresaActiva?.razon_social,
      rut: empresaActiva?.rut,
      fechaDesde,
      fechaHasta,
      margenX,
    });

    y = seccionPDFClasica(doc, "Cuentas por Cobrar", y, { margenX });

    tablaPDFClasica(doc, {
      startY: y,
      head: [["Fecha", "Tipo", "Folio", "RUT", "Cliente", "Total", "Cobrado", "Saldo", "%"]],
      body: [
        ...porCobrar.map((item) => [
          fechaCL(item.fecha),
          item.tipo_documento,
          item.folio || "",
          item.rut_tercero || "",
          item.nombre_tercero || "",
          Number(item.total_documento || 0).toLocaleString("es-CL"),
          Number(item.total_pagado || 0).toLocaleString("es-CL"),
          Number(item.saldo_pendiente || 0).toLocaleString("es-CL"),
          `${porcentajePagado(item)}%`,
        ]),
        [
          "TOTAL",
          "",
          "",
          "",
          "",
          Number(totalesCobrar.total_documentos || 0).toLocaleString("es-CL"),
          Number(totalesCobrar.total_pagado || 0).toLocaleString("es-CL"),
          Number(totalesCobrar.saldo_pendiente || 0).toLocaleString("es-CL"),
          "",
        ],
      ],
      margin: { left: margenX, right: margenX },
      styles: {
        fontSize: 6.4,
        cellPadding: 1.1,
      },
      columnStyles: {
        0: { cellWidth: 21 },
        1: { cellWidth: 24 },
        2: { cellWidth: 17 },
        3: { cellWidth: 26 },
        4: { cellWidth: 82 },
        5: { cellWidth: 27, halign: "right" },
        6: { cellWidth: 27, halign: "right" },
        7: { cellWidth: 27, halign: "right" },
        8: { cellWidth: 13, halign: "right" },
      },
      didParseCell(data) {
        marcarFilaTotalPDF(data, data.row.raw?.[0] === "TOTAL");
      },
    });

    y = doc.lastAutoTable.finalY + 5;

    if (y > altoPagina - 45) {
      doc.addPage();
      y = encabezadoPDFClasico(doc, {
        titulo: "Cuentas por Cobrar y por Pagar",
        empresa: empresaActiva?.razon_social,
        rut: empresaActiva?.rut,
        fechaDesde,
        fechaHasta,
        margenX,
      });
    }

    y = seccionPDFClasica(doc, "Cuentas por Pagar", y, { margenX });

    tablaPDFClasica(doc, {
      startY: y,
      head: [["Fecha", "Tipo", "Folio", "RUT", "Proveedor / Prestador", "Total", "Pagado", "Saldo", "%"]],
      body: [
        ...porPagar.map((item) => [
          fechaCL(item.fecha),
          item.tipo_documento,
          item.folio || "",
          item.rut_tercero || "",
          item.nombre_tercero || "",
          Number(item.total_documento || 0).toLocaleString("es-CL"),
          Number(item.total_pagado || 0).toLocaleString("es-CL"),
          Number(item.saldo_pendiente || 0).toLocaleString("es-CL"),
          `${porcentajePagado(item)}%`,
        ]),
        [
          "TOTAL",
          "",
          "",
          "",
          "",
          Number(totalesPagar.total_documentos || 0).toLocaleString("es-CL"),
          Number(totalesPagar.total_pagado || 0).toLocaleString("es-CL"),
          Number(totalesPagar.saldo_pendiente || 0).toLocaleString("es-CL"),
          "",
        ],
      ],
      margin: { left: margenX, right: margenX },
      styles: {
        fontSize: 6.4,
        cellPadding: 1.1,
      },
      columnStyles: {
        0: { cellWidth: 21 },
        1: { cellWidth: 24 },
        2: { cellWidth: 17 },
        3: { cellWidth: 26 },
        4: { cellWidth: 82 },
        5: { cellWidth: 27, halign: "right" },
        6: { cellWidth: 27, halign: "right" },
        7: { cellWidth: 27, halign: "right" },
        8: { cellWidth: 13, halign: "right" },
      },
      didParseCell(data) {
        marcarFilaTotalPDF(data, data.row.raw?.[0] === "TOTAL");
      },
    });

    piePaginasPDFClasico(doc, {
      texto: "Cuentas por Cobrar y por Pagar",
      margenX,
    });
    doc.save(`Cuentas_Pendientes_${fechaDesde}_${fechaHasta}.pdf`);
  }

  function irAPagoCobro(item, tipo) {
    localStorage.setItem(
      "documentoPagoCobro",
      JSON.stringify({
        tipo,
        documento_id: item.documento_id,
        tipo_documento: item.tipo_documento,
        folio: item.folio,
        rut_tercero: item.rut_tercero,
        nombre_tercero: item.nombre_tercero,
        saldo_pendiente: item.saldo_pendiente,
      })
    );

    if (irVista) {
      irVista("pagosCobros");
    }
  }

  async function deshacerMovimiento(item) {
    if (item.estado !== "vigente") return;

    const confirmar = window.confirm(
      item.contabilizado
        ? "Este movimiento esta contabilizado. Se anulara el asiento asociado. Deseas continuar?"
        : "Deseas deshacer este movimiento?"
    );

    if (!confirmar) return;

    try {
      setError("");
      setMensaje("");

      const data = await anularPagoCobro(item.id, empresaActiva.id);
      setMensaje(data.mensaje || "Movimiento deshecho correctamente.");
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!empresaActiva) {
    return (
      <div>
        <h1 style={titulo}>Cuentas por Cobrar y Pagar</h1>
        <div style={alerta}>
          Debes seleccionar una empresa activa antes de ver cuentas pendientes.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={titulo}>Cuentas por Cobrar y Cuentas por Pagar</h1>

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

        <button type="button" style={botonExcel} onClick={exportarExcel}>
          Exportar Excel
        </button>

        <button type="button" style={botonPDF} onClick={exportarPDF}>
          Exportar PDF
        </button>
      </div>

      <div style={gridResumen}>
        <div style={cardCobrar}>
          <strong>Cuentas por cobrar</strong>
          <span>{formato(totalesCobrar.saldo_pendiente)}</span>
          <small>{porCobrar.length} documentos pendientes</small>
        </div>

        <div style={cardPagar}>
          <strong>Cuentas por pagar</strong>
          <span>{formato(totalesPagar.saldo_pendiente)}</span>
          <small>{porPagar.length} documentos pendientes</small>
        </div>

        <div style={card}>
          <strong>Compras por pagar</strong>
          <span>{formato(totalesPagar.saldo_compras)}</span>
        </div>

        <div style={card}>
          <strong>Honorarios por pagar</strong>
          <span>{formato(totalesPagar.saldo_honorarios)}</span>
        </div>
      </div>

      <div style={seccionBox}>
        <h2 style={tituloSeccion}>Cuentas por Cobrar</h2>

        <TablaPendientes
          documentos={porCobrar}
          tipo="Cobro"
          formato={formato}
          fechaCL={fechaCL}
          porcentajePagado={porcentajePagado}
          botonTexto="Registrar cobro"
          onAccion={irAPagoCobro}
        />
      </div>

      <div style={seccionBox}>
        <h2 style={tituloSeccion}>Cuentas por Pagar</h2>

        <TablaPendientes
          documentos={porPagar}
          tipo="Pago"
          formato={formato}
          fechaCL={fechaCL}
          porcentajePagado={porcentajePagado}
          botonTexto="Registrar pago"
          onAccion={irAPagoCobro}
        />
      </div>

      <div style={seccionBox}>
        <h2 style={tituloSeccion}>Cobros y pagos registrados</h2>

        <TablaMovimientos
          movimientos={movimientos}
          fechaCL={fechaCL}
          formato={formato}
          onDeshacer={deshacerMovimiento}
        />
      </div>
    </div>
  );
}

function TablaPendientes({
  documentos,
  tipo,
  formato,
  fechaCL,
  porcentajePagado,
  botonTexto,
  onAccion,
}) {
  return (
    <div style={tablaBox}>
      <table style={tabla}>
        <thead>
          <tr>
            <th style={th}>Fecha</th>
            <th style={th}>Tipo</th>
            <th style={th}>Documento</th>
            <th style={th}>Folio</th>
            <th style={th}>RUT</th>
            <th style={th}>Tercero</th>
            <th style={thNumero}>Total</th>
            <th style={thNumero}>{tipo === "Cobro" ? "Cobrado" : "Pagado"}</th>
            <th style={thNumero}>Saldo</th>
            <th style={thNumero}>%</th>
            <th style={thAccion}>Accion</th>
          </tr>
        </thead>

        <tbody>
          {documentos.map((item) => (
            <tr key={`${item.tipo_documento}-${item.documento_id}`}>
              <td style={td}>{fechaCL(item.fecha)}</td>
              <td style={td}>{item.tipo_documento}</td>
              <td style={td}>{item.documento_origen}</td>
              <td style={td}>{item.folio}</td>
              <td style={td}>{item.rut_tercero}</td>
              <td style={td}>{item.nombre_tercero}</td>
              <td style={tdNumero}>{formato(item.total_documento)}</td>
              <td style={tdNumero}>{formato(item.total_pagado)}</td>
              <td style={tdNumero}>{formato(item.saldo_pendiente)}</td>
              <td style={tdNumero}>{porcentajePagado(item)}%</td>
              <td style={tdAccion}>
                <button
                  type="button"
                  style={tipo === "Cobro" ? botonCobrar : botonPagar}
                  onClick={() => onAccion(item, tipo)}
                  title={botonTexto}
                  aria-label={botonTexto}
                >
                  {tipo === "Cobro" ? "$" : "\u279C"}
                </button>
              </td>
            </tr>
          ))}

          {documentos.length === 0 && (
            <tr>
              <td style={td} colSpan="11">
                No hay documentos pendientes.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TablaMovimientos({ movimientos, fechaCL, formato, onDeshacer }) {
  return (
    <div style={tablaBox}>
      <table style={tabla}>
        <thead>
          <tr>
            <th style={th}>Fecha</th>
            <th style={th}>Tipo</th>
            <th style={th}>Documento</th>
            <th style={th}>Folio</th>
            <th style={th}>Tercero</th>
            <th style={thNumero}>Monto</th>
            <th style={th}>Estado</th>
            <th style={th}>Comprobante</th>
            <th style={thAccion}>Accion</th>
          </tr>
        </thead>

        <tbody>
          {movimientos.map((item) => (
            <tr key={item.id}>
              <td style={td}>{fechaCL(item.fecha)}</td>
              <td style={td}>{item.tipo_movimiento}</td>
              <td style={td}>{item.tipo_documento}</td>
              <td style={td}>{item.folio || ""}</td>
              <td style={td}>{item.nombre_tercero || ""}</td>
              <td style={tdNumero}>{formato(item.monto)}</td>
              <td style={td}>
                {item.estado === "vigente" ? (
                  <span style={badgeOk}>Vigente</span>
                ) : (
                  <span style={badgeAnulado}>Anulado</span>
                )}
              </td>
              <td style={td}>
                {item.comprobante_id
                  ? `Comp. #${item.comprobante_numero || item.comprobante_id}`
                  : "-"}
              </td>
              <td style={tdAccion}>
                {item.estado === "vigente" ? (
                  <button
                    type="button"
                    style={botonDeshacer}
                    onClick={() => onDeshacer(item)}
                    title="Deshacer movimiento"
                    aria-label="Deshacer movimiento"
                  >
                    {"\u21BA"}
                  </button>
                ) : (
                  <span style={textoSuave}>Sin accion</span>
                )}
              </td>
            </tr>
          ))}

          {movimientos.length === 0 && (
            <tr>
              <td style={td} colSpan="9">
                No hay cobros o pagos registrados en este rango.
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
  color: "#0f172a",
  marginBottom: "5px",
};

const subtitulo = {
  color: "#475569",
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
  color: "#1e293b",
  marginBottom: "5px",
};

const input = {
  padding: "10px",
  border: "1px solid #a9d8ef",
  borderRadius: "10px",
  minWidth: "170px",
  height: "40px",
  boxSizing: "border-box",
};

const botonBuscar = {
  background: "#0369a1",
  color: "white",
  border: "none",
  padding: "10px 20px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const botonExcel = {
  background: "#10b981",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const botonPDF = {
  background: "#ef4444",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const gridResumen = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
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
  color: "#1e293b",
};

const cardCobrar = {
  ...card,
  border: "1px solid #22c55e",
};

const cardPagar = {
  ...card,
  border: "1px solid #ef4444",
};

const seccionBox = {
  background: "white",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "22px",
};

const tituloSeccion = {
  color: "#0369a1",
  marginTop: 0,
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
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  color: "#0369a1",
  whiteSpace: "nowrap",
};

const thNumero = {
  ...th,
  textAlign: "right",
};

const thAccion = {
  ...th,
  textAlign: "center",
};

const td = {
  padding: "9px",
  borderBottom: "1px solid #e2e8f0",
  color: "#1e293b",
  verticalAlign: "top",
};

const tdNumero = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const tdAccion = {
  ...td,
  textAlign: "center",
  whiteSpace: "nowrap",
};

const botonAccionBase = {
  color: "white",
  border: "none",
  width: "32px",
  height: "32px",
  padding: 0,
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
  fontSize: "15px",
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const botonCobrar = {
  ...botonAccionBase,
  background: "linear-gradient(135deg, #10b981, #06b6d4)",
};

const botonPagar = {
  ...botonAccionBase,
  background: "linear-gradient(135deg, #0369a1, #06b6d4)",
};

const botonDeshacer = {
  ...botonAccionBase,
  background: "linear-gradient(135deg, #ef4444, #f97316)",
};

const textoSuave = {
  color: "#475569",
  fontSize: "12px",
  fontWeight: "bold",
};

const badgeOk = {
  background: "#dcfce7",
  color: "#166534",
  padding: "5px 8px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "12px",
};

const badgeAnulado = {
  background: "#fee2e2",
  color: "#991b1b",
  padding: "5px 8px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "12px",
};

const ok = {
  color: "#10b981",
  fontWeight: "bold",
};

const err = {
  color: "#ef4444",
  fontWeight: "bold",
};

const alerta = {
  marginTop: "25px",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  padding: "16px",
  borderRadius: "14px",
  fontWeight: "bold",
};
