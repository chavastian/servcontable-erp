import { useEffect, useMemo, useState } from "react";
import {
  ejecutarAccionSuscripcion,
  guardarConfiguracionSuscripciones,
  guardarPlanSuscripcion,
  listarAuditoriaSuscripciones,
  listarClientesSuscripciones,
  listarNotificacionesSuscripciones,
  listarPlanesSuscripcion,
  listarSolicitudesWebSuscripciones,
  obtenerClienteSuscripcion,
  obtenerConfiguracionSuscripciones,
  obtenerDashboardSuscripciones,
  registrarPagoSuscripcion,
} from "../services/adminSuscripcionesService";
import { obtenerUsuarioActual } from "../services/authService";

const ROLES_SUPER_ADMIN = ["superadmin", "super_admin", "admin", "administrador_sistema"];
const ESTADOS = ["TRIAL", "ACTIVE", "PAST_DUE", "EXPIRED", "SUSPENDED", "CANCELLED"];
const ESTADOS_PAGO = ["PAID", "PENDING", "FAILED", "REFUNDED", "VOID"];

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

function leerListaFeatures(plan) {
  if (Array.isArray(plan?.features)) return plan.features.join("\n");
  return "";
}

const planInicial = {
  code: "",
  name: "",
  description: "",
  monthly_price: 0,
  annual_price: 0,
  max_companies: "",
  max_users: "",
  features: "",
  active: true,
  trial_days: 14,
  sort_order: 0,
};

