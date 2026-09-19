import { useEffect, useMemo, useState } from "react";
import {
  crearPagoFlow,
  obtenerEstadoContratacion,
} from "../services/contratacionService";
import { CONFIG_COMERCIAL, calcularMontoComercial } from "../config/comercial";
import { EstadoCargando } from "../components/EstadoPantalla";

const LOGO_SRC = "/servcontable-logo.png";
const APP_URL = import.meta.env.VITE_APP_URL || "https://app.servcontablepro.cl";
const WHATSAPP_URL =
  "https://wa.me/56984508073?text=Hola%2C%20quiero%20contratar%20ServContable%20PRO";

const PRECIOS = {
  mensual: {
    etiqueta: "Mensual",
    neto: CONFIG_COMERCIAL.precioBaseMensual,
    descripcion: "+ IVA / mes",
  },
  anual: {
    etiqueta: "Anual",
    neto: CONFIG_COMERCIAL.precioBaseMensual,
    descripcion: "+ IVA / mes",
    nota: `Pago anual de una vez: 12 meses x ${formatearCLP(CONFIG_COMERCIAL.precioBaseMensual)} = ${formatearCLP(CONFIG_COMERCIAL.precioBaseMensual * 12)} + IVA.`,
  },
};

function formatearCLP(valor) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Number(valor || 0));
}

function obtenerResultadoPago() {
  const path = window.location.pathname;
  if (path.includes("pago-exitoso")) return "exito";
  if (path.includes("pago-pendiente")) return "pendiente";
  if (path.includes("pago-error")) return "error";
  return "";
}

