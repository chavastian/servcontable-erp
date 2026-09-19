import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerResumenIVA } from "../services/resumenIVAService";
import { obtenerPeriodoTrabajo } from "../services/periodoTrabajoService";
import { EstadoCargando } from "../components/EstadoPantalla";

export default function ResumenIVA() {
  const empresaActiva = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
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

      const data = await obtenerResumenIVA(empresaActiva.id, periodo);

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
        <h1 style={titulo}>Resumen IVA</h1>
        <div style={alerta}>
          Debes seleccionar una empresa activa antes de ver el resumen IVA.
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

  const resumen = datos?.resumen || {
    iva_debito: 0,
    iva_credito: 0,
    iva_no_recuperable: 0,
    iva_determinado: 0,
    iva_pagar: 0,
    remanente: 0,
  };

  return (
    <div>
      <h1 style={titulo}>Resumen IVA</h1>
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

        <button type="button" style={botonBuscar} onClick={cargarResumen}>
          Buscar
        </button>
      </div>

      {error && <p style={err}>{error}</p>}


      {cargando && <EstadoCargando mensaje="Cargando datos..." />}

      <div style={resumenBox}>
        <div style={cardResumen}>
          <strong>IVA Débito</strong>
          <span>{formato(resumen.iva_debito)}</span>
        </div>

        <div style={cardResumen}>
          <strong>IVA Crédito</strong>
          <span>{formato(resumen.iva_credito)}</span>
        </div>

        <div style={cardResumen}>
          <strong>IVA No Recuperable</strong>
          <span>{formato(resumen.iva_no_recuperable)}</span>
        </div>

        <div style={resumen.iva_pagar > 0 ? cardResumenError : cardResumenOk}>
          <strong>IVA a pagar</strong>
          <span>{formato(resumen.iva_pagar)}</span>
        </div>

        <div style={resumen.remanente > 0 ? cardResumenOk : cardResumen}>
          <strong>Remanente IVA</strong>
          <span>{formato(resumen.remanente)}</span>
        </div>
      </div>

      <div style={layout}>
        <div style={seccionBox}>
          <h2 style={tituloSeccion}>Ventas del período</h2>

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
          <h2 style={tituloSeccion}>Compras del período</h2>

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
                <td style={tdNumero}>{formato(compras.iva_no_recuperable)}</td>
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

      <div style={determinacionBox}>
        <h2 style={tituloSeccion}>Determinación IVA</h2>

        <p>
          <strong>IVA Débito:</strong> {formato(resumen.iva_debito)}
        </p>

        <p>
          <strong>Menos IVA Crédito:</strong> {formato(resumen.iva_credito)}
        </p>

        <p>
          <strong>IVA determinado:</strong>{" "}
          {formato(resumen.iva_determinado)}
        </p>

        {resumen.iva_pagar > 0 && (
          <h2 style={textoPagar}>
            IVA a pagar: {formato(resumen.iva_pagar)}
          </h2>
        )}

        {resumen.remanente > 0 && (
          <h2 style={textoRemanente}>
            Remanente IVA: {formato(resumen.remanente)}
          </h2>
        )}

        {resumen.iva_pagar === 0 && resumen.remanente === 0 && (
          <h2>IVA determinado en cero.</h2>
        )}
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
  color: "var(--sc-text)",
  marginBottom: "5px",
};

const input = {
  padding: "11px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "10px",
  minWidth: "160px",
};

const botonBuscar = {
  background: "var(--sc-azul)",
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
};

const tituloSeccion = {
  color: "var(--sc-azul)",
  marginTop: 0,
};

const tabla = {
  width: "100%",
  borderCollapse: "collapse",
};

const td = {
  padding: "12px",
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

const determinacionBox = {
  background: "var(--sc-fondo-claro)",
  border: "1px solid var(--sc-borde-claro)",
  borderRadius: "16px",
  padding: "22px",
  color: "var(--sc-text)",
};

const textoPagar = {
  color: "var(--sc-danger)",
};

const textoRemanente = {
  color: "var(--sc-teal)",
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
