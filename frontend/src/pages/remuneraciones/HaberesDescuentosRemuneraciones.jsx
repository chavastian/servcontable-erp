import { useEffect, useMemo, useState } from "react";
import { obtenerEmpresaActiva } from "../../services/empresaService";
import { listarTrabajadores } from "../../services/trabajadoresService";
import { obtenerPeriodoTrabajo } from "../../services/periodoTrabajoService";
import PeriodoMesSelector from "../../components/PeriodoMesSelector";
import {
  listarHaberesDescuentos,
  crearHaberDescuento,
  actualizarHaberDescuento,
  cambiarRecurrenteHaberDescuento,
  eliminarHaberDescuento,
} from "../../services/haberesDescuentosService";

const FORMULARIO_INICIAL = {
  trabajador_id: "",
  nombre: "",
  tipo: "HABER_IMPONIBLE",
  monto: "",
  imponible: true,
  tributable: true,
  afecta_descuentos: true,
  observacion: "",
  recurrente: false,
};

export default function HaberesDescuentosRemuneraciones() {
  const empresaActiva = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [trabajadores, setTrabajadores] = useState([]);
  const [items, setItems] = useState([]);
  const [editandoId, setEditandoId] = useState(null);

  const [totales, setTotales] = useState({
    haberes_imponibles: 0,
    haberes_no_imponibles: 0,
    descuentos: 0,
    total_general: 0,
  });

  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL);

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const conceptosSugeridos = useMemo(() => {
    const unicos = new Set();

    for (const item of items) {
      const nombre = String(item?.nombre || "").trim();
      if (!nombre) continue;
      if (item.tipo !== formulario.tipo) continue;
      unicos.add(nombre);
    }

    return Array.from(unicos).sort((a, b) => a.localeCompare(b, "es"));
  }, [items, formulario.tipo]);


  useEffect(() => {
    if (empresaActiva) {
      cargarDatos();
    }
  }, []);

  async function cargarDatos() {
    try {
      setMensaje("");
      setError("");

      const trabajadoresData = await listarTrabajadores(
        empresaActiva.id,
        "activo"
      );

      const haberesData = await listarHaberesDescuentos(
        empresaActiva.id,
        periodo,
        "",
        true
      );

      setTrabajadores(trabajadoresData.trabajadores || []);
      setItems(haberesData.items || []);
      setTotales(
        haberesData.totales || {
          haberes_imponibles: 0,
          haberes_no_imponibles: 0,
          descuentos: 0,
          total_general: 0,
        }
      );
    } catch (err) {
      setError(err.message);
    }
  }

  function cambiarFormulario(e) {
    const { name, value, type, checked } = e.target;

    setFormulario((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function cambiarTipo(e) {
    const tipo = e.target.value;

    let valores = {
      tipo,
      imponible: false,
      tributable: false,
      afecta_descuentos: false,
    };

    if (tipo === "HABER_IMPONIBLE") {
      valores = {
        tipo,
        imponible: true,
        tributable: true,
        afecta_descuentos: true,
      };
    }

    setFormulario((prev) => ({
      ...prev,
      ...valores,
    }));
  }

  function limpiarFormulario() {
    setFormulario(FORMULARIO_INICIAL);
    setEditandoId(null);
  }

  function iniciarEdicion(item) {
    setEditandoId(item.id);
    setFormulario({
      trabajador_id: String(item.trabajador_id || ""),
      nombre: item.nombre || "",
      tipo: item.tipo || "HABER_IMPONIBLE",
      monto: Number(item.monto || 0),
      imponible: Boolean(item.imponible),
      tributable: Boolean(item.tributable),
      afecta_descuentos: Boolean(item.afecta_descuentos),
      observacion: item.observacion || "",
      recurrente: Boolean(item.recurrente),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function guardar(e) {
    e.preventDefault();

    try {
      setMensaje("");
      setError("");

      const payload = {
        empresa_id: empresaActiva.id,
        trabajador_id: Number(formulario.trabajador_id),
        periodo,
        nombre: formulario.nombre,
        tipo: formulario.tipo,
        monto: Number(formulario.monto || 0),
        imponible: formulario.imponible,
        tributable: formulario.tributable,
        afecta_descuentos: formulario.afecta_descuentos,
        observacion: formulario.observacion,
        recurrente: Boolean(formulario.recurrente),
      };

      const data = editandoId
        ? await actualizarHaberDescuento(editandoId, payload)
        : await crearHaberDescuento(payload);

      setMensaje(data.mensaje);
      limpiarFormulario();
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function alternarRecurrente(item) {
    try {
      setMensaje("");
      setError("");

      const data = await cambiarRecurrenteHaberDescuento(
        item.id,
        empresaActiva.id,
        !item.recurrente
      );

      setMensaje(data.mensaje);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function eliminar(id) {
    const confirmar = window.confirm(
      "Seguro deseas eliminar este haber/descuento?"
    );

    if (!confirmar) return;

    try {
      setMensaje("");
      setError("");

      const data = await eliminarHaberDescuento(id, empresaActiva.id);

      if (editandoId === id) {
        limpiarFormulario();
      }

      setMensaje(data.mensaje);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  function nombreTrabajador(item) {
    return `${item.nombres || ""} ${item.apellidos || ""}`.trim();
  }

  function etiquetaTipo(tipo) {
    if (tipo === "HABER_IMPONIBLE") return "Haber imponible";
    if (tipo === "HABER_NO_IMPONIBLE") return "Haber no imponible";
    if (tipo === "DESCUENTO") return "Descuento";
    return tipo;
  }

  return (
    <div>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <div style={card}>
        <h2 style={tituloSeccion}>Haberes y descuentos variables</h2>

        <div style={filtros}>
          <div>
            <label style={label}>Periodo</label>
            <PeriodoMesSelector style={input} value={periodo} onChange={setPeriodo} />
          </div>

          <button type="button" style={botonBuscar} onClick={cargarDatos}>
            Buscar
          </button>
        </div>
      </div>

      <div style={gridResumen}>
        <div style={cardResumen}>
          <strong>Haberes imponibles</strong>
          <span>{formato(totales.haberes_imponibles)}</span>
        </div>

        <div style={cardResumen}>
          <strong>Haberes no imponibles</strong>
          <span>{formato(totales.haberes_no_imponibles)}</span>
        </div>

        <div style={cardResumenRojo}>
          <strong>Descuentos</strong>
          <span>{formato(totales.descuentos)}</span>
        </div>

        <div style={cardResumenVerde}>
          <strong>Total registrado</strong>
          <span>{formato(totales.total_general)}</span>
        </div>
      </div>

      <form style={card} onSubmit={guardar}>
        <h2 style={tituloSeccion}>Registrar concepto variable</h2>

        <div style={grid}>
          <div>
            <label style={label}>Trabajador</label>
            <select
              style={input}
              name="trabajador_id"
              value={formulario.trabajador_id}
              onChange={cambiarFormulario}
            >
              <option value="">Seleccionar trabajador</option>
              {trabajadores.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.rut} - {item.nombres} {item.apellidos}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label}>Tipo</label>
            <select
              style={input}
              name="tipo"
              value={formulario.tipo}
              onChange={cambiarTipo}
            >
              <option value="HABER_IMPONIBLE">Haber imponible</option>
              <option value="HABER_NO_IMPONIBLE">Haber no imponible</option>
              <option value="DESCUENTO">Descuento</option>
            </select>
          </div>

          <div>
            <label style={label}>Nombre concepto</label>
            <input
              style={input}
              name="nombre"
              value={formulario.nombre}
              onChange={cambiarFormulario}
              list="conceptos-sugeridos-remu"
              placeholder="Ej: Bono produccion"
            />
            <datalist id="conceptos-sugeridos-remu">
              {conceptosSugeridos.map((concepto) => (
                <option key={concepto} value={concepto} />
              ))}
            </datalist>
          </div>

          <div>
            <label style={label}>Monto</label>
            <input
              style={input}
              type="number"
              name="monto"
              value={formulario.monto}
              onChange={cambiarFormulario}
            />
          </div>
        </div>

        <div style={checkboxRow}>
          <label style={checkLabel}>
            <input
              type="checkbox"
              name="imponible"
              checked={formulario.imponible}
              onChange={cambiarFormulario}
            />
            Imponible
          </label>

          <label style={checkLabel}>
            <input
              type="checkbox"
              name="tributable"
              checked={formulario.tributable}
              onChange={cambiarFormulario}
            />
            Tributable
          </label>

          <label style={checkLabel}>
            <input
              type="checkbox"
              name="afecta_descuentos"
              checked={formulario.afecta_descuentos}
              onChange={cambiarFormulario}
            />
            Afecta descuentos previsionales
          </label>

          <label style={checkLabel}>
            <input
              type="checkbox"
              name="recurrente"
              checked={formulario.recurrente}
              onChange={cambiarFormulario}
            />
            Fijar todos los meses
          </label>
        </div>

        <div style={{ marginTop: "14px" }}>
          <label style={label}>Observacion</label>
          <input
            style={inputFull}
            name="observacion"
            value={formulario.observacion}
            onChange={cambiarFormulario}
            placeholder="Detalle adicional"
          />
        </div>

        <div style={accionesFormulario}>
          <button style={botonGuardar} type="submit">
            {editandoId ? "Actualizar concepto" : "Guardar concepto"}
          </button>

          {editandoId && (
            <button style={botonCancelar} type="button" onClick={limpiarFormulario}>
              Cancelar edicion
            </button>
          )}
        </div>
      </form>

      <div style={card}>
        <h2 style={tituloSeccion}>Conceptos registrados</h2>

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Trabajador</th>
                <th style={th}>RUT</th>
                <th style={th}>Tipo</th>
                <th style={th}>Concepto</th>
                <th style={thNumero}>Monto</th>
                <th style={th}>Imp.</th>
                <th style={th}>Trib.</th>
                <th style={th}>Afecta desc.</th>
                <th style={th}>Fijo</th>
                <th style={th}>Obs.</th>
                <th style={thAccion}>Accion</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={td}>{nombreTrabajador(item)}</td>
                  <td style={td}>{item.rut}</td>
                  <td style={td}>{etiquetaTipo(item.tipo)}</td>
                  <td style={td}>{item.nombre}</td>
                  <td style={tdNumero}>{formato(item.monto)}</td>
                  <td style={td}>{item.imponible ? "Si" : "No"}</td>
                  <td style={td}>{item.tributable ? "Si" : "No"}</td>
                  <td style={td}>{item.afecta_descuentos ? "Si" : "No"}</td>
                  <td style={td}>{item.recurrente ? "Si" : "No"}</td>
                  <td style={td}>{item.observacion}</td>
                  <td style={tdAccion}>
                    <div style={accionesFila}>
                      <button
                        type="button"
                        style={botonEditarIcono}
                        onClick={() => iniciarEdicion(item)}
                        title="Editar concepto"
                        aria-label="Editar concepto"
                      >
                        {"\u270E"}
                      </button>

                      <button
                        type="button"
                        style={
                          item.recurrente ? botonFijoActivoIcono : botonFijoIcono
                        }
                        onClick={() => alternarRecurrente(item)}
                        title={
                          item.recurrente
                            ? "Quitar fijo todos los meses"
                            : "Fijar todos los meses"
                        }
                        aria-label={
                          item.recurrente
                            ? "Quitar fijo todos los meses"
                            : "Fijar todos los meses"
                        }
                      >
                        {"\uD83D\uDCCC"}
                      </button>

                      <button
                        type="button"
                        style={botonEliminarIcono}
                        onClick={() => eliminar(item.id)}
                        title="Eliminar concepto"
                        aria-label="Eliminar concepto"
                      >
                        {"\u2715"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {items.length === 0 && (
                <tr>
                  <td style={td} colSpan="11">
                    No hay haberes o descuentos registrados para este periodo.
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
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
  gap: "8px",
  color: "#1e293b",
};

const cardResumenRojo = {
  ...cardResumen,
  border: "1px solid #ef4444",
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

const checkboxRow = {
  display: "flex",
  gap: "18px",
  flexWrap: "wrap",
  marginTop: "16px",
  background: "#f8fcff",
  padding: "12px",
  borderRadius: "12px",
};

const checkLabel = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  color: "#1e293b",
  fontWeight: "bold",
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

const botonGuardar = {
  ...botonBase,
  background: "#10b981",
};

const botonCancelar = {
  ...botonBase,
  background: "#475569",
};

const accionesFormulario = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginTop: "18px",
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

const accionesFila = {
  display: "flex",
  justifyContent: "center",
  gap: "6px",
  flexWrap: "nowrap",
  alignItems: "center",
};

const botonAccionIconoBase = {
  border: "none",
  borderRadius: "9px",
  width: "32px",
  height: "32px",
  padding: 0,
  cursor: "pointer",
  color: "white",
  fontWeight: "bold",
  fontSize: "15px",
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const botonEditarIcono = {
  ...botonAccionIconoBase,
  background: "linear-gradient(135deg, #0369a1, #06b6d4)",
};

const botonFijoIcono = {
  ...botonAccionIconoBase,
  background: "linear-gradient(135deg, #64748b, #0f172a)",
};

const botonFijoActivoIcono = {
  ...botonAccionIconoBase,
  background: "linear-gradient(135deg, #10b981, #06b6d4)",
};

const botonEliminarIcono = {
  ...botonAccionIconoBase,
  background: "linear-gradient(135deg, #ef4444, #f97316)",
};

const ok = {
  color: "#10b981",
  fontWeight: "bold",
};

const err = {
  color: "#ef4444",
  fontWeight: "bold",
};


