import { useEffect, useMemo, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerEstadoResultados } from "../services/estadoResultadosService";
import * as XLSX from "xlsx";
import { obtenerRangoAnualTrabajo } from "../services/periodoTrabajoService";
import { EstadoCargando } from "../components/EstadoPantalla";
import {
  crearPDFClasico,
  encabezadoPDFClasico,
  marcarFilaTotalPDF,
  piePaginasPDFClasico,
  tablaPDFClasica,
} from "../utils/documentTheme";

const CATEGORIAS_VACIAS = {
  ingresos_operacionales: [],
  otros_ingresos_sin_clasificar: [],
  costos_operacionales: [],
  gastos_administracion_ventas: [],
  depreciacion: [],
  gastos_financieros: [],
  ingresos_no_operacionales: [],
  gastos_no_operacionales: [],
  impuesto_renta: [],
  otros_gastos_sin_clasificar: [],
};

const RESUMEN_VACIO = {
  ingresos_operacionales: 0,
  otros_ingresos_sin_clasificar: 0,
  costos_operacionales: 0,
  margen_bruto: 0,
  gastos_administracion_ventas: 0,
  depreciacion: 0,
  gastos_financieros: 0,
  resultado_operacional: 0,
  ingresos_no_operacionales: 0,
  gastos_no_operacionales: 0,
  resultado_antes_impuestos: 0,
  impuesto_renta: 0,
  otros_gastos_sin_clasificar: 0,
  resultado_ejercicio: 0,
};

const DEFINICION_FILAS = [
  {
    clave: "ingresos_operacionales",
    etiqueta: "Ingresos Operacionales",
    naturaleza: "ingreso",
    detalle: true,
  },
  {
    clave: "otros_ingresos_sin_clasificar",
    etiqueta: "Otros Ingresos Sin Clasificar",
    naturaleza: "ingreso",
    detalle: true,
  },
  {
    clave: "costos_operacionales",
    etiqueta: "Costos Operacionales",
    naturaleza: "egreso",
    detalle: true,
  },
  {
    clave: "margen_bruto",
    etiqueta: "Margen Bruto",
    naturaleza: "resultado",
    negrita: true,
  },
  {
    clave: "gastos_administracion_ventas",
    etiqueta: "Gastos Administración y Ventas",
    naturaleza: "egreso",
    detalle: true,
  },
  {
    clave: "depreciacion",
    etiqueta: "Depreciación",
    naturaleza: "egreso",
    detalle: true,
  },
  {
    clave: "gastos_financieros",
    etiqueta: "Gastos Financieros",
    naturaleza: "egreso",
    detalle: true,
  },
  {
    clave: "resultado_operacional",
    etiqueta: "Resultado Operacional",
    naturaleza: "resultado",
    negrita: true,
  },
  {
    clave: "ingresos_no_operacionales",
    etiqueta: "Ingresos No Operacionales",
    naturaleza: "ingreso",
    detalle: true,
  },
  {
    clave: "gastos_no_operacionales",
    etiqueta: "Gastos No Operacionales",
    naturaleza: "egreso",
    detalle: true,
  },
  {
    clave: "resultado_antes_impuestos",
    etiqueta: "Resultado Antes de Impuestos",
    naturaleza: "resultado",
    negrita: true,
  },
  {
    clave: "impuesto_renta",
    etiqueta: "Impuesto a la Renta",
    naturaleza: "egreso",
    detalle: true,
  },
  {
    clave: "otros_gastos_sin_clasificar",
    etiqueta: "Otros Gastos Sin Clasificar",
    naturaleza: "egreso",
    detalle: true,
  },
  {
    clave: "resultado_ejercicio",
    etiqueta: "Resultado del Ejercicio",
    naturaleza: "resultado",
    negrita: true,
    final: true,
  },
];

function ordenarPorCodigo(lista) {
  return [...(Array.isArray(lista) ? lista : [])].sort((a, b) =>
    String(a.codigo || "").localeCompare(String(b.codigo || ""), "es")
  );
}

function construirFilasEstado(categorias, resumen) {
  const filas = [];

  DEFINICION_FILAS.forEach((def) => {
    filas.push({
      tipo: "resumen",
      etiqueta: def.etiqueta,
      monto: Number(resumen?.[def.clave] || 0),
      naturaleza: def.naturaleza,
      negrita: Boolean(def.negrita),
      final: Boolean(def.final),
    });

    if (!def.detalle) {
      return;
    }

    const cuentas = ordenarPorCodigo(categorias?.[def.clave]);

    cuentas.forEach((item) => {
      filas.push({
        tipo: "detalle",
        etiqueta: `${item.codigo || ""} - ${item.nombre || ""}`.replace(
          /^\s*-\s*/,
          ""
        ),
        monto: Number(item.monto || 0),
        naturaleza: def.naturaleza,
        negrita: false,
        final: false,
      });
    });
  });

  return filas;
}

