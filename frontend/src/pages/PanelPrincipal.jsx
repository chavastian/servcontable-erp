import { lazy, Suspense, useEffect, useState } from "react";
import { cerrarSesion } from "../services/authService";
import ModuloHero from "../components/ModuloHero";

const Empresas = lazy(() => import("./Empresas"));
const PlanCuentas = lazy(() => import("./PlanCuentas"));
const Comprobantes = lazy(() => import("./NuevoComprobante"));
const LibroDiario = lazy(() => import("./LibroDiario"));
const LibroMayor = lazy(() => import("./LibroMayor"));
const Balance8Columnas = lazy(() => import("./Balance8Columnas"));
const EstadoResultados = lazy(() => import("./EstadoResultados"));
const Ventas = lazy(() => import("./Ventas"));
const RegistroBoletas = lazy(() => import("./RegistroBoletas"));
const Compras = lazy(() => import("./Compras"));
const ResumenIVA = lazy(() => import("./ResumenIVA"));
const ResumenF29 = lazy(() => import("./ResumenF29"));
const ControlRemanenteIVA = lazy(() => import("./ControlRemanenteIVA"));
const ConfiguracionContable = lazy(() => import("./ConfiguracionContable"));
const LibrosCompraVenta = lazy(() => import("./LibrosCompraVenta"));
const ContabilidadSimplificada = lazy(() => import("./ContabilidadSimplificada"));
const Honorarios = lazy(() => import("./Honorarios"));
const PagosCobros = lazy(() => import("./PagosCobros"));
const ConciliacionBancaria = lazy(() => import("./ConciliacionBancaria"));
const CuentasPendientes = lazy(() => import("./CuentasPendientes"));
const CartolaRut = lazy(() => import("./CartolaRut"));
const DashboardFinanciero = lazy(() => import("./DashboardFinanciero"));
const Remuneraciones = lazy(() => import("./Remuneraciones"));
const DashboardContable = lazy(() => import("./contabilidad/DashboardContable"));
const AnalisisCuentas = lazy(() => import("./AnalisisCuentas"));
const AuditoriaSistema = lazy(() => import("./AuditoriaSistema"));
const UsuariosSistema = lazy(() => import("./UsuariosSistema"));
const AdminSuscripciones = lazy(() => import("./AdminSuscripciones"));
const PanelEstudio = lazy(() => import("./PanelEstudio"));
const CierreMensual = lazy(() => import("./CierreMensual"));
const CalceBancario = lazy(() => import("./CalceBancario"));
const ClasificarDocumentos = lazy(() => import("./ClasificarDocumentos"));
const CalendarioTributario = lazy(() => import("./CalendarioTributario"));
const FlujoCaja = lazy(() => import("./FlujoCaja"));
const Terceros = lazy(() => import("./Terceros"));
const CentrosCosto = lazy(() => import("./CentrosCosto"));
const ActivoFijo = lazy(() => import("./ActivoFijo"));
const DeclaracionesJuradas = lazy(() => import("./DeclaracionesJuradas"));
const ImportarBhe = lazy(() => import("./ImportarBhe"));
const CorreccionMonetaria = lazy(() => import("./CorreccionMonetaria"));
const RentaAnual = lazy(() => import("./RentaAnual"));

const ROLES_ADMIN_SISTEMA = ["admin", "superadmin", "super_admin", "administrador_sistema"];
const LOGO_SRC = "/servcontable-logo.png";

// Bajo este ancho el menú lateral tapa el contenido en vez de empujarlo. El
// mismo umbral que usa index.css para el resto de la aplicación.
const CONSULTA_PANTALLA_ANGOSTA = "(max-width: 780px)";

function pantallaAngosta() {
  return typeof window !== "undefined" && window.matchMedia(CONSULTA_PANTALLA_ANGOSTA).matches;
}

