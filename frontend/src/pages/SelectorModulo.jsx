const LOGO_SRC = "/servcontable-logo.png";
const ROLES_ADMIN_SISTEMA = ["admin", "superadmin", "super_admin", "administrador_sistema"];

function rolNormalizado(rol = "") {
  return String(rol || "").trim().toLowerCase();
}

export default function SelectorModulo({ usuario, seleccionarModulo, alCerrarSesion }) {
  const usuarioEsAdminSistema = ROLES_ADMIN_SISTEMA.includes(rolNormalizado(usuario?.rol));

  return (
    <div style={contenedor}>
      <div style={barraSuperior}>
        <div style={marcaTop}>
          <img style={logoTop} src={LOGO_SRC} alt="ServContable" />
          <strong style={{ color: "var(--sc-azul)" }}>
            ServContable PRO · {usuario?.nombre || usuario?.email || "Usuario"}
          </strong>
        </div>

        <button type="button" style={botonSalir} onClick={alCerrarSesion}>
          Cerrar sesión
        </button>
      </div>

      <div style={contenido}>
        <h1 style={titulo}>Seleccionar módulo</h1>
        <p style={subtitulo}>
          Elige el área de trabajo que deseas administrar.
        </p>

        <div style={grid}>
          <div style={card}>
            <div style={icono}>📊</div>
            <h2 style={cardTitulo}>Módulo Contable</h2>
            <p style={cardTexto}>
              Empresas, plan de cuentas, comprobantes, compras, ventas,
              libros, balances, IVA y F29.
            </p>

            <button
              type="button"
              style={botonPrimario}
              onClick={() => seleccionarModulo("contable")}
            >
              Entrar a Contabilidad
            </button>
          </div>

          <div style={card}>
            <div style={icono}>👥</div>
            <h2 style={cardTitulo}>Módulo Remuneraciones</h2>
            <p style={cardTexto}>
              Trabajadores, liquidaciones, haberes, descuentos, Previred,
              libro de remuneraciones y pagos.
            </p>

            <button
              type="button"
              style={botonPrimario}
              onClick={() => seleccionarModulo("remuneraciones")}
            >
              Entrar a Remuneraciones
            </button>
          </div>

          <div style={card}>
            <div style={icono}>📋</div>
            <h2 style={cardTitulo}>Módulo Contabilidad Simplificada</h2>
            <p style={cardTexto}>
              Registro simplificado, libro de caja e ingresos y egresos para
              controlar la contabilidad simplificada.
            </p>

            <button
              type="button"
              style={botonPrimario}
              onClick={() => seleccionarModulo("simplificada")}
            >
              Entrar a Contabilidad Simplificada
            </button>
          </div>

          {usuarioEsAdminSistema && (
            <div style={card}>
              <div style={icono}>🛡️</div>
              <h2 style={cardTitulo}>Administración</h2>
              <p style={cardTexto}>
                Clientes, suscripciones, solicitudes web, configuración y auditoría del sistema.
              </p>

              <button
              type="button"
              style={botonPrimario}
              onClick={() => seleccionarModulo("administracion")}
            >
                Entrar a Administración
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const contenedor = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at 80% 18%, rgba(34, 211, 238, 0.32), transparent 25%), radial-gradient(circle at 12% 82%, rgba(16, 185, 129, 0.22), transparent 28%), linear-gradient(135deg, #07111f 0%, #075985 54%, #22d3ee 100%)",
  fontFamily: "Arial, sans-serif",
};

const barraSuperior = {
  height: "52px",
  background: "rgba(255,255,255,0.92)",
  borderBottom: "1px solid rgba(255,255,255,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 22px",
  color: "var(--sc-ink)",
  boxShadow: "0 12px 30px rgba(7, 17, 31, 0.16)",
  backdropFilter: "blur(14px)",
};

const marcaTop = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

const logoTop = {
  width: "28px",
  height: "28px",
  borderRadius: "8px",
  objectFit: "contain",
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  border: "1px solid #67e8f9",
  padding: "3px",
  boxSizing: "border-box",
};

const contenido = {
  minHeight: "calc(100vh - 52px)",
  padding: "28px 18px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
};

const titulo = {
  fontSize: "34px",
  color: "white",
  marginBottom: "8px",
  textAlign: "center",
  textShadow: "0 3px 12px rgba(0,0,0,0.22)",
};

const subtitulo = {
  color: "var(--sc-celeste-suave)",
  marginBottom: "22px",
  fontSize: "15px",
  textAlign: "center",
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 360px))",
  gap: "20px",
  justifyContent: "center",
  width: "100%",
  maxWidth: "1160px",
};

const card = {
  background: "rgba(255,255,255,0.97)",
  borderRadius: "20px",
  padding: "24px",
  boxShadow: "0 26px 70px rgba(7, 17, 31, 0.24)",
  border: "1px solid rgba(255,255,255,0.55)",
  minHeight: "238px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

const icono = {
  fontSize: "36px",
  marginBottom: "8px",
};

const cardTitulo = {
  color: "var(--sc-azul)",
  marginBottom: "8px",
  fontSize: "22px",
};

const cardTexto = {
  color: "#155e75",
  lineHeight: "1.42",
  minHeight: "60px",
  fontSize: "14px",
};

const botonPrimario = {
  marginTop: "14px",
  background: "linear-gradient(135deg, var(--sc-azul), var(--sc-cian-medio))",
  color: "white",
  border: "none",
  padding: "10px 15px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  boxShadow: "0 8px 18px rgba(15,76,129,0.28)",
};

const botonSalir = {
  background: "var(--sc-danger)",
  color: "white",
  border: "none",
  padding: "8px 12px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
};
