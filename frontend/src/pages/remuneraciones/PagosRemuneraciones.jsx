import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../../services/empresaService";
import {
  obtenerPeriodoTrabajo,
  obtenerUltimoDiaPeriodo,
} from "../../services/periodoTrabajoService";
import PeriodoMesSelector from "../../components/PeriodoMesSelector";
import {
  obtenerPagosRemuneraciones,
  registrarPagoRemuneracion,
  anularPagoRemuneracion,
} from "../../services/pagosRemuneracionesService";

export default function PagosRemuneraciones() {
  const empresaActiva = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [fecha, setFecha] = useState(obtenerUltimoDiaPeriodo(obtenerPeriodoTrabajo()));
  const [tipoPago, setTipoPago] = useState("SUELDOS");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [resumen, setResumen] = useState([]);
  const [pagos, setPagos] = useState([]);

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (empresaActiva) {
      cargarDatos();
    }
  }, []);

  useEffect(() => {
    setFecha(obtenerUltimoDiaPeriodo(periodo));
  }, [periodo]);

  async function cargarDatos() {
    try {
      setMensaje("");
      setError("");

      const data = await obtenerPagosRemuneraciones(empresaActiva.id, periodo);

      setResumen(data.resumen || []);
      setPagos(data.pagos || []);
    } catch (err) {
      setError(err.message);
    }
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  function fechaCL(fechaTexto) {
    if (!fechaTexto) return "";
    const texto = String(fechaTexto).substring(0, 10);
    const partes = texto.split("-");
    if (partes.length !== 3) return texto;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  function obtenerSaldoTipo(tipo) {
    const item = resumen.find((r) => r.tipo_pago === tipo);
    return Number(item?.saldo_pendiente || 0);
  }

  function cargarMontoPendiente() {
    const saldo = obtenerSaldoTipo(tipoPago);
    setMonto(saldo > 0 ? saldo : 0);
  }

  async function guardarPago(e) {
    e.preventDefault();

    try {
      setMensaje("");
      setError("");

      const data = await registrarPagoRemuneracion({
        empresa_id: empresaActiva.id,
        periodo,
        fecha,
        tipo_pago: tipoPago,
        monto: Number(monto || 0),
        descripcion:
          descripcion ||
          `Pago ${tipoPago} remuneraciones período ${periodo}`,
      });

      setMensaje(
        `${data.mensaje}. Comprobante N° ${data.comprobante.numero}`
      );

      setMonto("");
      setDescripcion("");

      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function anularPago(id) {
    const confirmar = window.confirm(
      "¿Seguro deseas anular este pago de remuneraciones?"
    );

    if (!confirmar) return;

    try {
      setMensaje("");
      setError("");

      const data = await anularPagoRemuneracion(id, empresaActiva.id);
      setMensaje(data.mensaje);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <div style={card}>
        <h2 style={tituloSeccion}>Pago de Remuneraciones</h2>

        <div style={filtros}>
          <div>
            <label style={label}>Período</label>
            <PeriodoMesSelector style={input} value={periodo} onChange={setPeriodo} />
          </div>

          <button type="button" style={botonBuscar} onClick={cargarDatos}>
            Buscar obligaciones
          </button>
        </div>
      </div>

      <div style={gridResumen}>
        {resumen.map((item) => (
          <div
            key={item.tipo_pago}
            style={
              Number(item.saldo_pendiente || 0) <= 0
                ? cardResumenVerde
                : cardResumen
            }
          >
            <strong>{item.descripcion}</strong>
            <span>Obligación: {formato(item.total_obligacion)}</span>
            <span>Pagado: {formato(item.total_pagado)}</span>
            <span>
              <strong>Saldo: {formato(item.saldo_pendiente)}</strong>
            </span>
          </div>
        ))}
      </div>

      <form style={card} onSubmit={guardarPago}>
        <h2 style={tituloSeccion}>Registrar pago</h2>

        <div style={grid}>
          <div>
            <label style={label}>Fecha pago</label>
            <input
              style={input}
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>

          <div>
            <label style={label}>Tipo de pago</label>
            <select
              style={input}
              value={tipoPago}
              onChange={(e) => setTipoPago(e.target.value)}
            >
              <option value="SUELDOS">Sueldos líquidos</option>
              <option value="AFP">AFP / SIS</option>
              <option value="SALUD">Salud</option>
              <option value="AFC">AFC</option>
              <option value="MUTUAL">Mutual</option>
            </select>
          </div>

          <div>
            <label style={label}>Monto</label>
            <input
              style={input}
              type="number"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>

          <div>
            <label style={label}>Acción rápida</label>
            <button type="button" style={botonPendiente} onClick={cargarMontoPendiente}>
              Usar saldo pendiente
            </button>
          </div>
        </div>

        <div style={{ marginTop: "14px" }}>
          <label style={label}>Glosa / descripción</label>
          <input
            style={inputFull}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: Pago sueldos líquidos mayo 2026"
          />
        </div>

        <button style={botonGuardar} type="submit">
          Registrar y contabilizar pago
        </button>
      </form>

      <div style={card}>
        <h2 style={tituloSeccion}>Pagos registrados</h2>

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Fecha</th>
                <th style={th}>Tipo</th>
                <th style={th}>Descripción</th>
                <th style={thNumero}>Monto</th>
                <th style={th}>Cuenta debe</th>
                <th style={th}>Cuenta haber</th>
                <th style={th}>Comprobante</th>
                <th style={thAccion}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {pagos.map((item) => (
                <tr key={item.id}>
                  <td style={td}>{fechaCL(item.fecha)}</td>
                  <td style={td}>{item.tipo_pago}</td>
                  <td style={td}>{item.descripcion}</td>
                  <td style={tdNumero}>{formato(item.monto)}</td>
                  <td style={td}>
                    {item.cuenta_debe_codigo} - {item.cuenta_debe_nombre}
                  </td>
                  <td style={td}>
                    {item.cuenta_haber_codigo} - {item.cuenta_haber_nombre}
                  </td>
                  <td style={td}>
                    {item.comprobante_id
                      ? item.comprobante_numero || item.comprobante_id
                      : "-"}
                  </td>
                  <td style={tdAccion}>
                    <button type="button"
                      style={botonEliminar}
                      onClick={() => anularPago(item.id)}
                      title="Anular pago"
                      aria-label="Anular pago"
                    >
                      {"\u2715"}
                    </button>
                  </td>
                </tr>
              ))}

              {pagos.length === 0 && (
                <tr>
                  <td style={td} colSpan="8">
                    No hay pagos de remuneraciones registrados para este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const card = {
  background: "white",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "20px",
};

const tituloSeccion = {
  color: "#0369a1",
  marginTop: 0,
};

const filtros = {
  display: "flex",
  alignItems: "end",
  gap: "12px",
  flexWrap: "wrap",
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "14px",
};

const gridResumen = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: "14px",
  marginBottom: "20px",
};

const cardResumen = {
  background: "white",
  borderRadius: "16px",
  padding: "16px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  display: "flex",
  flexDirection: "column",
  gap: "7px",
  color: "#1e293b",
  border: "1px solid #f59e0b",
};

const cardResumenVerde = {
  ...cardResumen,
  border: "1px solid #22c55e",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "#1e293b",
  marginBottom: "5px",
};

const input = {
  width: "100%",
  padding: "10px",
  border: "1px solid #a9d8ef",
  borderRadius: "10px",
  height: "40px",
  boxSizing: "border-box",
};

const inputFull = {
  ...input,
  width: "100%",
};

const botonBase = {
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const botonBuscar = {
  ...botonBase,
  background: "#0369a1",
};

const botonPendiente = {
  ...botonBase,
  background: "#0ea5e9",
  width: "100%",
};

const botonGuardar = {
  ...botonBase,
  background: "#10b981",
  marginTop: "18px",
  height: "42px",
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
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  color: "#0369a1",
  whiteSpace: "nowrap",
};

const thNumero = {
  ...th,
  textAlign: "right",
};

const thAccion = {
  ...th,
  textAlign: "center",
};

const td = {
  padding: "9px",
  borderBottom: "1px solid #e2e8f0",
  color: "#1e293b",
};

const tdNumero = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const tdAccion = {
  ...td,
  textAlign: "center",
  whiteSpace: "nowrap",
};

const botonEliminar = {
  background: "linear-gradient(135deg, #ef4444, #f97316)",
  color: "white",
  border: "none",
  width: "32px",
  height: "32px",
  padding: 0,
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
  fontSize: "15px",
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const ok = {
  color: "#10b981",
  fontWeight: "bold",
};

const err = {
  color: "#ef4444",
  fontWeight: "bold",
};
