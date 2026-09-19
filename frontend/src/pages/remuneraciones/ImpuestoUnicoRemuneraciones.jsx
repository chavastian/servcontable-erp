import { useEffect, useMemo, useState } from "react";
import { obtenerEmpresaActiva } from "../../services/empresaService";
import { obtenerPeriodoTrabajo } from "../../services/periodoTrabajoService";
import PeriodoMesSelector from "../../components/PeriodoMesSelector";
import {
  listarTramosImpuestoUnico,
  guardarTramoImpuestoUnico,
  eliminarTramoImpuestoUnico,
  eliminarTramosPeriodo,
} from "../../services/impuestoUnicoService";

const TRAMOS_UICOLES = [
  {
    id: "1",
    nombre: "Tramo 1 - Exento",
    desdeUtm: 0,
    hastaUtm: 13.5,
    factor: 0,
    rebajaUtm: 0,
  },
  {
    id: "2",
    nombre: "Tramo 2 - 4%",
    desdeUtm: 13.5,
    hastaUtm: 30,
    factor: 0.04,
    rebajaUtm: 0.54,
  },
  {
    id: "3",
    nombre: "Tramo 3 - 8%",
    desdeUtm: 30,
    hastaUtm: 50,
    factor: 0.08,
    rebajaUtm: 1.74,
  },
  {
    id: "4",
    nombre: "Tramo 4 - 13.5%",
    desdeUtm: 50,
    hastaUtm: 70,
    factor: 0.135,
    rebajaUtm: 4.49,
  },
  {
    id: "5",
    nombre: "Tramo 5 - 23%",
    desdeUtm: 70,
    hastaUtm: 90,
    factor: 0.23,
    rebajaUtm: 11.14,
  },
  {
    id: "6",
    nombre: "Tramo 6 - 30.4%",
    desdeUtm: 90,
    hastaUtm: 120,
    factor: 0.304,
    rebajaUtm: 17.8,
  },
  {
    id: "7",
    nombre: "Tramo 7 - 35%",
    desdeUtm: 120,
    hastaUtm: 310,
    factor: 0.35,
    rebajaUtm: 23.32,
  },
  {
    id: "8",
    nombre: "Tramo 8 - 40%",
    desdeUtm: 310,
    hastaUtm: 0,
    factor: 0.4,
    rebajaUtm: 38.82,
  },
];

function calcularTramoEnPesos(definicion, valorUtm) {
  const utm = Number(valorUtm || 0);
  const topeInicial = Math.round(definicion.desdeUtm * utm);

  return {
    desde: definicion.desdeUtm === 0 ? 0 : topeInicial + 1,
    hasta: definicion.hastaUtm > 0 ? Math.round(definicion.hastaUtm * utm) : 0,
    factor: definicion.factor,
    rebaja: Math.round(definicion.rebajaUtm * utm),
  };
}

function normalizarFactor(factor) {
  const valor = Number(factor || 0);
  return valor > 1 && valor <= 100 ? valor / 100 : valor;
}