export default function Inicio() {
  const [periodicidad, setPeriodicidad] = useState("mensual");
  const [formulario, setFormulario] = useState({
    nombre: "",
    correo: "",
    telefono: "",
    rut: "",
    empresa: "",
    aceptaTerminos: false,
  });
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [estadoPago, setEstadoPago] = useState(null);

  const resultadoPago = obtenerResultadoPago();

  const totalSeleccionado = useMemo(() => {
    return calcularMontoComercial({
      usuariosActivos: CONFIG_COMERCIAL.usuariosIncluidos,
      meses: periodicidad === "anual" ? 12 : 1,
    });
  }, [periodicidad]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const contratacionId = params.get("contratacion");

    if (!contratacionId) return;

    obtenerEstadoContratacion(contratacionId)
      .then(setEstadoPago)
      .catch(() => setEstadoPago(null));
  }, []);

  function cambiarCampo(campo, valor) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  function irAContratacion(tipo = periodicidad) {
    setPeriodicidad(tipo);
    setMensaje("");
    setError("");
    document
      .getElementById("contratar")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function contratar(e) {
    e.preventDefault();

    try {
      setCargando(true);
      setMensaje("Creando pago seguro en Flow...");
      setError("");

      const data = await crearPagoFlow({
        ...formulario,
        periodicidad,
        acepta_terminos: formulario.aceptaTerminos,
      });

      const linkPago = data.checkout_url || data.url;

      if (!linkPago) {
        throw new Error("Flow no devolvio un link de pago.");
      }

      window.location.href = linkPago;
    } catch (err) {
      setError(err.message);
      setMensaje("");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={pagina}>
      <header style={hero}>
        <div style={marcaFila}>
          <img src={LOGO_SRC} alt="ServContable PRO" style={logo} />
          <div>
            <strong style={marca}>ServContable PRO</strong>
            <span style={subMarca}>Contabilidad y remuneraciones en la nube</span>
          </div>
        </div>

        <nav style={accionesTop}>
          <button
            style={botonClaro}
            type="button"
            onClick={() => {
              window.location.href = `${APP_URL}#prueba-gratis`;
            }}
          >
            Probar gratis
          </button>
          <button
            style={botonPrincipalMini}
            type="button"
            onClick={() => irAContratacion("mensual")}
          >
            Contratar servicio
          </button>
          <button
            style={botonTexto}
            type="button"
            onClick={() => {
              window.location.href = APP_URL;
            }}
          >
            Ingresar
          </button>
        </nav>
      </header>

      {resultadoPago && (
        <section style={avisoPago(resultadoPago)}>
          <strong>
            {resultadoPago === "exito" && "Pago recibido"}
            {resultadoPago === "pendiente" && "Pago pendiente"}
            {resultadoPago === "error" && "Pago no completado"}
          </strong>
          <span>
            {resultadoPago === "exito" &&
              "Tu contratacion quedara activa cuando Flow confirme el webhook."}
            {resultadoPago === "pendiente" &&
              "Estamos esperando la confirmacion de Flow."}
            {resultadoPago === "error" &&
              "Puedes intentar nuevamente o escribirnos por WhatsApp."}
          </span>
          {estadoPago && <small>Estado interno: {estadoPago.estado}</small>}
        </section>
      )}

      <main style={contenido}>
        <section style={bloqueIntro}>
          <span style={pill}>Sistema PRO para pymes y estudios contables</span>
          <h1 style={titulo}>
            Ordena contabilidad, impuestos y remuneraciones en una sola plataforma.
          </h1>
          <p style={bajada}>
            Prueba ServContable PRO gratis por 30 días. La contratación se paga
            por Flow y la suscripción queda registrada para activación.
          </p>

          <div style={botonesHero}>
            <button
              style={botonPrincipal}
              type="button"
              onClick={() => irAContratacion("mensual")}
            >
              Contratar SERVCONTABLE PRO
            </button>
            <button
              style={botonSecundario}
              type="button"
              onClick={() => {
                window.location.href = `${APP_URL}#prueba-gratis`;
              }}
            >
              Probar gratis
            </button>
            <a
              style={botonWhatsapp}
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
          </div>
        </section>

        <section style={panelPlan}>
          <span style={pillSuave}>Servicio único</span>
          <h2 style={tituloPlan}>Contratación SERVCONTABLE PRO</h2>
          <p style={textoPlan}>Servicio con 1 usuario incluido y empresas ilimitadas.</p>

          <div style={precioGrid}>
            <button
              type="button"
              style={tarjetaPrecio(periodicidad === "mensual")}
              onClick={() => setPeriodicidad("mensual")}
            >
              <strong>Mensual</strong>
              <span>{formatearCLP(PRECIOS.mensual.neto)}</span>
              <small>+ IVA / mes</small>
            </button>

            <button
              type="button"
              style={tarjetaPrecio(periodicidad === "anual")}
              onClick={() => setPeriodicidad("anual")}
            >
              <strong>Anual</strong>
              <span>{formatearCLP(PRECIOS.anual.neto)}</span>
              <small>+ IVA / mes</small>
            </button>
          </div>

          <div style={notaAnual}>{PRECIOS.anual.nota}</div>

          <ul style={listaPlan}>
            <li>Empresas ilimitadas incluidas.</li>
            <li>{CONFIG_COMERCIAL.usuariosIncluidos} usuario incluido.</li>
            <li>Usuario adicional: {formatearCLP(CONFIG_COMERCIAL.precioUsuarioAdicional)} + IVA mensual.</li>
            <li>Contabilidad, remuneraciones, Previred, libros e informes.</li>
          </ul>

          <button
            style={botonPrincipal}
            type="button"
            onClick={() => irAContratacion(periodicidad)}
          >
            Contratar servicio →
          </button>
        </section>
      </main>

      <section style={seccionWeb} id="problema">
        <h2 style={seccionTitulo}>Qué problema resuelve</h2>
        <p style={textoPlan}>
          ServContable PRO ordena contabilidad, remuneraciones e impuestos por
          empresa, año de trabajo y usuario.
        </p>
        <div style={gridWeb3}>
          <MiniCard titulo="Menos planillas" texto="Compras, ventas, comprobantes, liquidaciones y reportes quedan conectados." />
          <MiniCard titulo="Control por cliente" texto="Cada cliente administra sus empresas y el administrador revisa accesos, pagos y solicitudes." />
          <MiniCard titulo="Reportes listos" texto="Libros, balances, IVA, F29, liquidaciones y finiquitos salen con formato compacto." />
        </div>
      </section>

      <section style={seccionWeb} id="funciones">
        <h2 style={seccionTitulo}>Funciones principales</h2>
        <div style={gridWeb4}>
          <MiniCard titulo="Contabilidad" texto="Comprobantes, compras, ventas, libro diario, mayor, balance y resultado." />
          <MiniCard titulo="Tributario" texto="Resumen IVA, F29 estimado, retenciones y control de remanente." />
          <MiniCard titulo="Remuneraciones" texto="Trabajadores, haberes, descuentos, liquidaciones, pagos y Previred." />
          <MiniCard titulo="Gestión" texto="Empresas, usuarios, auditoría, prueba gratis y solicitudes web." />
        </div>
      </section>

      <section style={seccionWeb} id="prueba-gratis">
        <h2 style={seccionTitulo}>Prueba gratis</h2>
        <div style={demoLegalBox}>
          <p style={textoPlan}>
            Crea tu acceso con correo y contraseña. Entras directo al programa
            completo y luego configuras tu empresa dentro del sistema.
          </p>
          <p style={textoPlan}>
            La prueba gratuita dura 30 días, no requiere datos de pago y no
            elimina tus datos al vencer.
          </p>
          <button
            style={botonPrincipalMini}
            type="button"
            onClick={() => {
              window.location.href = `${APP_URL}#prueba-gratis`;
            }}
          >
            Comenzar prueba gratis
          </button>
        </div>
      </section>

      <section style={seccionWeb} id="faq">
        <h2 style={seccionTitulo}>Preguntas frecuentes</h2>
        <div style={gridWeb2}>
          <Pregunta titulo="¿El servicio incluye empresas ilimitadas?" texto="Sí. SERVCONTABLE PRO incluye empresas ilimitadas y 1 usuario." />
          <Pregunta titulo="¿Cuánto dura la prueba gratis?" texto="30 días. El acceso se crea automáticamente y luego configuras tu empresa dentro del sistema." />
          <Pregunta titulo="¿Cómo se activa la suscripción?" texto="Flow confirma el pago por webhook y el sistema registra la contratación para habilitar el acceso." />
          <Pregunta titulo="¿Cuánto cuesta un usuario adicional?" texto={`${formatearCLP(CONFIG_COMERCIAL.precioUsuarioAdicional)} + IVA mensual por usuario adicional.`} />
        </div>
      </section>

      <section style={seccionWeb} id="legales">
        <h2 style={seccionTitulo}>Términos y condiciones, privacidad y seguridad</h2>
        <div style={gridWeb4}>
          <MiniCard titulo="Términos y condiciones" texto="Servicio SaaS de suscripción mensual o anual. El cliente debe ingresar información fidedigna y revisar sus reportes." />
          <MiniCard titulo="Política de privacidad" texto="Los datos se usan para contratación, activación, facturación, soporte y comunicaciones del servicio." />
          <MiniCard titulo="Seguridad" texto="Acceso autenticado, roles de usuario, separación por empresa y control automático de pruebas vencidas." />
          <MiniCard titulo="Retracto" texto="La contratación online informa precio, IVA y condiciones. El derecho a retracto se aplicará cuando corresponda según normativa vigente." />
        </div>
      </section>

      <section style={seccionWeb} id="datos-empresa">
        <h2 style={seccionTitulo}>Datos de empresa</h2>
        <div style={datosEmpresaBox}>
          <LineaResumen label="Web" valor="www.servcontablepro.cl" />
          <LineaResumen label="Aplicación" valor="app.servcontablepro.cl" />
          <LineaResumen label="Contacto" valor="contacto@servcontablepro.cl" />
          <LineaResumen label="WhatsApp" valor="+56984508073" />
          <LineaResumen label="Razón social / RUT" valor="Completar datos de la empresa emisora en producción" />
        </div>
      </section>

      <section id="contratar" style={checkout}>
        <div style={checkoutFormCard}>
          <span style={pill}>Checkout seguro</span>
          <h2 style={seccionTitulo}>Datos de contratacion</h2>
          <p style={textoPlan}>
            Completa los datos para crear el link de pago en Flow.
          </p>

          <form style={formularioEstilo} onSubmit={contratar}>
            <div style={gridForm}>
              <Campo
                label="Nombre"
                value={formulario.nombre}
                onChange={(valor) => cambiarCampo("nombre", valor)}
                required
              />
              <Campo
                label="Correo electrónico"
                type="email"
                value={formulario.correo}
                onChange={(valor) => cambiarCampo("correo", valor)}
                required
              />
              <Campo
                label="Telefono"
                value={formulario.telefono}
                onChange={(valor) => cambiarCampo("telefono", valor)}
              />
              <Campo
                label="RUT"
                value={formulario.rut}
                onChange={(valor) => cambiarCampo("rut", valor)}
              />
              <Campo
                label="Empresa"
                value={formulario.empresa}
                onChange={(valor) => cambiarCampo("empresa", valor)}
              />
              <label style={campoCompacto}>
                <span>Periodicidad</span>
                <select
                  style={input}
                  value={periodicidad}
                  onChange={(e) => setPeriodicidad(e.target.value)}
                >
                  <option value="mensual">Mensual</option>
                  <option value="anual">Anual</option>
                </select>
              </label>
            </div>

            <details style={legalBox}>
              <summary style={legalSummary}>Terminos, privacidad y seguridad</summary>
              <div style={legalTexto}>
                <p>
                  Al contratar aceptas el uso de ServContable PRO como software de
                  gestion contable y remuneraciones bajo modalidad de suscripcion.
                  El cliente es responsable de ingresar informacion fidedigna y
                  resguardar sus credenciales.
                </p>
                <p>
                  Los datos se usan para prestar el servicio, administrar pagos,
                  soporte y activacion de la suscripcion. El sistema opera con acceso
                  autenticado, control de sesiones, perfiles de usuario y respaldo
                  de la informacion en la infraestructura contratada.
                </p>
              </div>
            </details>

            <label style={aceptacionBox}>
              <input
                type="checkbox"
                checked={formulario.aceptaTerminos}
                onChange={(e) => cambiarCampo("aceptaTerminos", e.target.checked)}
              />
              <span>
                Acepto las condiciones de contratacion, privacidad y seguridad de
                ServContable PRO.
              </span>
            </label>

            {mensaje && <p style={mensajeOk}>{mensaje}</p>}
            {cargando && <EstadoCargando mensaje="Cargando datos..." />}
            {error && <p style={mensajeError}>{error}</p>}

            <button style={botonPago} type="submit" disabled={cargando}>
              {cargando ? "Creando pago..." : "Pagar con Flow"}
            </button>
          </form>
        </div>

        <aside style={resumenPedido}>
          <h3 style={resumenTitulo}>Resumen del pedido</h3>
          <LineaResumen
            label={`SERVCONTABLE PRO ${periodicidad}`}
            valor={formatearCLP(totalSeleccionado.neto)}
          />
          <LineaResumen label="IVA 19%" valor={formatearCLP(totalSeleccionado.iva)} />
          <div style={totalFila}>
            <strong>Total</strong>
            <strong>{formatearCLP(totalSeleccionado.total)}</strong>
          </div>
          <p style={resumenNota}>
            WhatsApp soporte: +56984508073. Atencion de lunes a viernes.
          </p>
        </aside>
      </section>
    </div>
  );
}

function Campo({ label, value, onChange, type = "text", required = false }) {
  return (
    <label style={campoCompacto}>
      <span>{label}</span>
      <input
        style={input}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </label>
  );
}

function LineaResumen({ label, valor }) {
  return (
    <div style={lineaResumen}>
      <span>{label}</span>
      <strong>{valor}</strong>
    </div>
  );
}

function MiniCard({ titulo, texto }) {
  return (
    <article style={miniCard}>
      <strong>{titulo}</strong>
      <p>{texto}</p>
    </article>
  );
}

function Pregunta({ titulo, texto }) {
  return (
    <details style={preguntaCard}>
      <summary>{titulo}</summary>
      <p>{texto}</p>
    </details>
  );
}

const pagina = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at 78% 12%, rgba(34, 211, 238, 0.22), transparent 28%), linear-gradient(135deg, #f8fdff 0%, #e8f8ff 100%)",
  color: "#061529",
  fontFamily: "Arial, sans-serif",
  padding: "18px",
};

