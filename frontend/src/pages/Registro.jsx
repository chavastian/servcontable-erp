import { useState } from "react";
import { registrarUsuario } from "../services/authService";

const LOGO_SRC = "/servcontable-logo.png";

export default function Registro({ irALogin }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  // Evita el doble envío: un segundo clic antes de que responda el servidor
  // creaba el registro dos veces.
  const [guardando, setGuardando] = useState(false);

  async function manejarRegistro(e) {
    e.preventDefault();

    if (guardando) return;

    try {
      setGuardando(true);
      setMensaje("");
      setError("");

      const data = await registrarUsuario(nombre, email, password);
      setMensaje(data.mensaje || "Usuario registrado correctamente");
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={contenedor}>
      <div style={tarjeta}>
        <img style={logo} src={LOGO_SRC} alt="ServContable" />
        <h1 style={titulo}>Crear cuenta</h1>
        <p style={subtitulo}>ServContable PRO Web</p>

        <form onSubmit={manejarRegistro} style={formulario}>
          <div>
            <label style={label}>Nombre</label>
            <input
              style={input}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre completo"
              autoComplete="name"
            />
          </div>

          <div>
            <label style={label}>Correo electrónico</label>
            <input
              style={input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@empresa.cl"
              autoComplete="username"
            />
          </div>

          <div>
            <label style={label}>Contraseña</label>
            <input
              style={input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              autoComplete="new-password"
            />
          </div>

          <button style={botonPrimario} type="submit" disabled={guardando}>
            {guardando ? "Registrando..." : "Registrar usuario"}
          </button>
        </form>

        {mensaje && <p style={mensajeOk}>{mensaje}</p>}
        {error && <p style={mensajeError}>{error}</p>}

        <button type="button" style={botonSecundario} onClick={irALogin}>
          Ya tengo cuenta, iniciar sesión
        </button>
      </div>
    </div>
  );
}

const contenedor = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at 18% 18%, rgba(16, 185, 129, 0.28), transparent 24%), linear-gradient(135deg, #07111f 0%, var(--sc-azul) 52%, #22d3ee 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "Arial, sans-serif",
  padding: "20px",
};

const tarjeta = {
  width: "100%",
  maxWidth: "440px",
  background: "rgba(255,255,255,0.96)",
  borderRadius: "26px",
  padding: "35px",
  boxShadow: "0 26px 70px rgba(7, 17, 31, 0.28)",
  border: "1px solid rgba(255,255,255,0.48)",
};

const logo = {
  width: "76px",
  height: "76px",
  borderRadius: "22px",
  objectFit: "contain",
  background: "linear-gradient(135deg, var(--sc-celeste-suave), #ffffff)",
  border: "1px solid #67e8f9",
  padding: "8px",
  boxSizing: "border-box",
  display: "block",
  margin: "0 auto 14px",
  boxShadow: "0 14px 30px rgba(15, 76, 129, 0.16)",
};

const titulo = {
  color: "var(--sc-azul)",
  fontSize: "32px",
  textAlign: "center",
  marginBottom: "5px",
};

const subtitulo = {
  color: "var(--sc-gris)",
  textAlign: "center",
  marginBottom: "25px",
};

const formulario = {
  display: "flex",
  flexDirection: "column",
  gap: "15px",
};

const label = {
  display: "block",
  marginBottom: "6px",
  color: "var(--sc-text)",
  fontWeight: "bold",
  fontSize: "14px",
};

const input = {
  width: "100%",
  padding: "13px",
  borderRadius: "12px",
  border: "1px solid var(--sc-celeste-borde)",
  fontSize: "15px",
  boxSizing: "border-box",
};

const botonPrimario = {
  background: "linear-gradient(135deg, var(--sc-azul), var(--sc-cian-medio))",
  color: "white",
  border: "none",
  padding: "14px",
  borderRadius: "12px",
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: "10px",
};

const botonSecundario = {
  background: "transparent",
  color: "var(--sc-azul)",
  border: "none",
  marginTop: "20px",
  width: "100%",
  cursor: "pointer",
  fontWeight: "bold",
};

const mensajeOk = {
  marginTop: "15px",
  color: "var(--sc-teal)",
  fontWeight: "bold",
  textAlign: "center",
};

const mensajeError = {
  marginTop: "15px",
  color: "var(--sc-danger)",
  fontWeight: "bold",
  textAlign: "center",
};
