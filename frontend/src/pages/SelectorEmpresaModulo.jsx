import { useEffect, useState } from "react";
import { crearEmpresa, listarEmpresas } from "../services/empresaService";

const LOGO_SRC = "/servcontable-logo.png";

const EMPRESA_INICIAL = {
  razon_social: "",
  rut: "",
  giro: "",
  regimen_tributario: "14D3 Pro Pyme General",
  direccion: "",
  comuna: "",
  ciudad: "",
  telefono: "",
  correo: "",
  descripcion_actividad: "",
  rut_representante: "",
  representante_legal: "",
  correo_representante: "",
  telefono_representante: "",
};

export default function SelectorEmpresaModulo({
  usuario,
  moduloActivo,
  alSeleccionarEmpresa,
  volverASeleccionModulo,
  alCerrarSesion,
}) {
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState("");
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [mostrarCrearEmpresa, setMostrarCrearEmpresa] = useState(false);

  const administradorSistema = true;
  const puedeCrearEmpresa = administradorSistema;

  const [nuevaEmpresa, setNuevaEmpresa] = useState(EMPRESA_INICIAL);

  async function cargarEmpresas() {
    try {
      setError("");
      setMensaje("");

      const data = await listarEmpresas();
      const lista = Array.isArray(data?.empresas) ? data.empresas : [];

      setEmpresas(lista);

      if (lista.length > 0) {
        setEmpresaId(String(lista[0].id));
        setEmpresaSeleccionada(lista[0]);
      } else {
        setEmpresaId("");
        setEmpresaSeleccionada(null);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    cargarEmpresas();
  }, []);

  function cambiarEmpresa(e) {
    const id = e.target.value;
    setEmpresaId(id);

    const encontrada = empresas.find((item) => String(item.id) === String(id));
    setEmpresaSeleccionada(encontrada || null);
  }

  function continuar() {
    setError("");

    if (!empresaSeleccionada) {
      setError("Debes seleccionar una empresa.");
      return;
    }

    sessionStorage.setItem("empresaActiva", JSON.stringify(empresaSeleccionada));
    localStorage.removeItem("empresaActiva");
    alSeleccionarEmpresa(empresaSeleccionada);
  }

  function nombreModulo() {
    if (moduloActivo === "contable") return "Módulo Contable";
    if (moduloActivo === "remuneraciones") return "Módulo Remuneraciones";
    if (moduloActivo === "simplificada") return "Módulo Contabilidad Simplificada";
    return "Módulo";
  }

  async function guardarNuevaEmpresa() {
    try {
      setError("");
      setMensaje("");

      if (!nuevaEmpresa.razon_social || !nuevaEmpresa.rut) {
        setError("Debe ingresar razón social y RUT de la empresa.");
        return;
      }

      const data = await crearEmpresa(nuevaEmpresa);
      const empresasActualizadas = await listarEmpresas();
      const listaActualizada = Array.isArray(empresasActualizadas?.empresas)
        ? empresasActualizadas.empresas
        : [];

      setEmpresas(listaActualizada);

      const empresaCreada = data?.empresa;
      if (empresaCreada?.id) {
        setEmpresaId(String(empresaCreada.id));
        setEmpresaSeleccionada(empresaCreada);
      } else if (listaActualizada.length > 0) {
        const ultimaEmpresa = listaActualizada[listaActualizada.length - 1];
        setEmpresaId(String(ultimaEmpresa.id));
        setEmpresaSeleccionada(ultimaEmpresa);
      }

      setMostrarCrearEmpresa(false);
      setNuevaEmpresa(EMPRESA_INICIAL);
      setMensaje("Empresa creada correctamente.");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={contenedor}>
      <div style={barraSuperior}>
        <strong style={{ color: "#0369a1" }}>
          ServContable PRO - {usuario?.nombre || usuario?.email || "Usuario"}
        </strong>

        <div style={accionesTop}>
          <button type="button" style={botonVolverTop} onClick={volverASeleccionModulo}>
            Cambiar módulo
          </button>
          <button type="button" style={botonSalir} onClick={alCerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      </div>

      <div style={contenido}>
        <div style={card}>
          <img style={icono} src={LOGO_SRC} alt="ServContable" />
          <h1 style={titulo}>Seleccionar empresa</h1>

          {empresas.length > 0 ? (
            <p style={subtitulo}>
              Estas ingresando a <strong>{nombreModulo()}</strong>. Selecciona la
              empresa con la que deseas trabajar.
            </p>
          ) : (
            <div style={bienvenidaTrialBox}>
              <h2 style={bienvenidaTitulo}>Bienvenido a ServContable PRO</h2>
              <p>
                Tu prueba gratuita ya está activa. Para comenzar debes configurar
                la empresa con la que deseas trabajar.
              </p>
            </div>
          )}

          {error && <p style={mensajeError}>{error}</p>}
          {mensaje && <p style={mensajeOk}>{mensaje}</p>}

          {empresas.length === 0 && (
            <div style={sinEmpresasBox}>
              Aún no tienes una empresa configurada. Presiona
              <strong> Configurar mi empresa</strong> para ingresar los datos de
              la empresa dentro del sistema.
            </div>
          )}

          <div style={formulario}>
            <div>
              <label style={label}>Empresa</label>
              <select style={input} value={empresaId} onChange={cambiarEmpresa}>
                {empresas.length === 0 && <option value="">No hay empresas asignadas</option>}
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.razon_social || empresa.nombre || "Empresa sin nombre"}
                  </option>
                ))}
              </select>
            </div>

            {empresaSeleccionada && (
              <div style={resumenEmpresa}>
                <strong style={resumenTitulo}>
                  {empresaSeleccionada.razon_social || empresaSeleccionada.nombre || "Empresa"}
                </strong>
                <span>RUT: {empresaSeleccionada.rut || "Sin RUT registrado"}</span>
                {(empresaSeleccionada.correo || empresaSeleccionada.telefono) && (
                  <span>
                    Contacto: {empresaSeleccionada.correo || "Sin correo"}
                    {empresaSeleccionada.telefono ? ` / ${empresaSeleccionada.telefono}` : ""}
                  </span>
                )}
                {empresaSeleccionada.representante_legal && (
                  <span>Representante: {empresaSeleccionada.representante_legal}</span>
                )}
                <span>
                  Régimen: {empresaSeleccionada.regimen_tributario || empresaSeleccionada.regimen || "No indicado"}
                </span>
              </div>
            )}

            <button type="button"
              style={{ ...botonPrimario, opacity: empresaSeleccionada ? 1 : 0.55 }}
              onClick={continuar}
              disabled={!empresaSeleccionada}
            >
              Continuar a {nombreModulo()}
            </button>

            {puedeCrearEmpresa && (
              <button
                type="button"
                style={botonCrearEmpresa}
                onClick={() => {
                  setError("");
                  setMensaje("");
                  setMostrarCrearEmpresa(!mostrarCrearEmpresa);
                }}
              >
                {mostrarCrearEmpresa
                  ? "Cancelar creación"
                  : empresas.length === 0
                  ? "Configurar mi empresa"
                  : "+ Crear nueva empresa"}
              </button>
            )}

            {puedeCrearEmpresa && mostrarCrearEmpresa && (
              <div style={cardCrearEmpresa}>
                <h3 style={tituloCrearEmpresa}>Crear nueva empresa</h3>
                <div style={gridFormulario}>
                  <CampoEmpresa label="Razón social" campo="razon_social" valor={nuevaEmpresa.razon_social} setNuevaEmpresa={setNuevaEmpresa} />
                  <CampoEmpresa label="RUT empresa" campo="rut" valor={nuevaEmpresa.rut} setNuevaEmpresa={setNuevaEmpresa} />
                  <CampoEmpresa label="Giro" campo="giro" valor={nuevaEmpresa.giro} setNuevaEmpresa={setNuevaEmpresa} />

                  <div>
                    <label style={label}>Régimen tributario</label>
                    <select
                      style={input}
                      value={nuevaEmpresa.regimen_tributario}
                      onChange={(e) => setNuevaEmpresa((actual) => ({ ...actual, regimen_tributario: e.target.value }))}
                    >
                      <option value="14D3 Pro Pyme General">14D3 Pro Pyme General</option>
                      <option value="14D8 Pro Pyme Transparente">14D8 Pro Pyme Transparente</option>
                      <option value="Regimen General">Régimen General</option>
                      <option value="Renta Presunta">Renta Presunta</option>
                      <option value="Sin regimen informado">Sin régimen informado</option>
                    </select>
                  </div>

                  <CampoEmpresa label="Dirección" campo="direccion" valor={nuevaEmpresa.direccion} setNuevaEmpresa={setNuevaEmpresa} />
                  <CampoEmpresa label="Comuna" campo="comuna" valor={nuevaEmpresa.comuna} setNuevaEmpresa={setNuevaEmpresa} />
                  <CampoEmpresa label="Ciudad" campo="ciudad" valor={nuevaEmpresa.ciudad} setNuevaEmpresa={setNuevaEmpresa} />
                  <CampoEmpresa label="Teléfono empresa" campo="telefono" valor={nuevaEmpresa.telefono} setNuevaEmpresa={setNuevaEmpresa} />
                  <CampoEmpresa label="Correo empresa" campo="correo" valor={nuevaEmpresa.correo} setNuevaEmpresa={setNuevaEmpresa} />
                  <CampoEmpresa
                    label="Descripción de la actividad"
                    campo="descripcion_actividad"
                    valor={nuevaEmpresa.descripcion_actividad}
                    setNuevaEmpresa={setNuevaEmpresa}
                    multilinea
                    anchoCompleto
                  />

                  <div style={separadorFormulario}>Representante legal</div>
                  <CampoEmpresa label="RUT representante" campo="rut_representante" valor={nuevaEmpresa.rut_representante} setNuevaEmpresa={setNuevaEmpresa} />
                  <CampoEmpresa label="Nombre representante" campo="representante_legal" valor={nuevaEmpresa.representante_legal} setNuevaEmpresa={setNuevaEmpresa} />
                  <CampoEmpresa label="Correo representante" campo="correo_representante" valor={nuevaEmpresa.correo_representante} setNuevaEmpresa={setNuevaEmpresa} />
                  <CampoEmpresa label="Teléfono representante" campo="telefono_representante" valor={nuevaEmpresa.telefono_representante} setNuevaEmpresa={setNuevaEmpresa} />
                </div>

                <button type="button" style={botonGuardarEmpresa} onClick={guardarNuevaEmpresa}>
                  Guardar empresa
                </button>
              </div>
            )}

            <button type="button" style={botonSecundario} onClick={volverASeleccionModulo}>
              Volver a seleccionar módulo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CampoEmpresa({
  label,
  campo,
  valor,
  setNuevaEmpresa,
  multilinea = false,
  anchoCompleto = false,
}) {
  const props = {
    style: multilinea ? { ...input, minHeight: "58px", resize: "vertical" } : input,
    value: valor,
    onChange: (e) => setNuevaEmpresa((actual) => ({ ...actual, [campo]: e.target.value })),
  };

  return (
    <div style={anchoCompleto ? campoAnchoCompleto : undefined}>
      <label style={labelEstilo}>{label}</label>
      {multilinea ? <textarea {...props} /> : <input {...props} />}
    </div>
  );
}

const contenedor = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at 84% 14%, rgba(34, 211, 238, 0.30), transparent 25%), radial-gradient(circle at 12% 86%, rgba(16, 185, 129, 0.20), transparent 30%), linear-gradient(135deg, #07111f 0%, #075985 54%, #22d3ee 100%)",
  fontFamily: "Arial, sans-serif",
};