const hero = {
  maxWidth: "1160px",
  margin: "0 auto 18px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
};

const marcaFila = { display: "flex", alignItems: "center", gap: "10px" };
const logo = {
  width: "48px",
  height: "48px",
  borderRadius: "14px",
  objectFit: "contain",
  border: "1px solid #67e8f9",
  background: "white",
  padding: "5px",
};
const marca = { display: "block", color: "#0369a1", fontSize: "20px" };
const subMarca = { display: "block", color: "#48657a", fontSize: "12px" };
const accionesTop = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const contenido = {
  maxWidth: "1160px",
  margin: "0 auto",
  display: "grid",
  gridTemplateColumns: "1.1fr 0.9fr",
  gap: "18px",
  alignItems: "stretch",
};

const bloqueIntro = {
  background: "linear-gradient(135deg, #07111f 0%, #075985 56%, #06b6d4 100%)",
  color: "white",
  borderRadius: "24px",
  padding: "34px",
  boxShadow: "0 22px 45px rgba(8, 47, 73, 0.18)",
};

const pill = {
  display: "inline-flex",
  background: "rgba(255,255,255,0.16)",
  color: "inherit",
  border: "1px solid rgba(255,255,255,0.24)",
  borderRadius: "999px",
  padding: "6px 10px",
  fontWeight: 800,
  fontSize: "12px",
};
const titulo = { fontSize: "36px", lineHeight: 1.05, margin: "20px 0 12px" };
const bajada = {
  fontSize: "16px",
  lineHeight: 1.55,
  color: "#dff7ff",
  maxWidth: "660px",
};
const botonesHero = { display: "flex", gap: "10px", marginTop: "24px", flexWrap: "wrap" };

