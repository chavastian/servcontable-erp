import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { listarCuentas } from "../services/cuentaService";
import { obtenerRangoAnualTrabajo } from "../services/periodoTrabajoService";
import {
  obtenerAnalisisCuentas,
  obtenerMovimientosCuentaAnalisis,
} from "../services/analisisCuentasService";
import * as XLSX from "xlsx";
import {
  crearPDFClasico,
  encabezadoPDFClasico,
  marcarFilaTotalPDF,
  piePaginasPDFClasico,
  tablaPDFClasica,
} from "../utils/documentTheme";



export default function AnalisisCuentas() {
  const empresaActiva = obtenerEmpresaActiva();
  const rangoInicial = obtenerRangoAnualTrabajo();

  const [fechaDesde, setFechaDesde] = useState(rangoInicial.fechaDesde);
  const [fechaHasta, setFechaHasta] = useState(rangoInicial.fechaHasta);
  const [cuentaId, setCuentaId] = useState("");

  const [cuentasPlan, setCuentasPlan] = useState([]);
  const [cuentasAnalisis, setCuentasAnalisis] = useState([]);

  const [cuentaDetalle, setCuentaDetalle] = useState(null);
  const [movimientosCuenta, setMovimientosCuenta] = useState([]);
  const [totalesCuenta, setTotalesCuenta] = useState({
    total_debe: 0,
    total_haber: 0,
    saldo: 0,
  });

  const [totales, setTotales] = useState({
    total_debe: 0,
    total_haber: 0,
    saldo: 0,
    activo: 0,
    pasivo: 0,
    perdida: 0,
    ganancia: 0,
  });

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  async function cargarCuentas() {
    try {
      setMensaje("");
      setError("");

      const data = await listarCuentas(empresaActiva.id);
      setCuentasPlan(Array.isArray(data.cuentas) ? data.cuentas : []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (empresaActiva) {
      cargarCuentas();
    }
  }, []);

  async function buscarAnalisis() {
    try {
      setMensaje("");
      setError("");

      if (!empresaActiva?.id || !fechaDesde || !fechaHasta) {
        setError("Debe indicar empresa, fecha desde y fecha hasta.");
        return;
      }

      const data = await obtenerAnalisisCuentas({
        empresa_id: empresaActiva.id,
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        cuenta_id: cuentaId,
      });

      setCuentasAnalisis(Array.isArray(data.cuentas) ? data.cuentas : []);

      setTotales(
        data.totales || {
          total_debe: 0,
          total_haber: 0,
          saldo: 0,
          activo: 0,
          pasivo: 0,
          perdida: 0,
          ganancia: 0,
        }
      );

      setMensaje("Análisis de cuentas cargado correctamente.");
    } catch (err) {
      setError(err.message);
    }
  }

  function numero(valor) {
    return Number(valor || 0);
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  function exportarExcel() {
    const data = [];

    data.push(["ANALISIS DE CUENTAS"]);
    data.push([`Empresa: ${empresaActiva?.razon_social || ""}`]);
    data.push([`RUT: ${empresaActiva?.rut || ""}`]);
    data.push([`Desde: ${fechaDesde}`]);
    data.push([`Hasta: ${fechaHasta}`]);
    data.push([]);

    data.push([
      "Codigo",
      "Cuenta",
      "Tipo",
      "Clasificacion",
      "Naturaleza",
      "Debe",
      "Haber",
      "Saldo",
      "Activo",
      "Pasivo",
      "Perdida",
      "Ganancia",
      "Tipo balance",
    ]);

    cuentasAnalisis.forEach((item) => {
      data.push([
        item.codigo,
        item.nombre,
        item.tipo,
        item.clasificacion,
        item.naturaleza,
        numero(item.total_debe),
        numero(item.total_haber),
        numero(item.saldo),
        numero(item.activo),
        numero(item.pasivo),
        numero(item.perdida),
        numero(item.ganancia),
        item.tipo_balance,
      ]);
    });

    data.push([]);
    data.push([
      "TOTALES",
      "",
      "",
      "",
      "",
      numero(totales.total_debe),
      numero(totales.total_haber),
      numero(totales.saldo),
      numero(totales.activo),
      numero(totales.pasivo),
      numero(totales.perdida),
      numero(totales.ganancia),
      "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws["!cols"] = [
      { wch: 14 },
      { wch: 42 },
      { wch: 18 },
      { wch: 20 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 18 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Analisis Cuentas");

    XLSX.writeFile(wb, `Analisis_Cuentas_${fechaDesde}_${fechaHasta}.xlsx`);
  }

  function exportarPDF() {
    const doc = crearPDFClasico({ orientation: "l", format: "a4" });
    const margenX = 8;
    const yInicio = encabezadoPDFClasico(doc, {
      titulo: "Análisis de Cuentas",
      empresa: empresaActiva?.razon_social,
      rut: empresaActiva?.rut,
      fechaDesde,
      fechaHasta,
      margenX,
    });

    tablaPDFClasica(doc, {
      startY: yInicio,
      head: [
        [
          "Código",
          "Cuenta",
          "Debe",
          "Haber",
          "Saldo",
          "Activo",
          "Pasivo",
          "Pérdida",
          "Ganancia",
        ],
      ],
      body: [
        ...cuentasAnalisis.map((item) => [
          item.codigo || "",
          item.nombre || "",
          numero(item.total_debe).toLocaleString("es-CL"),
          numero(item.total_haber).toLocaleString("es-CL"),
          numero(item.saldo).toLocaleString("es-CL"),
          numero(item.activo).toLocaleString("es-CL"),
          numero(item.pasivo).toLocaleString("es-CL"),
          numero(item.perdida).toLocaleString("es-CL"),
          numero(item.ganancia).toLocaleString("es-CL"),
        ]),
        [
          "TOTALES",
          "",
          numero(totales.total_debe).toLocaleString("es-CL"),
          numero(totales.total_haber).toLocaleString("es-CL"),
          numero(totales.saldo).toLocaleString("es-CL"),
          numero(totales.activo).toLocaleString("es-CL"),
          numero(totales.pasivo).toLocaleString("es-CL"),
          numero(totales.perdida).toLocaleString("es-CL"),
          numero(totales.ganancia).toLocaleString("es-CL"),
        ],
      ],
      theme: "grid",
      margin: { left: margenX, right: margenX },
      styles: {
        fontSize: 6.8,
        cellPadding: 1.15,
      },
      columnStyles: {
        0: { cellWidth: 23 },
        1: { cellWidth: 76 },
        2: { cellWidth: 26, halign: "right" },
        3: { cellWidth: 26, halign: "right" },
        4: { cellWidth: 26, halign: "right" },
        5: { cellWidth: 26, halign: "right" },
        6: { cellWidth: 26, halign: "right" },
        7: { cellWidth: 26, halign: "right" },
        8: { cellWidth: 26, halign: "right" },
      },
      didParseCell(data) {
        marcarFilaTotalPDF(data, data.row.raw?.[0] === "TOTALES");
      },
    });

    piePaginasPDFClasico(doc, { texto: "Análisis de Cuentas", margenX });
    doc.save(`Analisis_Cuentas_${fechaDesde}_${fechaHasta}.pdf`);
  }

  const cuentasSeguras = Array.isArray(cuentasPlan) ? cuentasPlan : [];
  const analisisSeguro = Array.isArray(cuentasAnalisis)
    ? cuentasAnalisis
    : [];


    async function abrirDetalleCuenta(item) {
      try {
        setMensaje("");
        setError("");

        const data = await obtenerMovimientosCuentaAnalisis({
          empresa_id: empresaActiva.id,
          fecha_desde: fechaDesde,
          fecha_hasta: fechaHasta,
          cuenta_id: item.cuenta_id,
        });

        setCuentaDetalle(data.cuenta || item);
        setMovimientosCuenta(
          Array.isArray(data.movimientos) ? data.movimientos : []
        );
        setTotalesCuenta(
          data.totales || {
            total_debe: 0,
            total_haber: 0,
            saldo: 0,
          }
        );

        setMensaje(
          `Detalle cargado para la cuenta ${item.codigo} - ${item.nombre}`
        );
      } catch (err) {
        setError(err.message);
      }
    }

    function cerrarDetalleCuenta() {
      setCuentaDetalle(null);
      setMovimientosCuenta([]);
      setTotalesCuenta({
        total_debe: 0,
        total_haber: 0,
        saldo: 0,
      });
    }

    function fechaCL(fecha) {
      if (!fecha) return "";
      return String(fecha).substring(0, 10);
    }

  return (
    <div>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <h1 style={tituloPrincipal}>Análisis de cuentas</h1>

      <p style={empresaTexto}>
        Empresa activa: <strong>{empresaActiva?.razon_social || ""}</strong>
      </p>

      <div style={cardFiltros}>
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

        <div style={{ flex: 1 }}>
          <label style={label}>Cuenta</label>
          <select
            style={inputFull}
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
          >
            <option value="">Todas las cuentas</option>
            {cuentasSeguras.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>
                {cuenta.codigo} - {cuenta.nombre}
              </option>
            ))}
          </select>
        </div>

        <button type="button" style={botonExcel} onClick={exportarExcel}>
          Exportar Excel
        </button>

        <button type="button" style={botonPDF} onClick={exportarPDF}>
          Exportar PDF
        </button>

        <button type="button" style={botonBuscar} onClick={buscarAnalisis}>
          Buscar
        </button>
      </div>

      <div style={gridResumen}>
        <ResumenCard titulo="Debe" valor={formato(totales.total_debe)} />
        <ResumenCard titulo="Haber" valor={formato(totales.total_haber)} />
        <ResumenCard titulo="Activo" valor={formato(totales.activo)} />
        <ResumenCard titulo="Pasivo" valor={formato(totales.pasivo)} />
        <ResumenCard titulo="Perdida" valor={formato(totales.perdida)} />
        <ResumenCard titulo="Ganancia" valor={formato(totales.ganancia)} />
      </div>

      <div style={cardTabla}>
        <h2 style={tituloSeccion}>Resultado del análisis</h2>

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Código</th>
                <th style={th}>Cuenta</th>
                <th style={th}>Tipo</th>
                <th style={th}>Naturaleza</th>
                <th style={thNumero}>Debe</th>
                <th style={thNumero}>Haber</th>
                <th style={thNumero}>Saldo</th>
                <th style={thNumero}>Activo</th>
                <th style={thNumero}>Pasivo</th>
                <th style={thNumero}>Perdida</th>
                <th style={thNumero}>Ganancia</th>
              </tr>
            </thead>

            <tbody>
              {analisisSeguro.map((item) => (
                <tr key={item.cuenta_id}>
                  <td style={td}>
                    <button
                       type="button"
                       style={linkCuenta}
                       onClick={() => abrirDetalleCuenta(item)}
                    >
                       {item.codigo}
                    </button>
                  </td>

                  <td style={td}>
                    <button
                       type="button"
                       style={linkCuenta}
                       onClick={() => abrirDetalleCuenta(item)}
                    >
                       {item.nombre}
                   </button>
                 </td>
                  <td style={td}>{item.tipo}</td>
                  <td style={td}>{item.naturaleza}</td>
                  <td style={tdNumero}>{formato(item.total_debe)}</td>
                  <td style={tdNumero}>{formato(item.total_haber)}</td>
                  <td style={tdNumero}>{formato(item.saldo)}</td>
                  <td style={tdNumero}>{formato(item.activo)}</td>
                  <td style={tdNumero}>{formato(item.pasivo)}</td>
                  <td style={tdNumero}>{formato(item.perdida)}</td>
                  <td style={tdNumero}>{formato(item.ganancia)}</td>
                </tr>
              ))}

              {analisisSeguro.length === 0 && (
                <tr>
                  <td style={td} colSpan="11">
                    No hay datos para el rango seleccionado.
                  </td>
                </tr>
              )}
            </tbody>

            {analisisSeguro.length > 0 && (
              <tfoot>
                <tr>
                  <td style={tdTotal} colSpan="4">
                    TOTALES
                  </td>
                  <td style={tdTotalNumero}>{formato(totales.total_debe)}</td>
                  <td style={tdTotalNumero}>{formato(totales.total_haber)}</td>
                  <td style={tdTotalNumero}>{formato(totales.saldo)}</td>
                  <td style={tdTotalNumero}>{formato(totales.activo)}</td>
                  <td style={tdTotalNumero}>{formato(totales.pasivo)}</td>
                  <td style={tdTotalNumero}>{formato(totales.perdida)}</td>
                  <td style={tdTotalNumero}>{formato(totales.ganancia)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {cuentaDetalle && (
        <div style={cardDetalle}>
            <div style={detalleHeader}>
            <div>
                <h2 style={tituloSeccion}>
                Movimientos de la cuenta {cuentaDetalle.codigo} -{" "}
                {cuentaDetalle.nombre}
                </h2>

                <p style={textoDetalle}>
                Naturaleza: <strong>{cuentaDetalle.naturaleza || "No indicada"}</strong>{" "}
                | Rango: <strong>{fechaDesde}</strong> a <strong>{fechaHasta}</strong>
                </p>
            </div>

            <button type="button" style={botonCerrar} onClick={cerrarDetalleCuenta}>
                Cerrar detalle
            </button>
            </div>

            <div style={resumenDetalle}>
            <ResumenCard
                titulo="Debe cuenta"
                valor={formato(totalesCuenta.total_debe)}
            />
            <ResumenCard
                titulo="Haber cuenta"
                valor={formato(totalesCuenta.total_haber)}
            />
            <ResumenCard titulo="Saldo cuenta" valor={formato(totalesCuenta.saldo)} />
            </div>

            <div style={tablaBox}>
            <table style={tabla}>
                <thead>
                <tr>
                    <th style={th}>Fecha</th>
                    <th style={th}>Tipo</th>
                    <th style={th}>N°</th>
                    <th style={th}>Glosa comprobante</th>
                    <th style={th}>Glosa detalle</th>
                    <th style={thNumero}>Debe</th>
                    <th style={thNumero}>Haber</th>
                    <th style={thNumero}>Saldo acumulado</th>
                </tr>
                </thead>

                <tbody>
                {movimientosCuenta.map((mov) => (
                    <tr key={mov.detalle_id}>
                    <td style={td}>{fechaCL(mov.fecha)}</td>
                    <td style={td}>{mov.tipo}</td>
                    <td style={td}>{mov.numero}</td>
                    <td style={td}>{mov.glosa_comprobante}</td>
                    <td style={td}>{mov.glosa_detalle}</td>
                    <td style={tdNumero}>{formato(mov.debe)}</td>
                    <td style={tdNumero}>{formato(mov.haber)}</td>
                    <td style={tdNumero}>{formato(mov.saldo_acumulado)}</td>
                    </tr>
                ))}

                {movimientosCuenta.length === 0 && (
                    <tr>
                    <td style={td} colSpan="8">
                        No hay movimientos para esta cuenta.
                    </td>
                    </tr>
                )}
                </tbody>

                {movimientosCuenta.length > 0 && (
                <tfoot>
                    <tr>
                    <td style={tdTotal} colSpan="5">
                        TOTALES CUENTA
                    </td>
                    <td style={tdTotalNumero}>
                        {formato(totalesCuenta.total_debe)}
                    </td>
                    <td style={tdTotalNumero}>
                        {formato(totalesCuenta.total_haber)}
                    </td>
                    <td style={tdTotalNumero}>{formato(totalesCuenta.saldo)}</td>
                    </tr>
                </tfoot>
                )}
             </table>
            </div>
        </div>
        )}
    </div>
  );
}

function ResumenCard({ titulo, valor }) {
  return (
    <div style={cardResumen}>
      <strong>{titulo}</strong>
      <span>{valor}</span>
    </div>
  );
}

const tituloPrincipal = {
  fontSize: "32px",
  color: "var(--sc-ink)",
  marginBottom: "10px",
};

const empresaTexto = {
  color: "var(--sc-gris)",
  marginBottom: "18px",
};

const cardFiltros = {
  background: "white",
  borderRadius: "16px",
  padding: "16px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  display: "flex",
  alignItems: "end",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "18px",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-text)",
  marginBottom: "5px",
};

const input = {
  width: "170px",
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "9px",
  height: "40px",
  boxSizing: "border-box",
};

const inputFull = {
  width: "100%",
  minWidth: "260px",
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "9px",
  height: "40px",
  boxSizing: "border-box",
};

const botonBase = {
  color: "white",
  border: "none",
  padding: "11px 18px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const botonExcel = {
  ...botonBase,
  background: "var(--sc-teal)",
};

const botonPDF = {
  ...botonBase,
  background: "var(--sc-danger)",
};

const botonBuscar = {
  ...botonBase,
  background: "var(--sc-azul)",
};

const gridResumen = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "14px",
  marginBottom: "18px",
};

const cardResumen = {
  background: "white",
  borderRadius: "16px",
  padding: "16px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  color: "var(--sc-text)",
};

const cardTabla = {
  background: "white",
  borderRadius: "16px",
  padding: "22px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "20px",
};

const tituloSeccion = {
  color: "var(--sc-azul)",
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
};

const tdNumero = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const tdTotal = {
  ...td,
  fontWeight: "bold",
  background: "var(--sc-fondo-claro)",
  color: "var(--sc-azul)",
};

const tdTotalNumero = {
  ...tdTotal,
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

const linkCuenta = {
  background: "transparent",
  border: "none",
  color: "var(--sc-azul)",
  fontWeight: "bold",
  cursor: "pointer",
  textAlign: "left",
  padding: 0,
  textDecoration: "underline",
};

const cardDetalle = {
  background: "white",
  borderRadius: "16px",
  padding: "22px",
  boxShadow: "0 8px 25px rgba(0,0,0,0.12)",
  marginTop: "22px",
  marginBottom: "24px",
  border: "2px solid #0ea5e9",
};

const detalleHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "start",
  flexWrap: "wrap",
  marginBottom: "16px",
};

const textoDetalle = {
  color: "var(--sc-gris)",
  marginTop: "-6px",
};

const botonCerrar = {
  background: "var(--sc-gris)",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
};

const resumenDetalle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
  marginBottom: "18px",
};


