import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../../services/empresaService";
import { obtenerFechaHoyISO } from "../../services/periodoTrabajoService";
import { listarCentrosCosto } from "../../services/centrosCostoService";
import {
  listarTrabajadores,
  crearTrabajador,
  actualizarTrabajador,
  eliminarTrabajador,
} from "../../services/trabajadoresService";

const OPCIONES_JORNADA = [
  "Completa",
  "Parcial",
  "Turnos",
  "Excepcional",
  "Teletrabajo",
  "Articulo 22",
];

const OPCIONES_AFP = [
  "Capital",
  "Cuprum",
  "Habitat",
  "Modelo",
  "PlanVital",
  "ProVida",
  "UNO",
];

const OPCIONES_SALUD = [
  "FONASA",
  "Isapre Banmedica",
  "Isapre Colmena",
  "Isapre Consalud",
  "Isapre Cruz Blanca",
  "Isapre Nueva Masvida",
  "Isapre Vida Tres",
  "Isapre Esencial",
  "Isapre Fundacion",
  "Isalud",
];

const OPCIONES_BANCO = [
  "Banco del Estado de Chile",
  "Banco de Chile",
  "Banco Santander-Chile",
  "Banco de Credito e Inversiones",
  "Scotiabank Chile",
  "Banco Itau Chile",
  "Banco BICE",
  "Banco Internacional",
  "Banco Falabella",
  "Banco Ripley",
  "Banco Consorcio",
  "Banco BTG Pactual Chile",
  "HSBC Bank (Chile)",
  "Tanner Banco Digital",
  "Tenpo Bank Chile",
];

const OPCIONES_TIPO_CUENTA = [
  "Cuenta corriente",
  "Cuenta vista",
  "Cuenta de ahorro",
  "Cuenta RUT",
  "Chequera electronica",
  "Cuenta digital",
];

function construirOpciones(base, valorActual) {
  if (!valorActual) return base;
  return base.includes(valorActual) ? base : [valorActual, ...base];
}