const panelPlan = {
  background: "rgba(255,255,255,0.95)",
  border: "1px solid #bae6fd",
  borderRadius: "22px",
  padding: "24px",
  boxShadow: "0 18px 42px rgba(8, 47, 73, 0.12)",
};

const pillSuave = {
  ...pill,
  background: "#e0f2fe",
  color: "#0369a1",
  borderColor: "#bae6fd",
};
const tituloPlan = { color: "#075985", fontSize: "26px", margin: "16px 0 8px" };
const textoPlan = { color: "#426176", margin: "0 0 14px", lineHeight: 1.45 };
const precioGrid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" };
const notaAnual = {
  background: "#ecfdf5",
  color: "#047857",
  border: "1px solid #86efac",
  borderRadius: "12px",
  padding: "12px",
  fontWeight: 800,
  marginTop: "12px",
};
const listaPlan = { color: "#24445c", lineHeight: 1.8, paddingLeft: "20px", margin: "14px 0" };

const tarjetaPrecio = (activa) => ({
  textAlign: "left",
  border: activa ? "2px solid #06b6d4" : "1px solid #bae6fd",
  background: activa ? "#ecfeff" : "#f0f9ff",
  borderRadius: "14px",
  padding: "14px",
  color: "#064d7a",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
});

const checkout = {
  maxWidth: "1160px",
  margin: "18px auto 0",
  display: "grid",
  gridTemplateColumns: "1.35fr 0.65fr",
  gap: "18px",
  alignItems: "start",
};

