import { useEffect, useMemo, useState } from "react";
import {
  listarUsuariosSistema,
  crearUsuarioSistema,
  actualizarUsuarioSistema,
  cambiarEstadoUsuario,
  enviarRecuperacionPasswordUsuario,
  obtenerUsuarioActual,
} from "../services/authService";
import { listarEmpresas } from "../services/empresaService";
import { EstadoCargando } from "../components/EstadoPantalla";

const ROLES_ADMIN_SISTEMA = ["admin", "superadmin", "super_admin", "administrador_sistema"];
function rolNormalizado(rol = "") {
  return String(rol || "").trim().toLowerCase();
}

function esAdminSistema(rol = "") {
  return ROLES_ADMIN_SISTEMA.includes(rolNormalizado(rol));
}

function nombreRol(rol = "") {
  const rolActual = rolNormalizado(rol);

  if (esAdminSistema(rolActual)) return "Administrador sistema";
  if (["admin_cliente", "cliente_admin"].includes(rolActual)) return "Administrador empresa";
  return "Usuario cliente";
}

function empresasAsignadas(usuario) {
  const empresas = Array.isArray(usuario?.empresas) ? usuario.empresas : [];

  if (empresas.length === 0) {
    return "Sin empresas asignadas";
  }

  return empresas
    .map((empresa) => {
      const nombre = empresa.razon_social || empresa.nombre || "Empresa";
      const rolEmpresa = empresa.rol_empresa ? ` (${empresa.rol_empresa})` : "";
      return `${nombre}${rolEmpresa}`;
    })
    .join(", ");
}

function formatearFecha(valor) {
  if (!valor) {
    return "-";
  }

  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    return String(valor).slice(0, 10);
  }

  return fecha.toLocaleDateString("es-CL");
}

function nombreSuscripcion(usuario) {
  const estado = String(usuario?.suscripcion_estado || "").trim().toLowerCase();

  if (!estado) return "-";
  if (["trial", "prueba", "prueba_gratis"].includes(estado)) return "Prueba gratis";
  if (["active", "activa"].includes(estado)) return "Activa";
  if (["expired", "vencida"].includes(estado)) return "Vencida";
  if (["suspended", "suspendida"].includes(estado)) return "Suspendida";
  if (["cancelled", "cancelada"].includes(estado)) return "Cancelada";

  return estado;
}

function empresaPrincipal(usuario) {
  const empresas = Array.isArray(usuario?.empresas) ? usuario.empresas : [];

  return empresas.find((empresa) => empresa?.empresa_id || empresa?.id) || null;
}

function normalizarRolEmpresa(rolEmpresa = "") {
  const rol = String(rolEmpresa || "").trim().toLowerCase();

  if (["admin", "administrador", "admin_sistema"].includes(rol)) {
    return "admin";
  }

  return "usuario";
}