const HEROES_CONTABLE = {
  panelEstudio: {
    titulo: "Panel del estudio",
    descripcion:
      "Todas tus empresas en una pantalla, con lo que le falta a cada una en el período.",
  },
  cierreMensual: {
    titulo: "Cierre mensual",
    descripcion:
      "Las revisiones que hay que hacer antes de declarar, y si el período está listo.",
  },
  calceBancario: {
    titulo: "Calce automático del banco",
    descripcion:
      "Propone a qué documento corresponde cada movimiento pendiente de la cartola.",
  },
  clasificarDocumentos: {
    titulo: "Clasificar documentos",
    descripcion:
      "Asigna la cuenta que esta empresa ya usaba para el mismo proveedor o cliente.",
  },
  calendarioTributario: {
    titulo: "Calendario tributario",
    descripcion:
      "F29, cotizaciones y libro de remuneraciones, con sus fechas de referencia.",
  },
  flujoCaja: {
    titulo: "Flujo de caja",
    descripcion:
      "Antigüedad de lo que te deben y debes, más una proyección semana a semana.",
  },
  comprobantes: {
    titulo: "Comprobantes contables",
    descripcion: "Registra, revisa y controla los asientos contables de la empresa activa.",
  },
  ventas: {
    titulo: "Registro de Ventas",
    descripcion: "Gestiona documentos de venta, comprobantes automáticos e información tributaria.",
  },
  boletas: {
    titulo: "Registro de Boletas",
    descripcion: "Importa boletas electrónicas SII y genera comprobantes de ingreso.",
  },
  inicio: {
    titulo: "Dashboard financiero",
    descripcion: "Resumen de ventas, compras, IVA y saldos de la empresa activa.",
  },
  conciliacionBancaria: {
    titulo: "Conciliación bancaria",
    descripcion: "Importa cartolas bancarias y controla movimientos conciliados.",
  },
  compras: {
    titulo: "Registro de Compras",
    descripcion: "Importa compras SII, registra proveedores y controla comprobantes de compra.",
  },
  honorarios: {
    titulo: "Honorarios Recibidos",
    descripcion: "Registra boletas de honorarios recibidas y su efecto contable y tributario.",
  },
  importarBhe: {
    titulo: "Importar boletas de honorarios del SII",
    descripcion:
      "Lee el archivo del SII, muestra qué columna es qué y solo después importa las boletas nuevas.",
  },
  correccionMonetaria: {
    titulo: "Corrección monetaria",
    descripcion:
      "Corrige las partidas no monetarias y el capital propio del artículo 41, con el IPC del año.",
  },
  rentaAnual: {
    titulo: "Renta anual",
    descripcion:
      "Determina la renta líquida imponible desde el balance y propone los códigos del F22.",
  },
  pagosCobros: {
    titulo: "Pagar / Cobrar Documento",
    descripcion: "Registra pagos y cobros, agrupados o por documento, con su asiento contable.",
  },
  cuentasPendientes: {
    titulo: "Cuentas por Cobrar/Pagar",
    descripcion: "Consulta saldos pendientes y movimientos asociados a clientes y proveedores.",
  },
  cartolaRut: {
    titulo: "Cartola por RUT",
    descripcion: "Consulta movimientos, saldos y documentos pendientes de un tercero en la empresa activa.",
  },
  libroDiario: {
    titulo: "Libro Diario",
    descripcion: "Revisa y exporta el detalle cronológico de los movimientos contables.",
  },
  libroMayor: {
    titulo: "Libro Mayor",
    descripcion: "Analiza movimientos y saldos por cuenta contable.",
  },
  analisisCuentas: {
    titulo: "Análisis de cuentas",
    descripcion: "Profundiza en saldos, movimientos y comportamiento por cuenta.",
  },
  balance8: {
    titulo: "Balance 8 Columnas",
    descripcion: "Genera el balance tributario con saldos, resultado y clasificación contable.",
  },
  estadoResultados: {
    titulo: "Estado de Resultados",
    descripcion: "Visualiza ingresos, costos, gastos y resultado del ejercicio.",
  },
  librosCompraVenta: {
    titulo: "Libros Compra/Venta",
    descripcion: "Emite libros tributarios de compras y ventas con formato compacto.",
  },
  registroSimplificado: {
    titulo: "Registro Simplificado",
    descripcion: "Vista compacta de ingresos, egresos y resultado simplificado.",
  },
  libroCaja: {
    titulo: "Libro de Caja",
    descripcion: "Controla entradas y salidas de caja y banco.",
  },
  libroIngresosEgresos: {
    titulo: "Libro de Ingresos y Egresos",
    descripcion: "Consulta el movimiento simplificado de ingresos y egresos.",
  },
  resumenIVA: {
    titulo: "Resumen IVA",
    descripcion: "Determina débitos, créditos, remanentes e IVA a pagar.",
  },
  resumenF29: {
    titulo: "Resumen F29",
    descripcion: "Prepara la información tributaria mensual para declaración F29.",
  },
  remanenteIVA: {
    titulo: "Control Remanente IVA",
    descripcion: "Controla el remanente de crédito fiscal y sus movimientos.",
  },
  configuracionContable: {
    titulo: "Configuración Contable",
    descripcion: "Define las cuentas y parámetros que utiliza el módulo contable.",
  },
  empresas: {
    titulo: "Empresas",
    descripcion: "Crea, edita y selecciona empresas para trabajar en el sistema.",
  },
  planCuentas: {
    titulo: "Plan de cuentas",
    descripcion: "Administra cuentas contables, clasificaciones, estado y naturaleza.",
  },
  auditoria: {
    titulo: "Auditoría del sistema",
    descripcion: "Revisa acciones relevantes realizadas por los usuarios.",
  },
  usuariosSistema: {
    titulo: "Usuarios y accesos",
    descripcion: "Administra clientes, permisos y accesos al sistema.",
  },
  adminSuscripciones: {
    titulo: "Administración del Sistema",
    descripcion: "Controla clientes, usuarios, pagos, vencimientos y configuración comercial.",
  },
  adminSuscripcionesSolicitudes: {
    titulo: "Solicitudes web",
    descripcion: "Revisa pruebas gratis y suscripciones solicitadas desde la página pública.",
  },
  adminSuscripcionesClientes: {
    titulo: "Clientes",
    descripcion: "Lista y filtra clientes suscritos al sistema.",
  },
  adminSuscripcionesGestion: {
    titulo: "Suscripciones",
    descripcion: "Gestiona estados, vencimientos y acciones manuales.",
  },
  adminSuscripcionesEmpresas: {
    titulo: "Empresas",
    descripcion: "Revisa empresas asociadas a clientes. El servicio permite empresas ilimitadas.",
  },
  adminSuscripcionesPagos: {
    titulo: "Pagos",
    descripcion: "Revisa pagos y registra pagos manuales de suscripción.",
  },
  adminSuscripcionesNotificaciones: {
    titulo: "Notificaciones",
    descripcion: "Prepara avisos de vencimiento y eventos de suscripción.",
  },
  adminSuscripcionesAuditoria: {
    titulo: "Auditoría",
    descripcion: "Consulta acciones administrativas sensibles.",
  },
  adminSuscripcionesConfiguracion: {
    titulo: "Configuración Comercial",
    descripcion: "Define precio base, IVA, usuario incluido y valor de usuarios adicionales.",
  },
};