const barraSuperior = {
  minHeight: "52px",
  background: "rgba(255,255,255,0.92)",
  borderBottom: "1px solid rgba(255,255,255,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 22px",
  color: "#0f172a",
  boxShadow: "0 12px 30px rgba(7, 17, 31, 0.16)",
  boxSizing: "border-box",
  gap: "12px",
  flexWrap: "wrap",
  backdropFilter: "blur(14px)",
};

const accionesTop = {
  display: "flex",
  gap: "10px",
  alignItems: "center",
};

const contenido = {
  minHeight: "calc(100vh - 52px)",
  padding: "22px 18px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
};

const card = {
  width: "100%",
  maxWidth: "660px",
  background: "rgba(255,255,255,0.97)",
  borderRadius: "22px",
  padding: "24px",
  boxShadow: "0 26px 70px rgba(7, 17, 31, 0.24)",
  border: "1px solid rgba(255,255,255,0.55)",
};

const icono = {
  width: "48px",
  height: "48px",
  borderRadius: "14px",
  background: "linear-gradient(135deg, #dff7ff, #ffffff)",
  border: "1px solid #67e8f9",
  objectFit: "contain",
  padding: "6px",
  boxSizing: "border-box",
  margin: "0 auto 10px auto",
  boxShadow: "0 12px 26px rgba(15, 76, 129, 0.16)",
};

