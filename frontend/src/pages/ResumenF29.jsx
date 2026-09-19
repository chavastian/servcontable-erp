import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerResumenF29 } from "../services/resumenF29Service";
import { obtenerPeriodoTrabajo } from "../services/periodoTrabajoService";
import { EstadoCargando } from "../components/EstadoPantalla";

export default function ResumenF29() {
  const empresaActiva = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [tasaPPM, setTasaPPM] = useState("0.25");
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  // Distingue "esperando" de "no hay datos": sin esto la tabla en blanco
  // significa las dos cosas a la vez.
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (empresaActiva) {
      cargarResumen();
    }
  }, []);

  async function cargarResumen() {
    try {
      setCargando(true);
      setError("");

      const data = await obtenerResumenF29(
        empresaActiva.id,
        periodo,
        tasaPPM
      );

      setDatos(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  if (!empresaActiva) {
    return (
      <div>
        <h1 style={titulo}>Resumen F29</h1>
        <div style={alerta}>
          Debes seleccionar una empresa activa antes de ver el resumen F29.
        </div>
      </div>
    );
  }

  const ventas = datos?.ventas || {
    neto: 0,
    exento: 0,
    iva_debito: 0,
    total: 0,
  };

  const compras = datos?.compras || {
    neto: 0,
    exento: 0,
    iva_credito: 0,
    iva_no_recuperable: 0,
    total: 0,
  };

  const iva = datos?.iva || {
    iva_debito: 0,
    iva_credito: 0,
    iva_determinado: 0,
    iva_pagar: 0,
    remanente: 0,
  };

  const ppm = datos?.ppm || {
    base_ppm: 0,
    tasa_ppm: Number(tasaPPM || 0),
    monto_ppm: 0,
  };

  const honorarios = datos?.honorarios || {
    bruto: 0,
    retencion: 0,
    liquido: 0,
  };

  const totalF29Estimado = datos?.total_f29_estimado || 0;

  return (
    <div>
      <h1 style={titulo}>Resumen F29</h1>
      <p style={subtitulo}>
        Empresa activa: <strong>{empresaActiva.razon_social}</strong>
      </p>

      <div style={filtrosBox}>
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
          <label style={label}>Tasa PPM %</label>
          <input
            style={input}
            type="number"
            step="0.01"
            value={tasaPPM}
            onChange={(e) => setTasaPPM(e.target.value)}
            placeholder="0.25"
          />
        </div>

        <button type="button" style={botonBuscar} onClick={cargarResumen}>
          Calcular
        </button>
      </div>

      {error && <p style={err}>{error}</p>}


      {cargando && <EstadoCargando mensaje="Cargando datos..." />}

      <div style={resumenBox}>
        <div style={cardResumen}>
          <strong>IVA Débito</strong>
          <span>{formato(iva.iva_debito)}</span>
        </div>

        <div style={cardResumen}>
          <strong>IVA Crédito</strong>
          <span>{formato(iva.iva_credito)}</span>
        </div>

        <div style={iva.iva_pagar > 0 ? cardResumenError : cardResumenOk}>
          <strong>IVA a pagar</strong>
          <span>{formato(iva.iva_pagar)}</span>
        </div>

        <div style={iva.remanente > 0 ? cardResumenOk : cardResumen}>
          <strong>Remanente IVA</strong>
          <span>{formato(iva.remanente)}</span>
        </div>

        <div style={cardResumen}>
          <strong>PPM estimado</strong>
          <span>{formato(ppm.monto_ppm)}</span>
        </div>

        <div style={cardResumen}>
          <strong>Retención honorarios</strong>
          <span>{formato(honorarios.retencion)}</span>
        </div>

        <div style={cardResumenTotal}>
          <strong>Total F29 estimado</strong>
          <span>{formato(totalF29Estimado)}</span>
        </div>
      </div>

      <div style={layout}>
        <div style={seccionBox}>
          <h2 style={tituloSeccion}>Base de ventas</h2>

          <div className="sc-tabla-scroll">

            <table style={tabla}>
            <tbody>
              <tr>
                <td style={td}>Ventas netas afectas</td>
                <td style={tdNumero}>{formato(ventas.neto)}</td>
              </tr>
              <tr>
                <td style={td}>Ventas exentas</td>
                <td style={tdNumero}>{formato(ventas.exento)}</td>
              </tr>
              <tr>
                <td style={td}>IVA Débito Fiscal</td>
                <td style={tdNumero}>{formato(ventas.iva_debito)}</td>
              </tr>
              <tr>
                <td style={tdTotal}>Total ventas</td>
                <td style={tdTotalNumero}>{formato(ventas.total)}</td>
              </tr>
            </tbody>
            </table>
          </div>
        </div>

        <div style={seccionBox}>
          <h2 style={tituloSeccion}>Base de compras</h2>

          <div className="sc-tabla-scroll">

            <table style={tabla}>
            <tbody>
              <tr>
                <td style={td}>Compras netas afectas</td>
                <td style={tdNumero}>{formato(compras.neto)}</td>
              </tr>
              <tr>
                <td style={td}>Compras exentas</td>
                <td style={tdNumero}>{formato(compras.exento)}</td>
              </tr>
              <tr>
                <td style={td}>IVA Crédito Fiscal</td>
                <td style={tdNumero}>{formato(compras.iva_credito)}</td>
              </tr>
              <tr>
                <td style={td}>IVA No Recuperable</td>
                <td style={tdNumero}>
                  {formato(compras.iva_no_recuperable)}
                </td>
              </tr>
              <tr>
                <td style={tdTotal}>Total compras</td>
                <td style={tdTotalNumero}>{formato(compras.total)}</td>
              </tr>
            </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={seccionBox}>
        <h2 style={tituloSeccion}>Determinación estimada F29</h2>

        <div className="sc-tabla-scroll">

          <table style={tabla}>
          <tbody>
            <tr>
              <td style={td}>IVA Débito Fiscal</td>
              <td style={tdNumero}>{formato(iva.iva_debito)}</td>
            </tr>

            <tr>
              <td style={td}>Menos IVA Crédito Fiscal</td>
              <td style={tdNumero}>{formato(iva.iva_credito)}</td>
            </tr>

            <tr>
              <td style={tdTotal}>IVA determinado</td>
              <td style={tdTotalNumero}>{formato(iva.iva_determinado)}</td>
            </tr>

            <tr>
              <td style={td}>IVA a pagar</td>
              <td style={tdNumero}>{formato(iva.iva_pagar)}</td>
            </tr>

            <tr>
              <td style={td}>Remanente IVA</td>
              <td style={tdNumero}>{formato(iva.remanente)}</td>
            </tr>

            <tr>
              <td style={td}>Base PPM</td>
              <td style={tdNumero}>{formato(ppm.base_ppm)}</td>
            </tr>

            <tr>
              <td style={td}>Tasa PPM aplicada</td>
              <td style={tdNumero}>{Number(ppm.tasa_ppm || 0)}%</td>
            </tr>

            <tr>
              <td style={td}>PPM estimado</td>
              <td style={tdNumero}>{formato(ppm.monto_ppm)}</td>
            </tr>

            <tr>
              <td style={td}>Retención honorarios</td>
              <td style={tdNumero}>{formato(honorarios.retencion)}</td>
            </tr>

            <tr>
              <td style={tdFinal}>Total F29 estimado</td>
              <td style={tdFinalNumero}>{formato(totalF29Estimado)}</td>
            </tr>
          </tbody>
          </table>
        </div>

        <p style={nota}>
          Este resumen es una estimación interna del sistema. No reemplaza la
          revisión del formulario oficial ni otros códigos que puedan aplicar.
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

const filtrosBox = {
  display: "flex",
  alignItems: "end",
  gap: "15px",
  background: "white",
  padding: "18px",
  borderRadius: "16px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "20px",
  flexWrap: "wrap",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "#1e293b",
  marginBottom: "5px",
};

const input = {
  padding: "11px",
  border: "1px solid #a9d8ef",
  borderRadius: "10px",
  minWidth: "160px",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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

const cardResumenTotal = {
  ...cardResumen,
  border: "2px solid #0ea5e9",
};

const layout = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "20px",
  marginBottom: "20px",
};

const seccionBox = {
  background: "white",
  borderRadius: "18px",
  padding: "25px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "20px",
};

const tituloSeccion = {
  color: "#0369a1",
  marginTop: 0,
};

const tabla = {
  width: "100%",
  borderCollapse: "collapse",
};

const td = {
  padding: "12px",
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
  fontSize: "18px",
};

const tdFinalNumero = {
  ...tdFinal,
  textAlign: "right",
};

const nota = {
  marginTop: "15px",
  color: "#475569",
  fontSize: "14px",
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