const HEROES_REMUNERACIONES = {
  remTrabajadores: {
    titulo: "Trabajadores",
    descripcion: "Administra datos personales, laborales, previsionales y bancarios.",
  },
  remHaberes: {
    titulo: "Haberes y descuentos",
    descripcion: "Registra conceptos variables, fijos, imponibles, no imponibles y descuentos.",
  },
  remImpuestoUnico: {
    titulo: "Impuesto único",
    descripcion: "Configura tramos mensuales para el cálculo del impuesto único.",
  },
  remLiquidaciones: {
    titulo: "Liquidaciones",
    descripcion: "Calcula, revisa y contabiliza liquidaciones de sueldo.",
  },
  remLiquidacionPDF: {
    titulo: "Liquidación PDF",
    descripcion: "Genera liquidaciones individuales con formato ServContable.",
  },
  remLibro: {
    titulo: "Libro remuneraciones",
    descripcion: "Consulta y exporta el libro mensual de remuneraciones.",
  },
  remPagos: {
    titulo: "Pago remuneraciones",
    descripcion: "Registra pagos de sueldos y controla saldos pendientes.",
  },
  remPrevired: {
    titulo: "CSV Previred",
    descripcion: "Prepara la nómina previsional para carga en Previred.",
  },
  remFiniquitos: {
    titulo: "Finiquitos",
    descripcion: "Calcula, emite y contabiliza finiquitos laborales.",
  },
  remVacacionesAusencias: {
    titulo: "Vacaciones y Ausencias",
    descripcion: "Registra ausencias, feriados y movimientos de vacaciones.",
  },
  remSaldoVacaciones: {
    titulo: "Saldo vacaciones",
    descripcion: "Calcula saldos disponibles y usados por trabajador.",
  },
  remConfiguracionPrevisional: {
    titulo: "Configuración previsional",
    descripcion: "Importa indicadores Previred y configura topes, AFP, AFC, salud y asignación familiar.",
  },
  remConfiguracionContable: {
    titulo: "Configuración contable",
    descripcion: "Define las cuentas contables usadas por remuneraciones.",
  },
};

function rolNormalizado(rol = "") {
  return String(rol || "").trim().toLowerCase();
}

function vistaInicialPorModulo(moduloActivo) {
  if (moduloActivo === "administracion") return "adminSuscripciones";
  if (moduloActivo === "remuneraciones") return "remuneraciones";
  if (moduloActivo === "simplificada") return "registroSimplificado";
  return "inicio";
}

const VISTAS_VALIDAS = new Set([
  "importarBhe",
  "correccionMonetaria",
  "rentaAnual",
  "declaracionesJuradas",
  "activoFijo",
  "terceros",
  "centrosCosto",
  "adminSuscripciones",
  "adminSuscripcionesAuditoria",
  "adminSuscripcionesClientes",
  "adminSuscripcionesConfiguracion",
  "adminSuscripcionesEmpresas",
  "adminSuscripcionesGestion",
  "adminSuscripcionesPagos",
  "adminSuscripcionesSolicitudes",
  "analisisCuentas",
  "auditoria",
  "balance8",
  "boletas",
  "calceBancario",
  "calendarioTributario",
  "cartolaRut",
  "cierreMensual",
  "clasificarDocumentos",
  "compras",
  "comprobantes",
  "conciliacionBancaria",
  "configuracionContable",
  "cuentasPendientes",
  "dashboardContable",
  "empresas",
  "estadoResultados",
  "flujoCaja",
  "honorarios",
  "inicio",
  "libroCaja",
  "libroDiario",
  "libroIngresosEgresos",
  "libroMayor",
  "librosCompraVenta",
  "pagosCobros",
  "panelEstudio",
  "planCuentas",
  "registroSimplificado",
  "remConfiguracion",
  "remConfiguracionContable",
  "remConfiguracionPrevisional",
  "remFiniquitos",
  "remHaberes",
  "remImpuestoUnico",
  "remLibro",
  "remLiquidacionPDF",
  "remLiquidaciones",
  "remPagos",
  "remPrevired",
  "remSaldoVacaciones",
  "remTrabajadores",
  "remVacacionesAusencias",
  "remanenteIVA",
  "remuneraciones",
  "resumenF29",
  "resumenIVA",
  "usuariosSistema",
  "ventas",
]);