const titulo = {
  color: "#0369a1",
  textAlign: "center",
  fontSize: "28px",
  margin: "0 0 6px 0",
};

const subtitulo = {
  color: "#155e75",
  textAlign: "center",
  fontSize: "14px",
  lineHeight: "1.35",
  marginBottom: "16px",
};

const formulario = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const label = {
  display: "block",
  marginBottom: "4px",
  color: "#1e293b",
  fontWeight: "bold",
  fontSize: "13px",
};

const labelEstilo = label;

const input = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: "9px",
  border: "1px solid #a9d8ef",
  fontSize: "14px",
  boxSizing: "border-box",
};

const resumenEmpresa = {
  background: "#f8fcff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "12px",
  color: "#1e293b",
  display: "flex",
  flexDirection: "column",
  gap: "3px",
  fontSize: "13px",
};

const resumenTitulo = {
  color: "#0369a1",
  fontSize: "15px",
};

const botonPrimario = {
  background: "linear-gradient(135deg, #0369a1, #06b6d4)",
  color: "white",
  border: "none",
  padding: "11px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  boxShadow: "0 8px 18px rgba(15,76,129,0.28)",
};

const botonSecundario = {
  background: "transparent",
  color: "#0369a1",
  border: "none",
  padding: "7px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonVolverTop = {
  background: "linear-gradient(135deg, #0369a1, #06b6d4)",
  color: "white",
  border: "none",
  padding: "8px 12px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonSalir = {
  background: "linear-gradient(135deg, #ef4444, #f97316)",
  color: "white",
  border: "none",
  padding: "8px 12px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
};

