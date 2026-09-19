import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerPeriodoTrabajo } from "../services/periodoTrabajoService";
import {
  obtenerControlRemanenteIVA,
  guardarControlRemanenteIVA,
  listarHistorialRemanenteIVA,
} from "../services/remanenteIVAService";

export default function ControlRemanenteIVA() {
  const empresaActiva = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [remanenteAnterior, setRemanenteAnterior] = useState(0);
  const [observacion, setObservacion] = useState("");
  const [datos, setDatos] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (empresaActiva) {
      cargarDatos();
      cargarHistorial();
    }
  }, []);

  async function cargarDatos() {
    try {
      setError("");
      setMensaje("");

      const data = await obtenerControlRemanenteIVA(empresaActiva.id, periodo);

      setDatos(data);
      setRemanenteAnterior(data.remanente_anterior || 0);
      setObservacion(data.observacion || "");
    } catch (err) {
      setError(err.message);
    }
  }

  async function cargarHistorial() {
    try {
      const data = await listarHistorialRemanenteIVA(empresaActiva.id);
      setHistorial(data.controles || []);
    } catch (err) {
      setError(err.message);
    }
  }

  // Evita el doble envío: un segundo clic antes de que responda el servidor
  // creaba el registro dos veces.
  const [guardando, setGuardando] = useState(false);

  async function guardarControl(e) {
    e.preventDefault();

    if (guardando) return;

    try {
      setGuardando(true);
      setMensaje("");
      setError("");

      const data = await guardarControlRemanenteIVA({
        empresa_id: empresaActiva.id,
        periodo,
        remanente_anterior: Number(remanenteAnterior || 0),
        observacion,
      });

      setMensaje(data.mensaje);

      await cargarDatos();
      await cargarHistorial();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  if (!empresaActiva) {
    return (
      <div>
        <h1 style={titulo}>Control Remanente IVA</h1>
        <div style={alerta}>
          Debes seleccionar una empresa activa antes de controlar remanentes.
        </div>
      </div>
    );
  }

  const resumen = datos || {
    remanente_anterior: 0,
    iva_debito: 0,
    iva_credito: 0,
    iva_disponible: 0,
    iva_determinado: 0,
    iva_pagar: 0,
    remanente_siguiente: 0,
  };

  const ivaDisponible =
    Number(resumen.iva_credito || 0) + Number(remanenteAnterior || 0);

  const ivaDeterminado = Number(resumen.iva_debito || 0) - ivaDisponible;

  const ivaPagarCalculado = ivaDeterminado > 0 ? ivaDeterminado : 0;
  const remanenteSiguienteCalculado =
    ivaDeterminado < 0 ? Math.abs(ivaDeterminado) : 0;

  return (
    <div>
      <h1 style={titulo}>Control Remanente IVA</h1>
      <p style={subtitulo}>
        Empresa activa: <strong>{empresaActiva.razon_social}</strong>
      </p>

      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <form style={filtrosBox} onSubmit={guardarControl}>
        <div>
          <label style={label}>Período</label>
          <input
            style={input}
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            placeholder={obtenerPeriodoTrabajo()}
          />
        </div>

        <div>
          <label style={label}>Remanente anterior</label>
          <input
            style={input}
            type="number"
            value={remanenteAnterior}
            onChange={(e) => setRemanenteAnterior(e.target.value)}
            placeholder="0"
          />
        </div>

        <div style={{ flex: 1 }}>
          <label style={label}>Observación</label>
          <input
            style={input}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="Ej: Remanente informado en F29 anterior"
          />
        </div>

        <button style={botonBuscar} type="button" onClick={cargarDatos}>
          Calcular
        </button>

        <button style={botonGuardar} type="submit" disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </form>

      <div style={resumenBox}>
        <div style={cardResumen}>
          <strong>Remanente anterior</strong>
          <span>{formato(remanenteAnterior)}</span>
        </div>

        <div style={cardResumen}>
          <strong>IVA Débito</strong>
          <span>{formato(resumen.iva_debito)}</span>
        </div>

        <div style={cardResumen}>
          <strong>IVA Crédito</strong>
          <span>{formato(resumen.iva_credito)}</span>
        </div>

        <div style={cardResumen}>
          <strong>IVA disponible</strong>
          <span>{formato(ivaDisponible)}</span>
        </div>

        <div style={ivaPagarCalculado > 0 ? cardResumenError : cardResumenOk}>
          <strong>IVA a pagar</strong>
          <span>{formato(ivaPagarCalculado)}</span>
        </div>

        <div
          style={
            remanenteSiguienteCalculado > 0 ? cardResumenOk : cardResumen
          }
        >
          <strong>Remanente siguiente</strong>
          <span>{formato(remanenteSiguienteCalculado)}</span>
        </div>
      </div>

      <div style={determinacionBox}>
        <h2 style={tituloSeccion}>Determinación con remanente</h2>

        <table style={tabla}>
          <tbody>
            <tr>
              <td style={td}>IVA Débito Fiscal</td>
              <td style={tdNumero}>{formato(resumen.iva_debito)}</td>
            </tr>

            <tr>
              <td style={td}>IVA Crédito Fiscal</td>
              <td style={tdNumero}>{formato(resumen.iva_credito)}</td>
            </tr>

            <tr>
              <td style={td}>Remanente anterior</td>
              <td style={tdNumero}>{formato(remanenteAnterior)}</td>
            </tr>

            <tr>
              <td style={tdTotal}>IVA disponible</td>
              <td style={tdTotalNumero}>{formato(ivaDisponible)}</td>
            </tr>

            <tr>
              <td style={tdTotal}>IVA determinado</td>
              <td style={tdTotalNumero}>{formato(ivaDeterminado)}</td>
            </tr>

            <tr>
              <td style={tdFinal}>IVA a pagar</td>
              <td style={tdFinalNumero}>{formato(ivaPagarCalculado)}</td>
            </tr>

            <tr>
              <td style={tdFinal}>Remanente siguiente</td>
              <td style={tdFinalNumero}>
                {formato(remanenteSiguienteCalculado)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={determinacionBox}>
        <h2 style={tituloSeccion}>Historial de remanentes</h2>

        <table style={tabla}>
          <thead>
            <tr>
              <th style={th}>Período</th>
              <th style={th}>Rem. anterior</th>
              <th style={th}>IVA débito</th>
              <th style={th}>IVA crédito</th>
              <th style={th}>IVA pagar</th>
              <th style={th}>Rem. siguiente</th>
              <th style={th}>Observación</th>
            </tr>
          </thead>

          <tbody>
            {historial.map((item) => (
              <tr key={item.id}>
                <td style={td}>{item.periodo}</td>
                <td style={tdNumero}>{formato(item.remanente_anterior)}</td>
                <td style={tdNumero}>{formato(item.iva_debito)}</td>
                <td style={tdNumero}>{formato(item.iva_credito)}</td>
                <td style={tdNumero}>{formato(item.iva_pagar)}</td>
                <td style={tdNumero}>
                  {formato(item.remanente_siguiente)}
                </td>
                <td style={td}>{item.observacion}</td>
              </tr>
            ))}

            {historial.length === 0 && (
              <tr>
                <td style={td} colSpan="7">
                  No hay controles guardados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const titulo = {
  fontSize: "30px",
  color: "#0f172a",
  marginBottom: "4px",
};

const subtitulo = {
  color: "#475569",
  marginBottom: "14px",
};

const filtrosBox = {
  display: "flex",
  alignItems: "end",
  gap: "12px",
  background: "white",
  padding: "14px",
  borderRadius: "14px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.07)",
  marginBottom: "16px",
  flexWrap: "wrap",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "#1e293b",
  marginBottom: "4px",
  fontSize: "14px",
};

const input = {
  padding: "9px",
  border: "1px solid #a9d8ef",
  borderRadius: "9px",
  minWidth: "150px",
  width: "100%",
  boxSizing: "border-box",
  fontSize: "14px",
};

const botonBuscar = {
  background: "#0369a1",
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonGuardar = {
  background: "#10b981",
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
};

const resumenBox = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "12px",
  marginBottom: "16px",
};

const cardResumen = {
  background: "white",
  borderRadius: "14px",
  padding: "14px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.07)",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
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

const determinacionBox = {
  background: "white",
  borderRadius: "16px",
  padding: "18px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.07)",
  marginBottom: "16px",
  overflowX: "auto",
};

const tituloSeccion = {
  color: "#0369a1",
  marginTop: 0,
  fontSize: "22px",
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

const tdFinal = {
  ...td,
  fontWeight: "bold",
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  color: "#0369a1",
};

const tdFinalNumero = {
  ...tdFinal,
  textAlign: "right",
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
  marginTop: "16px",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  padding: "14px",
  borderRadius: "12px",
  fontWeight: "bold",
};
