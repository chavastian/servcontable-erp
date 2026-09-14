import { useState } from "react";
import {
  crearPruebaGratis,
  loginUsuario,
  resetearPasswordConToken,
  solicitarRecuperacionPassword,
} from "../services/authService";

const LOGO_SRC = "/servcontable-logo.png";

export default function Login({ irARegistro, loginCorrecto }) {
  const esEscritorio = import.meta.env.VITE_DESKTOP_MODE === "true";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [urlResetDesarrollo, setUrlResetDesarrollo] = useState("");
  const [error, setError] = useState("");
  const [solicitarPrueba, setSolicitarPrueba] = useState(false);
  const [trialForm, setTrialForm] = useState({
    correo: "",
    password: "",
    confirmarPassword: "",
  });
  const [resetToken, setResetToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("resetToken") || "";
  });
  const [modoRecuperacion, setModoRecuperacion] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get("resetToken"));
  });

  const permiteRegistroPublico =
    import.meta.env.VITE_ALLOW_PUBLIC_REGISTRATION === "true";

  async function manejarLogin(e) {
    e.preventDefault();

    try {
      limpiarMensajes();
      const data = await loginUsuario(email, password);
      loginCorrecto(data.usuario);
    } catch (err) {
      setError(err.message);
    }
  }

  async function manejarSolicitudPrueba(e) {
    e.preventDefault();

    try {
      limpiarMensajes();

      const data = await crearPruebaGratis({
        correo: trialForm.correo || email,
        password: trialForm.password,
        confirmar_password: trialForm.confirmarPassword,
      });

      setEmail(data.usuario?.email || trialForm.correo || email);
      setTrialForm({
        correo: "",
        password: "",
        confirmarPassword: "",
      });
      setSolicitarPrueba(false);
      setMensaje("¡Bienvenido a ServContable PRO! Tu prueba gratuita ya esta activa.");
      loginCorrecto(data.usuario);
    } catch (err) {
      setError(err.message);
    }
  }

  async function manejarSolicitudRecuperacion(e) {
    e.preventDefault();

    try {
      limpiarMensajes();
      const data = await solicitarRecuperacionPassword(email);
      setMensaje(data.mensaje);

      if (data.url_reset_desarrollo) {
        setUrlResetDesarrollo(data.url_reset_desarrollo);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function manejarResetPassword(e) {
    e.preventDefault();

    try {
      limpiarMensajes();
      const data = await resetearPasswordConToken(resetToken, nuevaPassword);

      setMensaje(data.mensaje);
      setNuevaPassword("");
      setResetToken("");
      setModoRecuperacion(false);
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      setError(err.message);
    }
  }

  function limpiarMensajes() {
    setError("");
    setMensaje("");
    setUrlResetDesarrollo("");
  }

  function volverLogin() {
    setModoRecuperacion(false);
    setResetToken("");
    setNuevaPassword("");
    setSolicitarPrueba(false);
    limpiarMensajes();
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  function cambiarTrial(campo, valor) {
    setTrialForm((actual) => ({ ...actual, [campo]: valor }));
  }

  return (
    <div style={contenedor}>
      <div style={tarjeta}>
        <img style={logo} src={LOGO_SRC} alt="ServContable" />
        <h1 style={titulo}>ServContable PRO{esEscritorio ? " Escritorio" : ""}</h1>
        <p style={subtitulo}>
          {esEscritorio
            ? "Sistema contable local"
            : resetToken
            ? "Define una nueva contraseña"
            : modoRecuperacion
            ? "Recuperación segura de acceso"
            : "Ingreso seguro al sistema"}
        </p>

        {resetToken ? (
          <form onSubmit={manejarResetPassword} style={formulario}>
            <CampoPassword
              label="Nueva contraseña"
              value={nuevaPassword}
              onChange={setNuevaPassword}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
            />

            <button style={botonPrimario} type="submit">
              Actualizar contraseña
            </button>
          </form>
        ) : modoRecuperacion ? (
          <form onSubmit={manejarSolicitudRecuperacion} style={formulario}>
            <p style={textoAyuda}>
              Ingresa tu RUT o correo y enviaremos un enlace temporal para crear una
              nueva contraseña.
            </p>

            <CampoIdentificador value={email} onChange={setEmail} />

            <button style={botonPrimario} type="submit">
              Enviar instrucciones
            </button>
          </form>
        ) : solicitarPrueba ? (
          <form onSubmit={manejarSolicitudPrueba} style={formulario}>
            <p style={textoAyuda}>
              Prueba ServContable PRO gratis por 30 días. No necesitas ingresar datos de pago.
            </p>

            <CampoTexto
              label="Correo"
              type="email"
              value={trialForm.correo || email}
              onChange={(valor) => {
                cambiarTrial("correo", valor);
                setEmail(valor);
              }}
              placeholder="correo@empresa.cl"
            />
            <CampoPassword
              label="Contraseña"
              value={trialForm.password}
              onChange={(valor) => cambiarTrial("password", valor)}
              placeholder="Minimo 8 caracteres"
              autoComplete="new-password"
            />
            <CampoPassword
              label="Confirmar contraseña"
              value={trialForm.confirmarPassword}
              onChange={(valor) => cambiarTrial("confirmarPassword", valor)}
              placeholder="Repite tu contraseña"
              autoComplete="new-password"
            />

            <button style={botonPrimario} type="submit">
              Comenzar prueba gratis
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={manejarLogin} style={formulario}>
              <CampoIdentificador value={email} onChange={setEmail} />
              <CampoPassword
                label="Contraseña"
                value={password}
                onChange={setPassword}
                placeholder="********"
                autoComplete="current-password"
              />

              <button style={botonPrimario} type="submit">
                Ingresar
              </button>
            </form>

            {!esEscritorio && (
              <button
                style={botonSecundario}
                type="button"
                onClick={() => {
                  setModoRecuperacion(true);
                  limpiarMensajes();
                }}
              >
              Recuperar contraseña
              </button>
            )}

            {!esEscritorio && (
              <button
                style={botonDemo}
                type="button"
                onClick={() => {
                  setSolicitarPrueba(true);
                  limpiarMensajes();
                  setTrialForm((actual) => ({ ...actual, correo: email }));
                }}
              >
                Probar gratis
              </button>
            )}

            {permiteRegistroPublico && (
              <button style={botonSecundario} onClick={irARegistro}>
                Crear una cuenta nueva
              </button>
            )}

            {!permiteRegistroPublico && (
              <p style={notaAcceso}>
                Los accesos son creados por el administrador del equipo.
                {esEscritorio && " Los datos permanecen en este computador."}
              </p>
            )}
          </>
        )}

        {mensaje && <p style={mensajeOk}>{mensaje}</p>}
        {urlResetDesarrollo && (
          <a style={enlaceDev} href={urlResetDesarrollo}>
            Abrir enlace de prueba local
          </a>
        )}
        {error && <p style={mensajeError}>{error}</p>}

        {(modoRecuperacion || resetToken || solicitarPrueba) && (
          <button style={botonSecundario} type="button" onClick={volverLogin}>
            Volver al ingreso
          </button>
        )}
      </div>
    </div>
  );
}

function CampoEmail({ value, onChange }) {
  return (
    <CampoTexto
      label="Correo electrónico"
      type="email"
      value={value}
      onChange={onChange}
      placeholder="correo@empresa.cl"
      autoComplete="username"
    />
  );
}

function CampoIdentificador({ value, onChange }) {
  return (
    <CampoTexto
      label="RUT o correo"
      type="text"
      value={value}
      onChange={onChange}
      placeholder="16.153.127-8 o correo@empresa.cl"
      autoComplete="username"
    />
  );
}

function CampoPassword({ label, value, onChange, placeholder, autoComplete }) {
  return (
    <CampoTexto
      label={label}
      type="password"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      autoComplete={autoComplete}
    />
  );
}

function CampoTexto({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  autoComplete = "off",
}) {
  return (
    <div>
      <label style={labelEstilo}>{label}</label>
      <input
        style={input}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
    </div>
  );
}

const contenedor = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at 78% 18%, rgba(34, 211, 238, 0.34), transparent 25%), linear-gradient(135deg, #07111f 0%, #075985 48%, #22d3ee 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "Arial, sans-serif",
  padding: "16px",
};

const tarjeta = {
  width: "100%",
  maxWidth: "390px",
  background: "rgba(255,255,255,0.96)",
  borderRadius: "22px",
  padding: "26px",
  boxShadow: "0 22px 58px rgba(7, 17, 31, 0.26)",
  border: "1px solid rgba(255,255,255,0.48)",
};

const logo = {
  width: "58px",
  height: "58px",
  borderRadius: "16px",
  objectFit: "contain",
  background: "linear-gradient(135deg, #dff7ff, #ffffff)",
  border: "1px solid #67e8f9",
  padding: "6px",
  boxSizing: "border-box",
  display: "block",
  margin: "0 auto 10px",
  boxShadow: "0 12px 26px rgba(15, 76, 129, 0.14)",
};

const titulo = {
  color: "#0369a1",
  fontSize: "26px",
  textAlign: "center",
  margin: "0 0 4px",
};

const subtitulo = {
  color: "#475569",
  textAlign: "center",
  margin: "0 0 18px",
  fontSize: "14px",
};

const formulario = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const labelEstilo = {
  display: "block",
  marginBottom: "5px",
  color: "#1e293b",
  fontWeight: "bold",
  fontSize: "13px",
};

const input = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: "11px",
  border: "1px solid #a9d8ef",
  fontSize: "14px",
  boxSizing: "border-box",
};

const botonPrimario = {
  background: "linear-gradient(135deg, #0369a1, #06b6d4)",
  color: "white",
  border: "none",
  padding: "12px",
  borderRadius: "12px",
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: "4px",
};

const botonDemo = {
  background: "linear-gradient(135deg, #ecfeff, #dff7ff)",
  color: "#0369a1",
  border: "2px solid #22d3ee",
  padding: "11px",
  borderRadius: "12px",
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: "12px",
  width: "100%",
};

const botonSecundario = {
  background: "transparent",
  color: "#0369a1",
  border: "none",
  marginTop: "14px",
  width: "100%",
  cursor: "pointer",
  fontWeight: "bold",
};

const mensajeError = {
  marginTop: "12px",
  color: "#ef4444",
  fontWeight: "bold",
  textAlign: "center",
  fontSize: "13px",
};

const mensajeOk = {
  marginTop: "12px",
  color: "#059669",
  fontWeight: "bold",
  textAlign: "center",
  fontSize: "13px",
};

const textoAyuda = {
  margin: "0 0 2px",
  color: "#475569",
  fontSize: "12.5px",
  lineHeight: 1.45,
  textAlign: "center",
};

const enlaceDev = {
  display: "block",
  marginTop: "12px",
  color: "#0369a1",
  fontWeight: "bold",
  textAlign: "center",
  textDecoration: "none",
};

const notaAcceso = {
  marginTop: "16px",
  color: "#475569",
  textAlign: "center",
  fontSize: "12px",
};
