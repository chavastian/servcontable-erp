import { useEffect, useState } from "react";
import {
  crearEmpresa,
  listarEmpresas,
  actualizarEmpresa,
  eliminarEmpresa,
  guardarEmpresaActiva,
  obtenerEmpresaActiva,
  eliminarEmpresaActiva,
} from "../services/empresaService";

const FORMULARIO_EMPRESA_INICIAL = {
  rut: "",
  razon_social: "",
  giro: "",
  direccion: "",
  comuna: "",
  ciudad: "",
  regimen_tributario: "14D3 Pro Pyme General",
  telefono: "",
  correo: "",
  descripcion_actividad: "",
  rut_representante: "",
  representante_legal: "",
  correo_representante: "",
  telefono_representante: "",
};

function empresaAFormulario(empresa) {
  return {
    rut: empresa?.rut || "",
    razon_social: empresa?.razon_social || "",
    giro: empresa?.giro || "",
    direccion: empresa?.direccion || "",
    comuna: empresa?.comuna || "",
    ciudad: empresa?.ciudad || "",
    regimen_tributario: empresa?.regimen_tributario || "14D3 Pro Pyme General",
    telefono: empresa?.telefono || "",
    correo: empresa?.correo || "",
    descripcion_actividad: empresa?.descripcion_actividad || "",
    rut_representante: empresa?.rut_representante || "",
    representante_legal: empresa?.representante_legal || "",
    correo_representante: empresa?.correo_representante || "",
    telefono_representante: empresa?.telefono_representante || "",
  };
}

