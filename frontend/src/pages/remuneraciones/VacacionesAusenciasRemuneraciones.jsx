import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../../services/empresaService";
import { listarTrabajadores } from "../../services/trabajadoresService";
import { obtenerPeriodoTrabajo } from "../../services/periodoTrabajoService";
import PeriodoMesSelector from "../../components/PeriodoMesSelector";
import IconoSistema from "../../components/IconoSistema";
import {
  listarVacacionesAusencias,
  crearVacacionAusencia,
  eliminarVacacionAusencia,
  obtenerResumenVacacionesAusenciasTrabajador,
} from "../../services/vacacionesAusenciasService";

const TIPOS = [
  "Vacaciones",
  "Ausencia",
  "Licencia medica",
  "Permiso",
  "Atraso",
  "Suspension",
];

const SUBTIPOS = {
  Vacaciones: ["Feriado legal", "Feriado progresivo", "Vacaciones proporcionales"],
  Ausencia: ["Inasistencia injustificada", "Inasistencia justificada"],
  "Licencia medica": ["Enfermedad comun", "Accidente laboral", "Pre natal", "Post natal", "Otro"],
  Permiso: ["Con goce de sueldo", "Sin goce de sueldo"],
  Atraso: ["Atraso entrada", "Salida anticipada"],
  Suspension: ["Suspension laboral", "Pacto suspension", "Otro"],
};

