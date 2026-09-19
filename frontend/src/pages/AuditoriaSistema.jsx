import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { listarAuditoria } from "../services/auditoriaService";
import { obtenerRangoAnualTrabajo } from "../services/periodoTrabajoService";

function formatearFechaHora(fecha) {
  if (!fecha) return "-";
  const texto = String(fecha).replace("T", " ");
  return texto.substring(0, 19);
}

export default function AuditoriaSistema() {
  const empresaActiva = obtenerEmpresaActiva();
  const rangoInicial = obtenerRangoAnualTrabajo();

  const [fechaDesde, setFechaDesde] = useState(rangoInicial.fechaDesde);
  const [fechaHasta, setFechaHasta] = useState(rangoInicial.fechaHasta);
  const [movimientos, setMovimientos] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (empresaActiva?.id) {
      cargarDatos();
    }
  }, []);

  async function cargarDatos() {
    try {
      setError("");
      const data = await listarAuditoria(
        empresaActiva.id,
        fechaDesde,
        fechaHasta
      );
      setMovimientos(Array.isArray(data.movimientos) ? data.movimientos : []);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!empresaActiva) {
    return (
      <div>
        <h1 style={titulo}>Auditoria del sistema</h1>
        <div style={alerta}>Debes seleccionar una empresa activa.</div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={titulo}>Auditoria del sistema</h1>
      <p style={subtitulo}>
        Empresa activa: <strong>{empresaActiva.razon_social}</strong>
      </p>

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

      {error && <p style={err}>{error}</p>}

      <div style={tablaBox}>
        <table style={tabla}>
          <thead>
            <tr>
              <th style={th}>Fecha y hora</th>
              <th style={th}>Usuario</th>
              <th style={th}>Modulo</th>
              <th style={th}>Accion</th>
              <th style={th}>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.length === 0 ? (
              <tr>
                <td style={td} colSpan="5">
                  No hay movimientos de auditoria en el rango seleccionado.
                </td>
              </tr>
            ) : (
              movimientos.map((item) => (
                <tr key={item.id}>
                  <td style={td}>{formatearFechaHora(item.creado_en)}</td>
                  <td style={td}>
                    {item.usuario_email ||
                      (item.usuario_id ? `Usuario #${item.usuario_id}` : "Sistema")}
                  </td>
                  <td style={td}>{item.modulo || "-"}</td>
                  <td style={td}>{item.accion || "-"}</td>
                  <td style={td}>{item.detalle || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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

const filtrosBox = {
  display: "flex",
  gap: "12px",
  alignItems: "end",
  flexWrap: "wrap",
  marginBottom: "18px",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "#1e293b",
  marginBottom: "5px",
};

const input = {
  width: "190px",
  padding: "10px",
  border: "1px solid #a9d8ef",
  borderRadius: "9px",
  boxSizing: "border-box",
};

const botonBuscar = {
  background: "#0369a1",
  color: "white",
  border: "none",
  padding: "11px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const tablaBox = {
  background: "white",
  borderRadius: "18px",
  padding: "20px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
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
};

const td = {
  padding: "10px",
  borderBottom: "1px solid #e2e8f0",
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
