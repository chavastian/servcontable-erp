import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import {
  listarCuentas,
  crearCuenta,
  actualizarCuenta,
  cambiarEstadoCuenta,
} from "../services/cuentaService";
import { cargarPlanCuentasBase } from "../services/planCuentasBaseService";
import { EstadoCargando } from "../components/EstadoPantalla";

function normalizarBusqueda(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function PlanCuentas() {
  const empresaActiva = obtenerEmpresaActiva();

  const [cuentas, setCuentas] = useState([]);
  const [busquedaCuenta, setBusquedaCuenta] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  // Distingue "esperando" de "no hay datos": sin esto la tabla en blanco
  // significa las dos cosas a la vez.
  const [cargando, setCargando] = useState(false);
  const [cuentaEditandoId, setCuentaEditandoId] = useState(null);

  const [formulario, setFormulario] = useState({
    codigo: "",
    nombre: "",
    tipo: "Activo",
    clasificacion: "",
    naturaleza: "Deudora",
    nivel: 1,
  });

  useEffect(() => {
    if (empresaActiva) {
      cargarCuentas();
    }
  }, []);

  async function cargarCuentas() {
    try {
      setCargando(true);
      setError("");
      const data = await listarCuentas(empresaActiva.id, true);
      const lista = Array.isArray(data?.cuentas)
        ? data.cuentas
        : Array.isArray(data)
        ? data
        : [];
      setCuentas(lista);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  function manejarCambio(e) {
    const { name, value } = e.target;
    setFormulario({
      ...formulario,
      [name]: value,
    });
  }

  function limpiarFormulario() {
    setFormulario({
      codigo: "",
      nombre: "",
      tipo: "Activo",
      clasificacion: "",
      naturaleza: "Deudora",
      nivel: 1,
    });
    setCuentaEditandoId(null);
  }

  // Evita el doble envío: un segundo clic antes de que responda el servidor
  // creaba el registro dos veces.
  const [guardando, setGuardando] = useState(false);

  async function manejarSubmit(e) {
    e.preventDefault();

    if (guardando) return;

    if (!empresaActiva?.id) {
      setError("Debes seleccionar una empresa activa antes de crear cuentas.");
      return;
    }

    if (!formulario.codigo || !formulario.nombre) {
      setError("Debe ingresar código y nombre de la cuenta.");
      return;
    }

    try {
      setGuardando(true);
      setMensaje("");
      setError("");

      const payload = {
        empresa_id: empresaActiva.id,
        codigo: formulario.codigo,
        nombre: formulario.nombre,
        tipo: formulario.tipo,
        clasificacion: formulario.clasificacion,
        naturaleza: formulario.naturaleza,
        nivel: Number(formulario.nivel || 1),
      };

      let data;
      if (cuentaEditandoId) {
        data = await actualizarCuenta(cuentaEditandoId, payload);
        setMensaje(data.mensaje || "Cuenta actualizada correctamente.");
      } else {
        data = await crearCuenta(payload);
        setMensaje(data.mensaje || "Cuenta creada correctamente.");
      }

      limpiarFormulario();
      await cargarCuentas();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  function editarCuenta(cuenta) {
    setMensaje("");
    setError("");
    setCuentaEditandoId(cuenta.id);

    setFormulario({
      codigo: cuenta.codigo || "",
      nombre: cuenta.nombre || "",
      tipo: cuenta.tipo || "Activo",
      clasificacion: cuenta.clasificacion || "",
      naturaleza: cuenta.naturaleza || "Deudora",
      nivel: cuenta.nivel || 1,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicion() {
    limpiarFormulario();
    setMensaje("");
    setError("");
  }

  async function alternarEstadoCuenta(cuenta) {
    const activar = !cuenta.activo;
    const textoAccion = activar ? "habilitar" : "desactivar";

    const confirmar = window.confirm(
      `Deseas ${textoAccion} la cuenta ${cuenta.codigo} - ${cuenta.nombre}?`
    );

    if (!confirmar) return;

    try {
      setMensaje("");
      setError("");

      const data = await cambiarEstadoCuenta(
        cuenta.id,
        empresaActiva.id,
        activar
      );

      setMensaje(data.mensaje || "Estado de cuenta actualizado correctamente.");
      await cargarCuentas();
    } catch (err) {
      setError(err.message);
    }
  }

  async function importarPlanBase() {
    try {
      setError("");
      setMensaje("");

      if (!empresaActiva?.id) {
        setError("No existe empresa activa.");
        return;
      }

      const confirmar = window.confirm(
        "Deseas cargar el plan de cuentas base ServContable? Se omitiran las cuentas que ya existan con el mismo código."
      );
      if (!confirmar) return;

      const data = await cargarPlanCuentasBase({
        empresa_id: empresaActiva.id,
        reemplazar: false,
      });

      setMensaje(
        `Plan base cargado correctamente. Insertadas: ${
          data.insertadas || 0
        }, omitidas: ${data.omitidas || 0}.`
      );

      await cargarCuentas();
    } catch (err) {
      setError(err.message);
    }
  }

  const busquedaNormalizada = normalizarBusqueda(busquedaCuenta);
  const cuentasFiltradas = busquedaNormalizada
    ? cuentas.filter((cuenta) => {
        const codigo = normalizarBusqueda(cuenta.codigo);
        const nombre = normalizarBusqueda(cuenta.nombre);
        return (
          codigo.includes(busquedaNormalizada) ||
          nombre.includes(busquedaNormalizada)
        );
      })
    : cuentas;

  if (!empresaActiva) {
    return (
      <div>
        <h1 style={titulo}>Plan de cuentas</h1>
        <div style={alerta}>
          Debes seleccionar una empresa activa antes de administrar el plan de
          cuentas.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={titulo}>Plan de cuentas</h1>

      <p style={subtitulo}>
        Empresa activa: <strong>{empresaActiva.razon_social}</strong>
      </p>

      <div style={barraAcciones}>
        <button type="button" style={botonPlanBase} onClick={importarPlanBase}>
          Cargar plan base ServContable
        </button>
      </div>

      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      {cargando && <EstadoCargando mensaje="Cargando datos..." />}

      <div style={layout}>
        <form style={formularioEstilo} onSubmit={manejarSubmit}>
          <h2 style={tituloSeccion}>
            {cuentaEditandoId ? "Editar cuenta" : "Crear cuenta"}
          </h2>

          {cuentaEditandoId && (
            <div style={avisoEdicion}>
              Estas editando una cuenta existente. Guarda los cambios o cancela
              la edicion.
            </div>
          )}

          <label style={label}>Código</label>
          <input
            style={input}
            name="codigo"
            value={formulario.codigo}
            onChange={manejarCambio}
            placeholder="1.1.01"
          />

          <label style={label}>Nombre cuenta</label>
          <input
            style={input}
            name="nombre"
            value={formulario.nombre}
            onChange={manejarCambio}
            placeholder="Caja"
          />

          <label style={label}>Tipo</label>
          <select
            style={input}
            name="tipo"
            value={formulario.tipo}
            onChange={manejarCambio}
          >
            <option value="Activo">Activo</option>
            <option value="Pasivo">Pasivo</option>
            <option value="Patrimonio">Patrimonio</option>
            <option value="Ingreso">Ingreso</option>
            <option value="Costo">Costo</option>
            <option value="Gasto">Gasto</option>
            <option value="Ganancia">Ganancia</option>
            <option value="Perdida">Perdida</option>
          </select>

          <label style={label}>Clasificación</label>
          <input
            style={input}
            name="clasificacion"
            value={formulario.clasificacion}
            onChange={manejarCambio}
            placeholder="Disponible"
          />

          <label style={label}>Naturaleza</label>
          <select
            style={input}
            name="naturaleza"
            value={formulario.naturaleza}
            onChange={manejarCambio}
          >
            <option value="Deudora">Deudora</option>
            <option value="Acreedora">Acreedora</option>
          </select>

          <label style={label}>Nivel</label>
          <input
            style={input}
            type="number"
            name="nivel"
            value={formulario.nivel}
            onChange={manejarCambio}
            min="1"
            max="6"
          />

          <button style={cuentaEditandoId ? botonActualizar : boton} type="submit" disabled={guardando}>
            {guardando ? "Guardando..." : cuentaEditandoId ? "Actualizar cuenta" : "Guardar cuenta"}
          </button>

          {cuentaEditandoId && (
            <button type="button" style={botonCancelar} onClick={cancelarEdicion}>
              Cancelar edicion
            </button>
          )}
        </form>

        <div style={tablaBox}>
          <h2 style={tituloSeccion}>Cuentas registradas</h2>

          <div style={barraBusqueda}>
            <input
              style={inputBusqueda}
              value={busquedaCuenta}
              onChange={(e) => setBusquedaCuenta(e.target.value)}
              placeholder="Buscar por código o nombre de cuenta..."
            />
            <span style={contadorBusqueda}>
              {cuentasFiltradas.length} de {cuentas.length} cuentas
            </span>
          </div>

          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Código</th>
                <th style={th}>Nombre</th>
                <th style={th}>Tipo</th>
                <th style={th}>Clasificación</th>
                <th style={th}>Naturaleza</th>
                <th style={th}>Nivel</th>
                <th style={th}>Estado</th>
                <th style={thAccion}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {cuentasFiltradas.map((cuenta) => (
                <tr key={cuenta.id}>
                  <td style={td}>{cuenta.codigo}</td>
                  <td style={td}>{cuenta.nombre}</td>
                  <td style={td}>{cuenta.tipo}</td>
                  <td style={td}>{cuenta.clasificacion}</td>
                  <td style={td}>{cuenta.naturaleza}</td>
                  <td style={td}>{cuenta.nivel}</td>
                  <td style={td}>
                    <span style={cuenta.activo ? estadoActivo : estadoInactivo}>
                      {cuenta.activo ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td style={tdAccion}>
                    <div style={accionesCuenta}>
                      <button
                        type="button"
                        style={botonEditar}
                        onClick={() => editarCuenta(cuenta)}
                        title="Editar cuenta"
                        aria-label="Editar cuenta"
                      >
                        {"\u270E"}
                      </button>

                      <button
                        type="button"
                        style={cuenta.activo ? botonDesactivar : botonHabilitar}
                        onClick={() => alternarEstadoCuenta(cuenta)}
                        title={cuenta.activo ? "Desactivar cuenta" : "Habilitar cuenta"}
                        aria-label={cuenta.activo ? "Desactivar cuenta" : "Habilitar cuenta"}
                      >
                        {cuenta.activo ? "\u2715" : "\u2713"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {cuentasFiltradas.length === 0 && (
                <tr>
                  <td style={td} colSpan="8">
                    No hay cuentas coincidentes.
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

const titulo = {
  fontSize: "34px",
  color: "var(--sc-ink)",
  marginBottom: "5px",
};

const subtitulo = {
  color: "var(--sc-gris)",
  marginBottom: "18px",
};

const barraAcciones = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "18px",
};

const layout = {
  display: "grid",
  gridTemplateColumns: "330px 1fr",
  gap: "25px",
  alignItems: "start",
  marginTop: "20px",
};

const formularioEstilo = {
  background: "white",
  borderRadius: "18px",
  padding: "25px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
};

const tituloSeccion = {
  color: "var(--sc-azul)",
  marginTop: 0,
};

const avisoEdicion = {
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1e40af",
  padding: "12px",
  borderRadius: "12px",
  fontWeight: "bold",
  marginBottom: "12px",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-text)",
  marginTop: "12px",
  marginBottom: "5px",
};

const input = {
  width: "100%",
  padding: "11px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "10px",
  boxSizing: "border-box",
};

const boton = {
  width: "100%",
  marginTop: "18px",
  background: "var(--sc-azul)",
  color: "white",
  border: "none",
  padding: "13px",
  borderRadius: "12px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonActualizar = {
  ...boton,
  background: "var(--sc-teal)",
};

const botonCancelar = {
  width: "100%",
  marginTop: "10px",
  background: "var(--sc-gris)",
  color: "white",
  border: "none",
  padding: "12px",
  borderRadius: "12px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonPlanBase = {
  background: "var(--sc-azul)",
  color: "white",
  border: "none",
  padding: "11px 16px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const tablaBox = {
  background: "white",
  borderRadius: "18px",
  padding: "25px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  overflowX: "auto",
};

const tabla = {
  width: "100%",
  borderCollapse: "collapse",
};

const barraBusqueda = {
  display: "flex",
  gap: "12px",
  alignItems: "center",
  marginBottom: "16px",
  flexWrap: "wrap",
};

const inputBusqueda = {
  ...input,
  maxWidth: "420px",
};

const contadorBusqueda = {
  color: "#64748b",
  fontWeight: "bold",
};

const th = {
  textAlign: "left",
  padding: "12px",
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  color: "var(--sc-azul)",
  whiteSpace: "nowrap",
};

const thAccion = {
  ...th,
  textAlign: "center",
};

const td = {
  padding: "12px",
  borderBottom: "1px solid var(--sc-borde-claro)",
  color: "var(--sc-text)",
};

const tdAccion = {
  ...td,
  textAlign: "center",
};

const accionesCuenta = {
  display: "flex",
  gap: "6px",
  justifyContent: "center",
  flexWrap: "nowrap",
  alignItems: "center",
};

const botonEditar = {
  background: "linear-gradient(135deg, var(--sc-azul), var(--sc-cian-medio))",
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

const botonDesactivar = {
  background: "linear-gradient(135deg, var(--sc-danger), var(--sc-warning))",
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

const botonHabilitar = {
  ...botonDesactivar,
  background: "linear-gradient(135deg, var(--sc-teal), var(--sc-cian-medio))",
};

const estadoActivo = {
  color: "var(--sc-teal)",
  fontWeight: "bold",
};

const estadoInactivo = {
  color: "var(--sc-gris)",
  fontWeight: "bold",
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
  marginTop: "25px",
  background: "var(--sc-naranja-fondo)",
  border: "1px solid #fed7aa",
  color: "var(--sc-naranja-texto)",
  padding: "16px",
  borderRadius: "14px",
  fontWeight: "bold",
};