export default function AdminSuscripciones({ vistaInicial = "dashboard" }) {
  const usuario = obtenerUsuarioActual();
  const [tab, setTab] = useState(vistaInicial);
  const [dashboard, setDashboard] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [clienteActivo, setClienteActivo] = useState(null);
  const [planes, setPlanes] = useState([]);
  const [auditoria, setAuditoria] = useState([]);
  const [notificaciones, setNotificaciones] = useState([]);
  const [solicitudesWeb, setSolicitudesWeb] = useState([]);
  const [configuracion, setConfiguracion] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [planEditando, setPlanEditando] = useState(planInicial);
  const [filtros, setFiltros] = useState({
    buscar: "",
    estado: "",
    plan: "",
    desde: "",
    vence_hasta: "",
    sort: "created_desc",
  });
  const [accion, setAccion] = useState({
    accion: "EXTENDER",
    dias: 30,
    meses: 1,
    billing_cycle: "monthly",
    plan_id: "",
    observacion: "",
    max_companies_override: "",
    max_users_override: "",
  });
  const [pago, setPago] = useState({
    payment_date: new Date().toISOString().slice(0, 10),
    amount: 0,
    period_label: "",
    payment_method: "manual",
    status: "PAID",
    transaction_id: "",
    tax_document: "",
    notes: "",
  });

  const metricas = dashboard?.metricas || {};
  const planOpciones = useMemo(
    () => planes.map((plan) => ({ id: plan.id, label: plan.name || plan.code })),
    [planes]
  );

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
        dataPlanes,
        dataConfig,
        dataAuditoria,
        dataNotificaciones,
        dataSolicitudesWeb,
      ] =
        await Promise.all([
          obtenerDashboardSuscripciones(),
          listarClientesSuscripciones(filtros),
          listarPlanesSuscripcion(),
          obtenerConfiguracionSuscripciones(),
          listarAuditoriaSuscripciones(),
          listarNotificacionesSuscripciones(),
          listarSolicitudesWebSuscripciones(),
        ]);

      setDashboard(dataDashboard);
      setClientes(dataClientes.clientes || []);
      setPlanes(dataPlanes.planes || []);
      setConfiguracion(dataConfig.configuracion || []);
      setAuditoria(dataAuditoria.auditoria || []);
      setNotificaciones(dataNotificaciones.notificaciones || []);
      setSolicitudesWeb(dataSolicitudesWeb.solicitudes || []);
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

  async function abrirCliente(cliente) {
    try {
      setError("");
      setMensaje("");
      const data = await obtenerClienteSuscripcion(cliente.id);
      setClienteActivo(data);
      setTab("cliente");
      setAccion((actual) => ({
        ...actual,
        plan_id: data.cliente?.plan_id || planes[0]?.id || "",
      }));
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

  async function guardarPlan(e) {
    e.preventDefault();
    const confirma = window.confirm("Confirma guardar este plan de suscripcion?");
    if (!confirma) return;

    try {
      setError("");
      setMensaje("");
      await guardarPlanSuscripcion({
        ...planEditando,
        features: String(planEditando.features || "")
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setPlanEditando(planInicial);
      setMensaje("Plan guardado correctamente.");
      const data = await listarPlanesSuscripcion();
      setPlanes(data.planes || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function guardarConfig() {
    const confirma = window.confirm("Confirma guardar la configuracion general?");
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

  function actualizarPlan(e) {
    const { name, value, type, checked } = e.target;
    setPlanEditando((actual) => ({
      ...actual,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function editarPlan(plan) {
    setPlanEditando({
      ...plan,
      features: leerListaFeatures(plan),
      max_companies: plan.max_companies ?? "",
      max_users: plan.max_users ?? "",
    });
    setTab("planes");
  }

  if (!esSuperAdmin(usuario?.rol)) {
    return (
      <div>
        <h1 style={titulo}>Administracion de Suscripciones</h1>
        <p style={errorTexto}>Solo el administrador del sistema puede acceder a este modulo.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={titulo}>Administracion de Suscripciones</h1>
      <p style={subtitulo}>
        Seguimiento comercial, control de planes, vencimientos, pagos y auditoria de clientes.
      </p>

      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={errorTexto}>{error}</p>}

      <div style={tabs}>
        {[
          ["dashboard", "Dashboard"],
          ["solicitudes", "Solicitudes web"],
          ["clientes", "Clientes"],
          ["cliente", "Ficha"],
          ["planes", "Planes"],
          ["pagos", "Pagos"],
          ["notificaciones", "Notificaciones"],
          ["auditoria", "Auditoria"],
          ["configuracion", "Configuracion"],
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
            <Metric label="Total clientes" value={metricas.total_clientes} />
            <Metric label="Activas" value={metricas.activos} />
            <Metric label="En prueba" value={metricas.trial} />
            <Metric label="Proximas a vencer" value={metricas.proximas_vencer} />
            <Metric label="Vencidas" value={metricas.vencidas} />
            <Metric label="Suspendidas" value={metricas.suspendidas} />
            <Metric label="Canceladas" value={metricas.canceladas} />
            <Metric label="Nuevos del mes" value={metricas.nuevos_mes} />
            <Metric label="Ingresos mes" value={formatoMoneda(metricas.ingresos_mensuales)} />
            <Metric label="MRR estimado" value={formatoMoneda(metricas.mrr_estimado)} />
          </div>

          <div style={gridDos}>
            <section style={card}>
              <h2 style={tituloSeccion}>Distribucion por plan</h2>
              {(dashboard?.distribucion_planes || []).map((item) => (
                <div key={item.plan} style={filaResumen}>
                  <span>{item.plan}</span>
                  <strong>{item.total}</strong>
                </div>
              ))}
            </section>

            <section style={card}>
              <h2 style={tituloSeccion}>Proximas a vencer</h2>
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
            Aqui aparecen las personas que piden prueba gratis o suscripcion mensual desde la pagina publica.
          </p>
          <TablaSolicitudesWeb solicitudes={solicitudesWeb} />
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
            <select style={input} name="plan" value={filtros.plan} onChange={actualizarFiltro}>
              <option value="">Todos los planes</option>
              {planes.map((plan) => <option key={plan.id} value={plan.code}>{plan.name}</option>)}
            </select>
            <input style={input} type="date" name="desde" value={filtros.desde} onChange={actualizarFiltro} />
            <input style={input} type="date" name="vence_hasta" value={filtros.vence_hasta} onChange={actualizarFiltro} />
            <select style={input} name="sort" value={filtros.sort} onChange={actualizarFiltro}>
              <option value="created_desc">Fecha de alta</option>
              <option value="nombre">Nombre</option>
              <option value="vencimiento">Vencimiento</option>
              <option value="plan">Plan</option>
              <option value="estado">Estado</option>
              <option value="ultimo_acceso">Ultimo acceso</option>
            </select>
            <button type="button" style={botonPrimario} onClick={buscarClientes}>Buscar</button>
          </div>

          <TablaClientes clientes={clientes} abrirCliente={abrirCliente} />
        </section>
      )}

      {tab === "cliente" && (
        clienteActivo ? (
          <FichaCliente
            data={clienteActivo}
            planes={planOpciones}
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

      {tab === "planes" && (
        <section style={card}>
          <h2 style={tituloSeccion}>Planes de suscripcion</h2>
          <form style={gridFormulario} onSubmit={guardarPlan}>
            <input style={input} name="code" value={planEditando.code} onChange={actualizarPlan} placeholder="codigo_plan" />
            <input style={input} name="name" value={planEditando.name} onChange={actualizarPlan} placeholder="Nombre del plan" />
            <input style={input} name="monthly_price" value={planEditando.monthly_price} onChange={actualizarPlan} placeholder="Precio mensual" />
            <input style={input} name="annual_price" value={planEditando.annual_price} onChange={actualizarPlan} placeholder="Precio anual" />
            <input style={input} name="max_companies" value={planEditando.max_companies} onChange={actualizarPlan} placeholder="Max empresas" />
            <input style={input} name="max_users" value={planEditando.max_users} onChange={actualizarPlan} placeholder="Max usuarios" />
            <input style={input} name="trial_days" value={planEditando.trial_days} onChange={actualizarPlan} placeholder="Dias prueba" />
            <input style={input} name="sort_order" value={planEditando.sort_order} onChange={actualizarPlan} placeholder="Orden" />
            <textarea style={textarea} name="description" value={planEditando.description || ""} onChange={actualizarPlan} placeholder="Descripcion" />
            <textarea style={textarea} name="features" value={planEditando.features || ""} onChange={actualizarPlan} placeholder="Caracteristicas, una por linea" />
            <label style={checkLabel}>
              <input type="checkbox" name="active" checked={Boolean(planEditando.active)} onChange={actualizarPlan} />
              Plan activo
            </label>
            <button type="submit" style={botonGuardar}>Guardar plan</button>
          </form>

          <TablaPlanes planes={planes} editarPlan={editarPlan} />
        </section>
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
          <h2 style={tituloSeccion}>Configuracion general</h2>
          <div style={gridFormulario}>
            {configuracion.map((item, index) => (
              <div key={item.key}>
                <label style={label}>{item.key}</label>
                <input
                  style={input}
                  value={item.value}
                  onChange={(e) =>
                    setConfiguracion((actual) =>
                      actual.map((fila, i) =>
                        i === index ? { ...fila, value: e.target.value } : fila
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

function TablaSolicitudesWeb({ solicitudes }) {
  return (
    <div style={tablaWrap}>
      <table style={tabla}>
        <thead>
          <tr>
            {["Fecha", "Tipo", "Nombre", "Empresa", "RUT", "Correo", "Telefono", "Plan", "Monto", "Estado"].map((col) => (
              <th key={col} style={th}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {solicitudes.map((solicitud) => (
            <tr key={`${solicitud.tipo}-${solicitud.id}`}>
              <td style={td}>{formatoFecha(solicitud.creado_en)}</td>
              <td style={td}>{textoTipoSolicitud(solicitud.tipo)}</td>
              <td style={td}>{solicitud.nombre || "-"}</td>
              <td style={td}>{solicitud.empresa || "-"}</td>
              <td style={td}>{solicitud.rut || "-"}</td>
              <td style={td}>{solicitud.correo || "-"}</td>
              <td style={td}>{solicitud.telefono || "-"}</td>
              <td style={td}>{solicitud.plan || solicitud.periodicidad || "-"}</td>
              <td style={td}>{solicitud.total ? formatoMoneda(solicitud.total) : "-"}</td>
              <td style={td}>{solicitud.estado || solicitud.flow_status || "-"}</td>
            </tr>
          ))}
          {solicitudes.length === 0 && (
            <tr>
              <td style={td} colSpan={10}>No hay solicitudes web registradas.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TablaClientes({ clientes, abrirCliente }) {
  return (
    <div style={tablaWrap}>
      <table style={tabla}>
        <thead>
          <tr>
            {["ID", "Cliente", "RUT", "Correo", "Plan", "Estado", "Registro", "Vence", "Empresas", "Usuarios", "Ultimo acceso", "Accion"].map((col) => (
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
              <td style={td}>{cliente.plan_contratado || "-"}</td>
              <td style={td}><span style={estadoStyle(cliente.estado_suscripcion_calculado)}>{textoEstado(cliente.estado_suscripcion_calculado)}</span></td>
              <td style={td}>{formatoFecha(cliente.fecha_registro)}</td>
              <td style={td}>{formatoFecha(cliente.proximo_vencimiento)}</td>
              <td style={td}>{cliente.empresas_utilizadas}/{cliente.empresas_permitidas ?? "Sin limite"}</td>
              <td style={td}>{cliente.usuarios_activos}/{cliente.usuarios_permitidos ?? "Sin limite"}</td>
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

function FichaCliente({ data, planes, accion, setAccion, pago, setPago, aplicarAccion, guardarPago }) {
  const cliente = data.cliente || {};

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
          <Dato label="Plan" value={cliente.plan_contratado} />
          <Dato label="Precio" value={formatoMoneda(cliente.price)} />
          <Dato label="Modalidad" value={cliente.billing_cycle === "annual" ? "Anual" : "Mensual"} />
          <Dato label="Inicio" value={formatoFecha(cliente.fecha_inicio_suscripcion)} />
          <Dato label="Renovacion" value={formatoFecha(cliente.proxima_renovacion)} />
          <Dato label="Vencimiento" value={formatoFecha(cliente.proximo_vencimiento)} />
          <Dato label="Estado" value={textoEstado(cliente.estado_suscripcion_calculado)} />
          <Dato label="Renovacion automatica" value={cliente.auto_renew ? "Si" : "No"} />
        </div>

        <h2 style={tituloSeccion}>Uso del sistema</h2>
        <div style={datosGrid}>
          <Dato label="Empresas" value={`${cliente.empresas_utilizadas}/${cliente.empresas_permitidas ?? "Sin limite"}`} />
          <Dato label="Usuarios" value={`${cliente.usuarios_activos}/${cliente.usuarios_permitidos ?? "Sin limite"}`} />
          <Dato label="Dias restantes" value={cliente.dias_restantes ?? "-"} />
          <Dato label="Gracia restante" value={cliente.gracia_restante ?? "-"} />
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
            <option value="CAMBIAR_PLAN">Cambiar plan</option>
            <option value="EXTENDER">Extender vencimiento</option>
            <option value="RENOVAR">Renovar</option>
            <option value="LIMITES">Modificar limites</option>
            <option value="NOTA_INTERNA">Agregar nota interna</option>
          </select>
          <select style={input} value={accion.plan_id} onChange={(e) => setAccion((actual) => ({ ...actual, plan_id: e.target.value }))}>
            <option value="">Seleccionar plan</option>
            {planes.map((plan) => <option key={plan.id} value={plan.id}>{plan.label}</option>)}
          </select>
          <input style={input} value={accion.dias} onChange={(e) => setAccion((actual) => ({ ...actual, dias: e.target.value }))} placeholder="Dias gratuitos o extension" />
          <input style={input} value={accion.meses} onChange={(e) => setAccion((actual) => ({ ...actual, meses: e.target.value }))} placeholder="Meses renovacion" />
          <input style={input} value={accion.max_companies_override} onChange={(e) => setAccion((actual) => ({ ...actual, max_companies_override: e.target.value }))} placeholder="Limite especial empresas" />
          <input style={input} value={accion.max_users_override} onChange={(e) => setAccion((actual) => ({ ...actual, max_users_override: e.target.value }))} placeholder="Limite especial usuarios" />
          <textarea style={textarea} value={accion.observacion} onChange={(e) => setAccion((actual) => ({ ...actual, observacion: e.target.value }))} placeholder="Observacion interna" />
          <button type="button" style={botonGuardar} onClick={aplicarAccion}>Aplicar accion</button>
        </div>

        <h2 style={tituloSeccion}>Registrar pago manual</h2>
        <div style={gridFormularioUna}>
          <input style={input} type="date" value={pago.payment_date} onChange={(e) => setPago((actual) => ({ ...actual, payment_date: e.target.value }))} />
          <input style={input} value={pago.amount} onChange={(e) => setPago((actual) => ({ ...actual, amount: e.target.value }))} placeholder="Monto" />
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

function TablaPlanes({ planes, editarPlan }) {
  return (
    <div style={tablaWrap}>
      <table style={tabla}>
        <thead>
          <tr>
            {["Codigo", "Nombre", "Mensual", "Anual", "Empresas", "Usuarios", "Estado", "Accion"].map((col) => <th key={col} style={th}>{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {planes.map((plan) => (
            <tr key={plan.id}>
              <td style={td}>{plan.code}</td>
              <td style={td}>{plan.name}</td>
              <td style={td}>{formatoMoneda(plan.monthly_price)}</td>
              <td style={td}>{formatoMoneda(plan.annual_price)}</td>
              <td style={td}>{plan.max_companies ?? "Sin limite"}</td>
              <td style={td}>{plan.max_users ?? "Sin limite"}</td>
              <td style={td}><span style={plan.active ? badgeActivo : badgeInactivo}>{plan.active ? "Activo" : "Inactivo"}</span></td>
              <td style={td}><button type="button" style={botonTabla} onClick={() => editarPlan(plan)}>Editar</button></td>
            </tr>
          ))}
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
const checkLabel = { display: "flex", gap: "8px", alignItems: "center", fontWeight: "bold", color: "#1e293b" };
const label = { display: "block", fontWeight: "bold", color: "#1e293b", marginBottom: "6px" };
const datosGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "10px",
  marginBottom: "18px",
};
const datoBox = { background: "#f8fafc", border: "1px solid #dbeafe", borderRadius: "12px", padding: "10px" };
const datoLabel = { color: "#64748b", display: "block", fontSize: "12px", marginBottom: "4px", fontWeight: "bold" };
const badgeActivo = { background: "#dcfce7", color: "#166534", borderRadius: "999px", padding: "5px 9px", fontWeight: "bold", fontSize: "12px" };
const badgeInactivo = { background: "#fee2e2", color: "#991b1b", borderRadius: "999px", padding: "5px 9px", fontWeight: "bold", fontSize: "12px" };