export default function VacacionesAusenciasRemuneraciones() {
  const empresaActiva = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [trabajadores, setTrabajadores] = useState([]);
  const [registros, setRegistros] = useState([]);

  const [filtros, setFiltros] = useState({
    trabajador_id: "",
    tipo: "",
  });

  const [totales, setTotales] = useState({
    total_registros: 0,
    total_dias: 0,
    total_horas: 0,
    total_descuentos: 0,
    dias_vacaciones: 0,
    dias_ausencias: 0,
    dias_licencias: 0,
    dias_permisos: 0,
    dias_descuentan_vacaciones: 0,
    dias_afectan_remuneracion: 0,
  });

  const [resumenTrabajador, setResumenTrabajador] = useState(null);

  const [form, setForm] = useState({
    trabajador_id: "",
    tipo: "Vacaciones",
    subtipo: "Feriado legal",
    fecha_inicio: "",
    fecha_termino: "",
    dias: 0,
    horas: 0,
    afecta_remuneracion: false,
    descuenta_vacaciones: true,
    monto_descuento: 0,
    observacion: "",
  });

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

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

      setTrabajadores(trabajadoresData.trabajadores || []);

      const data = await listarVacacionesAusencias({
        empresa_id: empresaActiva.id,
        periodo,
        trabajador_id: filtros.trabajador_id,
        tipo: filtros.tipo,
      });

      setRegistros(data.registros || []);
      setTotales(data.totales || {});
    } catch (err) {
      setError(err.message);
    }
  }

  function calcularDias(fechaInicio, fechaTermino) {
    if (!fechaInicio || !fechaTermino) return 0;

    const inicio = new Date(fechaInicio);
    const termino = new Date(fechaTermino);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(termino.getTime())) {
      return 0;
    }

    const diffMs = termino.getTime() - inicio.getTime();
    const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

    return dias > 0 ? dias : 0;
  }

  function aplicarValoresPorTipo(tipo, subtipoActual = "") {
    let subtipo = subtipoActual || SUBTIPOS[tipo]?.[0] || "";

    const valores = {
      tipo,
      subtipo,
      afecta_remuneracion: false,
      descuenta_vacaciones: false,
    };

    if (tipo === "Vacaciones") {
      valores.descuenta_vacaciones = true;
      valores.afecta_remuneracion = false;
    }

    if (tipo === "Ausencia") {
      valores.descuenta_vacaciones = false;
      valores.afecta_remuneracion = true;
    }

    if (tipo === "Licencia medica") {
      valores.descuenta_vacaciones = false;
      valores.afecta_remuneracion = false;
    }

    if (tipo === "Permiso") {
      valores.descuenta_vacaciones = false;
      valores.afecta_remuneracion = subtipo === "Sin goce de sueldo";
    }

    if (tipo === "Atraso") {
      valores.descuenta_vacaciones = false;
      valores.afecta_remuneracion = true;
    }

    if (tipo === "Suspension") {
      valores.descuenta_vacaciones = false;
      valores.afecta_remuneracion = true;
    }

    return valores;
  }

  function cambiarForm(e) {
    const { name, value, type, checked } = e.target;

    setForm((prev) => {
      let actualizado = {
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      };

      if (name === "tipo") {
        actualizado = {
          ...actualizado,
          ...aplicarValoresPorTipo(value),
        };
      }

      if (name === "subtipo") {
        actualizado = {
          ...actualizado,
          ...aplicarValoresPorTipo(prev.tipo, value),
        };
      }

      if (name === "fecha_inicio" || name === "fecha_termino") {
        const fechaInicio =
          name === "fecha_inicio" ? value : actualizado.fecha_inicio;
        const fechaTermino =
          name === "fecha_termino" ? value : actualizado.fecha_termino;

        actualizado.dias = calcularDias(fechaInicio, fechaTermino);
      }

      return actualizado;
    });
  }

  function cambiarFiltro(e) {
    const { name, value } = e.target;

    setFiltros((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  // Evita el doble envío: un segundo clic antes de que responda el servidor
  // creaba el registro dos veces.
  const [guardando, setGuardando] = useState(false);

  async function guardarRegistro(e) {
    e.preventDefault();

    if (guardando) return;

    try {
      setGuardando(true);
      setMensaje("");
      setError("");

      if (!form.trabajador_id) {
        setError("Debes seleccionar un trabajador.");
        return;
      }

      if (!form.fecha_inicio || !form.fecha_termino) {
        setError("Debes indicar fecha de inicio y termino.");
        return;
      }

      const data = await crearVacacionAusencia({
        empresa_id: empresaActiva.id,
        periodo,
        ...form,
      });

      setMensaje(data.mensaje);

      setForm({
        trabajador_id: "",
        tipo: "Vacaciones",
        subtipo: "Feriado legal",
        fecha_inicio: "",
        fecha_termino: "",
        dias: 0,
        horas: 0,
        afecta_remuneracion: false,
        descuenta_vacaciones: true,
        monto_descuento: 0,
        observacion: "",
      });

      await cargarDatos();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarRegistroClick(id) {
    const confirmar = window.confirm("Deseas eliminar este registro?");

    if (!confirmar) return;

    try {
      setMensaje("");
      setError("");

      const data = await eliminarVacacionAusencia(id, empresaActiva.id);
      setMensaje(data.mensaje);

      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function verResumenTrabajador() {
    try {
      setMensaje("");
      setError("");

      const trabajadorId = form.trabajador_id || filtros.trabajador_id;

      if (!trabajadorId) {
        setError("Selecciona un trabajador para ver resumen.");
        return;
      }

      const data = await obtenerResumenVacacionesAusenciasTrabajador({
        empresa_id: empresaActiva.id,
        trabajador_id: trabajadorId,
        periodo,
      });

      setResumenTrabajador(data.resumen || null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <div style={hero}>
        <div>
          <h1 style={titulo}>Vacaciones y Ausencias</h1>
          <p style={subtitulo}>
            Control de vacaciones, licencias, permisos, inasistencias, atrasos y suspensiones.
          </p>
        </div>

        <div style={filtrosHero}>
          <div>
            <label style={labelHero}>Período</label>
            <PeriodoMesSelector
              style={inputHero}
              value={periodo}
              onChange={setPeriodo}
              containerStyle={{ width: "100%", minWidth: 220 }}
            />
          </div>

          <button type="button" style={botonHero} onClick={cargarDatos}>
            Buscar
          </button>
        </div>
      </div>

      <div style={gridResumen}>
        <ResumenCard titulo="Registros" valor={totales.total_registros || 0} icono={<IconoSistema tipo="comprobante" />} />
        <ResumenCard titulo="Dias vacaciones" valor={totales.dias_vacaciones || 0} icono={<IconoSistema tipo="vacaciones" />} />
        <ResumenCard titulo="Dias ausencias" valor={totales.dias_ausencias || 0} icono={<IconoSistema tipo="alerta" />} />
        <ResumenCard titulo="Licencias" valor={totales.dias_licencias || 0} icono={<IconoSistema tipo="licencia" />} />
        <ResumenCard titulo="Permisos" valor={totales.dias_permisos || 0} icono={<IconoSistema tipo="permiso" />} />
        <ResumenCard titulo="Descuentos" valor={formato(totales.total_descuentos)} icono={<IconoSistema tipo="descuento" />} />
      </div>

      <form style={card} onSubmit={guardarRegistro}>
        <h2 style={tituloSeccion}>Nuevo registro</h2>

        <div style={grid}>
          <div>
            <label style={label}>Trabajador</label>
            <select
              style={input}
              name="trabajador_id"
              value={form.trabajador_id}
              onChange={cambiarForm}
            >
              <option value="">Seleccionar trabajador</option>
              {trabajadores.map((trabajador) => (
                <option key={trabajador.id} value={trabajador.id}>
                  {trabajador.rut} - {trabajador.nombres} {trabajador.apellidos}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label}>Tipo</label>
            <select
              style={input}
              name="tipo"
              value={form.tipo}
              onChange={cambiarForm}
            >
              {TIPOS.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label}>Subtipo</label>
            <select
              style={input}
              name="subtipo"
              value={form.subtipo}
              onChange={cambiarForm}
            >
              {(SUBTIPOS[form.tipo] || []).map((subtipo) => (
                <option key={subtipo} value={subtipo}>
                  {subtipo}
                </option>
              ))}
            </select>
          </div>

          <Campo
            label="Fecha inicio"
            name="fecha_inicio"
            type="date"
            value={form.fecha_inicio}
            onChange={cambiarForm}
          />

          <Campo
            label="Fecha termino"
            name="fecha_termino"
            type="date"
            value={form.fecha_termino}
            onChange={cambiarForm}
          />

          <Campo
            label="Días"
            name="dias"
            value={form.dias}
            onChange={cambiarForm}
          />

          <Campo
            label="Horas"
            name="horas"
            value={form.horas}
            onChange={cambiarForm}
          />

          <Campo
            label="Monto descuento"
            name="monto_descuento"
            value={form.monto_descuento}
            onChange={cambiarForm}
          />
        </div>

        <div style={checksGrid}>
          <label style={checkBox}>
            <input
              type="checkbox"
              name="descuenta_vacaciones"
              checked={form.descuenta_vacaciones}
              onChange={cambiarForm}
            />
            Descuenta vacaciones
          </label>

          <label style={checkBox}>
            <input
              type="checkbox"
              name="afecta_remuneracion"
              checked={form.afecta_remuneracion}
              onChange={cambiarForm}
            />
            Afecta remuneracion
          </label>
        </div>

        <div style={{ marginTop: "16px" }}>
          <label style={label}>Observacion</label>
          <textarea
            style={textarea}
            name="observacion"
            value={form.observacion}
            onChange={cambiarForm}
            placeholder="Detalle del registro..."
          />
        </div>

        <div style={acciones}>
          <button style={botonGuardar} type="submit" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar registro"}
          </button>

          <button type="button" style={botonSecundario} onClick={verResumenTrabajador}>
            Ver resumen trabajador
          </button>
        </div>
      </form>

      {resumenTrabajador && (
        <div style={card}>
          <h2 style={tituloSeccion}>Resumen del trabajador</h2>

          <div style={gridResumen}>
            <ResumenCard titulo="Vacaciones" valor={resumenTrabajador.dias_vacaciones || 0} icono={<IconoSistema tipo="vacaciones" />} />
            <ResumenCard titulo="Ausencias" valor={resumenTrabajador.dias_ausencias || 0} icono={<IconoSistema tipo="alerta" />} />
            <ResumenCard titulo="Licencias" valor={resumenTrabajador.dias_licencias || 0} icono={<IconoSistema tipo="licencia" />} />
            <ResumenCard titulo="Permisos" valor={resumenTrabajador.dias_permisos || 0} icono={<IconoSistema tipo="permiso" />} />
            <ResumenCard titulo="Afecta remuneracion" valor={resumenTrabajador.dias_afectan_remuneracion || 0} icono={<IconoSistema tipo="descuento" />} />
            <ResumenCard titulo="Descuentos" valor={formato(resumenTrabajador.total_descuentos)} icono={<IconoSistema tipo="dinero" />} />
          </div>
        </div>
      )}

      <div style={card}>
        <h2 style={tituloSeccion}>Filtros</h2>

        <div style={grid}>
          <div>
            <label style={label}>Trabajador</label>
            <select
              style={input}
              name="trabajador_id"
              value={filtros.trabajador_id}
              onChange={cambiarFiltro}
            >
              <option value="">Todos</option>
              {trabajadores.map((trabajador) => (
                <option key={trabajador.id} value={trabajador.id}>
                  {trabajador.rut} - {trabajador.nombres} {trabajador.apellidos}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label}>Tipo</label>
            <select
              style={input}
              name="tipo"
              value={filtros.tipo}
              onChange={cambiarFiltro}
            >
              <option value="">Todos</option>
              {TIPOS.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
            </select>
          </div>

          <div style={botonFiltroBox}>
            <button type="button" style={botonSecundario} onClick={cargarDatos}>
              Aplicar filtros
            </button>
          </div>
        </div>
      </div>

      <div style={card}>
        <h2 style={tituloSeccion}>Registros del período</h2>

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Trabajador</th>
                <th style={th}>Tipo</th>
                <th style={th}>Subtipo</th>
                <th style={th}>Inicio</th>
                <th style={th}>Termino</th>
                <th style={thNumero}>Días</th>
                <th style={thNumero}>Horas</th>
                <th style={thAccion}>Vacaciones</th>
                <th style={thAccion}>Remuneracion</th>
                <th style={thNumero}>Descuento</th>
                <th style={thAccion}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {registros.map((item) => (
                <tr key={item.id}>
                  <td style={td}>
                    {item.trabajador_rut} - {item.trabajador_nombres}{" "}
                    {item.trabajador_apellidos}
                  </td>
                  <td style={td}>{item.tipo}</td>
                  <td style={td}>{item.subtipo}</td>
                  <td style={td}>{item.fecha_inicio?.substring(0, 10)}</td>
                  <td style={td}>{item.fecha_termino?.substring(0, 10)}</td>
                  <td style={tdNumero}>{Number(item.dias || 0).toLocaleString("es-CL")}</td>
                  <td style={tdNumero}>{Number(item.horas || 0).toLocaleString("es-CL")}</td>
                  <td style={tdAccion}>
                    {item.descuenta_vacaciones ? "Si" : "No"}
                  </td>
                  <td style={tdAccion}>
                    {item.afecta_remuneracion ? "Si" : "No"}
                  </td>
                  <td style={tdNumero}>{formato(item.monto_descuento)}</td>
                  <td style={tdAccion}>
                    <button
                      type="button"
                      style={botonEliminar}
                      onClick={() => eliminarRegistroClick(item.id)}
                      title="Eliminar registro"
                      aria-label="Eliminar registro"
                    >
                      {"\u2715"}
                    </button>
                  </td>
                </tr>
              ))}

              {registros.length === 0 && (
                <tr>
                  <td style={td} colSpan="11">
                    No hay registros para este período.
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

function Campo({ label, name, value, onChange, type = "number" }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        style={inputStyle}
        type={type}
        step={type === "number" ? "0.0001" : undefined}
        name={name}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

function ResumenCard({ titulo, valor, icono }) {
  return (
    <div style={resumenCard}>
      <span style={resumenIcono}>{icono}</span>
      <strong>{titulo}</strong>
      <p>{valor}</p>
    </div>
  );
}

const hero = {
  background: "linear-gradient(135deg, #0f172a, #0369a1, #0ea5e9)",
  borderRadius: "22px",
  padding: "28px",
  color: "white",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "end",
  gap: "20px",
  flexWrap: "wrap",
  marginBottom: "22px",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.18)",
};

const titulo = {
  margin: 0,
  fontSize: "32px",
};

const subtitulo = {
  color: "#dff7ff",
  marginBottom: 0,
};

const filtrosHero = {
  display: "flex",
  gap: "12px",
  alignItems: "end",
  flexWrap: "wrap",
};

const labelHero = {
  display: "block",
  fontWeight: "bold",
  color: "#dff7ff",
  marginBottom: "5px",
};

const inputHero = {
  width: "160px",
  padding: "10px",
  border: "1px solid #a9d8ef",
  borderRadius: "10px",
  height: "40px",
  boxSizing: "border-box",
};

const botonHero = {
  background: "white",
  color: "#0369a1",
  border: "none",
  padding: "10px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const gridResumen = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
  marginBottom: "22px",
};

const resumenCard = {
  background: "white",
  borderRadius: "18px",
  padding: "18px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  color: "#1e293b",
  display: "flex",
  flexDirection: "column",
  gap: "7px",
};

const resumenIcono = {
  width: "38px",
  height: "38px",
  borderRadius: "13px",
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  border: "1px solid #67e8f9",
  color: "#0369a1",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 8px 18px rgba(15, 76, 129, 0.12)",
};

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

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
};

const checksGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "14px",
  marginTop: "16px",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "#1e293b",
  marginBottom: "5px",
};

const labelStyle = label;

const input = {
  width: "100%",
  padding: "10px",
  border: "1px solid #a9d8ef",
  borderRadius: "10px",
  height: "40px",
  boxSizing: "border-box",
};

const inputStyle = input;

const textarea = {
  width: "100%",
  minHeight: "90px",
  padding: "10px",
  border: "1px solid #a9d8ef",
  borderRadius: "10px",
  boxSizing: "border-box",
  resize: "vertical",
};

const checkBox = {
  background: "#f8fcff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "12px",
  color: "#1e293b",
  fontWeight: "bold",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const acciones = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  marginTop: "18px",
};

const botonGuardar = {
  background: "#10b981",
  color: "white",
  border: "none",
  padding: "12px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonSecundario = {
  background: "#0369a1",
  color: "white",
  border: "none",
  padding: "12px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonFiltroBox = {
  display: "flex",
  alignItems: "end",
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