const mensajeError = {
  marginTop: "6px",
  color: "#ef4444",
  fontWeight: "bold",
  textAlign: "center",
};

const mensajeOk = {
  marginTop: "6px",
  color: "#10b981",
  fontWeight: "bold",
  textAlign: "center",
};

const bienvenidaTrialBox = {
  background: "linear-gradient(135deg, #ecfeff, #f0fdf4)",
  border: "1px solid #67e8f9",
  color: "#075985",
  borderRadius: "12px",
  padding: "14px",
  fontSize: "14px",
  lineHeight: 1.35,
  marginBottom: "12px",
};

const bienvenidaTitulo = {
  margin: "0 0 8px 0",
  color: "#0369a1",
  fontSize: "22px",
};

const sinEmpresasBox = {
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  borderRadius: "11px",
  padding: "10px",
  fontWeight: "bold",
  marginBottom: "12px",
  fontSize: "13px",
};

const botonCrearEmpresa = {
  background: "transparent",
  color: "#0369a1",
  border: "1px solid #0369a1",
  padding: "10px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  width: "100%",
};

const cardCrearEmpresa = {
  background: "#f8fcff",
  border: "1px solid #a9d8ef",
  borderRadius: "12px",
  padding: "12px",
  marginTop: "4px",
};

const tituloCrearEmpresa = {
  color: "#0369a1",
  marginTop: 0,
  marginBottom: "10px",
  fontSize: "18px",
};

const gridFormulario = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: "9px",
  marginBottom: "10px",
};

const campoAnchoCompleto = {
  gridColumn: "1 / -1",
};

const separadorFormulario = {
  ...campoAnchoCompleto,
  color: "#0369a1",
  fontWeight: "bold",
  fontSize: "14px",
  borderTop: "1px solid #dbeafe",
  paddingTop: "10px",
  marginTop: "2px",
};

const botonGuardarEmpresa = {
  background: "linear-gradient(135deg, #10b981, #06b6d4)",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  width: "100%",
};

