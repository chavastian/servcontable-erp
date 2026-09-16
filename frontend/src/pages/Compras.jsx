import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { listarCuentas } from "../services/cuentaService";
import AccountSelector from "../components/AccountSelector";
import {
  crearCompra,
  listarCompras,
  importarComprasSII,
} from "../services/compraService";
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



export default function Compras() {
  const empresaActiva = obtenerEmpresaActiva();
  const rangoInicial = {
  ...obtenerRangoAnualTrabajo(),
  fechaFormulario: obtenerFechaTrabajoHoyISO(),
};

  const [fechaDesde, setFechaDesde] = useState(rangoInicial.fechaDesde);
  const [fechaHasta, setFechaHasta] = useState(rangoInicial.fechaHasta);
  const [compras, setCompras] = useState([]);
  const [cuentasGasto, setCuentasGasto] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const [totales, setTotales] = useState({
    neto: 0,
    exento: 0,
    iva_credito: 0,
    iva_no_recuperable: 0,
    otros_impuestos: 0,
    total: 0,
  });

  const [formulario, setFormulario] = useState({
    fecha: rangoInicial.fechaFormulario,
    tipo_documento: "Factura afecta",
    folio: "",
    rut_proveedor: "",
    razon_social_proveedor: "",
    neto: "",
    exento: "",
    iva_credito: "",
    iva_no_recuperable: "",
    total: "",
    cuenta_gasto_id: "",
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
      setError("");

      const cuentasData = await listarCuentas(empresaActiva.id);
      const comprasData = await listarCompras(empresaActiva.id, fechaDesde, fechaHasta);

      setCuentasGasto(
        cuentasData.cuentas.filter((cuenta) => {
          const tipo = normalizarTipoCuenta(cuenta.tipo);
          return (
            tipo === "gasto" ||
            tipo === "costo" ||
            tipo === "perdida" ||
            tipo === "activo"
          );
        })
      );

      setCompras(comprasData.compras);
      setTotales(comprasData.totales);
    } catch (err) {
      setError(err.message);
    }
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  function calcularDesdeNeto(
    netoValor,
    exentoValor = formulario.exento,
    ivaNoRecValor = formulario.iva_no_recuperable
  ) {
    const neto = Number(netoValor || 0);
    const exento = Number(exentoValor || 0);
    const ivaNoRec = Number(ivaNoRecValor || 0);
    const ivaCredito = Math.round(neto * 0.19);
    const total = neto + exento + ivaCredito + ivaNoRec;

    return {
      ivaCredito,
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
        iva_credito: calculo.ivaCredito,
        total: calculo.total,
      });

      return;
    }

    if (name === "exento") {
      const calculo = calcularDesdeNeto(formulario.neto, value);

      setFormulario({
        ...formulario,
        exento: value,
        iva_credito: calculo.ivaCredito,
        total: calculo.total,
      });

      return;
    }

    if (name === "iva_no_recuperable") {
      const calculo = calcularDesdeNeto(formulario.neto, formulario.exento, value);

      setFormulario({
        ...formulario,
        iva_no_recuperable: value,
        total: calculo.total,
      });

      return;
    }

    setFormulario({
      ...formulario,
      [name]: value,
    });
  }

  function formularioCompraHabilitado() {
    const neto = Number(formulario.neto || 0);
    const exento = Number(formulario.exento || 0);
    const ivaCredito = Number(formulario.iva_credito || 0);
    const ivaNoRecuperable = Number(formulario.iva_no_recuperable || 0);
    const total = Number(formulario.total || 0);

    const tieneMonto =
      neto > 0 || exento > 0 || ivaCredito > 0 || ivaNoRecuperable > 0 || total > 0;

    const camposObligatorios =
      String(formulario.fecha || "").trim() !== "" &&
      String(formulario.tipo_documento || "").trim() !== "" &&
      String(formulario.folio || "").trim() !== "" &&
      String(formulario.rut_proveedor || "").trim() !== "" &&
      String(formulario.razon_social_proveedor || "").trim() !== "";

    return tieneMonto && camposObligatorios;
  }

  const puedeGuardarCompra = formularioCompraHabilitado();

  async function guardarCompra(e) {
    e.preventDefault();

    if (!empresaActiva) {
      setError("Debes seleccionar una empresa activa.");
      return;
    }

    if (!puedeGuardarCompra) {
      setError("Completa los datos obligatorios y agrega montos para guardar la compra.");
      return;
    }

    try {
      setMensaje("");
      setError("");

      const data = await crearCompra({
        empresa_id: empresaActiva.id,
        ...formulario,
        generar_comprobante: true,
        neto: Number(formulario.neto || 0),
        exento: Number(formulario.exento || 0),
        iva_credito: Number(formulario.iva_credito || 0),
        iva_no_recuperable: Number(formulario.iva_no_recuperable || 0),
        total: Number(formulario.total || 0),
        cuenta_gasto_id: formulario.cuenta_gasto_id
          ? Number(formulario.cuenta_gasto_id)
          : null,
      });

      setMensaje(data.mensaje);

      setFormulario({
        fecha: rangoInicial.fechaFormulario,
        tipo_documento: "Factura afecta",
        folio: "",
        rut_proveedor: "",
        razon_social_proveedor: "",
        neto: "",
        exento: "",
        iva_credito: "",
        iva_no_recuperable: "",
        total: "",
        cuenta_gasto_id: "",
      });

      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function buscarCompras() {
    await cargarDatos();
  }

  async function importarArchivoComprasSII(e) {
    e.preventDefault();

    if (!archivoSII) {
      setError("Debes seleccionar un archivo CSV de compras del SII.");
      return;
    }

    try {
      setMensaje("");
      setError("");
      setResultadoImportacion(null);

      const data = await importarComprasSII(
        empresaActiva.id,
        archivoSII,
        generarComprobanteImportacion
      );

      setResultadoImportacion(data);
      setMensaje(data.mensaje);

      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!empresaActiva) {
    return (
      <div>
        <h1 style={titulo}>Compras</h1>
        <div style={alerta}>
          Debes seleccionar una empresa activa antes de registrar compras.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={titulo}>Compras</h1>
      <p style={subtitulo}>
        Empresa activa: <strong>{empresaActiva.razon_social}</strong>
      </p>

      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

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
          <strong>IVA Credito</strong>
          <span>{formato(totales.iva_credito)}</span>
        </div>

        <div style={cardResumen}>
          <strong>IVA No Recuperable</strong>
          <span>{formato(totales.iva_no_recuperable)}</span>
        </div>

        <div style={cardResumen}>
          <strong>Otros impuestos</strong>
          <span>{formato(totales.otros_impuestos)}</span>
        </div>

        <div style={cardResumenOk}>
          <strong>Total compras</strong>
          <span>{formato(totales.total)}</span>
        </div>
      </div>

      <form style={importBox} onSubmit={importarArchivoComprasSII}>
        <h2 style={tituloSeccion}>Importar compras desde CSV SII</h2>

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
            <label style={label}>Archivo CSV compras SII</label>
            <input
              style={input}
              type="file"
              accept=".csv"
              onChange={(e) => setArchivoSII(e.target.files[0])}
            />
          </div>

          <div>
            <label style={label}>Comprobante automatico</label>
            <select
              style={input}
              value={generarComprobanteImportacion ? "si" : "no"}
              onChange={(e) =>
                setGenerarComprobanteImportacion(e.target.value === "si")
              }
            >
              <option value="si">Si, generar comprobantes</option>
              <option value="no">No, solo importar compras</option>
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
            <p>Actualizadas: {resultadoImportacion.actualizadas || 0}</p>
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
        <form style={formularioBox} onSubmit={guardarCompra}>
          <h2 style={tituloSeccion}>Registrar compra</h2>

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
            <option>Nota de credito</option>
            <option>Nota de debito</option>
          </select>

          <label style={label}>Folio</label>
          <input
            style={input}
            name="folio"
            value={formulario.folio}
            onChange={manejarCambio}
            placeholder="456"
          />

          <label style={label}>RUT proveedor</label>
          <input
            style={input}
            name="rut_proveedor"
            value={formulario.rut_proveedor}
            onChange={manejarCambio}
            placeholder="76.222.222-2"
          />

          <label style={label}>Razon social proveedor</label>
          <input
            style={input}
            name="razon_social_proveedor"
            value={formulario.razon_social_proveedor}
            onChange={manejarCambio}
            placeholder="Proveedor SpA"
          />

          <label style={label}>Cuenta gasto/activo</label>
          <AccountSelector
            cuentas={cuentasGasto}
            style={input}
            name="cuenta_gasto_id"
            value={formulario.cuenta_gasto_id}
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

          <label style={label}>IVA Credito</label>
          <input
            style={input}
            type="number"
            name="iva_credito"
            value={formulario.iva_credito}
            onChange={manejarCambio}
          />

          <label style={label}>IVA No Recuperable</label>
          <input
            style={input}
            type="number"
            name="iva_no_recuperable"
            value={formulario.iva_no_recuperable}
            onChange={manejarCambio}
            placeholder="0"
          />

          <label style={label}>Total</label>
          <input
            style={input}
            type="number"
            name="total"
            value={formulario.total}
            onChange={manejarCambio}
          />

          <button
            style={puedeGuardarCompra ? botonGuardar : botonGuardarDeshabilitado}
            type="submit"
            disabled={!puedeGuardarCompra}
          >
            Guardar compra
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

            <button style={botonBuscar} onClick={buscarCompras}>
              Buscar
            </button>
          </div>

          <h2 style={tituloSeccion}>Compras registradas</h2>

          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Fecha</th>
                <th style={th}>Documento</th>
                <th style={th}>Folio</th>
                <th style={th}>Proveedor</th>
                <th style={th}>Neto</th>
                <th style={th}>Exento</th>
                <th style={th}>IVA Credito</th>
                <th style={th}>Otros imp.</th>
                <th style={th}>Total</th>
                <th style={th}>Comprobante</th>
              </tr>
            </thead>

            <tbody>
              {compras.map((compra) => (
                <tr key={compra.id}>
                  <td style={td}>{compra.fecha?.substring(0, 10)}</td>
                  <td style={td}>{compra.tipo_documento}</td>
                  <td style={td}>{compra.folio}</td>
                  <td style={td}>{compra.razon_social_proveedor}</td>
                  <td style={tdNumero}>{formato(compra.neto)}</td>
                  <td style={tdNumero}>{formato(compra.exento)}</td>
                  <td style={tdNumero}>{formato(compra.iva_credito)}</td>
                  <td style={tdNumero}>{formato(compra.otros_impuestos)}</td>
                  <td style={tdNumero}>{formato(compra.total)}</td>
                  <td style={td}>
                    {compra.comprobante_id ? (
                      <span style={estadoComprobanteCreado}>
                        <span style={iconoComprobanteCreado}>✓</span>
                        Comp. #{compra.comprobante_numero || compra.comprobante_id}
                      </span>
                    ) : (
                      <span style={estadoComprobantePendiente}>
                        Sin comprobante
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {compras.length === 0 && (
                <tr>
                  <td style={td} colSpan="10">
                    No hay compras registradas.
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
  color: "#1e293b",
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
  color: "#0369a1",
  marginTop: 0,
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "#1e293b",
  marginTop: "12px",
  marginBottom: "5px",
};

const input = {
  width: "100%",
  padding: "11px",
  border: "1px solid #a9d8ef",
  borderRadius: "10px",
  boxSizing: "border-box",
};

const botonGuardar = {
  width: "100%",
  marginTop: "18px",
  background: "#10b981",
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
};

const botonBuscar = {
  background: "#0369a1",
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
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  color: "#0369a1",
};

const td = {
  padding: "10px",
  borderBottom: "1px solid #e2e8f0",
  color: "#1e293b",
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
  gridTemplateColumns: "160px 1fr 220px 170px",
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
  background: "#f8fcff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "12px",
  color: "#1e293b",
};

const ok = {
  color: "#10b981",
  fontWeight: "bold",
};

const err = {
  color: "#ef4444",
  fontWeight: "bold",
};

const estadoComprobanteCreado = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  color: "#1e293b",
  fontWeight: "bold",
};

const iconoComprobanteCreado = {
  width: "14px",
  height: "14px",
  borderRadius: "2px",
  background: "#22c55e",
  color: "white",
  fontSize: "10px",
  fontWeight: "bold",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
};

const estadoComprobantePendiente = {
  color: "#475569",
  fontWeight: "bold",
};

const alerta = {
  marginTop: "20px",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  padding: "16px",
  borderRadius: "14px",
  fontWeight: "bold",
};