export default function TrabajadoresRemuneraciones() {
  const empresaActiva = obtenerEmpresaActiva();

  const [trabajadores, setTrabajadores] = useState([]);
  const [editandoId, setEditandoId] = useState(null);

  const crearEstadoInicial = () => ({
    rut: "",
    nombres: "",
    apellidos: "",
    fecha_nacimiento: "",
    nacionalidad: "Chilena",
    cargo: "",
    centro_costo: "",
    centro_costo_id: "",
    fecha_ingreso: obtenerFechaHoyISO(),
    fecha_termino: "",
    tipo_contrato: "Indefinido",
    jornada: "Completa",
    sueldo_base: "",
    afp: "",
    salud: "",
    plan_salud_uf: "",
    anios_cotizados_previos: 0,
    tramo_asignacion: "",
    cargas: 0,
    banco: "",
    tipo_cuenta: "",
    numero_cuenta: "",
    email: "",
    telefono: "",
    estado: "activo",
    sexo: "",
  });

  const [formulario, setFormulario] = useState(crearEstadoInicial);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  // El centro de costo dejó de ser texto libre (módulo 14): se elige del
  // catálogo de la empresa. Mientras no haya centros creados se sigue
  // aceptando texto, para no bloquear a quien todavía no los usa.
  const [centrosCosto, setCentrosCosto] = useState([]);

  useEffect(() => {
    if (empresaActiva) {
      cargarTrabajadores();
    }
  }, []);

  useEffect(() => {
    if (!empresaActiva?.id) return;

    let vigente = true;

    listarCentrosCosto(empresaActiva.id, "vigente")
      .then((datos) => {
        if (vigente) setCentrosCosto(datos.centros || []);
      })
      .catch(() => {
        if (vigente) setCentrosCosto([]);
      });

    return () => {
      vigente = false;
    };
  }, [empresaActiva?.id]);

  async function cargarTrabajadores() {
    try {
      setError("");
      const data = await listarTrabajadores(empresaActiva.id);
      setTrabajadores(data.trabajadores || []);
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

  function limpiarFormulario() {
    setEditandoId(null);
    setFormulario(crearEstadoInicial());
  }

  // Evita el doble envío: un segundo clic antes de que responda el servidor
  // creaba el registro dos veces.
  const [guardando, setGuardando] = useState(false);

  async function guardar(e) {
    e.preventDefault();

    if (guardando) return;

    try {
      setGuardando(true);
      setMensaje("");
      setError("");

      const payload = {
        empresa_id: empresaActiva.id,
        ...formulario,
        sueldo_base: Number(formulario.sueldo_base || 0),
        cargas: Number(formulario.cargas || 0),
        plan_salud_uf: Number(formulario.plan_salud_uf || 0),
        anios_cotizados_previos: Number(formulario.anios_cotizados_previos || 0),
        centro_costo_id: formulario.centro_costo_id || null,
      };

      const data = editandoId
        ? await actualizarTrabajador(editandoId, payload)
        : await crearTrabajador(payload);

      setMensaje(data.mensaje);
      limpiarFormulario();
      await cargarTrabajadores();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  function editar(item) {
    setEditandoId(item.id);

    setFormulario({
      rut: item.rut || "",
      nombres: item.nombres || "",
      apellidos: item.apellidos || "",
      fecha_nacimiento: item.fecha_nacimiento?.substring(0, 10) || "",
      nacionalidad: item.nacionalidad || "Chilena",
      cargo: item.cargo || "",
      centro_costo: item.centro_costo || "",
      centro_costo_id: item.centro_costo_id ? String(item.centro_costo_id) : "",
      fecha_ingreso: item.fecha_ingreso?.substring(0, 10) || "",
      fecha_termino: item.fecha_termino?.substring(0, 10) || "",
      tipo_contrato: item.tipo_contrato || "Indefinido",
      jornada: item.jornada || "Completa",
      sueldo_base: item.sueldo_base || "",
      afp: item.afp || "",
      salud: item.salud || "",
      plan_salud_uf: Number(item.plan_salud_uf || 0) > 0 ? item.plan_salud_uf : "",
      anios_cotizados_previos: item.anios_cotizados_previos || 0,
      tramo_asignacion: item.tramo_asignacion || "",
      cargas: item.cargas || 0,
      banco: item.banco || "",
      tipo_cuenta: item.tipo_cuenta || "",
      numero_cuenta: item.numero_cuenta || "",
      email: item.email || "",
      telefono: item.telefono || "",
      estado: item.estado || "activo",
      sexo: item.sexo || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function eliminar(id) {
    const confirmar = window.confirm("Seguro deseas eliminar este trabajador?");
    if (!confirmar) return;

    try {
      setMensaje("");
      setError("");

      const data = await eliminarTrabajador(id, empresaActiva.id);
      setMensaje(data.mensaje);
      await cargarTrabajadores();
    } catch (err) {
      setError(err.message);
    }
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  return (
    <div>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <form style={card} onSubmit={guardar}>
        <h2 style={tituloSeccion}>
          {editandoId ? "Editar trabajador" : "Nuevo trabajador"}
        </h2>

        <h3 style={subtituloSeccion}>Datos personales y laborales</h3>

        <div style={grid}>
          <Campo
            label="RUT"
            name="rut"
            value={formulario.rut}
            onChange={cambiarFormulario}
          />
          <Campo
            label="Nombres"
            name="nombres"
            value={formulario.nombres}
            onChange={cambiarFormulario}
          />
          <Campo
            label="Apellidos"
            name="apellidos"
            value={formulario.apellidos}
            onChange={cambiarFormulario}
          />
          <Campo
            label="Fecha nacimiento"
            type="date"
            name="fecha_nacimiento"
            value={formulario.fecha_nacimiento}
            onChange={cambiarFormulario}
          />
          <Campo
            label="Nacionalidad"
            name="nacionalidad"
            value={formulario.nacionalidad}
            onChange={cambiarFormulario}
          />

          <div>
            <label style={label}>Sexo</label>
            <select
              style={input}
              name="sexo"
              value={formulario.sexo}
              onChange={cambiarFormulario}
            >
              <option value="">Seleccionar</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
            </select>
          </div>

          <Campo
            label="Cargo"
            name="cargo"
            value={formulario.cargo}
            onChange={cambiarFormulario}
          />
          {centrosCosto.length > 0 ? (
            <div>
              <label style={labelStyle} htmlFor="trabajador-centro-costo">
                Centro de costo
              </label>
              <select
                id="trabajador-centro-costo"
                style={inputStyle}
                name="centro_costo_id"
                value={formulario.centro_costo_id}
                onChange={cambiarFormulario}
              >
                <option value="">Sin centro</option>
                {centrosCosto.map((centro) => (
                  <option key={centro.id} value={centro.id}>
                    {centro.codigo} - {centro.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <Campo
              label="Centro costo"
              name="centro_costo"
              value={formulario.centro_costo}
              onChange={cambiarFormulario}
            />
          )}
          <Campo
            label="Fecha ingreso"
            type="date"
            name="fecha_ingreso"
            value={formulario.fecha_ingreso}
            onChange={cambiarFormulario}
          />
          <Campo
            label="Fecha termino"
            type="date"
            name="fecha_termino"
            value={formulario.fecha_termino}
            onChange={cambiarFormulario}
          />

          <div>
            <label style={label}>Tipo contrato</label>
            <select
              style={input}
              name="tipo_contrato"
              value={formulario.tipo_contrato}
              onChange={cambiarFormulario}
            >
              <option value="Indefinido">Indefinido</option>
              <option value="Plazo fijo">Plazo fijo</option>
              <option value="Obra o faena">Obra o faena</option>
              <option value="Part time">Part time</option>
            </select>
          </div>

          <CampoSelect
            label="Tipo jornada"
            name="jornada"
            value={formulario.jornada}
            onChange={cambiarFormulario}
            options={OPCIONES_JORNADA}
          />
          <Campo
            label="Sueldo base"
            type="number"
            name="sueldo_base"
            value={formulario.sueldo_base}
            onChange={cambiarFormulario}
          />
          <CampoSelect
            label="AFP"
            name="afp"
            value={formulario.afp}
            onChange={cambiarFormulario}
            options={OPCIONES_AFP}
          />
          <CampoSelect
            label="Salud"
            name="salud"
            value={formulario.salud}
            onChange={cambiarFormulario}
            options={OPCIONES_SALUD}
          />
          <Campo
            label="Plan Isapre (UF, 0 = 7% legal)"
            type="number"
            name="plan_salud_uf"
            value={formulario.plan_salud_uf}
            onChange={cambiarFormulario}
          />
          <Campo
            label="Años cotizados antes (feriado progresivo)"
            type="number"
            name="anios_cotizados_previos"
            value={formulario.anios_cotizados_previos}
            onChange={cambiarFormulario}
          />
          <Campo
            label="Tramo asignación"
            name="tramo_asignacion"
            value={formulario.tramo_asignacion}
            onChange={cambiarFormulario}
          />
          <Campo
            label="Cargas"
            type="number"
            name="cargas"
            value={formulario.cargas}
            onChange={cambiarFormulario}
          />
        </div>

        <h3 style={subtituloSeccion}>Datos bancarios y contacto</h3>

        <div style={grid}>
          <CampoSelect
            label="Banco"
            name="banco"
            value={formulario.banco}
            onChange={cambiarFormulario}
            options={OPCIONES_BANCO}
          />
          <CampoSelect
            label="Tipo cuenta"
            name="tipo_cuenta"
            value={formulario.tipo_cuenta}
            onChange={cambiarFormulario}
            options={OPCIONES_TIPO_CUENTA}
          />
          <Campo
            label="N cuenta"
            name="numero_cuenta"
            value={formulario.numero_cuenta}
            onChange={cambiarFormulario}
          />
          <Campo
            label="Email"
            name="email"
            value={formulario.email}
            onChange={cambiarFormulario}
          />
          <Campo
            label="Teléfono"
            name="telefono"
            value={formulario.telefono}
            onChange={cambiarFormulario}
          />
        </div>

        <button style={botonGuardar} type="submit" disabled={guardando}>
          {guardando ? "Guardando..." : editandoId ? "Actualizar trabajador" : "Guardar trabajador"}
        </button>

        {editandoId && (
          <button
            type="button"
            style={botonCancelar}
            onClick={limpiarFormulario}
          >
            Cancelar edicion
          </button>
        )}
      </form>

      <div style={card}>
        <h2 style={tituloSeccion}>Trabajadores registrados</h2>

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>RUT</th>
                <th style={th}>Nombre</th>
                <th style={th}>Cargo</th>
                <th style={th}>Contrato</th>
                <th style={th}>AFP</th>
                <th style={th}>Salud</th>
                <th style={thNumero}>Sueldo base</th>
                <th style={th}>Estado</th>
                <th style={thAccion}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {trabajadores.map((item) => (
                <tr key={item.id}>
                  <td style={td}>{item.rut}</td>
                  <td style={td}>
                    {item.nombres} {item.apellidos}
                  </td>
                  <td style={td}>{item.cargo}</td>
                  <td style={td}>{item.tipo_contrato}</td>
                  <td style={td}>{item.afp}</td>
                  <td style={td}>{item.salud}</td>
                  <td style={tdNumero}>{formato(item.sueldo_base)}</td>
                  <td style={td}>{item.estado}</td>
                  <td style={tdAccion}>
                    <button type="button"
                      style={botonEditar}
                      onClick={() => editar(item)}
                      title="Editar trabajador"
                      aria-label="Editar trabajador"
                    >
                      {"\u270E"}
                    </button>
                    <button type="button"
                      style={botonEliminar}
                      onClick={() => eliminar(item.id)}
                      title="Eliminar trabajador"
                      aria-label="Eliminar trabajador"
                    >
                      {"\u2715"}
                    </button>
                  </td>
                </tr>
              ))}

              {trabajadores.length === 0 && (
                <tr>
                  <td style={td} colSpan="9">
                    No hay trabajadores registrados.
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

function Campo({ label, name, value, onChange, type = "text" }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        style={inputStyle}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

function CampoSelect({
  label,
  name,
  value,
  onChange,
  options,
  placeholder = "Seleccionar",
}) {
  const opciones = construirOpciones(options, value);

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select style={inputStyle} name={name} value={value} onChange={onChange}>
        <option value="">{placeholder}</option>
        {opciones.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
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
  color: "var(--sc-azul)",
  marginTop: 0,
};

const subtituloSeccion = {
  color: "var(--sc-text)",
  marginTop: "24px",
  marginBottom: "12px",
  paddingTop: "14px",
  borderTop: "1px solid var(--sc-borde-claro)",
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "14px",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-text)",
  marginBottom: "5px",
};

const labelStyle = label;

const input = {
  width: "100%",
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "10px",
  height: "40px",
  boxSizing: "border-box",
};

const inputStyle = input;

const botonGuardar = {
  marginTop: "18px",
  background: "var(--sc-teal)",
  color: "white",
  border: "none",
  padding: "12px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonCancelar = {
  ...botonGuardar,
  background: "var(--sc-gris)",
  marginLeft: "10px",
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
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  color: "var(--sc-azul)",
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
  borderBottom: "1px solid var(--sc-borde-claro)",
  color: "var(--sc-text)",
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

const botonAccionBase = {
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

const botonEditar = {
  ...botonAccionBase,
  background: "linear-gradient(135deg, var(--sc-azul), var(--sc-cian-medio))",
  marginRight: "6px",
};

const botonEliminar = {
  ...botonAccionBase,
  background: "linear-gradient(135deg, var(--sc-danger), var(--sc-warning))",
};

const ok = {
  color: "var(--sc-teal)",
  fontWeight: "bold",
};

const err = {
  color: "var(--sc-danger)",
  fontWeight: "bold",
};