export default function EstadoResultados() {
  const empresaActiva = obtenerEmpresaActiva();
  const rangoInicial = obtenerRangoAnualTrabajo();

  const [fechaDesde, setFechaDesde] = useState(rangoInicial.fechaDesde);
  const [fechaHasta, setFechaHasta] = useState(rangoInicial.fechaHasta);
  const [modoCuentas, setModoCuentas] = useState("movimiento");
  const [categorias, setCategorias] = useState(CATEGORIAS_VACIAS);
  const [resumenEstructura, setResumenEstructura] = useState(RESUMEN_VACIO);
  const [totales, setTotales] = useState({
    total_ingresos: 0,
    total_costos: 0,
    margen_bruto: 0,
    total_gastos: 0,
    total_impuestos: 0,
    resultado_ejercicio: 0,
  });
  const [error, setError] = useState("");
  // Distingue "esperando" de "no hay datos": sin esto la tabla en blanco
  // significa las dos cosas a la vez.
  const [cargando, setCargando] = useState(false);

  const filasEstado = useMemo(
    () => construirFilasEstado(categorias, resumenEstructura),
    [categorias, resumenEstructura]
  );

  useEffect(() => {
    if (empresaActiva) {
      cargarEstadoResultados();
    }
  }, []);

  async function cargarEstadoResultados() {
    try {
      setCargando(true);
      setError("");

      const data = await obtenerEstadoResultados(
        empresaActiva.id,
        fechaDesde,
        fechaHasta,
        modoCuentas === "todas"
      );

      setCategorias(data.categorias || CATEGORIAS_VACIAS);
      setResumenEstructura(data.resumen_estructura || RESUMEN_VACIO);
      setTotales(data.totales || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  function formatoAbsoluto(valor) {
    return `$${Math.abs(Number(valor || 0)).toLocaleString("es-CL")}`;
  }

  function formatoMontoEstado(valor, naturaleza) {
    const numero = Number(valor || 0);
    const absoluto = Math.abs(numero).toLocaleString("es-CL");

    if (naturaleza === "egreso") {
      if (numero === 0) return "(0)";
      if (numero > 0) return `(${absoluto})`;
      return numero.toLocaleString("es-CL");
    }

    if (naturaleza === "resultado") {
      return numero.toLocaleString("es-CL");
    }

    return absoluto;
  }

  function exportarEstadoResultadosExcel() {
    const filasExcel = [];

    filasExcel.push(["ESTADO DE RESULTADOS"]);
    filasExcel.push([`Empresa: ${empresaActiva?.razon_social || ""}`]);
    filasExcel.push([`RUT: ${empresaActiva?.rut || ""}`]);
    filasExcel.push([`Desde: ${fechaDesde}`]);
    filasExcel.push([`Hasta: ${fechaHasta}`]);
    filasExcel.push([
      `Cuentas: ${
        modoCuentas === "todas"
          ? "Todas las cuentas"
          : "Solo cuentas con movimiento"
      }`,
    ]);
    filasExcel.push([]);
    filasExcel.push(["Concepto", "Monto"]);

    filasEstado.forEach((fila) => {
      const etiqueta = fila.tipo === "detalle" ? `   ${fila.etiqueta}` : fila.etiqueta;
      filasExcel.push([etiqueta, formatoMontoEstado(fila.monto, fila.naturaleza)]);
    });

    const ws = XLSX.utils.aoa_to_sheet(filasExcel);
    ws["!cols"] = [{ wch: 60 }, { wch: 20 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Estado Resultados");

    XLSX.writeFile(wb, `Estado_Resultados_${fechaDesde}_${fechaHasta}.xlsx`);
  }

  function exportarEstadoResultadosPDF() {
    const doc = crearPDFClasico({ orientation: "p", format: "a4" });
    const margenX = 10;
    const yInicio = encabezadoPDFClasico(doc, {
      titulo: "Estado de Resultados",
      empresa: empresaActiva?.razon_social,
      rut: empresaActiva?.rut,
      fechaDesde,
      fechaHasta,
      margenX,
    });

    tablaPDFClasica(doc, {
      startY: yInicio,
      head: [["Concepto", "Monto"]],
      body: filasEstado.map((fila) => [
        fila.tipo === "detalle" ? `   ${fila.etiqueta}` : fila.etiqueta,
        formatoMontoEstado(fila.monto, fila.naturaleza),
      ]),
      theme: "grid",
      margin: { left: margenX, right: margenX },
      styles: {
        fontSize: 8,
        cellPadding: 1.5,
      },
      columnStyles: {
        0: { cellWidth: 135 },
        1: { cellWidth: 50, halign: "right" },
      },
      didParseCell(data) {
        const fila = filasEstado[data.row.index];
        if (!fila) return;

        if (fila.negrita) {
          data.cell.styles.fontStyle = "bold";
        }

        if (fila.final) {
          marcarFilaTotalPDF(data, true);
        }
      },
    });

    piePaginasPDFClasico(doc, { texto: "Estado de Resultados", margenX });
    doc.save(`Estado_Resultados_${fechaDesde}_${fechaHasta}.pdf`);
  }

  if (!empresaActiva) {
    return (
      <div>
        <h1 style={titulo}>Estado de resultados</h1>
        <div style={alerta}>
          Debes seleccionar una empresa activa antes de ver el estado de
          resultados.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={titulo}>Estado de resultados</h1>
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
          <label style={label}>Cuentas</label>
          <select
            style={input}
            value={modoCuentas}
            onChange={(e) => setModoCuentas(e.target.value)}
          >
            <option value="movimiento">Solo con movimiento</option>
            <option value="todas">Todas las cuentas</option>
          </select>
        </div>

        <button type="button" style={botonExcel} onClick={exportarEstadoResultadosExcel}>
          Exportar Excel
        </button>

        <button type="button" style={botonPDF} onClick={exportarEstadoResultadosPDF}>
          Exportar PDF
        </button>

        <button type="button" style={botonBuscar} onClick={cargarEstadoResultados}>
          Buscar
        </button>
      </div>

      {error && <p style={err}>{error}</p>}


      {cargando && <EstadoCargando mensaje="Cargando datos..." />}

      <div style={resumenBox}>
        <div style={cardResumen}>
          <strong>Ingresos</strong>
          <span>{formatoAbsoluto(totales.total_ingresos)}</span>
        </div>

        <div style={cardResumen}>
          <strong>Costos</strong>
          <span>{formatoAbsoluto(totales.total_costos)}</span>
        </div>

        <div style={cardResumen}>
          <strong>Gastos</strong>
          <span>{formatoAbsoluto(totales.total_gastos)}</span>
        </div>

        <div style={cardResumen}>
          <strong>Impuestos</strong>
          <span>{formatoAbsoluto(totales.total_impuestos)}</span>
        </div>

        <div
          style={
            Number(resumenEstructura.resultado_ejercicio || 0) >= 0
              ? cardResumenOk
              : cardResumenError
          }
        >
          <strong>Resultado del ejercicio</strong>
          <span>{formato(resumenEstructura.resultado_ejercicio)}</span>
        </div>
      </div>

      <div style={seccionBox}>
        <table style={tabla}>
          <thead>
            <tr>
              <th style={th}>Concepto</th>
              <th style={thNumero}>Monto</th>
            </tr>
          </thead>
          <tbody>
            {filasEstado.map((fila, index) => (
              <tr
                key={`${fila.etiqueta}-${index}`}
                style={fila.final ? filaFinal : undefined}
              >
                <td
                  style={
                    fila.tipo === "detalle"
                      ? tdDetalle
                      : fila.negrita
                      ? tdResumenNegrita
                      : tdResumen
                  }
                >
                  {fila.etiqueta}
                </td>
                <td
                  style={
                    fila.tipo === "detalle"
                      ? tdNumeroDetalle
                      : fila.negrita
                      ? tdNumeroNegrita
                      : tdNumero
                  }
                >
                  {formatoMontoEstado(fila.monto, fila.naturaleza)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

const label = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-text)",
  marginBottom: "5px",
};

const input = {
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "9px",
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

const resumenBox = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
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
  color: "var(--sc-text)",
};

const cardResumenOk = {
  ...cardResumen,
  border: "2px solid #22c55e",
};

const cardResumenError = {
  ...cardResumen,
  border: "2px solid var(--sc-danger)",
};

const seccionBox = {
  background: "white",
  borderRadius: "18px",
  padding: "20px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  overflowX: "auto",
  marginBottom: "20px",
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
};

const thNumero = {
  ...th,
  textAlign: "right",
};

const tdBase = {
  padding: "7px 10px",
  borderBottom: "1px solid var(--sc-borde-claro)",
  color: "var(--sc-text)",
};

const tdResumen = {
  ...tdBase,
};

const tdResumenNegrita = {
  ...tdBase,
  fontWeight: "700",
  color: "var(--sc-ink)",
};

const tdDetalle = {
  ...tdBase,
  color: "var(--sc-gris)",
  paddingLeft: "28px",
};

const tdNumero = {
  ...tdBase,
  textAlign: "right",
};

const tdNumeroNegrita = {
  ...tdNumero,
  fontWeight: "700",
  color: "var(--sc-ink)",
};

const tdNumeroDetalle = {
  ...tdNumero,
  color: "var(--sc-gris)",
};

const filaFinal = {
  background: "#bbd2e4",
};

const err = {
  color: "var(--sc-danger)",
  fontWeight: "bold",
};

const alerta = {
  marginTop: "20px",
  background: "var(--sc-naranja-fondo)",
  border: "1px solid #fed7aa",
  color: "var(--sc-naranja-texto)",
  padding: "16px",
  borderRadius: "14px",
  fontWeight: "bold",
};

const filtrosAcciones = {
  display: "flex",
  alignItems: "end",
  gap: "10px",
  flexWrap: "wrap",
  marginBottom: "18px",
};

const botonExcel = {
  background: "var(--sc-teal)",
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const botonPDF = {
  background: "var(--sc-danger)",
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};
