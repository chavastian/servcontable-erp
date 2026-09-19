import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerBalance8Columnas } from "../services/balance8Service";
import * as XLSX from "xlsx";
import { obtenerRangoAnualTrabajo } from "../services/periodoTrabajoService";
import { EstadoCargando } from "../components/EstadoPantalla";
import {
  DOCUMENT_THEME,
  crearPDFClasico,
  encabezadoPDFClasico,
  marcarFilaTotalPDF,
  paginaPDF,
  piePaginasPDFClasico,
  tablaPDFClasica,
} from "../utils/documentTheme";

export default function Balance8Columnas() {
  const empresaActiva = obtenerEmpresaActiva();
  const rangoInicial = obtenerRangoAnualTrabajo();

  const [fechaDesde, setFechaDesde] = useState(rangoInicial.fechaDesde);
  const [fechaHasta, setFechaHasta] = useState(rangoInicial.fechaHasta);
  const [soloMovimientos, setSoloMovimientos] = useState(false);
  const [filas, setFilas] = useState([]);
  const [totales, setTotales] = useState({
    debitos: 0,
    creditos: 0,
    saldo_deudor: 0,
    saldo_acreedor: 0,
    activo: 0,
    pasivo: 0,
    perdidas: 0,
    ganancias: 0,
  });
  const [resultadoEjercicio, setResultadoEjercicio] = useState(0);
  const [totalActivoFinal, setTotalActivoFinal] = useState(0);
  const [totalPasivoFinal, setTotalPasivoFinal] = useState(0);
  const [cuadratura, setCuadratura] = useState(0);
  const [error, setError] = useState("");
  // Distingue "esperando" de "no hay datos": sin esto la tabla en blanco
  // significa las dos cosas a la vez.
  const [cargando, setCargando] = useState(false);

  function formatoMonto(valor) {
    return Number(valor || 0).toLocaleString("es-CL");
  }

  function obtenerCampo(fila, opciones) {
    for (const campo of opciones) {
      if (fila[campo] !== undefined && fila[campo] !== null) {
        return fila[campo];
      }
    }
    return "";
  }

  function obtenerNumero(fila, opciones) {
    const valor = obtenerCampo(fila, opciones);
    return Number(valor || 0);
  }

  function obtenerCodigoCuenta(fila) {
    return (
      fila.codigo ||
      fila.codigo_cuenta ||
      fila.cuenta_codigo ||
      fila.cod_cuenta ||
      ""
    );
  }

  function obtenerNombreCuenta(fila) {
    return (
      fila.nombre ||
      fila.nombre_cuenta ||
      fila.cuenta_nombre ||
      fila.descripcion ||
      ""
    );
  }

  useEffect(() => {
    if (empresaActiva) {
      cargarBalance();
    }
  }, []);

  async function cargarBalance() {
    try {
      setCargando(true);
      setError("");

      const data = await obtenerBalance8Columnas(
        empresaActiva.id,
        fechaDesde,
        fechaHasta,
        soloMovimientos
      );

      setFilas(data.filas);
      setTotales(data.totales);
      setResultadoEjercicio(Number(data.resultado_ejercicio || 0));
      setTotalActivoFinal(Number(data.total_activo_final || 0));
      setTotalPasivoFinal(Number(data.total_pasivo_final || 0));
      setCuadratura(Number(data.cuadratura || 0));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  function exportarBalanceExcel() {
    const filasExcel = [];

    filasExcel.push(["BALANCE GENERAL"]);
    filasExcel.push([`Empresa: ${empresaActiva?.razon_social || ""}`]);
    filasExcel.push([`RUT: ${empresaActiva?.rut || ""}`]);
    filasExcel.push([`Desde: ${fechaDesde} Hasta: ${fechaHasta}`]);
    filasExcel.push([]);

    filasExcel.push([
      "Codigo",
      "Nombre de la Cuenta",
      "Debitos",
      "Creditos",
      "Saldo Deudor",
      "Saldo Acreedor",
      "Activo",
      "Pasivo",
      "Perdida",
      "Ganancia",
    ]);

    let totalDebitos = 0;
    let totalCreditos = 0;
    let totalSaldoDeudor = 0;
    let totalSaldoAcreedor = 0;
    let totalActivo = 0;
    let totalPasivo = 0;
    let totalPerdida = 0;
    let totalGanancia = 0;

    filas.forEach((fila) => {
      const debitos = obtenerNumero(fila, ["debitos", "debe", "total_debe"]);
      const creditos = obtenerNumero(fila, ["creditos", "haber", "total_haber"]);
      const saldoDeudor = obtenerNumero(fila, ["saldo_deudor", "deudor"]);
      const saldoAcreedor = obtenerNumero(fila, ["saldo_acreedor", "acreedor"]);
      const activo = obtenerNumero(fila, ["activo"]);
      const pasivo = obtenerNumero(fila, ["pasivo"]);
      const perdida = obtenerNumero(fila, ["perdida", "perdidas", "perdida"]);
      const ganancia = obtenerNumero(fila, ["ganancia", "ganancias"]);

      totalDebitos += debitos;
      totalCreditos += creditos;
      totalSaldoDeudor += saldoDeudor;
      totalSaldoAcreedor += saldoAcreedor;
      totalActivo += activo;
      totalPasivo += pasivo;
      totalPerdida += perdida;
      totalGanancia += ganancia;

      filasExcel.push([
        obtenerCodigoCuenta(fila),
        obtenerNombreCuenta(fila),
        debitos,
        creditos,
        saldoDeudor,
        saldoAcreedor,
        activo,
        pasivo,
        perdida,
        ganancia,
      ]);
    });

    const utilidad =
      totalGanancia > totalPerdida ? totalGanancia - totalPerdida : 0;
    const perdidaEjercicio =
      totalPerdida > totalGanancia ? totalPerdida - totalGanancia : 0;

    filasExcel.push([]);
    filasExcel.push([
      "Subtotales",
      "",
      totalDebitos,
      totalCreditos,
      totalSaldoDeudor,
      totalSaldoAcreedor,
      totalActivo,
      totalPasivo,
      totalPerdida,
      totalGanancia,
    ]);

    filasExcel.push([
      utilidad > 0 ? "Utilidad" : "Perdida",
      "",
      "",
      "",
      "",
      "",
      utilidad > 0 ? 0 : perdidaEjercicio,
      utilidad > 0 ? utilidad : 0,
      utilidad > 0 ? utilidad : 0,
      utilidad > 0 ? 0 : perdidaEjercicio,
    ]);

    filasExcel.push([
      "Totales",
      "",
      totalDebitos,
      totalCreditos,
      totalSaldoDeudor,
      totalSaldoAcreedor,
      totalActivo + (utilidad > 0 ? 0 : perdidaEjercicio),
      totalPasivo + (utilidad > 0 ? utilidad : 0),
      totalPerdida + (utilidad > 0 ? utilidad : 0),
      totalGanancia + (utilidad > 0 ? 0 : perdidaEjercicio),
    ]);

    const ws = XLSX.utils.aoa_to_sheet(filasExcel);

    ws["!cols"] = [
      { wch: 14 },
      { wch: 34 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Balance General");
    XLSX.writeFile(wb, `Balance_General_${fechaDesde}_${fechaHasta}.xlsx`);
  }

  function exportarBalancePDF() {
    const doc = crearPDFClasico({ orientation: "l", format: "a4" });
    const margenX = 8;
    const { ancho: anchoPagina, alto: altoPagina } = paginaPDF(doc);
    const yInicio = encabezadoPDFClasico(doc, {
      titulo: "Balance General",
      empresa: empresaActiva?.razon_social,
      rut: empresaActiva?.rut,
      fechaDesde,
      fechaHasta,
      margenX,
    });

    let totalDebitos = 0;
    let totalCreditos = 0;
    let totalSaldoDeudor = 0;
    let totalSaldoAcreedor = 0;
    let totalActivo = 0;
    let totalPasivo = 0;
    let totalPerdida = 0;
    let totalGanancia = 0;

    const body = filas.map((fila) => {
      const debitos = obtenerNumero(fila, ["debitos", "debe", "total_debe"]);
      const creditos = obtenerNumero(fila, ["creditos", "haber", "total_haber"]);
      const saldoDeudor = obtenerNumero(fila, ["saldo_deudor", "deudor"]);
      const saldoAcreedor = obtenerNumero(fila, ["saldo_acreedor", "acreedor"]);
      const activo = obtenerNumero(fila, ["activo"]);
      const pasivo = obtenerNumero(fila, ["pasivo"]);
      const perdida = obtenerNumero(fila, ["perdida", "perdidas", "pérdida", "perdida"]);
      const ganancia = obtenerNumero(fila, ["ganancia", "ganancias"]);

      totalDebitos += debitos;
      totalCreditos += creditos;
      totalSaldoDeudor += saldoDeudor;
      totalSaldoAcreedor += saldoAcreedor;
      totalActivo += activo;
      totalPasivo += pasivo;
      totalPerdida += perdida;
      totalGanancia += ganancia;

      return [
        obtenerCodigoCuenta(fila),
        obtenerNombreCuenta(fila),
        formatoMonto(debitos),
        formatoMonto(creditos),
        formatoMonto(saldoDeudor),
        formatoMonto(saldoAcreedor),
        formatoMonto(activo),
        formatoMonto(pasivo),
        formatoMonto(perdida),
        formatoMonto(ganancia),
      ];
    });

    const utilidad = totalGanancia > totalPerdida ? totalGanancia - totalPerdida : 0;
    const perdidaEjercicio = totalPerdida > totalGanancia ? totalPerdida - totalGanancia : 0;

    body.push([
      "Subtotales",
      "",
      formatoMonto(totalDebitos),
      formatoMonto(totalCreditos),
      formatoMonto(totalSaldoDeudor),
      formatoMonto(totalSaldoAcreedor),
      formatoMonto(totalActivo),
      formatoMonto(totalPasivo),
      formatoMonto(totalPerdida),
      formatoMonto(totalGanancia),
    ]);

    body.push([
      utilidad > 0 ? "Utilidad" : "Pérdida",
      "",
      "",
      "",
      "",
      "",
      utilidad > 0 ? "0" : formatoMonto(perdidaEjercicio),
      utilidad > 0 ? formatoMonto(utilidad) : "0",
      utilidad > 0 ? formatoMonto(utilidad) : "0",
      utilidad > 0 ? "0" : formatoMonto(perdidaEjercicio),
    ]);

    body.push([
      "Totales",
      "",
      formatoMonto(totalDebitos),
      formatoMonto(totalCreditos),
      formatoMonto(totalSaldoDeudor),
      formatoMonto(totalSaldoAcreedor),
      formatoMonto(totalActivo + (utilidad > 0 ? 0 : perdidaEjercicio)),
      formatoMonto(totalPasivo + (utilidad > 0 ? utilidad : 0)),
      formatoMonto(totalPerdida + (utilidad > 0 ? utilidad : 0)),
      formatoMonto(totalGanancia + (utilidad > 0 ? 0 : perdidaEjercicio)),
    ]);

    tablaPDFClasica(doc, {
      startY: yInicio,
      head: [
        [
          "Código",
          "Nombre de la Cuenta",
          "Débitos",
          "Créditos",
          "Deudor",
          "Acreedor",
          "Activo",
          "Pasivo",
          "Pérdida",
          "Ganancia",
        ],
      ],
      body,
      theme: "grid",
      margin: { left: margenX, right: margenX },
      styles: {
        fontSize: 5.8,
        cellPadding: 0.95,
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 55 },
        2: { cellWidth: 25, halign: "right" },
        3: { cellWidth: 25, halign: "right" },
        4: { cellWidth: 25, halign: "right" },
        5: { cellWidth: 25, halign: "right" },
        6: { cellWidth: 25, halign: "right" },
        7: { cellWidth: 25, halign: "right" },
        8: { cellWidth: 25, halign: "right" },
        9: { cellWidth: 25, halign: "right" },
      },
      didParseCell(data) {
        const texto = data.row.raw?.[0];
        marcarFilaTotalPDF(
          data,
          ["Subtotales", "Totales", "Utilidad", "Pérdida"].includes(texto)
        );
      },
    });

    let yFinal = doc.lastAutoTable.finalY + 16;

    if (yFinal > altoPagina - 44) {
      doc.addPage();
      yFinal = 58;
    }

    const xFirmaContador = 58;
    const xFirmaLegal = anchoPagina - 58;
    const largoLinea = 48;

    doc.setDrawColor(...DOCUMENT_THEME.color.black);
    doc.setLineWidth(DOCUMENT_THEME.line.normal);
    doc.line(
      xFirmaContador - largoLinea / 2,
      yFinal,
      xFirmaContador + largoLinea / 2,
      yFinal
    );
    doc.line(
      xFirmaLegal - largoLinea / 2,
      yFinal,
      xFirmaLegal + largoLinea / 2,
      yFinal
    );

    doc.setFont(DOCUMENT_THEME.font, "bold");
    doc.setFontSize(DOCUMENT_THEME.size.text);
    doc.setTextColor(...DOCUMENT_THEME.color.black);
    doc.text("Firma del Contador", xFirmaContador, yFinal + 7, { align: "center" });
    doc.text("Firma del Representante Legal", xFirmaLegal, yFinal + 7, {
      align: "center",
    });

    const textoLegal =
      "Se deja constancia de que la contabilidad ha sido confeccionada con los antecedentes y documentos fidedignos que han sido proporcionados por el contribuyente. (Artículo 100 del Código Tributario)";
    doc.setFont(DOCUMENT_THEME.font, "normal");
    doc.setFontSize(DOCUMENT_THEME.size.note);
    doc.text(textoLegal, anchoPagina / 2, yFinal + 20, {
      align: "center",
      maxWidth: anchoPagina - 24,
    });

    piePaginasPDFClasico(doc, { texto: "Balance General", margenX });
    doc.save(`Balance_General_${fechaDesde}_${fechaHasta}.pdf`);
  }

  if (!empresaActiva) {
    return (
      <div>
        <h1 style={titulo}>Balance 8 columnas</h1>
        <div style={alerta}>
          Debes seleccionar una empresa activa antes de ver el balance.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={titulo}>Balance 8 columnas</h1>
      <p style={subtitulo}>
        Empresa activa: <strong>{empresaActiva.razon_social}</strong>
      </p>

      <div style={filtrosAcciones}>
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

        <div>
          <label style={label}>Mostrar cuentas</label>
          <select
            style={input}
            value={soloMovimientos ? "movimientos" : "todas"}
            onChange={(e) => setSoloMovimientos(e.target.value === "movimientos")}
          >
            <option value="todas">Todas las cuentas</option>
            <option value="movimientos">Solo con movimientos</option>
          </select>
        </div>

        <button type="button" style={botonExcel} onClick={exportarBalanceExcel}>
          Exportar Excel
        </button>

        <button type="button" style={botonPDF} onClick={exportarBalancePDF}>
          Exportar PDF
        </button>

        <button type="button" style={botonBuscar} onClick={cargarBalance}>
          Buscar
        </button>
      </div>

      {error && <p style={err}>{error}</p>}


      {cargando && <EstadoCargando mensaje="Cargando datos..." />}

      <div style={resumenBox}>
        <div style={cardResumen}>
          <strong>Total Activo Final</strong>
          <span>{formato(totalActivoFinal)}</span>
        </div>

        <div style={cardResumen}>
          <strong>Total Pasivo + Patrimonio Final</strong>
          <span>{formato(totalPasivoFinal)}</span>
        </div>

        <div style={cuadratura === 0 ? cardResumenOk : cardResumenError}>
          <strong>Cuadratura</strong>
          <span>{formato(cuadratura)}</span>
        </div>

        <div style={resultadoEjercicio >= 0 ? cardResumenOk : cardResumenError}>
          <strong>Resultado ejercicio</strong>
          <span>{formato(resultadoEjercicio)}</span>
        </div>
      </div>

      <div style={tablaBox}>
        <h2 style={tituloSeccion}>Detalle del balance</h2>

        <table style={tabla}>
          <thead>
            <tr>
              <th style={th}>Código</th>
              <th style={th}>Cuenta</th>
              <th style={th}>Tipo</th>
              <th style={th}>Débitos</th>
              <th style={th}>Créditos</th>
              <th style={th}>Saldo Deudor</th>
              <th style={th}>Saldo Acreedor</th>
              <th style={th}>Activo</th>
              <th style={th}>Pasivo</th>
              <th style={th}>Perdidas</th>
              <th style={th}>Ganancias</th>
            </tr>
          </thead>

          <tbody>
            {filas.map((fila) => (
              <tr key={fila.cuenta_id}>
                <td style={td}>{fila.codigo}</td>
                <td style={td}>{fila.nombre}</td>
                <td style={td}>{fila.tipo}</td>
                <td style={tdNumero}>{formato(fila.debitos)}</td>
                <td style={tdNumero}>{formato(fila.creditos)}</td>
                <td style={tdNumero}>{formato(fila.saldo_deudor)}</td>
                <td style={tdNumero}>{formato(fila.saldo_acreedor)}</td>
                <td style={tdNumero}>{formato(fila.activo)}</td>
                <td style={tdNumero}>{formato(fila.pasivo)}</td>
                <td style={tdNumero}>{formato(fila.perdidas)}</td>
                <td style={tdNumero}>{formato(fila.ganancias)}</td>
              </tr>
            ))}

            {filas.length === 0 && (
              <tr>
                <td style={td} colSpan="11">
                  No hay movimientos para este período.
                </td>
              </tr>
            )}

            <tr>
              <td style={tdTotal} colSpan="3">
                TOTALES
              </td>
              <td style={tdTotalNumero}>{formato(totales.debitos)}</td>
              <td style={tdTotalNumero}>{formato(totales.creditos)}</td>
              <td style={tdTotalNumero}>{formato(totales.saldo_deudor)}</td>
              <td style={tdTotalNumero}>{formato(totales.saldo_acreedor)}</td>
              <td style={tdTotalNumero}>{formato(totales.activo)}</td>
              <td style={tdTotalNumero}>{formato(totales.pasivo)}</td>
              <td style={tdTotalNumero}>{formato(totales.perdidas)}</td>
              <td style={tdTotalNumero}>{formato(totales.ganancias)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={resultadoBox}>
        {resultadoEjercicio > 0 && (
          <p>
            <strong>Utilidad del ejercicio:</strong> {formato(resultadoEjercicio)}.
            Se suma al Pasivo/Patrimonio para cuadrar el balance.
          </p>
        )}

        {resultadoEjercicio < 0 && (
          <p>
            <strong>Perdida del ejercicio:</strong>{" "}
            {formato(Math.abs(resultadoEjercicio))}. Se suma al Activo para
            cuadrar el balance.
          </p>
        )}

        {resultadoEjercicio === 0 && (
          <p>
            <strong>Resultado del ejercicio:</strong> Sin utilidad ni perdida.
          </p>
        )}

        <p>
          <strong>Total Activo Final:</strong> {formato(totalActivoFinal)}
        </p>

        <p>
          <strong>Total Pasivo + Patrimonio Final:</strong>{" "}
          {formato(totalPasivoFinal)}
        </p>
      </div>
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

const label = {
  display: "block",
  fontWeight: "bold",
  color: "#1e293b",
  marginBottom: "5px",
};

const input = {
  padding: "10px",
  border: "1px solid #a9d8ef",
  borderRadius: "9px",
  minWidth: "170px",
  height: "40px",
  boxSizing: "border-box",
};

const botonBuscar = {
  background: "#0369a1",
  color: "white",
  border: "none",
  padding: "12px 20px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const resumenBox = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "15px",
  marginBottom: "20px",
};

const cardResumen = {
  background: "white",
  borderRadius: "16px",
  padding: "18px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  color: "#1e293b",
};

const cardResumenOk = {
  ...cardResumen,
  border: "2px solid #22c55e",
};

const cardResumenError = {
  ...cardResumen,
  border: "2px solid #ef4444",
};

const tablaBox = {
  background: "white",
  borderRadius: "18px",
  padding: "25px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  overflowX: "auto",
};

const tituloSeccion = {
  color: "#0369a1",
  marginTop: 0,
};

const tabla = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "1200px",
};

const th = {
  textAlign: "left",
  padding: "12px",
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  color: "#0369a1",
};

const td = {
  padding: "10px",
  borderBottom: "1px solid #e2e8f0",
  color: "#1e293b",
};

const tdNumero = {
  ...td,
  textAlign: "right",
};

const tdTotal = {
  ...td,
  fontWeight: "bold",
  background: "#f8fcff",
};

const tdTotalNumero = {
  ...tdNumero,
  fontWeight: "bold",
  background: "#f8fcff",
};

const resultadoBox = {
  marginTop: "20px",
  background: "#f8fcff",
  border: "1px solid #e2e8f0",
  borderRadius: "16px",
  padding: "18px",
  color: "#1e293b",
};

const err = {
  color: "#ef4444",
  fontWeight: "bold",
};

const alerta = {
  marginTop: "20px",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  padding: "16px",
  borderRadius: "14px",
  fontWeight: "bold",
};

const botonExcel = {
  background: "#10b981",
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const botonPDF = {
  background: "#ef4444",
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const filtrosAcciones = {
  display: "flex",
  alignItems: "end",
  gap: "10px",
  flexWrap: "wrap",
  marginBottom: "18px",
};