export default function ImpuestoUnicoRemuneraciones() {
  const empresaActiva = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [tramos, setTramos] = useState([]);
  const [valorUtm, setValorUtm] = useState(68000);
  const [tramoPlantilla, setTramoPlantilla] = useState("");
  const [basePrueba, setBasePrueba] = useState("");

  const [formulario, setFormulario] = useState({
    desde: "",
    hasta: "",
    factor: "",
    rebaja: "",
  });

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const calculoPrueba = useMemo(() => {
    const base = Number(basePrueba || 0);

    if (base <= 0) {
      return null;
    }

    const tramo = tramos.find((item) => {
      const desde = Number(item.desde || 0);
      const hasta = Number(item.hasta || 0);
      return base >= desde && (hasta === 0 || base <= hasta);
    });

    if (!tramo) {
      return {
        base,
        tramo: null,
        impuesto: 0,
      };
    }

    const factor = normalizarFactor(tramo.factor);
    const rebaja = Number(tramo.rebaja || 0);
    const impuesto = Math.max(0, Math.round(base * factor - rebaja));

    return {
      base,
      tramo: {
        ...tramo,
        factor,
      },
      impuesto,
    };
  }, [basePrueba, tramos]);

  useEffect(() => {
    if (empresaActiva) {
      cargarTramos();
    }
  }, []);

  async function cargarTramos() {
    try {
      setMensaje("");
      setError("");

      const data = await listarTramosImpuestoUnico(empresaActiva.id, periodo);

      setTramos(data.tramos || []);
      setMensaje("Tramos de impuesto unico cargados correctamente.");
    } catch (err) {
      setError(err.message);
    }
  }

  function cambiarFormulario(e) {
    const { name, value } = e.target;

    setFormulario((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function autocompletarTramo(e) {
    const id = e.target.value;
    setTramoPlantilla(id);

    if (!id) return;

    const tramo = TRAMOS_UICOLES.find((item) => item.id === id);
    if (!tramo) return;

    const utm = Number(valorUtm || 0);
    if (utm <= 0) {
      setError("Debes indicar el valor UTM del periodo para autocompletar.");
      return;
    }

    const valores = calcularTramoEnPesos(tramo, utm);
    setFormulario({
      desde: valores.desde,
      hasta: valores.hasta,
      factor: valores.factor,
      rebaja: valores.rebaja,
    });
    setError("");
    setMensaje(`${tramo.nombre} autocompletado con UTM $${utm.toLocaleString("es-CL")}.`);
  }

  function limpiarFormulario() {
    setTramoPlantilla("");
    setFormulario({
      desde: "",
      hasta: "",
      factor: "",
      rebaja: "",
    });
  }

  async function guardar(e) {
    e.preventDefault();

    try {
      setMensaje("");
      setError("");

      const data = await guardarTramoImpuestoUnico({
        empresa_id: empresaActiva.id,
        periodo,
        desde: Number(formulario.desde || 0),
        hasta: Number(formulario.hasta || 0),
        factor: Number(formulario.factor || 0),
        rebaja: Number(formulario.rebaja || 0),
      });

      setMensaje(data.mensaje);
      limpiarFormulario();
      await cargarTramos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function eliminar(id) {
    const confirmar = window.confirm("Seguro deseas eliminar este tramo?");
    if (!confirmar) return;

    try {
      setMensaje("");
      setError("");

      const data = await eliminarTramoImpuestoUnico(id, empresaActiva.id);
      setMensaje(data.mensaje);
      await cargarTramos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function eliminarPeriodo() {
    const confirmar = window.confirm(
      `Seguro deseas eliminar todos los tramos del periodo ${periodo}?`
    );
    if (!confirmar) return;

    try {
      setMensaje("");
      setError("");

      const data = await eliminarTramosPeriodo(empresaActiva.id, periodo);
      setMensaje(data.mensaje);
      await cargarTramos();
    } catch (err) {
      setError(err.message);
    }
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  function porcentaje(valor) {
    return `${Number(valor || 0).toLocaleString("es-CL", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    })}`;
  }

  return (
    <div>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <div style={card}>
        <h2 style={tituloSeccion}>Impuesto Unico de Segunda Categoria</h2>

        <div style={alerta}>
          Ingresa los tramos mensuales del impuesto unico para el periodo.
        </div>

        <div style={filtros}>
          <div>
            <label style={label}>Periodo</label>
            <PeriodoMesSelector style={input} value={periodo} onChange={setPeriodo} />
          </div>

          <button type="button" style={botonBuscar} onClick={cargarTramos}>
            Buscar tramos
          </button>

          <button type="button" style={botonEliminarPeriodo} onClick={eliminarPeriodo}>
            Eliminar tramos periodo
          </button>
        </div>
      </div>

      <form style={card} onSubmit={guardar}>
        <h2 style={tituloSeccion}>Agregar tramo</h2>

        <div style={grid}>
          <div>
            <label style={label}>Valor UTM periodo</label>
            <input
              style={input}
              type="number"
              name="valor_utm"
              value={valorUtm}
              onChange={(e) => setValorUtm(e.target.value)}
            />
          </div>

          <div>
            <label style={label}>Tramo oficial</label>
            <select
              style={input}
              value={tramoPlantilla}
              onChange={autocompletarTramo}
            >
              <option value="">Seleccionar tramo</option>
              {TRAMOS_UICOLES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label}>Desde</label>
            <input
              style={input}
              type="number"
              name="desde"
              value={formulario.desde}
              onChange={cambiarFormulario}
            />
          </div>

          <div>
            <label style={label}>Hasta</label>
            <input
              style={input}
              type="number"
              name="hasta"
              value={formulario.hasta}
              onChange={cambiarFormulario}
              placeholder="0 si es sin tope"
            />
          </div>

          <div>
            <label style={label}>Factor</label>
            <input
              style={input}
              type="number"
              step="0.000001"
              name="factor"
              value={formulario.factor}
              onChange={cambiarFormulario}
              placeholder="Ej: 0.04"
            />
          </div>

          <div>
            <label style={label}>Rebaja</label>
            <input
              style={input}
              type="number"
              name="rebaja"
              value={formulario.rebaja}
              onChange={cambiarFormulario}
            />
          </div>
        </div>

        <button style={botonGuardar} type="submit">
          Guardar tramo
        </button>
      </form>

      <div style={card}>
        <h2 style={tituloSeccion}>Tramos configurados</h2>

        <div style={simuladorBox}>
          <div>
            <label style={label}>Probar sueldo/base tributable</label>
            <input
              style={input}
              type="number"
              value={basePrueba}
              onChange={(e) => setBasePrueba(e.target.value)}
              placeholder="Ej: 638295"
            />
          </div>

          <div style={resultadoSimulador}>
            {!calculoPrueba ? (
              <span>Ingresa una base para buscar su tramo.</span>
            ) : calculoPrueba.tramo ? (
              <>
                <strong>
                  Tramo: {formato(calculoPrueba.tramo.desde)} a{" "}
                  {Number(calculoPrueba.tramo.hasta || 0) === 0
                    ? "sin tope"
                    : formato(calculoPrueba.tramo.hasta)}
                </strong>
                <span>
                  Factor {porcentaje(calculoPrueba.tramo.factor)} | Rebaja{" "}
                  {formato(calculoPrueba.tramo.rebaja)} | Impuesto{" "}
                  <strong>{formato(calculoPrueba.impuesto)}</strong>
                </span>
              </>
            ) : (
              <strong>No hay tramo configurado para esta base.</strong>
            )}
          </div>
        </div>

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Desde</th>
                <th style={th}>Hasta</th>
                <th style={th}>Factor</th>
                <th style={th}>Rebaja</th>
                <th style={thAccion}>Accion</th>
              </tr>
            </thead>

            <tbody>
              {tramos.map((item) => (
                <tr key={item.id}>
                  <td style={td}>{formato(item.desde)}</td>
                  <td style={td}>
                    {Number(item.hasta || 0) === 0
                      ? "Sin tope"
                      : formato(item.hasta)}
                  </td>
                  <td style={td}>{porcentaje(item.factor)}</td>
                  <td style={td}>{formato(item.rebaja)}</td>
                  <td style={tdAccion}>
                    <button type="button"
                      style={botonEliminar}
                      onClick={() => eliminar(item.id)}
                      title="Eliminar tramo"
                      aria-label="Eliminar tramo"
                    >
                      {"\u2715"}
                    </button>
                  </td>
                </tr>
              ))}

              {tramos.length === 0 && (
                <tr>
                  <td style={td} colSpan="5">
                    No hay tramos configurados para este periodo.
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

const alerta = {
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  padding: "12px",
  borderRadius: "12px",
  marginBottom: "16px",
  fontWeight: "bold",
};

const filtros = {
  display: "flex",
  alignItems: "end",
  gap: "12px",
  flexWrap: "wrap",
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
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

const botonEliminarPeriodo = {
  ...botonBase,
  background: "#f97316",
};

const botonGuardar = {
  marginTop: "18px",
  background: "#10b981",
  color: "white",
  border: "none",
  padding: "12px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const simuladorBox = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 320px) 1fr",
  gap: "12px",
  alignItems: "end",
  marginBottom: "14px",
  padding: "12px",
  border: "1px solid #bae6fd",
  borderRadius: "14px",
  background: "linear-gradient(135deg, #f0f9ff, #ecfeff)",
};

const resultadoSimulador = {
  minHeight: "40px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "4px",
  color: "#0369a1",
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

const thAccion = {
  ...th,
  textAlign: "center",
};

const td = {
  padding: "9px",
  borderBottom: "1px solid #e2e8f0",
  color: "#1e293b",
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