const checkoutFormCard = { ...panelPlan, padding: "22px" };
const seccionTitulo = { color: "#075985", fontSize: "24px", margin: "12px 0 8px" };
const formularioEstilo = { display: "flex", flexDirection: "column", gap: "12px" };
const gridForm = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" };
const campoCompacto = {
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  color: "#102238",
  fontWeight: 800,
  fontSize: "13px",
};
const input = {
  border: "1px solid #9bdcf7",
  borderRadius: "12px",
  padding: "11px 12px",
  fontSize: "14px",
  outlineColor: "#06b6d4",
  background: "white",
};
const legalBox = {
  background: "#f8fafc",
  border: "1px solid #dbeafe",
  borderRadius: "14px",
  padding: "10px 12px",
};
const legalSummary = { cursor: "pointer", color: "#075985", fontWeight: 900 };
const legalTexto = { color: "#48657a", fontSize: "13px", lineHeight: 1.45 };
const aceptacionBox = {
  display: "flex",
  gap: "10px",
  alignItems: "flex-start",
  background: "#ecfeff",
  border: "1px solid #67e8f9",
  borderRadius: "14px",
  padding: "12px",
  color: "#083344",
  fontWeight: 800,
};
const resumenPedido = { ...panelPlan, position: "sticky", top: "12px" };
const resumenTitulo = { color: "#075985", marginTop: 0 };
const lineaResumen = {
  display: "flex",
  justifyContent: "space-between",
  borderBottom: "1px solid #dbeafe",
  padding: "10px 0",
  gap: "12px",
};
const totalFila = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "20px",
  color: "#075985",
  padding: "16px 0",
  borderBottom: "1px solid #dbeafe",
};
const resumenNota = { color: "#48657a", fontSize: "13px", lineHeight: 1.4 };