export default function Empresas({ alSeleccionarEmpresa }) {
  const administradorSistema = true;

  const [empresas, setEmpresas] = useState([]);
  const [empresaActiva, setEmpresaActiva] = useState(obtenerEmpresaActiva());
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const [formulario, setFormulario] = useState(FORMULARIO_EMPRESA_INICIAL);
  const [empresaEditandoId, setEmpresaEditandoId] = useState(null);

  useEffect(() => {
    cargarEmpresas();
  }, []);

  async function cargarEmpresas() {
    try {
      setError("");
      const data = await listarEmpresas();
      setEmpresas(Array.isArray(data?.empresas) ? data.empresas : []);
    } catch (err) {
      setError(err.message);
    }
  }

  function manejarCambio(e) {
    setFormulario({
      ...formulario,
      [e.target.name]: e.target.value,
    });
  }

  // Evita el doble envío: un segundo clic antes de que responda el servidor
  // creaba el registro dos veces.
  const [guardando, setGuardando] = useState(false);

  async function manejarSubmit(e) {
    e.preventDefault();

    if (guardando) return;

    try {
      setGuardando(true);
      setMensaje("");
      setError("");

      const data = empresaEditandoId
        ? await actualizarEmpresa(empresaEditandoId, formulario)
        : await crearEmpresa(formulario);

      setMensaje(
        data.mensaje ||
          (empresaEditandoId
            ? "Empresa actualizada correctamente"
            : "Empresa creada correctamente")
      );

      if (empresaEditandoId && empresaActiva?.id === empresaEditandoId && data.empresa) {
        guardarEmpresaActiva(data.empresa);
        setEmpresaActiva(data.empresa);
      }

      setFormulario(FORMULARIO_EMPRESA_INICIAL);
      setEmpresaEditandoId(null);
      await cargarEmpresas();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  function editarEmpresa(empresa) {
    setMensaje("");
    setError("");
    setEmpresaEditandoId(empresa.id);
    setFormulario(empresaAFormulario(empresa));
  }

  function cancelarEdicion() {
    setEmpresaEditandoId(null);
    setFormulario(FORMULARIO_EMPRESA_INICIAL);
    setMensaje("");
    setError("");
  }

  async function manejarEliminarEmpresa(empresa) {
    const confirma = window.confirm(
      `Eliminar empresa ${empresa.razon_social}?\n\nLa empresa dejara de aparecer en el sistema. Esta acción no elimina los registros contables historicos.`
    );

    if (!confirma) {
      return;
    }

    try {
      setMensaje("");
      setError("");

      const data = await eliminarEmpresa(empresa.id);

      if (empresaActiva?.id === empresa.id) {
        eliminarEmpresaActiva();
        setEmpresaActiva(null);
      }

      if (empresaEditandoId === empresa.id) {
        cancelarEdicion();
      }

      setMensaje(data.mensaje || "Empresa eliminada correctamente");
      await cargarEmpresas();
    } catch (err) {
      setError(err.message);
    }
  }

  function seleccionarEmpresa(empresa) {
    guardarEmpresaActiva(empresa);
    setEmpresaActiva(empresa);
    setMensaje(`Empresa activa seleccionada: ${empresa.razon_social}`);

    if (alSeleccionarEmpresa) {
      alSeleccionarEmpresa(empresa);
    }
  }

  return (
    <div>
      <h1 style={titulo}>Empresas</h1>
      <p style={subtitulo}>
        Administra y selecciona la empresa activa del sistema.
      </p>

      {empresaActiva && (
        <div style={empresaActivaBox}>
          <strong>Empresa activa:</strong> {empresaActiva.razon_social} - RUT {empresaActiva.rut}
        </div>
      )}

      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      {!administradorSistema && (
        <div style={avisoCliente}>
          Tu usuario solo puede ver empresas asignadas por el administrador del sistema.
        </div>
      )}

      <div style={administradorSistema ? layout : layoutSoloTabla}>
        {administradorSistema && (
          <form style={formularioEstilo} onSubmit={manejarSubmit}>
            <h2 style={tituloSeccion}>
              {empresaEditandoId ? "Editar empresa" : "Crear empresa"}
            </h2>

            <label style={label}>RUT</label>
            <input
              style={input}
              name="rut"
              value={formulario.rut}
              onChange={manejarCambio}
              placeholder="76.123.456-7"
            />

            <label style={label}>Razón social</label>
            <input
              style={input}
              name="razon_social"
              value={formulario.razon_social}
              onChange={manejarCambio}
              placeholder="Empresa SpA"
            />

            <label style={label}>Giro</label>
            <input
              style={input}
              name="giro"
              value={formulario.giro}
              onChange={manejarCambio}
              placeholder="Servicios contables"
            />

            <label style={label}>Dirección</label>
            <input
              style={input}
              name="direccion"
              value={formulario.direccion}
              onChange={manejarCambio}
              placeholder="Dirección comercial"
            />

            <label style={label}>Comuna</label>
            <input
              style={input}
              name="comuna"
              value={formulario.comuna}
              onChange={manejarCambio}
              placeholder="Comuna"
            />

            <label style={label}>Ciudad</label>
            <input
              style={input}
              name="ciudad"
              value={formulario.ciudad}
              onChange={manejarCambio}
              placeholder="Ciudad"
            />

            <label style={label}>Régimen tributario</label>
            <select
              style={input}
              name="regimen_tributario"
              value={formulario.regimen_tributario}
              onChange={manejarCambio}
            >
              <option>14D3 Pro Pyme General</option>
              <option>14D8 Pro Pyme Transparente</option>
              <option>Régimen General Semi Integrado</option>
              <option>Sin régimen definido</option>
            </select>

            <div style={separadorFormulario}>Datos de contacto</div>

            <label style={label}>Teléfono empresa</label>
            <input
              style={input}
              name="telefono"
              value={formulario.telefono}
              onChange={manejarCambio}
              placeholder="+56 9 1234 5678"
            />

            <label style={label}>Correo empresa</label>
            <input
              style={input}
              name="correo"
              value={formulario.correo}
              onChange={manejarCambio}
              placeholder="contacto@empresa.cl"
            />

            <label style={label}>Descripción de la actividad</label>
            <textarea
              style={textarea}
              name="descripcion_actividad"
              value={formulario.descripcion_actividad}
              onChange={manejarCambio}
              placeholder="Detalle breve de la actividad comercial"
            />

            <div style={separadorFormulario}>Representante legal</div>

            <label style={label}>RUT representante</label>
            <input
              style={input}
              name="rut_representante"
              value={formulario.rut_representante}
              onChange={manejarCambio}
              placeholder="12.345.678-9"
            />

            <label style={label}>Nombre representante</label>
            <input
              style={input}
              name="representante_legal"
              value={formulario.representante_legal}
              onChange={manejarCambio}
              placeholder="Nombre completo"
            />

            <label style={label}>Correo representante</label>
            <input
              style={input}
              name="correo_representante"
              value={formulario.correo_representante}
              onChange={manejarCambio}
              placeholder="representante@empresa.cl"
            />

            <label style={label}>Teléfono representante</label>
            <input
              style={input}
              name="telefono_representante"
              value={formulario.telefono_representante}
              onChange={manejarCambio}
              placeholder="+56 9 1234 5678"
            />

            <div style={accionesFormulario}>
              <button style={boton} type="submit" disabled={guardando}>
                {guardando ? "Guardando..." : empresaEditandoId ? "Actualizar empresa" : "Guardar empresa"}
              </button>

              {empresaEditandoId && (
                <button style={botonCancelar} type="button" onClick={cancelarEdicion}>
                  Cancelar edicion
                </button>
              )}
            </div>
          </form>
        )}

        <div style={tablaBox}>
          <h2 style={tituloSeccion}>Empresas disponibles</h2>

          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>RUT</th>
                <th style={th}>Razón social</th>
                <th style={th}>Régimen</th>
                <th style={th}>Ciudad</th>
                <th style={th}>Contacto</th>
                <th style={th}>Representante</th>
                <th style={th}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {empresas.map((empresa) => {
                const activa = empresaActiva && empresaActiva.id === empresa.id;

                return (
                  <tr key={empresa.id}>
                    <td style={td}>{empresa.rut}</td>
                    <td style={td}>{empresa.razon_social}</td>
                    <td style={td}>{empresa.regimen_tributario}</td>
                    <td style={td}>{empresa.ciudad}</td>
                    <td style={td}>
                      <div>{empresa.correo || "-"}</div>
                      <small style={textoSecundario}>{empresa.telefono || ""}</small>
                    </td>
                    <td style={td}>
                      <div>{empresa.representante_legal || "-"}</div>
                      <small style={textoSecundario}>{empresa.rut_representante || ""}</small>
                    </td>
                    <td style={tdAccion}>
                      <div style={accionesTabla}>
                        <button type="button"
                          style={activa ? botonActivo : botonSeleccionar}
                          title={activa ? "Empresa activa" : "Seleccionar empresa"}
                          aria-label={activa ? "Empresa activa" : "Seleccionar empresa"}
                          onClick={() => seleccionarEmpresa(empresa)}
                        >
                          {activa ? "\u2713" : "\u279C"}
                        </button>

                        <button type="button"
                          style={botonEditar}
                          title="Editar empresa"
                          aria-label="Editar empresa"
                          onClick={() => editarEmpresa(empresa)}
                        >
                          {"\u270E"}
                        </button>

                        <button type="button"
                          style={botonEliminar}
                          title="Eliminar empresa"
                          aria-label="Eliminar empresa"
                          onClick={() => manejarEliminarEmpresa(empresa)}
                        >
                          {"\u2715"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {empresas.length === 0 && (
                <tr>
                  <td style={td} colSpan="7">
                    No hay empresas asignadas a tu usuario.
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
  marginBottom: "20px",
};

const empresaActivaBox = {
  background: "#dcfce7",
  color: "#166534",
  border: "1px solid #86efac",
  padding: "14px",
  borderRadius: "14px",
  marginBottom: "16px",
  fontWeight: "bold",
};

const avisoCliente = {
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  color: "var(--sc-azul)",
  border: "1px solid #7dd3fc",
  borderRadius: "14px",
  padding: "14px",
  marginBottom: "18px",
  fontWeight: "bold",
};

const layout = {
  display: "grid",
  gridTemplateColumns: "380px 1fr",
  gap: "25px",
  alignItems: "start",
};

const layoutSoloTabla = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: "25px",
  alignItems: "start",
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

const textarea = {
  ...input,
  minHeight: "72px",
  resize: "vertical",
};

const separadorFormulario = {
  color: "var(--sc-azul)",
  fontWeight: "bold",
  borderTop: "1px solid #dbeafe",
  paddingTop: "12px",
  marginTop: "14px",
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

const accionesFormulario = {
  display: "grid",
  gap: "10px",
};

const botonCancelar = {
  ...boton,
  marginTop: 0,
  background: "white",
  color: "var(--sc-azul)",
  border: "1px solid #38bdf8",
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

const th = {
  textAlign: "left",
  padding: "12px",
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  color: "var(--sc-azul)",
};

const td = {
  padding: "12px",
  borderBottom: "1px solid var(--sc-borde-claro)",
  color: "var(--sc-text)",
};

const textoSecundario = {
  color: "#64748b",
  display: "block",
  marginTop: "3px",
};

const tdAccion = {
  ...td,
  textAlign: "center",
  whiteSpace: "nowrap",
};

const accionesTabla = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
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

const botonSeleccionar = {
  ...botonAccionBase,
  background: "linear-gradient(135deg, var(--sc-azul), var(--sc-cian-medio))",
};

const botonActivo = {
  ...botonAccionBase,
  background: "linear-gradient(135deg, var(--sc-teal), var(--sc-cian-medio))",
};

const botonEditar = {
  ...botonAccionBase,
  background: "linear-gradient(135deg, #0284c7, #22d3ee)",
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

