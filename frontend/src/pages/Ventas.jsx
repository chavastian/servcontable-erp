import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { listarCuentas } from "../services/cuentaService";
import AccountSelector from "../components/AccountSelector";
import { EstadoCargando } from "../components/EstadoPantalla";
import {
  crearVenta,
  actualizarVenta,
  anularVenta,
  listarVentas,
  importarVentasSII,
} from "../services/ventaService";
import {
  obtenerFechaTrabajoHoyISO,
  obtenerRangoAnualTrabajo,
} from "../services/periodoTrabajoService";
function normalizarTipoCuenta(tipo = "") {
  return String(tipo)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}



export default function Ventas() {
  const empresaActiva = obtenerEmpresaActiva();
  const rangoInicial = {
  ...obtenerRangoAnualTrabajo(),
  fechaFormulario: obtenerFechaTrabajoHoyISO(),
};

  const [fechaDesde, setFechaDesde] = useState(rangoInicial.fechaDesde);
  const [fechaHasta, setFechaHasta] = useState(rangoInicial.fechaHasta);
  const [ventas, setVentas] = useState([]);
  const [cuentasIngreso, setCuentasIngreso] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  // Distingue "esperando" de "no hay datos": sin esto la tabla en blanco
  // significa las dos cosas a la vez.
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);

  const [totales, setTotales] = useState({
    neto: 0,
    exento: 0,
    iva: 0,
    total: 0,
  });

  const [formulario, setFormulario] = useState({
    fecha: rangoInicial.fechaFormulario,
    tipo_documento: "Factura afecta",
    folio: "",
    rut_cliente: "",
    razon_social_cliente: "",
    neto: "",
    exento: "",
    iva: "",
    total: "",
    cuenta_ingreso_id: "",
    fecha_vencimiento: "",
  });

  const [archivoSII, setArchivoSII] = useState(null);
  const [resultadoImportacion, setResultadoImportacion] = useState(null);
  const [generarComprobanteImportacion, setGenerarComprobanteImportacion] =
    useState(true);

  useEffect(() => {
    if (empresaActiva) {
      cargarDatos();
    }
  }, []);

  async function cargarDatos() {
    try {
      setCargando(true);
      setError("");

      const cuentasData = await listarCuentas(empresaActiva.id);
      const ventasData = await listarVentas(empresaActiva.id, fechaDesde, fechaHasta);

      setCuentasIngreso(
        cuentasData.cuentas.filter((cuenta) => {
          const tipo = normalizarTipoCuenta(cuenta.tipo);
          return tipo === "ingreso" || tipo === "ganancia";
        })
      );

      setVentas(ventasData.ventas);
      setTotales(ventasData.totales);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  function calcularDesdeNeto(netoValor, exentoValor = formulario.exento) {
    const neto = Number(netoValor || 0);
    const exento = Number(exentoValor || 0);
    const iva = Math.round(neto * 0.19);
    const total = neto + exento + iva;

    return {
      iva,
      total,
    };
  }

  function manejarCambio(e) {
    const { name, value } = e.target;

    if (name === "neto") {
      const calculo = calcularDesdeNeto(value);

      setFormulario({
        ...formulario,
        neto: value,
        iva: calculo.iva,
        total: calculo.total,
      });

      return;
    }

    if (name === "exento") {
      const calculo = calcularDesdeNeto(formulario.neto, value);

      setFormulario({
        ...formulario,
        exento: value,
        iva: calculo.iva,
        total: calculo.total,
      });

      return;
    }

    setFormulario({
      ...formulario,
      [name]: value,
    });
  }

  function formularioVentaHabilitado() {
    const neto = Number(formulario.neto || 0);
    const exento = Number(formulario.exento || 0);
    const iva = Number(formulario.iva || 0);
    const total = Number(formulario.total || 0);

    const tieneMonto = neto > 0 || exento > 0 || iva > 0 || total > 0;
    const camposObligatorios =
      String(formulario.fecha || "").trim() !== "" &&
      String(formulario.tipo_documento || "").trim() !== "" &&
      String(formulario.folio || "").trim() !== "" &&
      String(formulario.rut_cliente || "").trim() !== "" &&
      String(formulario.razon_social_cliente || "").trim() !== "";

    return tieneMonto && camposObligatorios;
  }

  const puedeGuardarVenta = formularioVentaHabilitado();

  function limpiarFormulario() {
    setEditandoId(null);
    setFormulario({
      fecha: rangoInicial.fechaFormulario,
      tipo_documento: "Factura afecta",
      folio: "",
      rut_cliente: "",
      razon_social_cliente: "",
      neto: "",
      exento: "",
      iva: "",
      total: "",
      cuenta_ingreso_id: "",
      fecha_vencimiento: "",
    });
  }

  function editarVenta(venta) {
    setEditandoId(venta.id);
    setMensaje("");
    setError("");
    setFormulario({
      fecha: String(venta.fecha || "").slice(0, 10),
      tipo_documento: venta.tipo_documento || "Factura afecta",
      folio: venta.folio || "",
      rut_cliente: venta.rut_cliente || "",
      razon_social_cliente: venta.razon_social_cliente || "",
      neto: venta.neto ?? "",
      exento: venta.exento ?? "",
      iva: venta.iva ?? "",
      total: venta.total ?? "",
      cuenta_ingreso_id: venta.cuenta_ingreso_id || "",
      fecha_vencimiento: String(venta.fecha_vencimiento || "").slice(0, 10),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function anularVentaFila(venta) {
    const motivo = window.prompt(
      `Anular la ${venta.tipo_documento} folio ${venta.folio}. Indica el motivo:`
    );

    if (motivo === null) return;

    if (String(motivo).trim().length < 3) {
      setError("El motivo de la anulación es obligatorio.");
      return;
    }

    try {
      setMensaje("");
      setError("");
      const data = await anularVenta(venta.id, empresaActiva.id, motivo.trim());
      setMensaje(data.mensaje);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function guardarVenta(e) {
    e.preventDefault();

    if (guardando) return;

    if (!empresaActiva) {
      setError("Debes seleccionar una empresa activa.");
      return;
    }

    if (!puedeGuardarVenta) {
      setError("Completa los datos obligatorios y agrega montos para guardar la venta.");
      return;
    }

    try {
      setGuardando(true);
      setMensaje("");
      setError("");

      const cuerpo = {
        empresa_id: empresaActiva.id,
        ...formulario,
        generar_comprobante: true,
        neto: Number(formulario.neto || 0),
        exento: Number(formulario.exento || 0),
        iva: Number(formulario.iva || 0),
        total: Number(formulario.total || 0),
        cuenta_ingreso_id: formulario.cuenta_ingreso_id
          ? Number(formulario.cuenta_ingreso_id)
          : null,
        fecha_vencimiento: formulario.fecha_vencimiento || null,
      };

      const data = editandoId
        ? await actualizarVenta(editandoId, cuerpo)
        : await crearVenta(cuerpo);

      setMensaje(data.mensaje);

      limpiarFormulario();

      await cargarDatos();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
      setCargando(false);
    }
  }

  async function buscarVentas() {
    await cargarDatos();
  }

  async function importarArchivoVentasSII(e) {
    e.preventDefault();

    if (!archivoSII) {
      setError("Debes seleccionar un archivo CSV de ventas del SII.");
      return;
    }

    try {
      setMensaje("");
      setError("");
      setResultadoImportacion(null);

      const data = await importarVentasSII(
        empresaActiva.id,
        archivoSII,
        generarComprobanteImportacion
      );

      setResultadoImportacion(data);
      setMensaje(data.mensaje);

      await cargarDatos();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  if (!empresaActiva) {
    return (
      <div>
        <h1 style={titulo}>Ventas</h1>
        <div style={alerta}>
          Debes seleccionar una empresa activa antes de registrar ventas.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={titulo}>Ventas</h1>
      <p style={subtitulo}>
        Empresa activa: <strong>{empresaActiva.razon_social}</strong>
      </p>

      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      {cargando && <EstadoCargando mensaje="Cargando datos..." />}

      <div style={resumenBox}>
        <div style={cardResumen}>
          <strong>Neto</strong>
          <span>{formato(totales.neto)}</span>
        </div>

        <div style={cardResumen}>
          <strong>Exento</strong>
          <span>{formato(totales.exento)}</span>
        </div>

        <div style={cardResumen}>
          <strong>IVA Débito</strong>
          <span>{formato(totales.iva)}</span>
        </div>

        <div style={cardResumenOk}>
          <strong>Total ventas</strong>
          <span>{formato(totales.total)}</span>
        </div>
      </div>

      <form style={importBox} onSubmit={importarArchivoVentasSII}>
        <h2 style={tituloSeccion}>Importar ventas desde CSV SII</h2>

        <div style={importGrid}>
          <div>
            <label style={label}>Fecha desde</label>
            <input
              style={input}
              type="date"
              min={rangoInicial.fechaDesde}
              max={rangoInicial.fechaHasta}
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </div>

          <div>
            <label style={label}>Archivo CSV ventas SII</label>
            <input
              style={input}
              type="file"
              accept=".csv"
              onChange={(e) => setArchivoSII(e.target.files[0])}
            />
          </div>

          <div>
            <label style={label}>Comprobante automático</label>
            <select
              style={input}
              value={generarComprobanteImportacion ? "si" : "no"}
              onChange={(e) =>
                setGenerarComprobanteImportacion(e.target.value === "si")
              }
            >
              <option value="si">Sí, generar comprobantes</option>
              <option value="no">No, solo importar ventas</option>
            </select>
          </div>

          <button style={botonImportar} type="submit">
            Importar CSV SII
          </button>
        </div>

        {resultadoImportacion && (
          <div style={resultadoBox}>
            <strong>{resultadoImportacion.mensaje}</strong>
            <p>Total filas: {resultadoImportacion.total_filas}</p>
            <p>Insertadas: {resultadoImportacion.insertadas}</p>
            <p>Omitidas: {resultadoImportacion.omitidas}</p>
            <p>
              Comprobantes creados:{" "}
              {resultadoImportacion.comprobantes_creados}
            </p>

            {resultadoImportacion.errores?.length > 0 && (
              <details>
                <summary>Ver errores</summary>
                <ul>
                  {resultadoImportacion.errores.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </form>

      <div style={layout}>
        <form style={formularioBox} onSubmit={guardarVenta}>
          <h2 style={tituloSeccion}>Registrar venta</h2>

          <label style={label}>Fecha</label>
          <input
            style={input}
            type="date"
            min={rangoInicial.fechaDesde}
            max={rangoInicial.fechaHasta}
            name="fecha"
            value={formulario.fecha}
            onChange={manejarCambio}
          />

          <label style={label}>Fecha de vencimiento (opcional)</label>
          <input
            style={input}
            type="date"
            name="fecha_vencimiento"
            value={formulario.fecha_vencimiento || ""}
            onChange={manejarCambio}
          />

          <label style={label}>Tipo documento</label>
          <select
            style={input}
            name="tipo_documento"
            value={formulario.tipo_documento}
            onChange={manejarCambio}
          >
            <option>Factura afecta</option>
            <option>Factura exenta</option>
            <option>Boleta</option>
            <option>Nota de crédito</option>
            <option>Nota de débito</option>
          </select>

          <label style={label}>Folio</label>
          <input
            style={input}
            name="folio"
            value={formulario.folio}
            onChange={manejarCambio}
            placeholder="123"
          />

          <label style={label}>RUT cliente</label>
          <input
            style={input}
            name="rut_cliente"
            value={formulario.rut_cliente}
            onChange={manejarCambio}
            placeholder="76.000.000-0"
          />

          <label style={label}>Razón social cliente</label>
          <input
            style={input}
            name="razon_social_cliente"
            value={formulario.razon_social_cliente}
            onChange={manejarCambio}
            placeholder="Cliente SpA"
          />

          <label style={label}>Cuenta de ingreso</label>
          <AccountSelector
            cuentas={cuentasIngreso}
            style={input}
            name="cuenta_ingreso_id"
            value={formulario.cuenta_ingreso_id}
            onChange={manejarCambio}
            placeholder="Buscar por codigo o nombre de cuenta..."
          />

          <label style={label}>Neto afecto</label>
          <input
            style={input}
            type="number"
            name="neto"
            value={formulario.neto}
            onChange={manejarCambio}
            placeholder="100000"
          />

          <label style={label}>Exento</label>
          <input
            style={input}
            type="number"
            name="exento"
            value={formulario.exento}
            onChange={manejarCambio}
            placeholder="0"
          />

          <label style={label}>IVA</label>
          <input
            style={input}
            type="number"
            name="iva"
            value={formulario.iva}
            onChange={manejarCambio}
          />

          <label style={label}>Total</label>
          <input
            style={input}
            type="number"
            name="total"
            value={formulario.total}
            onChange={manejarCambio}
          />

          {editandoId && (
            <div className="sc-message" style={{ marginBottom: 8 }}>
              Editando la venta seleccionada. Al guardar se regenera su asiento.
              <button
                type="button"
                className="sc-btn sc-btn--ghost"
                style={{ marginLeft: 8 }}
                onClick={limpiarFormulario}
              >
                Cancelar edición
              </button>
            </div>
          )}
          <button
            style={puedeGuardarVenta ? botonGuardar : botonGuardarDeshabilitado}
            type="submit"
            disabled={guardando || !puedeGuardarVenta}
          >
            {guardando ? "Guardando..." : editandoId ? "Guardar cambios" : "Registrar venta"}
          </button>
        </form>

        <div style={tablaBox}>
          <div style={filtrosLinea}>
            <div>
              <label style={label}>Fecha desde</label>
              <input
                style={input}
                type="date"
                min={rangoInicial.fechaDesde}
                max={rangoInicial.fechaHasta}
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
              />
            </div>

            <div>
              <label style={label}>Fecha hasta</label>
              <input
                style={input}
                type="date"
                min={rangoInicial.fechaDesde}
                max={rangoInicial.fechaHasta}
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
              />
            </div>

            <button type="button" style={botonBuscar} onClick={buscarVentas}>
              Buscar
            </button>
          </div>

          <h2 style={tituloSeccion}>Ventas registradas</h2>

          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Fecha</th>
                <th style={th}>Documento</th>
                <th style={th}>Folio</th>
                <th style={th}>Cliente</th>
                <th style={th}>Neto</th>
                <th style={th}>IVA</th>
                <th style={th}>Total</th>
                <th style={th}>Comprobante</th>
                <th style={th} aria-label="Acciones" />
              </tr>
            </thead>

            <tbody>
              {ventas.map((venta) => (
                <tr key={venta.id}>
                  <td style={td}>{venta.fecha?.substring(0, 10)}</td>
                  <td style={td}>{venta.tipo_documento}</td>
                  <td style={td}>{venta.folio}</td>
                  <td style={td}>{venta.razon_social_cliente}</td>
                  <td style={tdNumero}>{formato(venta.neto)}</td>
                  <td style={tdNumero}>{formato(venta.iva)}</td>
                  <td style={tdNumero}>{formato(venta.total)}</td>
                  <td style={td}>
                    {venta.comprobante_id
                      ? `✅ Comp. #${venta.comprobante_numero || venta.comprobante_id}`
                      : "❌ Sin comprobante"}
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="sc-btn sc-btn--ghost"
                        onClick={() => editarVenta(venta)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="sc-btn sc-btn--danger"
                        onClick={() => anularVentaFila(venta)}
                      >
                        Anular
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {ventas.length === 0 && (
                <tr>
                  <td style={td} colSpan="9">
                    No hay ventas registradas.
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
  marginBottom: "18px",
};

const resumenBox = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "15px",
  marginBottom: "20px",
};

const cardResumen = {
  background: "white",
  borderRadius: "16px",
  padding: "18px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  color: "var(--sc-text)",
};

const cardResumenOk = {
  ...cardResumen,
  border: "2px solid #22c55e",
};

const layout = {
  display: "grid",
  gridTemplateColumns: "360px 1fr",
  gap: "25px",
  alignItems: "start",
};

const formularioBox = {
  background: "white",
  borderRadius: "18px",
  padding: "25px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
};

const tablaBox = {
  background: "white",
  borderRadius: "18px",
  padding: "25px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  overflowX: "auto",
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

const botonGuardar = {
  width: "100%",
  marginTop: "18px",
  background: "var(--sc-teal)",
  color: "white",
  border: "none",
  padding: "13px",
  borderRadius: "12px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonGuardarDeshabilitado = {
  ...botonGuardar,
  background: "#94a3b8",
  cursor: "not-allowed",
  opacity: 0.75,
};

const botonBuscar = {
  background: "var(--sc-azul)",
  color: "white",
  border: "none",
  padding: "12px 20px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "44px",
  marginTop: "36px",
};

const filtrosLinea = {
  display: "flex",
  gap: "15px",
  alignItems: "end",
  marginBottom: "20px",
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
  padding: "10px",
  borderBottom: "1px solid var(--sc-borde-claro)",
  color: "var(--sc-text)",
};

const tdNumero = {
  ...td,
  textAlign: "right",
};

const importBox = {
  background: "white",
  borderRadius: "16px",
  padding: "18px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.07)",
  marginBottom: "18px",
};

const importGrid = {
  display: "grid",
  gridTemplateColumns: "160px 1fr 220px 160px",
  gap: "12px",
  alignItems: "end",
};

const botonImportar = {
  background: "#0ea5e9",
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const resultadoBox = {
  marginTop: "14px",
  background: "var(--sc-fondo-claro)",
  border: "1px solid var(--sc-borde-claro)",
  borderRadius: "12px",
  padding: "12px",
  color: "var(--sc-text)",
};

const ok = {
  color: "var(--sc-teal)",
  fontWeight: "bold",
};

const err = {
  color: "var(--sc-danger)",
  fontWeight: "bold",
};

const alerta = {
  marginTop: "20px",
  background: "var(--sc-naranja-fondo)",
  border: "1px solid #fed7aa",
  color: "var(--sc-naranja-texto)",
  padding: "16px",
  borderRadius: "14px",
  fontWeight: "bold",
};
