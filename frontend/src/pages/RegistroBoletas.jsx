import { useEffect, useMemo, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { listarBoletas, importarBoletas } from "../services/boletaService";
import { EstadoCargando } from "../components/EstadoPantalla";
import {
  obtenerAnioActivo,
  obtenerPeriodoTrabajo,
  obtenerRangoPeriodoTrabajo,
} from "../services/periodoTrabajoService";

const MESES = [
  { valor: "01", label: "Enero" },
  { valor: "02", label: "Febrero" },
  { valor: "03", label: "Marzo" },
  { valor: "04", label: "Abril" },
  { valor: "05", label: "Mayo" },
  { valor: "06", label: "Junio" },
  { valor: "07", label: "Julio" },
  { valor: "08", label: "Agosto" },
  { valor: "09", label: "Septiembre" },
  { valor: "10", label: "Octubre" },
  { valor: "11", label: "Noviembre" },
  { valor: "12", label: "Diciembre" },
];

function moneda(valor) {
  return Number(valor || 0).toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

function formatoFecha(fecha) {
  if (!fecha) return "-";
  return String(fecha).substring(0, 10);
}

export default function RegistroBoletas() {
  const empresa = obtenerEmpresaActiva();
  const anioActivo = obtenerAnioActivo();
  const periodoInicial = obtenerPeriodoTrabajo();
  const [anio, setAnio] = useState(String(anioActivo));
  const [mes, setMes] = useState(periodoInicial.substring(5, 7));
  const [archivo, setArchivo] = useState(null);
  const [generarComprobante, setGenerarComprobante] = useState("true");
  const [boletas, setBoletas] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const periodo = `${anio}-${mes}`;
  const rango = obtenerRangoPeriodoTrabajo(periodo);

  const resumen = useMemo(
    () =>
      boletas.reduce(
        (acc, boleta) => {
          acc.neto += Number(boleta.neto || 0);
          acc.exento += Number(boleta.exento || 0);
          acc.iva += Number(boleta.iva || 0);
          acc.total += Number(boleta.total || 0);
          return acc;
        },
        { neto: 0, exento: 0, iva: 0, total: 0 }
      ),
    [boletas]
  );

  async function cargarBoletas() {
    if (!empresa?.id) return;

    try {
      setError("");
      const data = await listarBoletas(empresa.id, rango.fechaDesde, rango.fechaHasta);
      setBoletas(data.boletas || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    cargarBoletas();
  }, [empresa?.id, periodo]);

  async function importarArchivo(event) {
    event.preventDefault();

    if (!archivo) {
      setError("Selecciona el archivo de boletas SII.");
      return;
    }

    try {
      setCargando(true);
      setError("");
      setMensaje("");
      const data = await importarBoletas(
        empresa.id,
        archivo,
        generarComprobante === "true",
        periodo
      );
      setResultado(data.resumen);
      setMensaje(data.mensaje || "Importacion finalizada.");
      await cargarBoletas();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  function descargarModelo() {
    const contenido = [
      "Tipo Doc;Folio;Fecha Documento;Monto Neto;Monto Exento;Monto IVA;Monto Total;RUT Cliente;Razon Social",
      "39;1001;01/01/2026;8403;0;1597;10000;66.666.666-6;Consumidor final",
      "41;1002;01/01/2026;0;15000;0;15000;66.666.666-6;Consumidor final",
    ].join("\n");
    const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `modelo_boletas_${periodo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={page}>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {cargando && <EstadoCargando mensaje="Cargando datos..." />}
      {error && <p style={bad}>{error}</p>}

      <div style={summaryGrid}>
        <Card titulo="Neto" valor={moneda(resumen.neto)} />
        <Card titulo="Exento" valor={moneda(resumen.exento)} />
        <Card titulo="IVA debito" valor={moneda(resumen.iva)} />
        <Card titulo="Total boletas" valor={moneda(resumen.total)} destacado />
      </div>

      <section style={card}>
        <h2 style={sectionTitle}>Importar boletas desde SII</h2>
        <p style={hint}>
          Carga el registro de boletas electrónicas del SII en formato CSV o CSV comprimido .gz.
        </p>

        <form style={formGrid} onSubmit={importarArchivo}>
          <label style={field}>
            Mes
            <select style={input} value={mes} onChange={(e) => setMes(e.target.value)}>
              {MESES.map((item) => (
                <option key={item.valor} value={item.valor}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label style={field}>
            Año
            <select style={input} value={anio} onChange={(e) => setAnio(e.target.value)}>
              <option value={anioActivo}>{anioActivo}</option>
            </select>
          </label>

          <label style={{ ...field, gridColumn: "span 2" }}>
            Archivo CSV o GZ
            <input
              style={input}
              type="file"
              accept=".csv,.txt,.gz"
              onChange={(e) => setArchivo(e.target.files?.[0] || null)}
            />
          </label>

          <label style={field}>
            Comprobante automatico
            <select
              style={input}
              value={generarComprobante}
              onChange={(e) => setGenerarComprobante(e.target.value)}
            >
              <option value="true">Si, generar comprobantes</option>
              <option value="false">No generar comprobantes</option>
            </select>
          </label>

          <div style={buttonRow}>
            <button style={primaryButton} type="submit" disabled={cargando}>
              {cargando ? "Importando..." : "Importar archivo"}
            </button>
            <button style={ghostButton} type="button" onClick={descargarModelo}>
              Modelo
            </button>
            <button
              style={dangerButton}
              type="button"
              onClick={() => {
                setArchivo(null);
                setResultado(null);
                setMensaje("");
                setError("");
              }}
            >
              Limpiar
            </button>
          </div>
        </form>

        {resultado && (
          <div style={resultBox}>
            <strong>Resultado importacion</strong>
            <span>Total filas: {resultado.total_filas}</span>
            <span>Insertadas: {resultado.insertadas}</span>
            <span>Omitidas: {resultado.omitidas}</span>
            <span>Comprobantes creados: {resultado.comprobantes_creados}</span>
          </div>
        )}
      </section>

      <section style={card}>
        <h2 style={sectionTitle}>Boletas registradas</h2>
        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Fecha</th>
                <th style={th}>Documento</th>
                <th style={th}>Folio</th>
                <th style={th}>Cliente</th>
                <th style={thRight}>Neto</th>
                <th style={thRight}>Exento</th>
                <th style={thRight}>IVA</th>
                <th style={thRight}>Total</th>
                <th style={th}>Comprobante</th>
              </tr>
            </thead>
            <tbody>
              {boletas.length === 0 ? (
                <tr>
                  <td style={td} colSpan="9">
                    No hay boletas registradas para el período seleccionado.
                  </td>
                </tr>
              ) : (
                boletas.map((boleta) => (
                  <tr key={boleta.id}>
                    <td style={td}>{formatoFecha(boleta.fecha)}</td>
                    <td style={td}>{boleta.tipo_documento}</td>
                    <td style={td}>{boleta.folio}</td>
                    <td style={td}>{boleta.razon_social_cliente}</td>
                    <td style={tdRight}>{moneda(boleta.neto)}</td>
                    <td style={tdRight}>{moneda(boleta.exento)}</td>
                    <td style={tdRight}>{moneda(boleta.iva)}</td>
                    <td style={tdRight}>{moneda(boleta.total)}</td>
                    <td style={td}>
                      {boleta.comprobante_id ? (
                        <span style={created}>Creado</span>
                      ) : (
                        <span style={pending}>Sin comprobante</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Card({ titulo, valor, destacado = false }) {
  return (
    <div style={{ ...smallCard, borderColor: destacado ? "var(--sc-teal)" : "#bae6fd" }}>
      <p style={cardLabel}>{titulo}</p>
      <strong style={cardValue}>{valor}</strong>
    </div>
  );
}

const page = { display: "flex", flexDirection: "column", gap: "12px" };
const ok = { color: "#059669", fontWeight: "bold", margin: 0 };
const bad = { color: "#dc2626", fontWeight: "bold", margin: 0 };
const summaryGrid = { display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: "10px" };
const smallCard = { background: "white", border: "1px solid #bae6fd", borderRadius: "14px", padding: "12px", boxShadow: "0 12px 26px rgba(3, 105, 161, 0.08)" };
const cardLabel = { margin: "0 0 6px", color: "var(--sc-ink)", fontWeight: "bold" };
const cardValue = { color: "var(--sc-azul)", fontSize: "18px" };
const card = { background: "white", borderRadius: "16px", padding: "16px", boxShadow: "0 14px 30px rgba(3, 105, 161, 0.08)" };
const sectionTitle = { color: "var(--sc-azul)", margin: "0 0 8px", fontSize: "22px" };
const hint = { margin: "0 0 12px", color: "var(--sc-gris)" };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(6, minmax(120px, 1fr))", gap: "10px", alignItems: "end" };
const field = { display: "flex", flexDirection: "column", gap: "5px", fontWeight: "bold", color: "var(--sc-text)" };
const input = { border: "1px solid #93c5fd", borderRadius: "10px", padding: "9px 10px", minHeight: "38px", fontSize: "13px", background: "white" };
const buttonRow = { display: "flex", gap: "8px", gridColumn: "span 6", flexWrap: "wrap" };
const primaryButton = { border: "none", borderRadius: "10px", padding: "10px 16px", color: "white", fontWeight: "bold", background: "linear-gradient(135deg, var(--sc-azul), var(--sc-cian-medio))", cursor: "pointer" };
const ghostButton = { border: "1px solid #67e8f9", borderRadius: "10px", padding: "10px 16px", color: "var(--sc-azul)", fontWeight: "bold", background: "var(--sc-cian-fondo)", cursor: "pointer" };
const dangerButton = { border: "1px solid #fecaca", borderRadius: "10px", padding: "10px 16px", color: "#b91c1c", fontWeight: "bold", background: "#fff1f2", cursor: "pointer" };
const resultBox = { marginTop: "12px", border: "1px solid #bae6fd", borderRadius: "12px", padding: "10px", display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: "8px", color: "var(--sc-text)" };
const tableWrap = { overflowX: "auto" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: "13px" };
const th = { background: "#dff4ff", color: "#075985", padding: "9px", textAlign: "left" };
const thRight = { ...th, textAlign: "right" };
const td = { borderBottom: "1px solid #dbeafe", padding: "8px", color: "var(--sc-ink)" };
const tdRight = { ...td, textAlign: "right" };
const created = { color: "#059669", fontWeight: "bold" };
const pending = { color: "#64748b", fontWeight: "bold" };
