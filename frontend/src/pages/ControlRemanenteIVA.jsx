import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerPeriodoTrabajo } from "../services/periodoTrabajoService";
import PeriodoMesSelector from "../components/PeriodoMesSelector";
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

  // El remanente anterior viene encadenado en UTM desde el mes previo. Solo el
  // primer periodo de la cadena admite digitarlo: es el punto de partida de
  // una empresa que llega con remanente desde otro sistema.
  const permiteInicial = Boolean(resumen.permite_remanente_inicial);
  const remanenteAplicado = permiteInicial
    ? Number(remanenteAnterior || 0)
    : Number(resumen.remanente_anterior || 0);

  const ivaDisponible = Number(resumen.iva_credito || 0) + remanenteAplicado;

  const ivaDeterminado = Number(resumen.iva_debito || 0) - ivaDisponible;

  const ivaPagarCalculado = ivaDeterminado > 0 ? ivaDeterminado : 0;
  const remanenteSiguienteCalculado =
    ivaDeterminado < 0 ? Math.abs(ivaDeterminado) : 0;
  const utm = Number(resumen.valor_utm || 0);

  return (
    <div>
      <h1 style={titulo}>Control Remanente IVA</h1>
      <p style={subtitulo}>
        Empresa activa: <strong>{empresaActiva.razon_social}</strong>
      </p>

      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}
      {(resumen.avisos || []).length > 0 && (
        <ul style={{ ...alerta, marginTop: 0, paddingLeft: 32 }}>
          {resumen.avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      )}

      <form style={filtrosBox} onSubmit={guardarControl}>
        <div>
          <label style={label} htmlFor="remanente-periodo">Período</label>
          <PeriodoMesSelector
            id="remanente-periodo"
            style={input}
            value={periodo}
            onChange={setPeriodo}
            permitirOtroAnio
          />
        </div>

        <div>
          <label style={label}>
            Remanente anterior{" "}
            {permiteInicial ? "(inicial, a mano)" : "(viene del mes anterior)"}
          </label>
          <input
            style={input}
            type="number"
            value={permiteInicial ? remanenteAnterior : remanenteAplicado}
            onChange={(e) => setRemanenteAnterior(e.target.value)}
            placeholder="0"
            readOnly={!permiteInicial}
            title={
              permiteInicial
                ? "Primer período de la cadena: puedes indicar el remanente con que llega la empresa."
                : "Se arrastra en UTM desde el período anterior. Corrige ese período si difiere."
            }
          />
          {utm > 0 ? (
            <span style={{ fontSize: 12, color: "var(--sc-gris)" }}>
              {Number(resumen.remanente_anterior_utm || 0).toLocaleString("es-CL")} UTM a {utm.toLocaleString("es-CL")}
            </span>
          ) : null}
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
          <span>{formato(remanenteAplicado)}</span>
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
              <td style={tdNumero}>{formato(remanenteAplicado)}</td>
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
                {utm > 0 ? (
                  <span style={{ display: "block", fontSize: 12, fontWeight: "normal" }}>
                    {(remanenteSiguienteCalculado / utm).toFixed(4)} UTM
                  </span>
                ) : null}
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
              <th style={th}>UTM</th>
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
                <td style={tdNumero}>
                  {item.remanente_siguiente_utm !== null && item.remanente_siguiente_utm !== undefined
                    ? Number(item.remanente_siguiente_utm).toLocaleString("es-CL")
                    : "—"}
                </td>
                <td style={td}>{item.observacion}</td>
              </tr>
            ))}

            {historial.length === 0 && (
              <tr>
                <td style={td} colSpan="8">
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
  color: "var(--sc-ink)",
  marginBottom: "4px",
};

const subtitulo = {
  color: "var(--sc-gris)",
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
  color: "var(--sc-text)",
  marginBottom: "4px",
  fontSize: "14px",
};

const input = {
  padding: "9px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "9px",
  minWidth: "150px",
  width: "100%",
  boxSizing: "border-box",
  fontSize: "14px",
};

const botonBuscar = {
  background: "var(--sc-azul)",
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonGuardar = {
  background: "var(--sc-teal)",
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

const determinacionBox = {
  background: "white",
  borderRadius: "16px",
  padding: "18px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.07)",
  marginBottom: "16px",
  overflowX: "auto",
};

const tituloSeccion = {
  color: "var(--sc-azul)",
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
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  color: "var(--sc-azul)",
};

const td = {
  padding: "10px",
  borderBottom: "1px solid var(--sc-borde-claro)",
  color: "var(--sc-text)",
};

const tdNumero = {
  ...td,
  textAlign: "right",
};

const tdTotal = {
  ...td,
  fontWeight: "bold",
  background: "var(--sc-fondo-claro)",
};

const tdTotalNumero = {
  ...tdNumero,
  fontWeight: "bold",
  background: "var(--sc-fondo-claro)",
};

const tdFinal = {
  ...td,
  fontWeight: "bold",
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  color: "var(--sc-azul)",
};

const tdFinalNumero = {
  ...tdFinal,
  textAlign: "right",
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
  marginTop: "16px",
  background: "var(--sc-naranja-fondo)",
  border: "1px solid #fed7aa",
  color: "var(--sc-naranja-texto)",
  padding: "14px",
  borderRadius: "12px",
  fontWeight: "bold",
};