export default function UsuariosSistema() {
  const usuarioActual = obtenerUsuarioActual();
  const adminSistema = esAdminSistema(usuarioActual?.rol);

  const [usuarios, setUsuarios] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [empresaFiltro, setEmpresaFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [usuarioEditandoId, setUsuarioEditandoId] = useState(null);

  const [formulario, setFormulario] = useState({
    nombre: "",
    email: "",
    rut: "",
    telefono: "",
    rol: "usuario_cliente",
    empresa_ids: [],
    rol_empresa: "usuario",
    activo: "true",
  });

  const rolesDisponibles = useMemo(() => {
    const roles = [
      { valor: "superadmin", label: "Administrador sistema" },
      { valor: "admin_cliente", label: "Administrador empresa" },
      { valor: "usuario_cliente", label: "Usuario cliente" },
    ];

    return roles;
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    if (!texto) {
      return usuarios;
    }

    return usuarios.filter((usuario) => {
      const empresasTexto = empresasAsignadas(usuario).toLowerCase();
      return [
        usuario.nombre,
        usuario.email,
        usuario.rut,
        usuario.rut_normalizado,
        usuario.telefono,
        empresasTexto,
      ]
        .filter(Boolean)
        .some((valor) => String(valor).toLowerCase().includes(texto));
    });
  }, [busqueda, usuarios]);

  async function cargarDatos() {
    try {
      setCargando(true);
      setError("");
      setMensaje("");

      const [datosEmpresas, datosUsuarios] = await Promise.all([
        listarEmpresas(),
        listarUsuariosSistema(empresaFiltro),
      ]);

      const listaEmpresas = Array.isArray(datosEmpresas?.empresas)
        ? datosEmpresas.empresas
        : [];

      setEmpresas(listaEmpresas);
      setUsuarios(Array.isArray(datosUsuarios?.usuarios) ? datosUsuarios.usuarios : []);

    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  async function buscarUsuarios() {
    try {
      setCargando(true);
      setError("");
      setMensaje("");

      const data = await listarUsuariosSistema(empresaFiltro);
      setUsuarios(Array.isArray(data?.usuarios) ? data.usuarios : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  function manejarCambio(e) {
    const { name, value } = e.target;

    setFormulario((actual) => ({
      ...actual,
      [name]: value,
    }));
  }

  function manejarEmpresas(e) {
    const seleccionadas = Array.from(e.target.selectedOptions).map((option) => option.value);

    setFormulario((actual) => ({
      ...actual,
      empresa_ids: seleccionadas,
    }));
  }

  function limpiarFormulario() {
    setUsuarioEditandoId(null);
    setFormulario((actual) => ({
      ...actual,
      nombre: "",
      email: "",
      rut: "",
      telefono: "",
      rol: "usuario_cliente",
      empresa_ids: [],
      rol_empresa: "usuario",
      activo: "true",
    }));
  }

  function editarUsuario(usuario) {
    const empresa = empresaPrincipal(usuario);

    setError("");
    setMensaje("");
    setUsuarioEditandoId(usuario.id);
    setFormulario({
      nombre: usuario.nombre || "",
      email: usuario.email || "",
      rut: usuario.rut || "",
      telefono: usuario.telefono || "",
      rol: rolNormalizado(usuario.rol) || "usuario_cliente",
      empresa_ids: Array.isArray(usuario.empresas)
        ? usuario.empresas
            .map((empresaUsuario) => String(empresaUsuario.empresa_id || empresaUsuario.id || ""))
            .filter(Boolean)
        : empresa
        ? [String(empresa.empresa_id || empresa.id)]
        : [],
      rol_empresa: empresa ? normalizarRolEmpresa(empresa.rol_empresa) : "usuario",
      activo: usuario.activo ? "true" : "false",
    });
  }

  // Evita el doble envío: un segundo clic antes de que responda el servidor
  // creaba el registro dos veces.
  const [guardando, setGuardando] = useState(false);

  async function guardarUsuario(e) {
    e.preventDefault();

    if (guardando) return;

    try {
      setGuardando(true);
      setError("");
      setMensaje("");

      const esSuperadmin = formulario.rol === "superadmin";
      const datos = {
        nombre: formulario.nombre.trim(),
        email: formulario.email.trim().toLowerCase(),
        rut: formulario.rut.trim(),
        telefono: formulario.telefono.trim(),
        rol: formulario.rol,
        empresa_ids: esSuperadmin ? [] : formulario.empresa_ids,
        rol_empresa: esSuperadmin ? null : formulario.rol_empresa,
        activo: formulario.activo === "true",
      };

      if (usuarioEditandoId) {
        await actualizarUsuarioSistema(usuarioEditandoId, datos);
        setMensaje("Usuario actualizado correctamente.");
        limpiarFormulario();
        await buscarUsuarios();
        return;
      }

      const respuesta = await crearUsuarioSistema(datos);

      limpiarFormulario();

      setMensaje(respuesta?.mensaje || "Usuario creado correctamente. Envia recuperacion para que defina su contrasena.");
      await buscarUsuarios();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function alternarEstado(usuario) {
    try {
      setError("");
      setMensaje("");

      await cambiarEstadoUsuario(usuario.id, !usuario.activo);
      setMensaje(usuario.activo ? "Usuario desactivado." : "Usuario activado.");
      await buscarUsuarios();
    } catch (err) {
      setError(err.message);
    }
  }

  async function enviarRecuperacion(usuario) {
    const confirmar = window.confirm(
      `Enviar recuperacion de contrasena a ${usuario.email}?`
    );

    if (!confirmar) {
      return;
    }

    try {
      setError("");
      setMensaje("");

      const respuesta = await enviarRecuperacionPasswordUsuario(usuario.id);
      setMensaje(respuesta?.mensaje || "Recuperacion de contrasena generada correctamente.");
    } catch (err) {
      setError(err.message);
    }
  }

  if (!adminSistema) {
    return (
      <div>
        <h1 style={titulo}>Usuarios y accesos</h1>
        <p style={errorTexto}>Solo el Administrador del Sistema puede administrar usuarios.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={titulo}>Usuarios y accesos</h1>
      <p style={subtitulo}>
        Administra usuarios, perfiles y empresas asociadas del sistema completo.
      </p>

      {mensaje && <p style={ok}>{mensaje}</p>}
      {cargando && <EstadoCargando mensaje="Cargando datos..." />}
      {error && <p style={errorTexto}>{error}</p>}

      <div style={gridPrincipal}>
        <form style={card} onSubmit={guardarUsuario}>
          <h2 style={tituloSeccion}>
            {usuarioEditandoId ? "Editar acceso" : "Crear acceso"}
          </h2>

          <div style={gridFormulario}>
            <div>
              <label style={label}>Nombre</label>
              <input
                style={input}
                name="nombre"
                value={formulario.nombre}
                onChange={manejarCambio}
                placeholder="Nombre del usuario"
              />
            </div>

            <div>
              <label style={label}>Correo</label>
              <input
                style={input}
                name="email"
                type="email"
                value={formulario.email}
                onChange={manejarCambio}
                placeholder="cliente@empresa.cl"
              />
            </div>

            <div>
              <label style={label}>RUT</label>
              <input
                style={input}
                name="rut"
                value={formulario.rut}
                onChange={manejarCambio}
                placeholder="Opcional"
              />
            </div>

            <div>
              <label style={label}>Teléfono</label>
              <input
                style={input}
                name="telefono"
                value={formulario.telefono}
                onChange={manejarCambio}
                placeholder="Opcional"
              />
            </div>

            <div>
              <label style={label}>Rol del sistema</label>
              <select
                style={input}
                name="rol"
                value={formulario.rol}
                onChange={manejarCambio}
              >
                {rolesDisponibles.map((rol) => (
                  <option key={rol.valor} value={rol.valor}>
                    {rol.label}
                  </option>
                ))}
              </select>
            </div>

            {formulario.rol !== "superadmin" && (
              <>
                <div>
                  <label style={label}>Empresas asignadas</label>
                  <select
                    style={input}
                    name="empresa_ids"
                    multiple
                    value={formulario.empresa_ids}
                    onChange={manejarEmpresas}
                  >
                    {empresas.length === 0 && (
                      <option value="">No hay empresas disponibles</option>
                    )}
                    {empresas.map((empresa) => (
                      <option key={empresa.id} value={empresa.id}>
                        {empresa.razon_social || empresa.nombre || "Empresa"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={label}>Permiso en empresa</label>
                  <select
                    style={input}
                    name="rol_empresa"
                    value={formulario.rol_empresa}
                    onChange={manejarCambio}
                  >
                    <option value="usuario">Usuario</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </>
            )}

            {usuarioEditandoId && (
              <div>
                <label style={label}>Estado</label>
                <select
                  style={input}
                  name="activo"
                  value={formulario.activo}
                  onChange={manejarCambio}
                >
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
            )}
          </div>

          <div style={accionesFormulario}>
            <button style={botonGuardar} type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : usuarioEditandoId ? "Guardar cambios" : "Crear usuario"}
            </button>

            {usuarioEditandoId && (
              <button style={botonCancelar} type="button" onClick={limpiarFormulario}>
                Cancelar edicion
              </button>
            )}
          </div>
        </form>

        <div style={cardInfo}>
          <h2 style={tituloSeccion}>Como queda el acceso</h2>
          <p style={textoInfo}>
            El Administrador del Sistema ve la administracion global. Los usuarios
            cliente solo trabajan con las empresas asociadas a su cuenta.
          </p>
          <p style={textoInfo}>
            Por seguridad no se crean ni muestran claves. El usuario define su
            contrasena mediante recuperacion segura.
          </p>
        </div>
      </div>

      <div style={cardTabla}>
        <div style={cabeceraTabla}>
          <h2 style={tituloSeccion}>Usuarios registrados</h2>

          <div style={filtros}>
            <input
              style={inputFiltro}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar nombre, correo, RUT o empresa"
            />
            <select
              style={inputFiltro}
              value={empresaFiltro}
              onChange={(e) => setEmpresaFiltro(e.target.value)}
            >
              <option value="">Todas las empresas</option>
              {empresas.map((empresa) => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.razon_social || empresa.nombre || "Empresa"}
                </option>
              ))}
            </select>

            <button style={botonBuscar} type="button" onClick={buscarUsuarios}>
              Buscar
            </button>
          </div>
        </div>

        {cargando && <p style={subtitulo}>Cargando usuarios...</p>}

        <div style={{ overflowX: "auto" }}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Usuario</th>
                <th style={th}>Correo</th>
                <th style={th}>RUT</th>
                <th style={th}>Rol</th>
                <th style={th}>Empresas</th>
                <th style={th}>Último acceso</th>
                <th style={th}>Suscripción</th>
                <th style={th}>Estado</th>
                <th style={th}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {usuariosFiltrados.map((usuario) => (
                <tr key={usuario.id}>
                  <td style={td}>{usuario.nombre}</td>
                  <td style={td}>{usuario.email}</td>
                  <td style={td}>{usuario.rut || "-"}</td>
                  <td style={td}>{nombreRol(usuario.rol)}</td>
                  <td style={td}>{empresasAsignadas(usuario)}</td>
                  <td style={td}>{formatearFecha(usuario.ultimo_acceso_en)}</td>
                  <td style={td}>{nombreSuscripcion(usuario)}</td>
                  <td style={td}>
                    <span style={usuario.activo ? badgeActivo : badgeInactivo}>
                      {usuario.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td style={tdAccion}>
                    <button
                      type="button"
                      title="Editar usuario"
                      aria-label="Editar usuario"
                      style={botonIconoEditar}
                      onClick={() => editarUsuario(usuario)}
                    >
                      {"\u270E"}
                    </button>
                    <button
                      type="button"
                      title="Enviar recuperacion de contrasena"
                      aria-label="Enviar recuperacion de contrasena"
                      style={botonIconoAzul}
                      onClick={() => enviarRecuperacion(usuario)}
                    >
                      {"\uD83D\uDD11"}
                    </button>
                    <button
                      type="button"
                      title={usuario.activo ? "Desactivar" : "Activar"}
                      aria-label={usuario.activo ? "Desactivar usuario" : "Activar usuario"}
                      style={usuario.activo ? botonIconoRojo : botonIconoVerde}
                      onClick={() => alternarEstado(usuario)}
                    >
                      {usuario.activo ? "\u2715" : "\u2713"}
                    </button>
                  </td>
                </tr>
              ))}

              {usuariosFiltrados.length === 0 && !cargando && (
                <tr>
                  <td style={td} colSpan="9">
                    No hay usuarios para el filtro seleccionado.
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
  color: "#0f172a",
  marginBottom: "5px",
};

const subtitulo = {
  color: "#475569",
  marginBottom: "20px",
};

const gridPrincipal = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 360px",
  gap: "20px",
  alignItems: "start",
};

const card = {
  background: "white",
  borderRadius: "18px",
  padding: "24px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
};

const cardInfo = {
  ...card,
  border: "1px solid #67e8f9",
  background: "#f0f9ff",
};

const cardTabla = {
  ...card,
  marginTop: "22px",
};

const tituloSeccion = {
  color: "#0369a1",
  marginTop: 0,
};

const gridFormulario = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "#1e293b",
  marginBottom: "6px",
};

const input = {
  width: "100%",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #a9d8ef",
  boxSizing: "border-box",
};

const inputFiltro = {
  ...input,
  minWidth: "240px",
};

const botonGuardar = {
  background: "#10b981",
  color: "white",
  border: "none",
  padding: "13px 18px",
  borderRadius: "12px",
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: "18px",
};

const accionesFormulario = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
  marginTop: "18px",
};

const botonCancelar = {
  background: "white",
  color: "#0369a1",
  border: "1px solid #38bdf8",
  padding: "13px 18px",
  borderRadius: "12px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonBuscar = {
  background: "#0369a1",
  color: "white",
  border: "none",
  padding: "12px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const cabeceraTabla = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
  flexWrap: "wrap",
};

const filtros = {
  display: "flex",
  gap: "10px",
  alignItems: "center",
  flexWrap: "wrap",
};

const tabla = {
  width: "100%",
  borderCollapse: "collapse",
};

const th = {
  textAlign: "left",
  padding: "12px",
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  color: "#0369a1",
  whiteSpace: "nowrap",
};

const td = {
  padding: "12px",
  borderBottom: "1px solid #e2e8f0",
  color: "#1e293b",
  verticalAlign: "top",
};

const tdAccion = {
  ...td,
  display: "flex",
  gap: "8px",
  justifyContent: "center",
  whiteSpace: "nowrap",
};

const badgeActivo = {
  background: "#dcfce7",
  color: "#166534",
  borderRadius: "999px",
  padding: "5px 9px",
  fontWeight: "bold",
  fontSize: "12px",
};

const badgeInactivo = {
  background: "#fee2e2",
  color: "#991b1b",
  borderRadius: "999px",
  padding: "5px 9px",
  fontWeight: "bold",
  fontSize: "12px",
};

const botonIconoAzul = {
  width: "32px",
  height: "32px",
  border: "none",
  borderRadius: "9px",
  background: "linear-gradient(135deg, #0369a1, #06b6d4)",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
  padding: 0,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "15px",
};

const botonIconoEditar = {
  ...botonIconoAzul,
  background: "linear-gradient(135deg, #0284c7, #22d3ee)",
};

const botonIconoRojo = {
  ...botonIconoAzul,
  background: "linear-gradient(135deg, #ef4444, #f97316)",
};

const botonIconoVerde = {
  ...botonIconoAzul,
  background: "linear-gradient(135deg, #10b981, #06b6d4)",
};

const textoInfo = {
  color: "#1e293b",
  lineHeight: "1.45",
};

const ok = {
  color: "#10b981",
  fontWeight: "bold",
};

const errorTexto = {
  color: "#ef4444",
  fontWeight: "bold",
};