const botonBase = {
  border: "none",
  borderRadius: "12px",
  fontWeight: 900,
  cursor: "pointer",
  padding: "12px 16px",
};
const botonPrincipal = {
  ...botonBase,
  background: "linear-gradient(135deg, #0369a1, #06b6d4)",
  color: "white",
  boxShadow: "0 12px 24px rgba(6, 182, 212, 0.22)",
};
const botonPrincipalMini = { ...botonPrincipal, padding: "10px 14px" };
const botonSecundario = {
  ...botonBase,
  background: "white",
  color: "#0369a1",
  border: "1px solid #7dd3fc",
};
const botonWhatsapp = {
  ...botonBase,
  background: "#dcfce7",
  color: "#047857",
  border: "1px solid #86efac",
};
const botonClaro = {
  ...botonBase,
  background: "#e0f2fe",
  color: "#075985",
  border: "1px solid #bae6fd",
  padding: "10px 14px",
};
const botonTexto = { ...botonBase, background: "transparent", color: "#075985", padding: "10px" };
const botonPago = { ...botonPrincipal, width: "100%", fontSize: "15px" };
const mensajeOk = { color: "#059669", fontWeight: 900, margin: 0 };
const mensajeError = { color: "#ef4444", fontWeight: 900, margin: 0 };

const seccionWeb = {
  maxWidth: "1160px",
  margin: "18px auto 0",
  background: "rgba(255,255,255,0.94)",
  border: "1px solid #bae6fd",
  borderRadius: "20px",
  padding: "20px",
  boxShadow: "0 14px 32px rgba(8, 47, 73, 0.08)",
};

const gridWeb2 = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "10px",
};

const gridWeb3 = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "10px",
};

const gridWeb4 = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "10px",
};

const miniCard = {
  background: "#f8fdff",
  border: "1px solid #d7effa",
  borderRadius: "14px",
  padding: "12px",
  color: "#075985",
  fontSize: "13px",
  lineHeight: 1.4,
};

const preguntaCard = {
  ...miniCard,
  color: "#102238",
};

const demoLegalBox = {
  ...miniCard,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
};

const datosEmpresaBox = {
  ...miniCard,
  maxWidth: "780px",
};

const avisoPago = (tipo) => ({
  maxWidth: "1160px",
  margin: "0 auto 14px",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  background: tipo === "error" ? "#fef2f2" : tipo === "pendiente" ? "#fffbeb" : "#ecfdf5",
  border: `1px solid ${
    tipo === "error" ? "#fecaca" : tipo === "pendiente" ? "#fde68a" : "#86efac"
  }`,
  color: tipo === "error" ? "#991b1b" : tipo === "pendiente" ? "#92400e" : "#047857",
  borderRadius: "14px",
  padding: "12px 14px",
});


