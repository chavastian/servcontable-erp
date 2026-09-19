import { useEffect, useState } from "react";
import {
  ejecutarAccionSuscripcion,
  ejecutarAccionSolicitudWebSuscripcion,
  guardarConfiguracionSuscripciones,
  listarAuditoriaSuscripciones,
  listarClientesSuscripciones,
  listarNotificacionesSuscripciones,
  listarSolicitudesWebSuscripciones,
  obtenerDetalleSolicitudWebSuscripcion,
  obtenerClienteSuscripcion,
  obtenerConfiguracionSuscripciones,
  obtenerDashboardSuscripciones,
  registrarPagoSuscripcion,
} from "../services/adminSuscripcionesService";
import { obtenerUsuarioActual } from "../services/authService";
import { CONFIG_COMERCIAL } from "../config/comercial";
import { EstadoCargando } from "../components/EstadoPantalla";

const ROLES_SUPER_ADMIN = ["superadmin", "super_admin", "admin", "administrador_sistema"];
const ESTADOS = ["TRIAL", "ACTIVE", "PAST_DUE", "EXPIRED", "SUSPENDED", "CANCELLED"];
const ESTADOS_PAGO = ["PAID", "PENDING", "FAILED", "REFUNDED", "VOID"];
const CONFIG_COMERCIAL_KEYS = [
  "commercial_service_name",
  "commercial_monthly_base_price",
  "commercial_iva_rate",
  "commercial_included_users",
  "commercial_additional_user_price",
  "commercial_companies_limit",
  "trial_days",
  "grace_days",
  "expiry_notice_days",
  "currency",
  "expired_status",
  "suspension_policy",
];

function esSuperAdmin(rol = "") {
  return ROLES_SUPER_ADMIN.includes(String(rol || "").trim().toLowerCase());
}

function formatoMoneda(valor) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Number(valor || 0));
}

function formatoFecha(valor) {
  if (!valor) return "-";
  return String(valor).slice(0, 10);
}

function textoEstado(estado = "") {
  const labels = {
    TRIAL: "Prueba",
    ACTIVE: "Activa",
    PAST_DUE: "Gracia",
    EXPIRED: "Vencida",
    SUSPENDED: "Suspendida",
    CANCELLED: "Cancelada",
  };
  return labels[estado] || estado || "-";
}

function etiquetaConfiguracion(key = "") {
  const labels = {
    commercial_service_name: "Servicio",
    commercial_monthly_base_price: "Precio mensual base",
    commercial_included_users: "Usuarios incluidos",
    commercial_additional_user_price: "Precio usuario adicional",
    commercial_iva_rate: "IVA",
    commercial_companies_limit: "Empresas",
    trial_days: "Duración prueba gratis",
    grace_days: "Días de gracia",
    expiry_notice_days: "Avisos antes del vencimiento",
    currency: "Moneda",
    expired_status: "Estado al vencer",
    suspension_policy: "Política de suspensión",
    default_plan_code: "Código interno del servicio",
  };
  return labels[key] || key;
}

function estadoStyle(estado = "") {
  const base = {
    borderRadius: "999px",
    padding: "5px 9px",
    fontWeight: "bold",
    fontSize: "12px",
    display: "inline-block",
    whiteSpace: "nowrap",
  };

  if (estado === "ACTIVE") return { ...base, background: "#dcfce7", color: "#166534" };
  if (estado === "TRIAL") return { ...base, background: "#dff7ff", color: "#0369a1" };
  if (estado === "PAST_DUE") return { ...base, background: "#fef3c7", color: "#92400e" };
  if (estado === "EXPIRED") return { ...base, background: "#fee2e2", color: "#991b1b" };
  if (estado === "SUSPENDED") return { ...base, background: "#e2e8f0", color: "#334155" };
  if (estado === "CANCELLED") return { ...base, background: "#f3f4f6", color: "#4b5563" };
  return { ...base, background: "#e2e8f0", color: "#334155" };
}