/**
 * La vista viaja en el hash de la URL: así F5 vuelve a la misma pantalla y el
 * botón atrás funciona. Un hash desconocido se ignora.
 */
function vistaDesdeHash() {
  const hash = String(window.location.hash || "").replace(/^#\/?/, "");

  return VISTAS_VALIDAS.has(hash) ? hash : "";
}

const cargandoPagina = (
  <p style={{ padding: 24, color: "var(--sc-muted)" }} aria-live="polite">
    Cargando…
  </p>
);

export default function PanelPrincipal({
  usuario,
  moduloActivo,
  empresaActiva,
  ejercicioActivo,
  cambiarEmpresa,
  cambiarEjercicio,
  volverASeleccionModulo,
  alCerrarSesion,
  alSeleccionarEmpresa,
}) {
  const [vistaActiva, setVistaActiva] = useState(
    () => vistaDesdeHash() || vistaInicialPorModulo(moduloActivo)
  );

  useEffect(() => {
    function alCambiarHash() {
      const vista = vistaDesdeHash();

      if (vista) setVistaActiva(vista);
    }

    window.addEventListener("hashchange", alCambiarHash);

    return () => window.removeEventListener("hashchange", alCambiarHash);
  }, []);

  useEffect(() => {
    if (vistaDesdeHash() !== vistaActiva) {
      window.history.replaceState(null, "", `#${vistaActiva}`);
    }
  }, [vistaActiva]);
  // En un teléfono el menú de 260 px dejaba 140 px de contenido: arranca
  // cerrado y se abre con el botón de la barra superior.
  const [menuAbierto, setMenuAbierto] = useState(() => !pantallaAngosta());
  const [gruposAbiertos, setGruposAbiertos] = useState({});
  const usuarioEsAdminSistema = ROLES_ADMIN_SISTEMA.includes(rolNormalizado(usuario?.rol));
  const esModuloAdministracion = moduloActivo === "administracion";
  const heroActual =
    esModuloAdministracion
      ? HEROES_CONTABLE[vistaActiva]
      : moduloActivo === "remuneraciones"
      ? HEROES_REMUNERACIONES[vistaActiva] || HEROES_CONTABLE[vistaActiva]
      : HEROES_CONTABLE[vistaActiva];
  // Vistas cuya página ya dibuja su propio encabezado. Si no están acá, el
  // encabezado sale dos veces: el del panel y el de la página. Le pasaba al
  // dashboard financiero, que además del título necesita el selector de período
  // dentro de su propio encabezado.
  const vistasConHeroPropio = [
    "inicio",
    "dashboardContable",
    "remConfiguracion",
    "remConfiguracionPrevisional",
    "remConfiguracionContable",
  ];
  const mostrarHeroPanel = Boolean(heroActual) && !vistasConHeroPropio.includes(vistaActiva);

  function irVista(vista) {
    setVistaActiva(vista);

    if (vistaDesdeHash() !== vista) {
      // pushState deja la entrada en el historial: el botón atrás vuelve a la
      // vista anterior y dispara hashchange.
      window.history.pushState(null, "", `#${vista}`);
    }

    // En pantalla angosta el menú es una capa sobre el contenido: si quedara
    // abierto tras elegir, taparía la pantalla que se acaba de pedir.
    if (pantallaAngosta()) {
      setMenuAbierto(false);
    }
  }

  function alternarGrupo(nombreGrupo) {
    setGruposAbiertos((actual) => ({
      ...actual,
      [nombreGrupo]: !actual[nombreGrupo],
    }));
  }

  function salir() {
    cerrarSesion();
    alCerrarSesion();
  }

  function estadoEjercicio() {
    if (!ejercicioActivo) return "Sin año";
    return ejercicioActivo.estado === "cerrado" ? "Cerrado" : "Abierto";
  }

  function colorEstadoEjercicio() {
    if (!ejercicioActivo) return "var(--sc-gris)";
    return ejercicioActivo.estado === "cerrado" ? "var(--sc-danger)" : "var(--sc-teal)";
  }

  const menuContable = [
    {
      grupo: "Principal",
      items: [
        { id: "panelEstudio", label: "Panel del estudio" },
        { id: "inicio", label: "Dashboard financiero" },
        { id: "dashboardContable", label: "Dashboard contable" },
      ],
    },
    {
      grupo: "Registros Contables",
      items: [
        { id: "comprobantes", label: "Comprobantes contables" },
        { id: "ventas", label: "Registro de Ventas" },
        { id: "boletas", label: "Registro de Boletas" },
        { id: "compras", label: "Registro de Compras" },
        { id: "honorarios", label: "Honorarios Recibidos" },
        { id: "importarBhe", label: "Importar boletas de honorarios (SII)" },
        { id: "terceros", label: "Proveedores y clientes" },
        { id: "pagosCobros", label: "Pagar / Cobrar Documento" },
        { id: "cuentasPendientes", label: "Cuentas por Cobrar/Pagar" },
        { id: "cartolaRut", label: "Cartola por RUT" },
        { id: "conciliacionBancaria", label: "Conciliación bancaria" },
        { id: "calceBancario", label: "Calce automático del banco" },
        { id: "clasificarDocumentos", label: "Clasificar documentos" },
      ],
    },
    {
      grupo: "Informes",
      items: [
        { id: "libroDiario", label: "Libro Diario" },
        { id: "libroMayor", label: "Libro Mayor" },
        { id: "activoFijo", label: "Activo fijo y depreciación" },
        { id: "analisisCuentas", label: "Análisis de cuentas" },
        { id: "balance8", label: "Balance 8 Columnas" },
        { id: "estadoResultados", label: "Estado de Resultados" },
        { id: "librosCompraVenta", label: "Libros Compra/Venta" },
        { id: "flujoCaja", label: "Flujo de caja" },
      ],
    },
    {
      grupo: "Tributario",
      items: [
        { id: "resumenIVA", label: "Resumen IVA" },
        { id: "resumenF29", label: "Resumen F29" },
        { id: "remanenteIVA", label: "Control Remanente IVA" },
        { id: "cierreMensual", label: "Cierre mensual" },
        { id: "calendarioTributario", label: "Calendario tributario" },
        { id: "declaracionesJuradas", label: "Declaraciones juradas" },
        { id: "correccionMonetaria", label: "Corrección monetaria" },
        { id: "rentaAnual", label: "Renta anual y F22" },
      ],
    },
    {
      grupo: "Configuración",
      items: [
        { id: "configuracionContable", label: "Configuración Contable" },
        { id: "empresas", label: "Empresas" },
        { id: "planCuentas", label: "Plan de cuentas" },
        { id: "centrosCosto", label: "Centros de costo" },
        { id: "auditoria", label: "Auditoría del sistema" },
      ],
    },
  ];

  const menuSimplificada = [
    {
      grupo: "Contabilidad Simplificada",
      items: [
        { id: "registroSimplificado", label: "Registro Simplificado" },
        { id: "libroCaja", label: "Libro de Caja" },
        { id: "libroIngresosEgresos", label: "Libro de Ingresos y Egresos" },
      ],
    },
  ];

  const menuRemuneraciones = [
    {
      grupo: "Remuneraciones",
      items: [
        { id: "remuneraciones", label: "Panel remuneraciones" },
        { id: "remTrabajadores", label: "Trabajadores" },
        { id: "remHaberes", label: "Haberes y descuentos" },
        { id: "remImpuestoUnico", label: "Impuesto único" },
        { id: "remLiquidaciones", label: "Liquidaciones" },
        { id: "remLiquidacionPDF", label: "Liquidación PDF" },
        { id: "remLibro", label: "Libro remuneraciones" },
        { id: "remPagos", label: "Pago remuneraciones" },
        { id: "remPrevired", label: "CSV Previred" },
        { id: "remFiniquitos", label: "Finiquitos" },
        { id: "remVacacionesAusencias", label: "Vacaciones y Ausencias" },
        { id: "remSaldoVacaciones", label: "Saldo vacaciones" },
        { id: "remConfiguracionPrevisional", label: "Config. previsional" },
        { id: "remConfiguracionContable", label: "Config. contable" },
      ],
    },
  ];

  const menuAdministracion = {
    grupo: "Administración",
    items: [
      { id: "adminSuscripciones", label: "Dashboard" },
      { id: "adminSuscripcionesClientes", label: "Clientes" },
      { id: "adminSuscripcionesEmpresas", label: "Empresas" },
      { id: "usuariosSistema", label: "Usuarios" },
      { id: "adminSuscripcionesGestion", label: "Suscripciones" },
      { id: "adminSuscripcionesPagos", label: "Pagos" },
      { id: "adminSuscripcionesSolicitudes", label: "Solicitudes Web" },
      { id: "adminSuscripcionesAuditoria", label: "Auditoría" },
      { id: "adminSuscripcionesConfiguracion", label: "Configuración Comercial" },
    ],
  };

  const menuBase =
    esModuloAdministracion
      ? [menuAdministracion]
      : moduloActivo === "remuneraciones"
      ? menuRemuneraciones
      : moduloActivo === "simplificada"
      ? menuSimplificada
      : menuContable;
  const menuActivo = menuBase;
  const tituloModulo =
    esModuloAdministracion
      ? "Administración"
      : moduloActivo === "remuneraciones"
      ? "Módulo Remuneraciones"
      : moduloActivo === "simplificada"
      ? "Módulo Contabilidad Simplificada"
      : "Módulo Contable";

  if (esModuloAdministracion && !usuarioEsAdminSistema) {
    return (
      <div style={layout}>
        <main style={main(false)}>
          <section style={contenido}>
            <div style={tarjetaAccesoDenegado}>
              <h1>Acceso denegado</h1>
              <p>La Administración del sistema está disponible solo para el Administrador del Sistema.</p>
              <button style={botonCambiar} type="button" onClick={volverASeleccionModulo}>
                Volver a módulos
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div style={layout}>
      {menuAbierto && (
        <aside className="sc-sidebar" style={sidebar}>
          <div style={brandBox}>
            <img style={brandIcon} src={LOGO_SRC} alt="ServContable" />
            <div>
              <h2 style={brand}>ServContable</h2>
              <p style={brandSub}>PRO</p>
            </div>
          </div>

          {!esModuloAdministracion && (
            <>
              <div style={empresaBox}>
                <p style={empresaLabel}>Empresa activa</p>
                <strong>{empresaActiva?.razon_social || empresaActiva?.nombre || "Sin empresa"}</strong>
                <small>RUT: {empresaActiva?.rut || "-"}</small>
              </div>

              <div style={ejercicioBox}>
                <p style={empresaLabel}>Año de trabajo</p>
                <strong>{ejercicioActivo?.anio || "Sin año seleccionado"}</strong>
                <span style={{ ...estadoBadge, background: colorEstadoEjercicio() }}>
                  {estadoEjercicio()}
                </span>
              </div>
            </>
          )}

          <div style={moduloBox}>{tituloModulo}</div>

          {menuActivo.map((grupo) => {
            const abierto = gruposAbiertos[grupo.grupo] === true;

            return (
              <div key={grupo.grupo} style={grupoBox}>
                <button
                  type="button"
                  style={grupoHeader}
                  onClick={() => alternarGrupo(grupo.grupo)}
                  aria-expanded={abierto}
                >
                  <span>{grupo.grupo}</span>
                  <span style={grupoFlecha}>{abierto ? "▼" : "▶"}</span>
                </button>

                {abierto && (
                  <div style={grupoContenido}>
                    {grupo.items.map((item) => (
                      <button type="button"
                        key={item.id}
                        style={menuItem(vistaActiva === item.id)}
                        onClick={() => irVista(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div style={accionesMenu}>
            {!esModuloAdministracion && (
              <>
                <button type="button" style={botonCambiar} onClick={cambiarEmpresa}>Cambiar empresa</button>
                {typeof cambiarEjercicio === "function" && (
                  <button type="button" style={botonCambiar} onClick={cambiarEjercicio}>Cambiar año</button>
                )}
              </>
            )}
            <button type="button" style={botonCambiar} onClick={volverASeleccionModulo}>Cambiar módulo</button>
            <button type="button" style={botonSalir} onClick={salir}>Cerrar sesión</button>
          </div>
        </aside>
      )}

      <main className="sc-main-panel" style={main(menuAbierto)}>
        <header style={topbar}>
          <button type="button" style={botonToggle} onClick={() => setMenuAbierto(!menuAbierto)}>
            {menuAbierto ? "Ocultar menú" : "Mostrar menú"}
          </button>

          <div style={topbarRight}>
            <strong>{usuario?.nombre || "Usuario"}</strong>
            <span>{usuario?.email || ""}</span>
            <span>{tituloModulo}</span>
            {!esModuloAdministracion && (
              <>
                <span style={topbarAnio}>Año: <strong>{ejercicioActivo?.anio || "-"}</strong></span>
                <span style={{ ...topbarEstado, background: colorEstadoEjercicio() }}>
                  {estadoEjercicio()}
                </span>
              </>
            )}
          </div>
        </header>

        <section style={contenido}>
          {mostrarHeroPanel && (
            <ModuloHero
              titulo={heroActual.titulo}
              descripcion={heroActual.descripcion}
            />
          )}

          <div
            className={`servcontable-module-body${
              mostrarHeroPanel ? " servcontable-has-panel-hero" : ""
            }`}
          >
            <Suspense fallback={cargandoPagina}>
            {vistaActiva === "panelEstudio" && (
              <PanelEstudio alAbrirEmpresa={alSeleccionarEmpresa} />
            )}
            {vistaActiva === "cierreMensual" && <CierreMensual />}
            {vistaActiva === "calceBancario" && <CalceBancario />}
            {vistaActiva === "clasificarDocumentos" && <ClasificarDocumentos />}
            {vistaActiva === "calendarioTributario" && <CalendarioTributario />}
            {vistaActiva === "flujoCaja" && <FlujoCaja />}
            {vistaActiva === "terceros" && <Terceros />}
            {vistaActiva === "centrosCosto" && <CentrosCosto />}
            {vistaActiva === "activoFijo" && <ActivoFijo />}
            {vistaActiva === "declaracionesJuradas" && <DeclaracionesJuradas />}
            {vistaActiva === "importarBhe" && <ImportarBhe />}
            {vistaActiva === "correccionMonetaria" && <CorreccionMonetaria />}
            {vistaActiva === "rentaAnual" && <RentaAnual />}
            {vistaActiva === "inicio" && <DashboardFinanciero irVista={irVista} />}
            {vistaActiva === "dashboardContable" && <DashboardContable irVista={irVista} />}
            {vistaActiva === "empresas" && <Empresas />}
            {vistaActiva === "planCuentas" && <PlanCuentas />}
            {vistaActiva === "auditoria" && <AuditoriaSistema />}
            {vistaActiva === "usuariosSistema" && esModuloAdministracion && usuarioEsAdminSistema && (
              <UsuariosSistema />
            )}
            {vistaActiva === "adminSuscripciones" && usuarioEsAdminSistema && (
              <AdminSuscripciones vistaInicial="dashboard" />
            )}
            {vistaActiva === "adminSuscripcionesSolicitudes" && usuarioEsAdminSistema && (
              <AdminSuscripciones vistaInicial="solicitudes" />
            )}
            {vistaActiva === "adminSuscripcionesClientes" && usuarioEsAdminSistema && (
              <AdminSuscripciones vistaInicial="clientes" />
            )}
            {vistaActiva === "adminSuscripcionesEmpresas" && usuarioEsAdminSistema && (
              <AdminSuscripciones vistaInicial="empresas" />
            )}
            {vistaActiva === "adminSuscripcionesGestion" && usuarioEsAdminSistema && (
              <AdminSuscripciones vistaInicial="suscripciones" />
            )}
            {vistaActiva === "adminSuscripcionesPagos" && usuarioEsAdminSistema && (
              <AdminSuscripciones vistaInicial="pagos" />
            )}
            {vistaActiva === "adminSuscripcionesAuditoria" && usuarioEsAdminSistema && (
              <AdminSuscripciones vistaInicial="auditoria" />
            )}
            {vistaActiva === "adminSuscripcionesConfiguracion" && usuarioEsAdminSistema && (
              <AdminSuscripciones vistaInicial="configuracion" />
            )}
            {vistaActiva === "comprobantes" && <Comprobantes />}
            {vistaActiva === "libroDiario" && <LibroDiario />}
            {vistaActiva === "libroMayor" && <LibroMayor />}
            {vistaActiva === "balance8" && <Balance8Columnas />}
            {vistaActiva === "estadoResultados" && <EstadoResultados />}
            {vistaActiva === "ventas" && <Ventas />}
            {vistaActiva === "boletas" && <RegistroBoletas />}
            {vistaActiva === "compras" && <Compras />}
            {vistaActiva === "resumenIVA" && <ResumenIVA />}
            {vistaActiva === "resumenF29" && <ResumenF29 />}
            {vistaActiva === "remanenteIVA" && <ControlRemanenteIVA />}
            {vistaActiva === "configuracionContable" && <ConfiguracionContable />}
            {vistaActiva === "librosCompraVenta" && <LibrosCompraVenta />}
            {vistaActiva === "registroSimplificado" && <ContabilidadSimplificada vista="registro" />}
            {vistaActiva === "libroCaja" && <ContabilidadSimplificada vista="caja" />}
            {vistaActiva === "libroIngresosEgresos" && <ContabilidadSimplificada vista="ingresosEgresos" />}
            {vistaActiva === "honorarios" && <Honorarios />}
            {vistaActiva === "pagosCobros" && <PagosCobros />}
            {vistaActiva === "cuentasPendientes" && <CuentasPendientes irVista={irVista} />}
            {vistaActiva === "cartolaRut" && <CartolaRut irVista={irVista} />}
            {vistaActiva === "conciliacionBancaria" && <ConciliacionBancaria />}
            {vistaActiva === "analisisCuentas" && <AnalisisCuentas />}

            {vistaActiva === "remuneraciones" && <Remuneraciones vistaInicial="panel" />}
            {vistaActiva === "remTrabajadores" && <Remuneraciones vistaInicial="trabajadores" />}
            {vistaActiva === "remHaberes" && <Remuneraciones vistaInicial="haberesDescuentos" />}
            {vistaActiva === "remImpuestoUnico" && <Remuneraciones vistaInicial="impuestoUnico" />}
            {vistaActiva === "remLiquidaciones" && <Remuneraciones vistaInicial="liquidaciones" />}
            {vistaActiva === "remLiquidacionPDF" && <Remuneraciones vistaInicial="liquidacionPDF" />}
            {vistaActiva === "remLibro" && <Remuneraciones vistaInicial="libro" />}
            {vistaActiva === "remPagos" && <Remuneraciones vistaInicial="pagos" />}
            {vistaActiva === "remPrevired" && <Remuneraciones vistaInicial="previred" />}
            {vistaActiva === "remConfiguracion" && <Remuneraciones vistaInicial="configuracion" />}
            {vistaActiva === "remConfiguracionPrevisional" && (
              <Remuneraciones vistaInicial="configuracionPrevisional" />
            )}
            {vistaActiva === "remConfiguracionContable" && (
              <Remuneraciones vistaInicial="configuracionContable" />
            )}
            {vistaActiva === "remFiniquitos" && <Remuneraciones vistaInicial="finiquitos" />}
            {vistaActiva === "remVacacionesAusencias" && <Remuneraciones vistaInicial="vacacionesAusencias" />}
            {vistaActiva === "remSaldoVacaciones" && <Remuneraciones vistaInicial="saldoVacaciones" />}
            </Suspense>
          </div>
        </section>
      </main>
    </div>
  );
}

const layout = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at 15% 10%, rgba(34, 211, 238, 0.18), transparent 28%), #eef7ff",
  display: "flex",
  fontFamily: "Arial, sans-serif",
};

const sidebar = {
  width: "260px",
  background:
    "linear-gradient(180deg, #07111f 0%, #08213b 48%, #053a5c 100%)",
  color: "white",
  minHeight: "100vh",
  padding: "12px 10px",
  boxSizing: "border-box",
  position: "fixed",
  left: 0,
  top: 0,
  bottom: 0,
  overflowY: "auto",
  zIndex: 10,
  boxShadow: "14px 0 36px rgba(7, 17, 31, 0.28)",
};

const brandBox = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "12px",
};

const brandIcon = {
  width: "30px",
  height: "30px",
  borderRadius: "8px",
  background: "linear-gradient(135deg, rgba(34,211,238,0.24), rgba(255,255,255,0.08))",
  objectFit: "contain",
  padding: "3px",
  boxSizing: "border-box",
  border: "1px solid rgba(103, 232, 249, 0.28)",
};

const brand = {
  color: "#22d3ee",
  margin: 0,
  fontSize: "21px",
};

const brandSub = {
  color: "#22d3ee",
  margin: 0,
  fontWeight: "bold",
};

const empresaBox = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(103, 232, 249, 0.18)",
  borderRadius: "12px",
  padding: "10px",
  textAlign: "center",
  marginBottom: "9px",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const ejercicioBox = {
  background: "rgba(7, 17, 31, 0.68)",
  border: "1px solid rgba(103, 232, 249, 0.18)",
  borderRadius: "12px",
  padding: "10px",
  textAlign: "center",
  marginBottom: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "5px",
};

const empresaLabel = {
  fontSize: "12px",
  margin: 0,
  color: "var(--sc-celeste-borde)",
};

const estadoBadge = {
  color: "white",
  padding: "5px 8px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: "bold",
  alignSelf: "center",
};

const moduloBox = {
  background: "linear-gradient(135deg, var(--sc-azul), var(--sc-cian-medio))",
  borderRadius: "10px",
  padding: "10px",
  fontWeight: "bold",
  marginBottom: "12px",
  textAlign: "center",
  fontSize: "14px",
  boxShadow: "0 10px 24px rgba(6, 182, 212, 0.24)",
};

const grupoBox = {
  marginBottom: "8px",
  border: "1px solid rgba(103, 232, 249, 0.18)",
  borderRadius: "12px",
  overflow: "hidden",
};

const grupoHeader = {
  width: "100%",
  background: "rgba(21, 94, 117, 0.88)",
  color: "white",
  border: "none",
  padding: "10px 11px",
  fontWeight: "bold",
  fontSize: "14px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  textAlign: "left",
};

const grupoFlecha = {
  color: "var(--sc-celeste-suave)",
  fontSize: "14px",
  lineHeight: 1,
};

const grupoContenido = {
  background: "rgba(11, 37, 69, 0.92)",
};

const menuItem = (activo) => ({
  width: "100%",
  background: activo ? "linear-gradient(135deg, #22d3ee, var(--sc-teal))" : "transparent",
  color: activo ? "#062033" : "white",
  border: "none",
  borderTop: "1px solid rgba(103, 232, 249, 0.12)",
  padding: "9px 11px",
  cursor: "pointer",
  display: "flex",
  gap: "9px",
  alignItems: "center",
  textAlign: "left",
  fontSize: "13px",
  fontWeight: activo ? "bold" : "normal",
});

const accionesMenu = {
  marginTop: "14px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const botonCambiar = {
  width: "100%",
  background: "linear-gradient(135deg, var(--sc-azul), #0891b2)",
  color: "white",
  border: "none",
  borderRadius: "9px",
  padding: "9px",
  fontWeight: "bold",
  fontSize: "13px",
  cursor: "pointer",
};

const botonSalir = {
  width: "100%",
  background: "linear-gradient(135deg, var(--sc-danger), var(--sc-warning))",
  color: "white",
  border: "none",
  borderRadius: "9px",
  padding: "9px",
  fontWeight: "bold",
  fontSize: "13px",
  cursor: "pointer",
};

const main = (menuAbierto) => ({
  flex: 1,
  marginLeft: menuAbierto ? "260px" : "0",
  minHeight: "100vh",
  transition: "all 0.25s ease",
  width: menuAbierto ? "calc(100% - 260px)" : "100%",
});

const topbar = {
  minHeight: "52px",
  background: "rgba(255, 255, 255, 0.92)",
  borderBottom: "1px solid rgba(169, 216, 239, 0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 16px",
  position: "sticky",
  top: 0,
  zIndex: 5,
  boxSizing: "border-box",
  backdropFilter: "blur(14px)",
  boxShadow: "0 10px 28px rgba(3, 105, 161, 0.08)",
};

const botonToggle = {
  background: "linear-gradient(135deg, var(--sc-azul), var(--sc-cian-medio))",
  color: "white",
  border: "none",
  padding: "8px 12px",
  borderRadius: "8px",
  fontWeight: "bold",
  fontSize: "13px",
  cursor: "pointer",
};

const topbarRight = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  color: "var(--sc-text)",
  fontSize: "13px",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const topbarAnio = {
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  color: "var(--sc-azul)",
  padding: "5px 9px",
  borderRadius: "999px",
  fontWeight: "bold",
};

const topbarEstado = {
  color: "white",
  padding: "5px 9px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "12px",
};

const contenido = {
  padding: "16px",
};

const tarjetaAccesoDenegado = {
  background: "white",
  border: "1px solid #bae6fd",
  borderRadius: "12px",
  padding: "24px",
  color: "var(--sc-ink)",
  maxWidth: "620px",
  boxShadow: "0 12px 30px rgba(2, 132, 199, 0.10)",
};
