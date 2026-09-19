import { useEffect, useMemo, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import {
  actualizarEstadoConciliacion,
  importarCartolaBancaria,
  listarMovimientosConciliacion,
} from "../services/conciliacionBancariaService";
import { obtenerRangoAnualTrabajo } from "../services/periodoTrabajoService";
import { EstadoCargando } from "../components/EstadoPantalla";

function moneda(valor) {
  return Number(valor || 0).toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

function fechaCorta(fecha) {
  return fecha ? String(fecha).substring(0, 10) : "-";
}

export default function ConciliacionBancaria() {
  const empresa = obtenerEmpresaActiva();
  const rangoInicial = obtenerRangoAnualTrabajo();
  const [fechaDesde, setFechaDesde] = useState(rangoInicial.fechaDesde);
  const [fechaHasta, setFechaHasta] = useState(rangoInicial.fechaHasta);
  const [archivo, setArchivo] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [totalesApi, setTotalesApi] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function cargarDatos() {
    if (!empresa?.id) return;

    try {
      setError("");
      const data = await listarMovimientosConciliacion(empresa.id, fechaDesde, fechaHasta);
      setMovimientos(data.movimientos || []);
      setTotalesApi(data.totales || {});
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    cargarDatos();
  }, [empresa?.id]);

  const totales = useMemo(
    () => ({
      cargos: Number(totalesApi.cargos || 0),
      abonos: Number(totalesApi.abonos || 0),
      pendientes: Number(totalesApi.pendientes || 0),
      conciliados: Number(totalesApi.conciliados || 0),
    }),
    [totalesApi]
  );

  async function importarArchivo(event) {
    event.preventDefault();

    // El botón ya queda deshabilitado, pero Enter en el formulario no lo respeta.
    if (cargando) return;

    if (!archivo) {
      setError("Selecciona un archivo de cartola bancaria.");
      return;
    }

    try {
      setCargando(true);
      setError("");
      setMensaje("");
      const data = await importarCartolaBancaria(empresa.id, archivo);
      setMensaje(data.mensaje || "Cartola importada correctamente.");
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function cambiarEstado(movimiento) {
    try {
      setError("");
      const nuevoEstado = movimiento.estado === "conciliado" ? "pendiente" : "conciliado";
      await actualizarEstadoConciliacion(movimiento.id, empresa.id, nuevoEstado);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={page}>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {cargando && <EstadoCargando mensaje="Cargando datos..." />}
      {error && <p style={bad}>{error}</p>}

      <section style={card}>
        <h2 style={title}>Conciliación bancaria</h2>
        <p style={hint}>
          Importa una cartola bancaria CSV/TXT y marca movimientos conciliados contra tus registros.
        </p>
        <form style={formGrid} onSubmit={importarArchivo}>
          <label style={field}>
            Fecha desde
            <input style={input} type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
          </label>
          <label style={field}>
            Fecha hasta
            <input style={input} type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
          </label>
          <label style={{ ...field, minWidth: "280px" }}>
            Archivo cartola
            <input style={input} type="file" accept=".csv,.txt" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
          </label>
          <button style={primaryButton} type="submit" disabled={cargando}>
            {cargando ? "Importando..." : "Importar cartola"}
          </button>
          <button style={ghostButton} type="button" onClick={cargarDatos}>
            Buscar
          </button>
        </form>
      </section>

      <div style={summaryGrid}>
        <Card titulo="Abonos" valor={moneda(totales.abonos)} />
        <Card titulo="Cargos" valor={moneda(totales.cargos)} />
        <Card titulo="Pendientes" valor={totales.pendientes} />
        <Card titulo="Conciliados" valor={totales.conciliados} destacado />
      </div>

      <section style={card}>
        <h2 style={sectionTitle}>Movimientos bancarios</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Fecha</th>
                <th style={th}>Descripción</th>
                <th style={th}>Documento</th>
                <th style={thRight}>Cargo</th>
                <th style={thRight}>Abono</th>
                <th style={thRight}>Saldo</th>
                <th style={th}>Estado</th>
                <th style={th}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.length === 0 ? (
                <tr>
                  <td style={td} colSpan="8">
                    No hay movimientos bancarios en el rango seleccionado.
                  </td>
                </tr>
              ) : (
                movimientos.map((movimiento) => (
                  <tr key={movimiento.id}>
                    <td style={td}>{fechaCorta(movimiento.fecha)}</td>
                    <td style={td}>{movimiento.descripcion}</td>
                    <td style={td}>{movimiento.documento || "-"}</td>
                    <td style={tdRight}>{moneda(movimiento.cargo)}</td>
                    <td style={tdRight}>{moneda(movimiento.abono)}</td>
                    <td style={tdRight}>{moneda(movimiento.saldo)}</td>
                    <td style={td}>
                      <span style={movimiento.estado === "conciliado" ? estadoOk : estadoPendiente}>
                        {movimiento.estado === "conciliado" ? "Conciliado" : "Pendiente"}
                      </span>
                    </td>
                    <td style={td}>
                      <button style={iconButton} type="button" onClick={() => cambiarEstado(movimiento)} title="Cambiar estado">
                        {movimiento.estado === "conciliado" ? "↺" : "✓"}
                      </button>
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
    <div style={{ ...smallCard, borderColor: destacado ? "#10b981" : "#bae6fd" }}>
      <p style={cardLabel}>{titulo}</p>
      <strong style={cardValue}>{valor}</strong>
    </div>
  );
}

const page = { display: "flex", flexDirection: "column", gap: "12px" };
const ok = { color: "#059669", fontWeight: "bold", margin: 0 };
const bad = { color: "#dc2626", fontWeight: "bold", margin: 0 };
const card = { background: "white", borderRadius: "16px", padding: "16px", boxShadow: "0 14px 30px rgba(3, 105, 161, 0.08)" };
const title = { color: "#0369a1", margin: "0 0 4px", fontSize: "22px" };
const sectionTitle = { color: "#0369a1", margin: "0 0 10px", fontSize: "20px" };
const hint = { color: "#475569", margin: "0 0 12px" };
const formGrid = { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "end" };
const field = { display: "flex", flexDirection: "column", gap: "5px", fontWeight: "bold" };
const input = { border: "1px solid #93c5fd", borderRadius: "10px", padding: "9px 10px", minHeight: "38px", fontSize: "13px" };
const primaryButton = { border: "none", borderRadius: "10px", padding: "10px 18px", color: "white", fontWeight: "bold", background: "linear-gradient(135deg, #0369a1, #06b6d4)", cursor: "pointer" };
const ghostButton = { border: "1px solid #67e8f9", borderRadius: "10px", padding: "10px 18px", color: "#0369a1", fontWeight: "bold", background: "#ecfeff", cursor: "pointer" };
const summaryGrid = { display: "grid", gridTemplateColumns: "repeat(4, minmax(150px, 1fr))", gap: "10px" };
const smallCard = { background: "white", border: "1px solid #bae6fd", borderRadius: "14px", padding: "12px", boxShadow: "0 12px 26px rgba(3, 105, 161, 0.08)" };
const cardLabel = { margin: "0 0 6px", color: "#0f172a", fontWeight: "bold" };
const cardValue = { color: "#0369a1", fontSize: "18px" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: "13px" };
const th = { background: "#dff4ff", color: "#075985", padding: "9px", textAlign: "left" };
const thRight = { ...th, textAlign: "right" };
const td = { borderBottom: "1px solid #dbeafe", padding: "8px", color: "#0f172a" };
const tdRight = { ...td, textAlign: "right" };
const estadoOk = { background: "#dcfce7", color: "#047857", borderRadius: "999px", padding: "4px 8px", fontWeight: "bold", fontSize: "12px" };
const estadoPendiente = { background: "#fef3c7", color: "#92400e", borderRadius: "999px", padding: "4px 8px", fontWeight: "bold", fontSize: "12px" };
const iconButton = { width: "34px", height: "34px", border: "none", borderRadius: "10px", background: "linear-gradient(135deg, #0369a1, #06b6d4)", color: "white", fontWeight: "bold", cursor: "pointer" };