export default function AdminSuscripciones({ vistaInicial = "dashboard" }) {
  const usuario = obtenerUsuarioActual();
  const [tab, setTab] = useState(vistaInicial);
  const [dashboard, setDashboard] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [clienteActivo, setClienteActivo] = useState(null);
  const [auditoria, setAuditoria] = useState([]);
  const [notificaciones, setNotificaciones] = useState([]);
  const [solicitudesWeb, setSolicitudesWeb] = useState([]);
  const [resumenSolicitudesWeb, setResumenSolicitudesWeb] = useState({});
  const [alertasSolicitudesWeb, setAlertasSolicitudesWeb] = useState([]);
  const [detalleSolicitudWeb, setDetalleSolicitudWeb] = useState(null);
  const [configuracion, setConfiguracion] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [filtros, setFiltros] = useState({
    buscar: "",
    estado: "",
    desde: "",
    vence_hasta: "",
    sort: "created_desc",
  });
  const [filtrosSolicitudes, setFiltrosSolicitudes] = useState({
    buscar: "",
    tipo: "",
    estado: "",
    desde: "",
    hasta: "",
  });
  const [accion, setAccion] = useState({
    accion: "EXTENDER",
    dias: 30,
    meses: 1,
    billing_cycle: "monthly",
    observacion: "",
  });
  const [pago, setPago] = useState({
    payment_date: new Date().toISOString().slice(0, 10),
    amount: "",
    period_label: "",
    payment_method: "manual",
    status: "PAID",
    transaction_id: "",
    tax_document: "",
    notes: "",
  });

  const metricas = dashboard?.metricas || {};

  useEffect(() => {
    cargarTodo();
  }, []);

  useEffect(() => {
    setTab(vistaInicial);
  }, [vistaInicial]);

  async function cargarTodo() {
    try {
      setCargando(true);
      setError("");
      const [
        dataDashboard,
        dataClientes,
        dataConfig,
        dataAuditoria,
        dataNotificaciones,
        dataSolicitudesWeb,
      ] =
        await Promise.all([
          obtenerDashboardSuscripciones(),
          listarClientesSuscripciones(filtros),
          obtenerConfiguracionSuscripciones(),
          listarAuditoriaSuscripciones(),
          listarNotificacionesSuscripciones(),
          listarSolicitudesWebSuscripciones(filtrosSolicitudes),
        ]);

      setDashboard(dataDashboard);
      setClientes(dataClientes.clientes || []);
      setConfiguracion(dataConfig.configuracion || []);
      setAuditoria(dataAuditoria.auditoria || []);
      setNotificaciones(dataNotificaciones.notificaciones || []);
      setSolicitudesWeb(dataSolicitudesWeb.solicitudes || []);
      setResumenSolicitudesWeb(dataSolicitudesWeb.resumen || {});
      setAlertasSolicitudesWeb(dataSolicitudesWeb.alertas || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function buscarClientes() {
    try {
      setCargando(true);
      setError("");
      const data = await listarClientesSuscripciones(filtros);
      setClientes(data.clientes || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function buscarSolicitudesWeb(filtrosExtra = {}) {
    try {
      setCargando(true);
      setError("");
      const filtrosFinales = { ...filtrosSolicitudes, ...filtrosExtra };
      setFiltrosSolicitudes(filtrosFinales);
      const data = await listarSolicitudesWebSuscripciones(filtrosFinales);
      setSolicitudesWeb(data.solicitudes || []);
      setResumenSolicitudesWeb(data.resumen || {});
      setAlertasSolicitudesWeb(data.alertas || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function verDetalleSolicitudWeb(solicitud) {
    try {
      setError("");
      const data = await obtenerDetalleSolicitudWebSuscripcion(solicitud.tipo, solicitud.id);
      setDetalleSolicitudWeb(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function ejecutarAccionSolicitudWeb(solicitud, accionSolicitud) {
    const motivoRequerido = ["SUSPENDER", "BLOQUEAR"].includes(accionSolicitud);
    const motivo = motivoRequerido
      ? window.prompt("Indica el motivo obligatorio:")
      : window.prompt("Observacion interna opcional:", "");

    if (motivoRequerido && !motivo) return;

    let payload = { accion: accionSolicitud, motivo: motivo || "" };

    if (accionSolicitud === "EXTENDER") {
      const dias = window.prompt("Cuantos dias quieres agregar? Ej: 7, 15 o 30", "7");
      if (!dias) return;
      payload = { ...payload, dias };
    }

    if (accionSolicitud === "CONVERTIR") {
      payload = { ...payload, billing_cycle: "monthly" };
    }

    const confirma = window.confirm("Confirma aplicar esta accion?");
    if (!confirma) return;

    try {
      setError("");
      setMensaje("");
      await ejecutarAccionSolicitudWebSuscripcion(solicitud.tipo, solicitud.id, payload);
      setMensaje("Accion de solicitud web aplicada correctamente.");
      await buscarSolicitudesWeb();
      setDetalleSolicitudWeb(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function abrirCliente(cliente) {
    try {
      setError("");
      setMensaje("");
      const data = await obtenerClienteSuscripcion(cliente.id);
      setClienteActivo(data);
      setTab("cliente");
    } catch (err) {
      setError(err.message);
    }
  }

  async function aplicarAccion() {
    if (!clienteActivo?.cliente?.id) return;
    const confirma = window.confirm("Confirma aplicar esta accion administrativa?");
    if (!confirma) return;

    try {
      setError("");
      setMensaje("");
      await ejecutarAccionSuscripcion(clienteActivo.cliente.id, accion);
      setMensaje("Accion aplicada correctamente.");
      await abrirCliente(clienteActivo.cliente);
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    }
  }

  async function guardarPago() {
    if (!clienteActivo?.cliente?.id) return;
    const confirma = window.confirm("Confirma registrar este pago manual?");
    if (!confirma) return;

    try {
      setError("");
      setMensaje("");
      await registrarPagoSuscripcion(clienteActivo.cliente.id, pago);
      setMensaje("Pago registrado correctamente.");
      await abrirCliente(clienteActivo.cliente);
      await cargarTodo();
    } catch (err) {
      setError(err.message);
    }
  }

  async function guardarConfig() {
    const confirma = window.confirm("Confirma guardar la configuracion comercial?");
    if (!confirma) return;

    try {
      setError("");
      setMensaje("");
      await guardarConfiguracionSuscripciones(configuracion);
      setMensaje("Configuracion guardada correctamente.");
    } catch (err) {
      setError(err.message);
    }
  }

  function actualizarFiltro(e) {
    const { name, value } = e.target;
    setFiltros((actual) => ({ ...actual, [name]: value }));
  }

  if (!esSuperAdmin(usuario?.rol)) {
    return (
      <div>
        <h1 style={titulo}>Administración del Sistema</h1>
        <p style={errorTexto}>Solo el administrador del sistema puede acceder a este modulo.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={titulo}>Administración</h1>
      <p style={subtitulo}>
        Seguimiento comercial y control simple de clientes, pruebas gratuitas, suscripciones y solicitudes web.
      </p>

      {mensaje && <p style={ok}>{mensaje}</p>}
      {cargando && <EstadoCargando mensaje="Cargando datos..." />}
      {error && <p style={errorTexto}>{error}</p>}

      <div style={tabs}>
        {[
          ["dashboard", "Dashboard"],
          ["clientes", "Clientes"],
          ["empresas", "Empresas"],
          ["suscripciones", "Suscripciones"],
          ["pagos", "Pagos"],
          ["solicitudes", "Solicitudes Web"],
          ["configuracion", "Configuración Comercial"],
          ["auditoria", "Auditoría"],
          ...(tab === "cliente" ? [["cliente", "Ficha"]] : []),
        ].map(([id, label]) => (
          <button key={id} type="button" style={tabButton(tab === id)} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {cargando && <p style={subtitulo}>Cargando informacion...</p>}

      {tab === "dashboard" && (
        <>
          <div style={metricGrid}>
            <Metric label="Clientes activos" value={metricas.activos} />
            <Metric label="Suscripciones activas" value={metricas.activos} />
            <Metric label="Clientes en prueba" value={metricas.trial} />
            <Metric label="Por vencer" value={metricas.proximas_vencer} />
            <Metric label="Vencidas" value={metricas.vencidas} />
            <Metric label="Suspendidas" value={metricas.suspendidas} />
            <Metric label="Empresas registradas" value={metricas.empresas_registradas} />
            <Metric label="Usuarios activos" value={metricas.usuarios_activos} />
            <Metric label="Usuarios adicionales" value={metricas.usuarios_adicionales_activos} />
            <Metric label="Pagos pendientes" value={metricas.pagos_pendientes || resumenSolicitudesWeb.pagos_pendientes} />
          </div>

          {alertasSolicitudesWeb.length > 0 && (
            <section style={card}>
              <h2 style={tituloSeccion}>Requieren atención</h2>
              {alertasSolicitudesWeb.map((alerta) => (
                <button
                  key={alerta.tipo}
                  type="button"
                  style={filaClienteBoton}
                  onClick={() => {
                    setTab("solicitudes");
                    buscarSolicitudesWeb({ estado: alerta.tipo });
                  }}
                >
                  <span>{alerta.texto}</span>
                  <strong>Ver</strong>
                </button>
              ))}
            </section>
          )}

          <div style={gridDos}>
            <section style={card}>
              <h2 style={tituloSeccion}>Modelo comercial</h2>
              <div style={filaResumen}>
                <span>Servicio</span>
                <strong>{dashboard?.configuracion_comercial?.servicio || CONFIG_COMERCIAL.servicio}</strong>
              </div>
              <div style={filaResumen}>
                <span>Precio base mensual</span>
                <strong>{formatoMoneda(dashboard?.configuracion_comercial?.precio_base_mensual || CONFIG_COMERCIAL.precioBaseMensual)}</strong>
              </div>
              <div style={filaResumen}>
                <span>Usuarios incluidos</span>
                <strong>{dashboard?.configuracion_comercial?.usuarios_incluidos || CONFIG_COMERCIAL.usuariosIncluidos}</strong>
              </div>
              <div style={filaResumen}>
                <span>Usuario adicional</span>
                <strong>{formatoMoneda(dashboard?.configuracion_comercial?.precio_usuario_adicional || CONFIG_COMERCIAL.precioUsuarioAdicional)}</strong>
              </div>
              <div style={filaResumen}>
                <span>Empresas</span>
                <strong>Ilimitadas</strong>
              </div>
            </section>

            <section style={card}>
              <h2 style={tituloSeccion}>Ingreso mensual estimado</h2>
              <div style={filaResumen}>
                <span>Base mensual</span>
                <strong>{formatoMoneda(metricas.ingreso_base_mensual)}</strong>
              </div>
              <div style={filaResumen}>
                <span>Usuarios adicionales</span>
                <strong>{formatoMoneda(metricas.ingreso_usuarios_adicionales)}</strong>
              </div>
              <div style={filaResumen}>
                <span>Neto</span>
                <strong>{formatoMoneda(metricas.ingreso_mensual_neto)}</strong>
              </div>
              <div style={filaResumen}>
                <span>IVA estimado</span>
                <strong>{formatoMoneda(metricas.iva_estimado)}</strong>
              </div>
              <div style={filaResumen}>
                <span>Total mensual</span>
                <strong>{formatoMoneda(metricas.total_mensual_estimado)}</strong>
              </div>
            </section>

            <section style={card}>
              <h2 style={tituloSeccion}>Pruebas próximas a vencer</h2>
              {(dashboard?.proximas_vencer || []).map((item) => (
                <button key={item.id} type="button" style={filaClienteBoton} onClick={() => abrirCliente(item)}>
                  <span>{item.cliente_nombre || item.correo}</span>
                  <strong>{formatoFecha(item.proximo_vencimiento)}</strong>
                </button>
              ))}
            </section>
          </div>
        </>
      )}

      {tab === "solicitudes" && (
        <section style={card}>
          <h2 style={tituloSeccion}>Solicitudes recibidas desde la pagina web</h2>
          <p style={subtitulo}>
            Registro comercial de pruebas gratuitas y solicitudes de suscripción realizadas desde la página pública.
          </p>
          <div style={metricGrid}>
            <Metric label="Pruebas activas" value={resumenSolicitudesWeb.pruebas_activas} />
            <Metric label="Vencen esta semana" value={resumenSolicitudesWeb.vencen_semana} />
            <Metric label="Vencen en 3 dias" value={resumenSolicitudesWeb.vencen_3_dias} />
            <Metric label="Nunca han ingresado" value={resumenSolicitudesWeb.nunca_ingresaron} />
            <Metric label="Sin actividad reciente" value={resumenSolicitudesWeb.sin_actividad_reciente} />
            <Metric label="Pruebas vencidas" value={resumenSolicitudesWeb.pruebas_vencidas} />
            <Metric label="Conversiones del mes" value={resumenSolicitudesWeb.conversiones_mes} />
            <Metric label="Pagos pendientes" value={resumenSolicitudesWeb.pagos_pendientes} />
          </div>

          {alertasSolicitudesWeb.length > 0 && (
            <div style={alertasBox}>
              <h3 style={tituloSeccion}>Requieren atencion</h3>
              {alertasSolicitudesWeb.map((alerta) => (
                <button
                  key={alerta.tipo}
                  type="button"
                  style={filaClienteBoton}
                  onClick={() => buscarSolicitudesWeb({ estado: alerta.tipo })}
                >
                  <span>{alerta.texto}</span>
                  <strong>Ver clientes</strong>
                </button>
              ))}
            </div>
          )}

          <div style={filtrosGrid}>
            <input
              style={input}
              value={filtrosSolicitudes.buscar}
              onChange={(e) => setFiltrosSolicitudes((actual) => ({ ...actual, buscar: e.target.value }))}
              placeholder="Correo, nombre o empresa"
            />
            <select
              style={input}
              value={filtrosSolicitudes.tipo}
              onChange={(e) => setFiltrosSolicitudes((actual) => ({ ...actual, tipo: e.target.value }))}
            >
              <option value="">Todos los tipos</option>
              <option value="PRUEBA_GRATIS">Prueba gratis</option>
              <option value="SUSCRIPCION_MENSUAL">Suscripcion mensual</option>
            </select>
            <select
              style={input}
              value={filtrosSolicitudes.estado}
              onChange={(e) => setFiltrosSolicitudes((actual) => ({ ...actual, estado: e.target.value }))}
            >
              <option value="">Todos los estados</option>
              <option value="prueba_activa">Prueba activa</option>
              <option value="vence_semana">Vence esta semana</option>
              <option value="vence_3_dias">Vence en 3 dias</option>
              <option value="nunca_ingreso">Nunca ingreso</option>
              <option value="prueba_vencida">Prueba vencida</option>
              <option value="pendiente_pago">Pendiente pago</option>
              <option value="pago_fallido">Pago fallido</option>
              <option value="convertido">Convertido</option>
              <option value="suspendido">Suspendido</option>
              <option value="archivado">Archivado</option>
            </select>
            <input
              style={input}
              type="date"
              value={filtrosSolicitudes.desde}
              onChange={(e) => setFiltrosSolicitudes((actual) => ({ ...actual, desde: e.target.value }))}
            />
            <input
              style={input}
              type="date"
              value={filtrosSolicitudes.hasta}
              onChange={(e) => setFiltrosSolicitudes((actual) => ({ ...actual, hasta: e.target.value }))}
            />
            <button type="button" style={botonPrimario} onClick={() => buscarSolicitudesWeb()}>Buscar</button>
          </div>

          <TablaSolicitudesWeb
            solicitudes={solicitudesWeb}
            abrirCliente={abrirCliente}
            verDetalle={verDetalleSolicitudWeb}
            ejecutarAccion={ejecutarAccionSolicitudWeb}
          />

          {detalleSolicitudWeb && (
            <DetalleSolicitudWeb
              data={detalleSolicitudWeb}
              cerrar={() => setDetalleSolicitudWeb(null)}
              abrirCliente={abrirCliente}
            />
          )}
        </section>
      )}

      {tab === "clientes" && (
        <section style={card}>
          <div style={filtrosGrid}>
            <input style={input} name="buscar" value={filtros.buscar} onChange={actualizarFiltro} placeholder="Nombre, RUT o correo" />
            <select style={input} name="estado" value={filtros.estado} onChange={actualizarFiltro}>
              <option value="">Todos los estados</option>
              {ESTADOS.map((estado) => <option key={estado} value={estado}>{textoEstado(estado)}</option>)}
            </select>
            <input style={input} type="date" name="desde" value={filtros.desde} onChange={actualizarFiltro} />
            <input style={input} type="date" name="vence_hasta" value={filtros.vence_hasta} onChange={actualizarFiltro} />
            <select style={input} name="sort" value={filtros.sort} onChange={actualizarFiltro}>
              <option value="created_desc">Fecha de alta</option>
              <option value="nombre">Nombre</option>
              <option value="vencimiento">Vencimiento</option>
              <option value="estado">Estado</option>
              <option value="ultimo_acceso">Ultimo acceso</option>
            </select>
            <button type="button" style={botonPrimario} onClick={buscarClientes}>Buscar</button>
          </div>

          <TablaClientes clientes={clientes} abrirCliente={abrirCliente} />
        </section>
      )}

      {tab === "suscripciones" && (
        <section style={card}>
          <h2 style={tituloSeccion}>Suscripciones</h2>
          <p style={subtitulo}>
            Vista resumida de pruebas gratuitas y clientes pagados. Para acciones, abre la ficha del cliente.
          </p>
          <div style={filtrosGrid}>
            <input style={input} name="buscar" value={filtros.buscar} onChange={actualizarFiltro} placeholder="Cliente o correo" />
            <select style={input} name="estado" value={filtros.estado} onChange={actualizarFiltro}>
              <option value="">Todos los estados</option>
              {ESTADOS.map((estado) => <option key={estado} value={estado}>{textoEstado(estado)}</option>)}
            </select>
            <button type="button" style={botonPrimario} onClick={buscarClientes}>Buscar</button>
          </div>
          <TablaSuscripciones clientes={clientes} abrirCliente={abrirCliente} />
        </section>
      )}

      {tab === "empresas" && (
        <section style={card}>
          <h2 style={tituloSeccion}>Empresas</h2>
          <p style={subtitulo}>
            Las empresas son ilimitadas por cliente. Esta vista resume las empresas asociadas sin afectar el valor mensual.
          </p>
          <div style={filtrosGrid}>
            <input style={input} name="buscar" value={filtros.buscar} onChange={actualizarFiltro} placeholder="Cliente, correo, RUT o empresa" />
            <select style={input} name="estado" value={filtros.estado} onChange={actualizarFiltro}>
              <option value="">Todos los estados</option>
              {ESTADOS.map((estado) => <option key={estado} value={estado}>{textoEstado(estado)}</option>)}
            </select>
            <button type="button" style={botonPrimario} onClick={buscarClientes}>Buscar</button>
          </div>
          <TablaEmpresasAdministracion clientes={clientes} abrirCliente={abrirCliente} />
        </section>
      )}

      {tab === "cliente" && (
        clienteActivo ? (
          <FichaCliente
            data={clienteActivo}
            accion={accion}
            setAccion={setAccion}
            pago={pago}
            setPago={setPago}
            aplicarAccion={aplicarAccion}
            guardarPago={guardarPago}
          />
        ) : (
          <section style={card}>
            <p style={subtitulo}>Selecciona un cliente desde el listado para ver su ficha completa.</p>
          </section>
        )
      )}

      {tab === "pagos" && (
        <section style={card}>
          <h2 style={tituloSeccion}>Pagos recientes del cliente seleccionado</h2>
          {clienteActivo ? (
            <TablaSimple
              columnas={["Fecha", "Monto", "Periodo", "Medio", "Estado", "Transaccion"]}
              filas={(clienteActivo.pagos || []).map((item) => [
                formatoFecha(item.payment_date),
                formatoMoneda(item.amount),
                item.period_label || "-",
                item.payment_method || "-",
                item.status || "-",
                item.transaction_id || "-",
              ])}
            />
          ) : (
            <p style={subtitulo}>Selecciona un cliente para revisar o registrar pagos.</p>
          )}
        </section>
      )}

      {tab === "notificaciones" && (
        <section style={card}>
          <h2 style={tituloSeccion}>Notificaciones de suscripcion</h2>
          <TablaSimple
            columnas={["Evento", "Titulo", "Estado", "Programada", "Canal"]}
            filas={notificaciones.map((item) => [
              item.event_type,
              item.title,
              item.status,
              formatoFecha(item.scheduled_at),
              item.channel,
            ])}
          />
        </section>
      )}

      {tab === "auditoria" && (
        <section style={card}>
          <h2 style={tituloSeccion}>Auditoria administrativa</h2>
          <TablaSimple
            columnas={["Fecha", "Administrador", "Cliente", "Accion", "Observacion"]}
            filas={auditoria.map((item) => [
              formatoFecha(item.created_at),
              item.admin_email || "-",
              item.customer_user_id || "-",
              item.action,
              item.observation || "-",
            ])}
          />
        </section>
      )}

      {tab === "configuracion" && (
        <section style={card}>
          <h2 style={tituloSeccion}>Configuración Comercial</h2>
          <div style={gridFormulario}>
            {configuracion
              .filter((item) => CONFIG_COMERCIAL_KEYS.includes(item.key))
              .map((item) => (
              <div key={item.key}>
                <label style={label}>{etiquetaConfiguracion(item.key)}</label>
                <input
                  style={input}
                  value={item.value}
                  onChange={(e) =>
                    setConfiguracion((actual) =>
                      actual.map((fila) =>
                        fila.key === item.key ? { ...fila, value: e.target.value } : fila
                      )
                    )
                  }
                />
              </div>
            ))}
          </div>
          <button type="button" style={botonGuardar} onClick={guardarConfig}>Guardar configuracion</button>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={metricCard}>
      <span style={metricLabel}>{label}</span>
      <strong style={metricValue}>{value ?? 0}</strong>
    </div>
  );
}

function textoTipoSolicitud(tipo = "") {
  if (tipo === "PRUEBA_GRATIS") return "Prueba gratis";
  if (tipo === "SUSCRIPCION_MENSUAL") return "Suscripcion mensual";
  return tipo || "-";
}

function textoEstadoSolicitud(estado = "") {
  const labels = {
    prueba_activa: "Prueba activa",
    vence_semana: "Vence esta semana",
    vence_3_dias: "Vence en 3 dias",
    nunca_ingreso: "Nunca ha ingresado",
    prueba_vencida: "Prueba vencida",
    pendiente_pago: "Pendiente de pago",
    pago_fallido: "Pago fallido",
    convertido: "Convertido",
    suspendido: "Suspendido",
    archivado: "Archivado",
  };
  return labels[estado] || estado || "-";
}

function accionesSolicitud(solicitud) {
  if (solicitud.tipo === "PRUEBA_GRATIS") {
    return [
      ["DETALLE", "Ver detalle"],
      ["CLIENTE", "Ver cliente"],
      ["EXTENDER", "Extender prueba"],
      ["SUSPENDER", "Suspender acceso"],
      ["REACTIVAR", "Reactivar acceso"],
      ["CONVERTIR", "Convertir a suscripcion"],
      ["INSTRUCCIONES", "Enviar instrucciones"],
      ["RECUPERACION", "Enviar recuperacion"],
      ["BLOQUEAR", "Bloquear usuario"],
      ["ARCHIVAR", "Archivar"],
    ];
  }

  return [
    ["DETALLE", "Ver detalle"],
    ["ARCHIVAR", "Archivar"],
  ];
}

function TablaSolicitudesWeb({ solicitudes, abrirCliente, verDetalle, ejecutarAccion }) {
  return (
    <div style={tablaWrap}>
      <table style={tabla}>
        <thead>
          <tr>
            {["Fecha", "Tipo", "Correo", "Estado", "Suscripción", "Monto", "Seguimiento", "Días", "Acciones"].map((col) => (
              <th key={col} style={th}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {solicitudes.map((solicitud) => (
            <tr key={`${solicitud.tipo}-${solicitud.id}`}>
              <td style={td}>{formatoFecha(solicitud.creado_en)}</td>
              <td style={td}>{textoTipoSolicitud(solicitud.tipo)}</td>
              <td style={td}>{solicitud.correo || "-"}</td>
              <td style={td}>{textoEstadoSolicitud(solicitud.estado_comercial || solicitud.estado || solicitud.flow_status)}</td>
              <td style={td}>{solicitud.plan || solicitud.periodicidad || solicitud.plan_nombre || "-"}</td>
              <td style={td}>{solicitud.total ? formatoMoneda(solicitud.total) : "-"}</td>
              <td style={td}>{solicitud.seguimiento || "-"}</td>
              <td style={td}>{solicitud.dias_restantes ?? "-"}</td>
              <td style={td}>
                <select
                  style={inputTabla}
                  defaultValue=""
                  onChange={(e) => {
                    const accion = e.target.value;
                    e.target.value = "";
                    if (!accion) return;
                    if (accion === "DETALLE") return verDetalle(solicitud);
                    if (accion === "CLIENTE") {
                      if (solicitud.usuario_id || solicitud.demo_usuario_id) {
                        return abrirCliente({ id: solicitud.usuario_id || solicitud.demo_usuario_id });
                      }
                      return verDetalle(solicitud);
                    }
                    return ejecutarAccion(solicitud, accion);
                  }}
                >
                  <option value="">Acciones</option>
                  {accionesSolicitud(solicitud).map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
          {solicitudes.length === 0 && (
            <tr>
              <td style={td} colSpan={9}>No hay solicitudes web registradas.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DetalleSolicitudWeb({ data, cerrar, abrirCliente }) {
  const solicitud = data.solicitud || {};
  const usuarioId = data.usuario_id || solicitud.usuario_vinculado_id || solicitud.usuario_id;

  return (
    <div style={detalleBox}>
      <div style={detalleHeader}>
        <h2 style={tituloSeccion}>Detalle de solicitud web</h2>
        <button type="button" style={botonTabla} onClick={cerrar}>Cerrar</button>
      </div>

      <div style={gridDos}>
        <section style={subCard}>
          <h3 style={tituloSeccion}>Cliente</h3>
          <div style={datosGrid}>
            <Dato label="Nombre" value={solicitud.nombre} />
            <Dato label="Empresa" value={solicitud.empresa || solicitud.empresa_creada} />
            <Dato label="RUT" value={solicitud.rut} />
            <Dato label="Correo" value={solicitud.correo || solicitud.usuario_email} />
            <Dato label="Telefono" value={solicitud.telefono} />
            <Dato label="Fecha solicitud" value={formatoFecha(solicitud.creado_en)} />
          </div>
        </section>

        <section style={subCard}>
          <h3 style={tituloSeccion}>Trial</h3>
          <div style={datosGrid}>
            <Dato label="Inicio" value={formatoFecha(solicitud.trial_inicio || solicitud.trial_starts_at || solicitud.demo_inicio)} />
            <Dato label="Vencimiento" value={formatoFecha(solicitud.trial_vence || solicitud.trial_ends_at || solicitud.demo_vence || solicitud.expires_at)} />
            <Dato label="Dias restantes" value={solicitud.dias_restantes ?? "-"} />
            <Dato label="Estado" value={textoEstadoSolicitud(solicitud.estado_comercial)} />
          </div>
        </section>

        <section style={subCard}>
          <h3 style={tituloSeccion}>Usuario y empresa</h3>
          <div style={datosGrid}>
            <Dato label="Usuario" value={solicitud.usuario_nombre || solicitud.usuario_email} />
            <Dato label="Estado usuario" value={solicitud.usuario_activo === false ? "Bloqueado/Inactivo" : "Activo"} />
            <Dato label="Ultimo acceso" value={solicitud.ultimo_acceso_en ? formatoFecha(solicitud.ultimo_acceso_en) : "Nunca ha ingresado"} />
            <Dato label="Empresa creada" value={solicitud.empresa_creada || "-"} />
          </div>
          {usuarioId && (
            <button type="button" style={botonPrimario} onClick={() => abrirCliente({ id: usuarioId })}>
              Ver cliente
            </button>
          )}
        </section>

        <section style={subCard}>
          <h3 style={tituloSeccion}>Comercial</h3>
          <div style={datosGrid}>
            <Dato label="Servicio" value={solicitud.plan_nombre || solicitud.plan || solicitud.periodicidad} />
            <Dato label="Seguimiento" value={solicitud.seguimiento} />
            <Dato label="Monto" value={solicitud.total ? formatoMoneda(solicitud.total) : "-"} />
            <Dato label="Flow" value={solicitud.flow_status || solicitud.flow_order || "-"} />
          </div>
        </section>
      </div>

      <h3 style={tituloSeccion}>Historial comercial</h3>
      <TablaSimple
        columnas={["Fecha", "Accion", "Anterior", "Nuevo", "Observacion"]}
        filas={(data.historial || []).map((item) => [
          formatoFecha(item.created_at),
          item.action,
          item.previous_status || "-",
          item.new_status || "-",
          item.observation || "-",
        ])}
      />
    </div>
  );
}

function TablaClientes({ clientes, abrirCliente }) {
  return (
    <div style={tablaWrap}>
      <table style={tabla}>
        <thead>
          <tr>
            {["ID", "Cliente", "RUT", "Correo", "Estado", "Registro", "Vence", "Empresas", "Usuarios", "Tipo", "Ultimo acceso", "Accion"].map((col) => (
              <th key={col} style={th}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {clientes.map((cliente) => (
            <tr key={cliente.id}>
              <td style={td}>{cliente.id}</td>
              <td style={td}>{cliente.razon_social || cliente.cliente_nombre}</td>
              <td style={td}>{cliente.rut || "-"}</td>
              <td style={td}>{cliente.correo}</td>
              <td style={td}><span style={estadoStyle(cliente.estado_suscripcion_calculado)}>{textoEstado(cliente.estado_suscripcion_calculado)}</span></td>
              <td style={td}>{formatoFecha(cliente.fecha_registro)}</td>
              <td style={td}>{formatoFecha(cliente.proximo_vencimiento)}</td>
              <td style={td}>{cliente.empresas_utilizadas || 0} / Ilimitadas</td>
              <td style={td}>{cliente.usuarios_activos || 0}</td>
              <td style={td}>{Number(cliente.usuarios_adicionales || 0) > 0 ? "Con adicionales" : "Incluido"}</td>
              <td style={td}>{formatoFecha(cliente.ultimo_acceso)}</td>
              <td style={td}><button type="button" style={botonTabla} onClick={() => abrirCliente(cliente)}>Ver ficha</button></td>
            </tr>
          ))}
          {clientes.length === 0 && (
            <tr><td style={td} colSpan="12">No hay clientes para el filtro seleccionado.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TablaSuscripciones({ clientes, abrirCliente }) {
  return (
    <div style={tablaWrap}>
      <table style={tabla}>
        <thead>
          <tr>
            {["Cliente", "Estado", "Empresas", "Usuarios", "Adicionales", "Inicio", "Renovación", "Vencimiento", "Total mensual", "Pago", "Acción"].map((col) => (
              <th key={col} style={th}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {clientes.map((cliente) => (
            <tr key={cliente.id}>
              <td style={td}>{cliente.razon_social || cliente.cliente_nombre || cliente.correo}</td>
              <td style={td}>
                <span style={estadoStyle(cliente.estado_suscripcion_calculado)}>
                  {textoEstado(cliente.estado_suscripcion_calculado)}
                </span>
              </td>
              <td style={td}>{cliente.empresas_utilizadas || 0} / Ilimitadas</td>
              <td style={td}>{cliente.usuarios_activos || 0}</td>
              <td style={td}>{cliente.usuarios_adicionales || 0}</td>
              <td style={td}>{formatoFecha(cliente.fecha_inicio_suscripcion)}</td>
              <td style={td}>{formatoFecha(cliente.proxima_renovacion)}</td>
              <td style={td}>{formatoFecha(cliente.proximo_vencimiento)}</td>
              <td style={td}>{formatoMoneda(cliente.total_mensual || cliente.price)}</td>
              <td style={td}>{cliente.payment_status || "-"}</td>
              <td style={td}>
                <button type="button" style={botonTabla} onClick={() => abrirCliente(cliente)}>
                  Ver ficha
                </button>
              </td>
            </tr>
          ))}
          {clientes.length === 0 && (
            <tr><td style={td} colSpan="11">No hay suscripciones para el filtro seleccionado.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function FichaCliente({ data, accion, setAccion, pago, setPago, aplicarAccion, guardarPago }) {
  const cliente = data.cliente || {};
  const resumen = cliente.resumen_mensual || {};

  return (
    <div style={gridDos}>
      <section style={card}>
        <h2 style={tituloSeccion}>Ficha del cliente</h2>
        <div style={datosGrid}>
          <Dato label="Nombre" value={cliente.cliente_nombre} />
          <Dato label="Razon social" value={cliente.razon_social} />
          <Dato label="RUT" value={cliente.rut} />
          <Dato label="Correo" value={cliente.correo} />
          <Dato label="Telefono" value={cliente.telefono} />
          <Dato label="Direccion" value={cliente.direccion} />
          <Dato label="Registro" value={formatoFecha(cliente.fecha_registro)} />
          <Dato label="Ultimo acceso" value={formatoFecha(cliente.ultimo_acceso)} />
        </div>

        <h2 style={tituloSeccion}>Suscripcion</h2>
        <div style={datosGrid}>
          <Dato label="Servicio" value={cliente.plan_contratado || CONFIG_COMERCIAL.servicio} />
          <Dato label="Precio base mensual" value={formatoMoneda(cliente.precio_base_mensual || CONFIG_COMERCIAL.precioBaseMensual)} />
          <Dato label="Modalidad" value={cliente.billing_cycle === "annual" ? "Anual" : "Mensual"} />
          <Dato label="Inicio" value={formatoFecha(cliente.fecha_inicio_suscripcion)} />
          <Dato label="Renovacion" value={formatoFecha(cliente.proxima_renovacion)} />
          <Dato label="Vencimiento" value={formatoFecha(cliente.proximo_vencimiento)} />
          <Dato label="Estado" value={textoEstado(cliente.estado_suscripcion_calculado)} />
          <Dato label="Renovacion automatica" value={cliente.auto_renew ? "Si" : "No"} />
        </div>

        <h2 style={tituloSeccion}>Uso del sistema</h2>
        <div style={datosGrid}>
          <Dato label="Empresas" value={`${cliente.empresas_utilizadas || 0} / Ilimitadas`} />
          <Dato label="Usuarios activos" value={cliente.usuarios_activos || 0} />
          <Dato label="Usuario incluido" value={resumen.usuarios_incluidos || CONFIG_COMERCIAL.usuariosIncluidos} />
          <Dato label="Usuarios adicionales" value={resumen.usuarios_adicionales || 0} />
          <Dato label="Dias restantes" value={cliente.dias_restantes ?? "-"} />
          <Dato label="Gracia restante" value={cliente.gracia_restante ?? "-"} />
        </div>

        <h2 style={tituloSeccion}>Resumen mensual</h2>
        <div style={datosGrid}>
          <Dato label="Base mensual" value={formatoMoneda(resumen.precio_base_mensual || cliente.precio_base_mensual)} />
          <Dato label="Usuarios adicionales" value={formatoMoneda(resumen.usuarios_adicionales_total || 0)} />
          <Dato label="Subtotal" value={formatoMoneda(resumen.subtotal || cliente.subtotal_mensual)} />
          <Dato label="IVA" value={formatoMoneda(resumen.iva || cliente.iva_mensual)} />
          <Dato label="Total" value={formatoMoneda(resumen.total || cliente.total_mensual)} />
        </div>
      </section>

      <section style={card}>
        <h2 style={tituloSeccion}>Acciones manuales</h2>
        <div style={gridFormularioUna}>
          <select style={input} value={accion.accion} onChange={(e) => setAccion((actual) => ({ ...actual, accion: e.target.value }))}>
            <option value="ACTIVAR">Activar</option>
            <option value="SUSPENDER">Suspender</option>
            <option value="REACTIVAR">Reactivar</option>
            <option value="CANCELAR">Cancelar</option>
            <option value="EXTENDER">Extender vencimiento</option>
            <option value="RENOVAR">Renovar</option>
            <option value="NOTA_INTERNA">Agregar nota interna</option>
          </select>
          <input style={input} value={accion.dias} onChange={(e) => setAccion((actual) => ({ ...actual, dias: e.target.value }))} placeholder="Dias gratuitos o extension" />
          <input style={input} value={accion.meses} onChange={(e) => setAccion((actual) => ({ ...actual, meses: e.target.value }))} placeholder="Meses renovacion" />
          <textarea style={textarea} value={accion.observacion} onChange={(e) => setAccion((actual) => ({ ...actual, observacion: e.target.value }))} placeholder="Observacion interna" />
          <button type="button" style={botonGuardar} onClick={aplicarAccion}>Aplicar accion</button>
        </div>

        <h2 style={tituloSeccion}>Registrar pago manual</h2>
        <p style={subtitulo}>
          Si dejas el monto vacío, se registrará el total mensual calculado: {formatoMoneda(resumen.total || cliente.total_mensual)}.
        </p>
        <div style={gridFormularioUna}>
          <input style={input} type="date" value={pago.payment_date} onChange={(e) => setPago((actual) => ({ ...actual, payment_date: e.target.value }))} />
          <input style={input} value={pago.amount} onChange={(e) => setPago((actual) => ({ ...actual, amount: e.target.value }))} placeholder="Monto opcional" />
          <input style={input} value={pago.period_label} onChange={(e) => setPago((actual) => ({ ...actual, period_label: e.target.value }))} placeholder="Periodo" />
          <input style={input} value={pago.payment_method} onChange={(e) => setPago((actual) => ({ ...actual, payment_method: e.target.value }))} placeholder="Medio de pago" />
          <select style={input} value={pago.status} onChange={(e) => setPago((actual) => ({ ...actual, status: e.target.value }))}>
            {ESTADOS_PAGO.map((estado) => <option key={estado} value={estado}>{estado}</option>)}
          </select>
          <input style={input} value={pago.transaction_id} onChange={(e) => setPago((actual) => ({ ...actual, transaction_id: e.target.value }))} placeholder="Transaccion" />
          <input style={input} value={pago.tax_document} onChange={(e) => setPago((actual) => ({ ...actual, tax_document: e.target.value }))} placeholder="Documento tributario" />
          <textarea style={textarea} value={pago.notes} onChange={(e) => setPago((actual) => ({ ...actual, notes: e.target.value }))} placeholder="Notas" />
          <button type="button" style={botonGuardar} onClick={guardarPago}>Registrar pago</button>
        </div>
      </section>

      <section style={card}>
        <h2 style={tituloSeccion}>Historial de pagos</h2>
        <TablaSimple columnas={["Fecha", "Monto", "Periodo", "Medio", "Estado"]} filas={(data.pagos || []).map((item) => [formatoFecha(item.payment_date), formatoMoneda(item.amount), item.period_label || "-", item.payment_method || "-", item.status || "-"])} />
      </section>

      <section style={card}>
        <h2 style={tituloSeccion}>Historial de suscripcion</h2>
        <TablaSimple columnas={["Fecha", "Accion", "Anterior", "Nuevo", "Observacion"]} filas={(data.historial || []).map((item) => [formatoFecha(item.created_at), item.action, item.previous_status || "-", item.new_status || "-", item.observation || "-"])} />
      </section>
    </div>
  );
}

function Dato({ label, value }) {
  return (
    <div style={datoBox}>
      <span style={datoLabel}>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function TablaEmpresasAdministracion({ clientes, abrirCliente }) {
  return (
    <div style={tablaWrap}>
      <table style={tabla}>
        <thead>
          <tr>
            {["Cliente", "Correo", "Empresa principal", "RUT", "Empresas registradas", "Condición", "Estado", "Acción"].map((col) => <th key={col} style={th}>{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {clientes.map((cliente) => (
            <tr key={cliente.id}>
              <td style={td}>{cliente.razon_social || cliente.cliente_nombre || "-"}</td>
              <td style={td}>{cliente.correo || "-"}</td>
              <td style={td}>{cliente.razon_social || "Sin empresa configurada"}</td>
              <td style={td}>{cliente.rut || "-"}</td>
              <td style={td}>{cliente.empresas_utilizadas || 0}</td>
              <td style={td}>Empresas ilimitadas</td>
              <td style={td}><span style={estadoStyle(cliente.estado_suscripcion_calculado)}>{textoEstado(cliente.estado_suscripcion_calculado)}</span></td>
              <td style={td}><button type="button" style={botonTabla} onClick={() => abrirCliente(cliente)}>Ver ficha</button></td>
            </tr>
          ))}
          {clientes.length === 0 && (
            <tr><td style={td} colSpan="8">No hay empresas para el filtro seleccionado.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TablaSimple({ columnas, filas }) {
  return (
    <div style={tablaWrap}>
      <table style={tabla}>
        <thead>
          <tr>{columnas.map((col) => <th key={col} style={th}>{col}</th>)}</tr>
        </thead>
        <tbody>
          {filas.map((fila, index) => (
            <tr key={`${index}-${fila.join("-")}`}>
              {fila.map((valor, i) => <td key={`${index}-${i}`} style={td}>{valor}</td>)}
            </tr>
          ))}
          {filas.length === 0 && (
            <tr><td style={td} colSpan={columnas.length}>Sin registros.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const titulo = { fontSize: "34px", color: "#0f172a", marginBottom: "5px" };
const subtitulo = { color: "#475569", marginBottom: "18px" };
const ok = { color: "#10b981", fontWeight: "bold" };
const errorTexto = { color: "#ef4444", fontWeight: "bold" };
const tabs = { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" };
const tabButton = (activo) => ({
  background: activo ? "linear-gradient(135deg, #0369a1, #06b6d4)" : "white",
  color: activo ? "white" : "#0369a1",
  border: "1px solid #38bdf8",
  borderRadius: "999px",
  padding: "9px 13px",
  fontWeight: "bold",
  cursor: "pointer",
});
const card = {
  background: "white",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  minWidth: 0,
};
const metricGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "14px",
  marginBottom: "18px",
};
const metricCard = { ...card, padding: "18px" };
const metricLabel = { color: "#475569", display: "block", marginBottom: "8px", fontWeight: "bold" };
const metricValue = { color: "#0369a1", fontSize: "27px" };
const gridDos = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  gap: "18px",
  alignItems: "start",
};
const tituloSeccion = { color: "#0369a1", marginTop: 0 };
const filaResumen = {
  display: "flex",
  justifyContent: "space-between",
  borderBottom: "1px solid #e2e8f0",
  padding: "10px 0",
  color: "#1e293b",
};
const filaClienteBoton = {
  ...filaResumen,
  width: "100%",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid #e2e8f0",
  cursor: "pointer",
  textAlign: "left",
};
const filtrosGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "10px",
  marginBottom: "16px",
};
const input = {
  width: "100%",
  padding: "11px",
  borderRadius: "10px",
  border: "1px solid #a9d8ef",
  boxSizing: "border-box",
};
const inputTabla = {
  ...input,
  minWidth: "145px",
  padding: "8px",
};
const textarea = { ...input, minHeight: "82px", resize: "vertical" };
const botonPrimario = {
  background: "#0369a1",
  color: "white",
  border: "none",
  borderRadius: "10px",
  padding: "11px 16px",
  fontWeight: "bold",
  cursor: "pointer",
};
const botonGuardar = {
  ...botonPrimario,
  background: "#10b981",
  marginTop: "6px",
};
const tablaWrap = { overflowX: "auto", marginTop: "14px" };
const tabla = { width: "100%", borderCollapse: "collapse" };
const th = {
  textAlign: "left",
  padding: "11px",
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  color: "#0369a1",
  whiteSpace: "nowrap",
};
const td = {
  padding: "11px",
  borderBottom: "1px solid #e2e8f0",
  color: "#1e293b",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};
const botonTabla = {
  background: "#0ea5e9",
  color: "white",
  border: "none",
  borderRadius: "9px",
  padding: "8px 10px",
  fontWeight: "bold",
  cursor: "pointer",
};
const gridFormulario = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
  marginBottom: "18px",
};
const gridFormularioUna = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: "10px",
  marginBottom: "20px",
};
const label = { display: "block", fontWeight: "bold", color: "#1e293b", marginBottom: "6px" };
const datosGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "10px",
  marginBottom: "18px",
};
const datoBox = { background: "#f8fafc", border: "1px solid #dbeafe", borderRadius: "12px", padding: "10px" };
const datoLabel = { color: "#64748b", display: "block", fontSize: "12px", marginBottom: "4px", fontWeight: "bold" };
const alertasBox = {
  ...card,
  boxShadow: "none",
  border: "1px solid #bae6fd",
  background: "#f0f9ff",
  marginBottom: "18px",
};
const detalleBox = {
  ...card,
  border: "1px solid #bae6fd",
  boxShadow: "none",
  marginTop: "18px",
};
const detalleHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "center",
};
const subCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "16px",
};
