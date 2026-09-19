import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../../services/empresaService";
import { listarTrabajadores } from "../../services/trabajadoresService";
import { obtenerPeriodoTrabajo } from "../../services/periodoTrabajoService";
import PeriodoMesSelector from "../../components/PeriodoMesSelector";
import IconoSistema from "../../components/IconoSistema";
import {
  obtenerSaldoVacaciones,
  obtenerHistorialVacacionesTrabajador,
} from "../../services/saldoVacacionesService";
import * as XLSX from "xlsx";
import {
  crearPDFClasico,
  encabezadoPDFClasico,
  marcarFilaTotalPDF,
  piePaginasPDFClasico,
  tablaPDFClasica,
} from "../../utils/documentTheme";

export default function SaldoVacacionesRemuneraciones() {
  const empresaActiva = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [trabajadorId, setTrabajadorId] = useState("");

  const [trabajadores, setTrabajadores] = useState([]);
  const [saldos, setSaldos] = useState([]);

  const [totales, setTotales] = useState({
    dias_devengados: 0,
    dias_usados: 0,
    dias_usados_periodo: 0,
    dias_pendientes: 0,
    trabajadores_saldo_negativo: 0,
  });

  const [detalleTrabajador, setDetalleTrabajador] = useState(null);
  const [historial, setHistorial] = useState([]);

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (empresaActiva) {
      cargarInicial();
    }
  }, []);

  async function cargarInicial() {
    try {
      setMensaje("");
      setError("");

      const trabajadoresData = await listarTrabajadores(
        empresaActiva.id,
        "activo"
      );

      setTrabajadores(trabajadoresData.trabajadores || []);

      await buscarSaldos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function buscarSaldos() {
    try {
      setMensaje("");
      setError("");
      setDetalleTrabajador(null);
      setHistorial([]);

      const data = await obtenerSaldoVacaciones({
        empresa_id: empresaActiva.id,
        periodo,
        trabajador_id: trabajadorId,
      });

      setSaldos(Array.isArray(data.saldos) ? data.saldos : []);

      setTotales(
        data.totales || {
          dias_devengados: 0,
          dias_usados: 0,
          dias_usados_periodo: 0,
          dias_pendientes: 0,
          trabajadores_saldo_negativo: 0,
        }
      );

      setMensaje("Saldo de vacaciones actualizado correctamente.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function verHistorial(item) {
    try {
      setMensaje("");
      setError("");

      const data = await obtenerHistorialVacacionesTrabajador({
        empresa_id: empresaActiva.id,
        trabajador_id: item.trabajador_id,
      });

      setDetalleTrabajador(data.trabajador || item);
      setHistorial(Array.isArray(data.historial) ? data.historial : []);
    } catch (err) {
      setError(err.message);
    }
  }

  function cerrarHistorial() {
    setDetalleTrabajador(null);
    setHistorial([]);
  }

  function numero(valor) {
    return Number(valor || 0);
  }

  function fechaCL(fecha) {
    if (!fecha) return "";
    return String(fecha).substring(0, 10);
  }

  function nombreTrabajador(item) {
    return `${item.nombres || ""} ${item.apellidos || ""}`.trim();
  }

  function formatoDias(valor) {
    return Number(valor || 0).toLocaleString("es-CL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function exportarExcel() {
    const data = [];

    data.push(["CONTROL DE SALDO DE VACACIONES"]);
    data.push([`Empresa: ${empresaActiva?.razon_social || ""}`]);
    data.push([`RUT: ${empresaActiva?.rut || ""}`]);
    data.push([`Periodo: ${periodo}`]);
    data.push([]);

    data.push([
      "RUT",
      "Trabajador",
      "Cargo",
      "Fecha ingreso",
      "Dias devengados",
      "Dias usados historicos",
      "Dias usados periodo",
      "Dias pendientes",
      "Estado saldo",
    ]);

    saldos.forEach((item) => {
      data.push([
        item.rut,
        nombreTrabajador(item),
        item.cargo || "",
        fechaCL(item.fecha_ingreso),
        numero(item.dias_devengados),
        numero(item.dias_usados),
        numero(item.dias_usados_periodo),
        numero(item.dias_pendientes),
        item.estado_saldo,
      ]);
    });

    data.push([]);
    data.push([
      "TOTALES",
      "",
      "",
      "",
      numero(totales.dias_devengados),
      numero(totales.dias_usados),
      numero(totales.dias_usados_periodo),
      numero(totales.dias_pendientes),
      "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws["!cols"] = [
      { wch: 14 },
      { wch: 36 },
      { wch: 24 },
      { wch: 16 },
      { wch: 18 },
      { wch: 22 },
      { wch: 20 },
      { wch: 18 },
      { wch: 22 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Saldo Vacaciones");

    XLSX.writeFile(wb, `Saldo_Vacaciones_${periodo}.xlsx`);
  }

  function exportarPDF() {
    const doc = crearPDFClasico({ orientation: "l", format: "a4" });

    const margenX = 10;
    const yInicio = encabezadoPDFClasico(doc, {
      titulo: "Control de Saldo de Vacaciones",
      empresa: empresaActiva?.razon_social,
      rut: empresaActiva?.rut,
      periodo,
      margenX,
    });

    tablaPDFClasica(doc, {
      startY: yInicio + 1,
      head: [
        [
          "RUT",
          "Trabajador",
          "Ingreso",
          "Devengados",
          "Usados",
          "Usados periodo",
          "Pendientes",
          "Estado",
        ],
      ],
      body: [
        ...saldos.map((item) => [
          item.rut || "",
          nombreTrabajador(item),
          fechaCL(item.fecha_ingreso),
          formatoDias(item.dias_devengados),
          formatoDias(item.dias_usados),
          formatoDias(item.dias_usados_periodo),
          formatoDias(item.dias_pendientes),
          item.estado_saldo,
        ]),
        [
          "TOTALES",
          "",
          "",
          formatoDias(totales.dias_devengados),
          formatoDias(totales.dias_usados),
          formatoDias(totales.dias_usados_periodo),
          formatoDias(totales.dias_pendientes),
          "",
        ],
      ],
      margin: { left: margenX, right: margenX },
      styles: {
        fontSize: 7,
        cellPadding: 1.35,
      },
      columnStyles: {
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right" },
      },
      didParseCell(data) {
        marcarFilaTotalPDF(data, data.row.raw?.[0] === "TOTALES");

        if (data.row.raw?.[7] === "Saldo negativo") {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    piePaginasPDFClasico(doc, {
      texto: "Control de Saldo de Vacaciones",
      margenX,
    });

    doc.save(`Saldo_Vacaciones_${periodo}.pdf`);
  }

  return (
    <div>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <div style={hero}>
        <div>
          <h1 style={titulo}>Saldo de Vacaciones</h1>
          <p style={subtitulo}>
            Control de días devengados, usados y pendientes por trabajador.
          </p>
        </div>
      </div>

      <div style={cardFiltros}>
        <div>
          <label style={label}>Período</label>
          <PeriodoMesSelector
            style={input}
            value={periodo}
            onChange={setPeriodo}
            containerStyle={{ width: "100%", minWidth: 220 }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <label style={label}>Trabajador</label>
          <select
            style={inputFull}
            value={trabajadorId}
            onChange={(e) => setTrabajadorId(e.target.value)}
          >
            <option value="">Todos los trabajadores</option>
            {trabajadores.map((trabajador) => (
              <option key={trabajador.id} value={trabajador.id}>
                {trabajador.rut} - {trabajador.nombres} {trabajador.apellidos}
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

        <button type="button" style={botonBuscar} onClick={buscarSaldos}>
          Buscar
        </button>
      </div>

      <div style={gridResumen}>
        <ResumenCard
          titulo="Dias devengados"
          valor={formatoDias(totales.dias_devengados)}
          icono={<IconoSistema tipo="calendario" />}
        />
        <ResumenCard
          titulo="Dias usados"
          valor={formatoDias(totales.dias_usados)}
          icono={<IconoSistema tipo="vacaciones" />}
        />
        <ResumenCard
          titulo="Usados periodo"
          valor={formatoDias(totales.dias_usados_periodo)}
          icono={<IconoSistema tipo="comprobante" />}
        />
        <ResumenCard
          titulo="Dias pendientes"
          valor={formatoDias(totales.dias_pendientes)}
          icono={<IconoSistema tipo="ok" />}
        />
        <ResumenCard
          titulo="Saldos negativos"
          valor={totales.trabajadores_saldo_negativo || 0}
          icono={<IconoSistema tipo="alerta" />}
        />
      </div>

      <div style={cardTabla}>
        <h2 style={tituloSeccion}>Resultado por trabajador</h2>

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>RUT</th>
                <th style={th}>Trabajador</th>
                <th style={th}>Cargo</th>
                <th style={th}>Ingreso</th>
                <th style={thNumero}>Devengados</th>
                <th style={thNumero}>Usados historico</th>
                <th style={thNumero}>Usados período</th>
                <th style={thNumero}>Pendientes</th>
                <th style={th}>Estado</th>
                <th style={th}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {saldos.map((item) => (
                <tr key={item.trabajador_id}>
                  <td style={td}>{item.rut}</td>
                  <td style={td}>{nombreTrabajador(item)}</td>
                  <td style={td}>{item.cargo}</td>
                  <td style={td}>{fechaCL(item.fecha_ingreso)}</td>
                  <td style={tdNumero}>{formatoDias(item.dias_devengados)}</td>
                  <td style={tdNumero}>{formatoDias(item.dias_usados)}</td>
                  <td style={tdNumero}>
                    {formatoDias(item.dias_usados_periodo)}
                  </td>
                  <td
                    style={
                      item.alerta_saldo_negativo ? tdNumeroRojo : tdNumero
                    }
                  >
                    {formatoDias(item.dias_pendientes)}
                  </td>
                  <td style={item.alerta_saldo_negativo ? tdRojo : td}>
                    {item.estado_saldo}
                  </td>
                  <td style={td}>
                    <button
                      type="button"
                      style={botonMini}
                      onClick={() => verHistorial(item)}
                    >
                      Ver historial
                    </button>
                  </td>
                </tr>
              ))}

              {saldos.length === 0 && (
                <tr>
                  <td style={td} colSpan="10">
                    No hay datos para el período seleccionado.
                  </td>
                </tr>
              )}
            </tbody>

            {saldos.length > 0 && (
              <tfoot>
                <tr>
                  <td style={tdTotal} colSpan="4">
                    TOTALES
                  </td>
                  <td style={tdTotalNumero}>
                    {formatoDias(totales.dias_devengados)}
                  </td>
                  <td style={tdTotalNumero}>
                    {formatoDias(totales.dias_usados)}
                  </td>
                  <td style={tdTotalNumero}>
                    {formatoDias(totales.dias_usados_periodo)}
                  </td>
                  <td style={tdTotalNumero}>
                    {formatoDias(totales.dias_pendientes)}
                  </td>
                  <td style={tdTotal}></td>
                  <td style={tdTotal}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {detalleTrabajador && (
        <div style={cardHistorial}>
          <div style={historialHeader}>
            <div>
              <h2 style={tituloSeccion}>
                Historial vacaciones - {detalleTrabajador.nombres}{" "}
                {detalleTrabajador.apellidos}
              </h2>
              <p style={textoSuave}>
                RUT: {detalleTrabajador.rut} | Ingreso:{" "}
                {fechaCL(detalleTrabajador.fecha_ingreso)}
              </p>
            </div>

            <button type="button" style={botonCerrar} onClick={cerrarHistorial}>
              Cerrar historial
            </button>
          </div>

          <div style={tablaBox}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={th}>Período</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Subtipo</th>
                  <th style={th}>Inicio</th>
                  <th style={th}>Termino</th>
                  <th style={thNumero}>Días</th>
                  <th style={th}>Observacion</th>
                </tr>
              </thead>

              <tbody>
                {historial.map((item) => (
                  <tr key={item.id}>
                    <td style={td}>{item.periodo}</td>
                    <td style={td}>{item.tipo}</td>
                    <td style={td}>{item.subtipo}</td>
                    <td style={td}>{fechaCL(item.fecha_inicio)}</td>
                    <td style={td}>{fechaCL(item.fecha_termino)}</td>
                    <td style={tdNumero}>{formatoDias(item.dias)}</td>
                    <td style={td}>{item.observacion}</td>
                  </tr>
                ))}

                {historial.length === 0 && (
                  <tr>
                    <td style={td} colSpan="7">
                      No hay historial de vacaciones para este trabajador.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ResumenCard({ titulo, valor, icono }) {
  return (
    <div style={cardResumen}>
      <span style={resumenIcono}>{icono}</span>
      <strong>{titulo}</strong>
      <span>{valor}</span>
    </div>
  );
}

const hero = {
  background: "linear-gradient(135deg, var(--sc-ink), var(--sc-azul), #0ea5e9)",
  borderRadius: "22px",
  padding: "28px",
  color: "white",
  marginBottom: "22px",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.18)",
};

const titulo = {
  margin: 0,
  fontSize: "32px",
};

const subtitulo = {
  color: "var(--sc-celeste-suave)",
  marginBottom: 0,
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
  minWidth: "280px",
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

const botonMini = {
  background: "var(--sc-azul)",
  color: "white",
  border: "none",
  padding: "8px 11px",
  borderRadius: "8px",
  fontWeight: "bold",
  cursor: "pointer",
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

const gridResumen = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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

const resumenIcono = {
  width: "38px",
  height: "38px",
  borderRadius: "13px",
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  border: "1px solid #67e8f9",
  color: "var(--sc-azul)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 8px 18px rgba(15, 76, 129, 0.12)",
};

const cardTabla = {
  background: "white",
  borderRadius: "16px",
  padding: "22px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "20px",
};

const cardHistorial = {
  ...cardTabla,
  border: "2px solid #0ea5e9",
};

const historialHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  flexWrap: "wrap",
  alignItems: "start",
};

const tituloSeccion = {
  color: "var(--sc-azul)",
  marginTop: 0,
};

const textoSuave = {
  color: "var(--sc-gris)",
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

const tdRojo = {
  ...td,
  color: "#b91c1c",
  fontWeight: "bold",
};

const tdNumeroRojo = {
  ...tdNumero,
  color: "#b91c1c",
  fontWeight: "bold",
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

