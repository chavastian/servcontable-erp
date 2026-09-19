import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { listarCuentas } from "../services/cuentaService";
import AccountSelector from "../components/AccountSelector";
import {
  listarDocumentosPendientes,
  listarPagosCobros,
  registrarPagoCobro,
  anularPagoCobro,
} from "../services/pagosCobrosService";
import {
  obtenerFechaTrabajoHoyISO,
  obtenerRangoAnualTrabajo,
} from "../services/periodoTrabajoService";

const VALOR_TODOS_DOCUMENTOS = "__TODOS_DOCUMENTOS__";



export default function PagosCobros() {
  const empresaActiva = obtenerEmpresaActiva();
  const rangoInicial = {
  ...obtenerRangoAnualTrabajo(),
  fechaFormulario: obtenerFechaTrabajoHoyISO(),
};

  const [fechaDesde, setFechaDesde] = useState(rangoInicial.fechaDesde);
  const [fechaHasta, setFechaHasta] = useState(rangoInicial.fechaHasta);

  const [cuentas, setCuentas] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);

  const [totales, setTotales] = useState({
    cobros: 0,
    pagos: 0,
    total: 0,
  });

  const [formulario, setFormulario] = useState({
    tipo_operacion: "Cobro",
    documento_id: "",
    fecha: rangoInicial.fechaFormulario,
    rut_tercero: "",
    nombre_tercero: "",
    folio: "",
    glosa: "",
    monto: "",
    cuenta_banco_id: "",
    cuenta_contraparte_id: "",
    contabilizar: true,
    modo_comprobante_masivo: "unico",
  });

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  async function cargarInicial() {
    try {
      setError("");
      setMensaje("");

      const cuentasData = await listarCuentas(empresaActiva.id);
      setCuentas(cuentasData.cuentas || []);

      await cargarDocumentos(formulario.tipo_operacion);
      await cargarMovimientos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function cargarDocumentos(tipoOperacion) {
    try {
      const data = await listarDocumentosPendientes(
        empresaActiva.id,
        tipoOperacion
      );

      setDocumentos(data.documentos || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function cargarMovimientos() {
    try {
      const data = await listarPagosCobros(
        empresaActiva.id,
        fechaDesde,
        fechaHasta
      );

      setMovimientos(data.movimientos || []);
      setTotales(
        data.totales || {
          cobros: 0,
          pagos: 0,
          total: 0,
        }
      );
    } catch (err) {
      setError(err.message);
    }
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  function fechaCL(fecha) {
    if (!fecha) return "";
    const texto = String(fecha).substring(0, 10);
    const partes = texto.split("-");
    if (partes.length !== 3) return texto;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  function glosaDocumento(tipoOperacion, doc) {
    const prefijo = tipoOperacion === "Cobro" ? "COBRO" : "PAGO";
    const folio = String(doc?.folio || "").trim();
    const referencia = folio ? `FOLIO ${folio}` : `DOC ${doc?.id || ""}`;
    const glosaBase =
      String(doc?.glosa_original || "").trim() ||
      String(doc?.nombre_tercero || "").trim() ||
      String(doc?.tipo_documento || "Documento").trim();

    return `${prefijo} ${referencia} - ${glosaBase}`.trim();
  }

  function glosaMasiva(tipoOperacion, docs) {
    const prefijo = tipoOperacion === "Cobro" ? "COBRO MASIVO" : "PAGO MASIVO";
    const folios = docs
      .map((doc) => String(doc.folio || "").trim())
      .filter(Boolean)
      .slice(0, 5);
    const sufijoFolios = folios.length
      ? ` - FOLIOS ${folios.join(", ")}${
          docs.length > folios.length ? ", ..." : ""
        }`
      : "";

    return `${prefijo} - ${docs.length} DOCUMENTOS${sufijoFolios}`;
  }

  function cambiarFormulario(e) {
    const { name, value, type, checked } = e.target;

    setFormulario((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function obtenerCuentaContraparteSugerida(tipoOperacion) {
    if (tipoOperacion === "Cobro") {
      const cuentaClientes = cuentas.find((c) =>
        String(c.nombre || "").toLowerCase().includes("cliente")
      );
      return cuentaClientes?.id || "";
    }

    if (tipoOperacion === "PagoCompra") {
      const cuentaProveedores = cuentas.find((c) =>
        String(c.nombre || "").toLowerCase().includes("proveedor")
      );
      return cuentaProveedores?.id || "";
    }

    if (tipoOperacion === "PagoHonorario") {
      const cuentaHonorario = cuentas.find((c) =>
        String(c.nombre || "").toLowerCase().includes("honorario")
      );
      return cuentaHonorario?.id || "";
    }

    return "";
  }

  async function cambiarTipoOperacion(e) {
    const nuevoTipo = e.target.value;

    setFormulario((prev) => ({
      ...prev,
      tipo_operacion: nuevoTipo,
      documento_id: "",
      rut_tercero: "",
      nombre_tercero: "",
      folio: "",
      glosa: "",
      monto: "",
      cuenta_contraparte_id: obtenerCuentaContraparteSugerida(nuevoTipo),
      modo_comprobante_masivo: "unico",
    }));

    await cargarDocumentos(nuevoTipo);
  }

  function seleccionarDocumento(e) {
    const id = e.target.value;

    if (id === VALOR_TODOS_DOCUMENTOS) {
      const totalPendiente = documentos.reduce(
        (acc, item) => acc + Number(item.saldo || 0),
        0
      );

      setFormulario((prev) => ({
        ...prev,
        documento_id: VALOR_TODOS_DOCUMENTOS,
        rut_tercero: "",
        nombre_tercero: `${documentos.length} documentos`,
        folio: "",
        monto: totalPendiente,
        cuenta_contraparte_id:
          prev.cuenta_contraparte_id ||
          obtenerCuentaContraparteSugerida(prev.tipo_operacion),
        glosa: glosaMasiva(prev.tipo_operacion, documentos),
      }));
      return;
    }

    const doc = documentos.find((item) => String(item.id) === String(id));

    if (!doc) {
      setFormulario((prev) => ({
        ...prev,
        documento_id: "",
        rut_tercero: "",
        nombre_tercero: "",
        folio: "",
        monto: "",
        glosa: "",
      }));
      return;
    }

    const cuentaContraparte = obtenerCuentaContraparteSugerida(
      formulario.tipo_operacion
    );

    setFormulario((prev) => ({
      ...prev,
      documento_id: id,
      rut_tercero: doc.rut_tercero || "",
      nombre_tercero: doc.nombre_tercero || "",
      folio: doc.folio || "",
      monto: Number(doc.saldo || 0),
      cuenta_contraparte_id: cuentaContraparte,
      glosa: glosaDocumento(prev.tipo_operacion, doc),
    }));
  }

  // Evita el doble envío: un segundo clic antes de que responda el servidor
  // creaba el registro dos veces.
  const [guardando, setGuardando] = useState(false);

  async function guardarMovimiento(e) {
    e.preventDefault();

    if (guardando) return;

    try {
      setGuardando(true);
      setError("");
      setMensaje("");

      const esMasivo = formulario.documento_id === VALOR_TODOS_DOCUMENTOS;

      const doc = documentos.find(
        (item) => String(item.id) === String(formulario.documento_id)
      );

      let tipoDocumento = "";

      if (formulario.tipo_operacion === "Cobro") {
        tipoDocumento = "Venta";
      } else if (formulario.tipo_operacion === "PagoCompra") {
        tipoDocumento = "Compra";
      } else if (formulario.tipo_operacion === "PagoHonorario") {
        tipoDocumento = "Honorario";
      } else {
        tipoDocumento = "Manual";
      }

      let data;

      if (esMasivo) {
        if (documentos.length === 0) {
          setError("No existen documentos pendientes para procesar.");
          return;
        }

        const payloadMasivo = {
          empresa_id: empresaActiva.id,
          tipo_operacion: formulario.tipo_operacion,
          procesar_todos: true,
          documento_ids: documentos.map((item) => Number(item.id)),
          fecha: formulario.fecha,
          glosa: formulario.glosa,
          cuenta_banco_id: Number(formulario.cuenta_banco_id || 0),
          cuenta_contraparte_id: Number(formulario.cuenta_contraparte_id || 0),
          contabilizar: formulario.contabilizar,
          modo_comprobante: formulario.modo_comprobante_masivo,
        };

        data = await registrarPagoCobro(payloadMasivo);
      } else {
        const payload = {
          empresa_id: empresaActiva.id,
          tipo_movimiento:
            formulario.tipo_operacion === "Cobro" ? "Cobro" : "Pago",
          tipo_documento: tipoDocumento,
          documento_id: formulario.documento_id || null,
          fecha: formulario.fecha,
          rut_tercero: formulario.rut_tercero,
          nombre_tercero: formulario.nombre_tercero,
          folio: formulario.folio,
          glosa: formulario.glosa,
          monto: Number(formulario.monto || 0),
          cuenta_banco_id: Number(formulario.cuenta_banco_id || 0),
          cuenta_contraparte_id: Number(formulario.cuenta_contraparte_id || 0),
          contabilizar: formulario.contabilizar,
        };

        if (doc && Number(payload.monto) > Number(doc.saldo)) {
          setError("El monto no puede ser mayor al saldo pendiente del documento.");
          return;
        }

        data = await registrarPagoCobro(payload);
      }

      setMensaje(data.mensaje);

      setFormulario({
        tipo_operacion: formulario.tipo_operacion,
        documento_id: "",
        fecha: formulario.fecha,
        rut_tercero: "",
        nombre_tercero: "",
        folio: "",
        glosa: "",
        monto: "",
        cuenta_banco_id: formulario.cuenta_banco_id,
        cuenta_contraparte_id: formulario.cuenta_contraparte_id,
        contabilizar: true,
        modo_comprobante_masivo: formulario.modo_comprobante_masivo,
      });

      await cargarDocumentos(formulario.tipo_operacion);
      await cargarMovimientos();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function anular(id) {
    const confirmar = window.confirm("¿Seguro deseas anular este movimiento?");

    if (!confirmar) return;

    try {
      setError("");
      setMensaje("");

      const data = await anularPagoCobro(id, empresaActiva.id);

      setMensaje(data.mensaje);
      await cargarDocumentos(formulario.tipo_operacion);
      await cargarMovimientos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function cargarDocumentoDesdePendientes() {
    const texto = localStorage.getItem("documentoPagoCobro");

    if (!texto) return;

    try {
        const doc = JSON.parse(texto);

        let tipoOperacion = "Cobro";

        if (doc.tipo === "Pago") {
        if (doc.tipo_documento === "Compra") {
            tipoOperacion = "PagoCompra";
        }

        if (doc.tipo_documento === "Honorario") {
            tipoOperacion = "PagoHonorario";
        }
        }

        setFormulario((prev) => ({
        ...prev,
        tipo_operacion: tipoOperacion,
        documento_id: doc.documento_id || "",
        rut_tercero: doc.rut_tercero || "",
        nombre_tercero: doc.nombre_tercero || "",
        folio: doc.folio || "",
        monto: Number(doc.saldo_pendiente || 0),
        glosa: glosaDocumento(tipoOperacion, {
            id: doc.documento_id,
            folio: doc.folio,
            tipo_documento: doc.tipo_documento,
            nombre_tercero: doc.nombre_tercero,
        }),
        }));

        await cargarDocumentos(tipoOperacion);

        localStorage.removeItem("documentoPagoCobro");
    } catch (error) {
        console.error("Error al cargar documento pendiente:", error);
    }
    }

  useEffect(() => {
    if (empresaActiva) {
        cargarInicial();
        cargarDocumentoDesdePendientes();
    }
  }, []);

  const esSeleccionMasiva =
    formulario.documento_id === VALOR_TODOS_DOCUMENTOS;
  const totalPendienteDocumentos = documentos.reduce(
    (acc, item) => acc + Number(item.saldo || 0),
    0
  );

  if (!empresaActiva) {
    return (
      <div>
        <h1 style={titulo}>Pagos y Cobros</h1>
        <div style={alerta}>
          Debes seleccionar una empresa activa antes de registrar pagos o cobros.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={titulo}>Pagos y Cobros de Documentos</h1>

      <p style={subtitulo}>
        Empresa activa: <strong>{empresaActiva.razon_social}</strong>
      </p>

      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <form style={formularioBox} onSubmit={guardarMovimiento}>
        <h2 style={tituloSeccion}>Registrar movimiento</h2>

        <div style={gridFormulario}>
          <div>
            <label style={label}>Tipo operación</label>
            <select
              style={input}
              name="tipo_operacion"
              value={formulario.tipo_operacion}
              onChange={cambiarTipoOperacion}
            >
              <option value="Cobro">Cobro de venta / cliente</option>
              <option value="PagoCompra">Pago de compra / proveedor</option>
              <option value="PagoHonorario">Pago de honorario</option>
            </select>
          </div>

          <div>
            <label style={label}>Documento pendiente</label>
            <select
              style={input}
              name="documento_id"
              value={formulario.documento_id}
              onChange={seleccionarDocumento}
            >
              <option value="">Seleccionar documento</option>
              {documentos.length > 0 && (
                <option value={VALOR_TODOS_DOCUMENTOS}>
                  Todos los documentos pendientes ({documentos.length}) - Total{" "}
                  {formato(totalPendienteDocumentos)}
                </option>
              )}
              {documentos.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.tipo_documento} Folio {doc.folio} -{" "}
                  {doc.nombre_tercero} - Saldo {formato(doc.saldo)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label}>Fecha</label>
            <input
              style={input}
              type="date"
              min={rangoInicial.fechaDesde}
              max={rangoInicial.fechaHasta}
              name="fecha"
              value={formulario.fecha}
              onChange={cambiarFormulario}
            />
          </div>

          <div>
            <label style={label}>Monto</label>
            <input
              style={input}
              type="number"
              name="monto"
              value={formulario.monto}
              onChange={cambiarFormulario}
              placeholder="0"
              readOnly={esSeleccionMasiva}
            />
          </div>

          <div>
            <label style={label}>Cuenta Caja / Banco</label>
            <AccountSelector
              cuentas={cuentas}
              style={input}
              name="cuenta_banco_id"
              value={formulario.cuenta_banco_id}
              onChange={cambiarFormulario}
              tiposPermitidos={["Activo"]}
              placeholder="Buscar caja, banco o cuenta activo..."
            />
          </div>

          <div>
            <label style={label}>Cuenta contraparte</label>
            <AccountSelector
              cuentas={cuentas}
              style={input}
              name="cuenta_contraparte_id"
              value={formulario.cuenta_contraparte_id}
              onChange={cambiarFormulario}
              placeholder="Buscar por código o nombre de cuenta..."
            />
          </div>

          <div>
            <label style={label}>RUT tercero</label>
            <input
              style={input}
              name="rut_tercero"
              value={formulario.rut_tercero}
              onChange={cambiarFormulario}
              disabled={esSeleccionMasiva}
            />
          </div>

          <div>
            <label style={label}>Nombre tercero</label>
            <input
              style={input}
              name="nombre_tercero"
              value={formulario.nombre_tercero}
              onChange={cambiarFormulario}
              disabled={esSeleccionMasiva}
            />
          </div>

          <div>
            <label style={label}>Folio</label>
            <input
              style={input}
              name="folio"
              value={formulario.folio}
              onChange={cambiarFormulario}
              disabled={esSeleccionMasiva}
            />
          </div>
        </div>

        <label style={label}>Glosa</label>
        <input
          style={input}
          name="glosa"
          value={formulario.glosa}
          onChange={cambiarFormulario}
          placeholder="Detalle del pago o cobro"
        />

        <label style={checkLabel}>
          <input
            type="checkbox"
            name="contabilizar"
            checked={formulario.contabilizar}
            onChange={cambiarFormulario}
          />
          Contabilizar automáticamente
        </label>

        {esSeleccionMasiva && formulario.contabilizar && (
          <div style={bloqueModoComprobante}>
            <label style={label}>Modo de comprobante masivo</label>
            <select
              style={input}
              name="modo_comprobante_masivo"
              value={formulario.modo_comprobante_masivo}
              onChange={cambiarFormulario}
            >
              <option value="unico">
                Todos los pagos/cobros en 1 solo comprobante
              </option>
              <option value="por_documento">
                Un comprobante por documento (fecha del documento)
              </option>
            </select>

            <small style={textoAyuda}>
              En modo único se usa la fecha del formulario. En modo por
              documento se genera un comprobante para cada documento usando su
              fecha original.
            </small>
          </div>
        )}

        <button style={botonGuardar} type="submit" disabled={guardando}>
          {guardando ? "Guardando..." : esSeleccionMasiva ? "Guardar movimientos masivos" : "Guardar movimiento"}
        </button>
      </form>

      <div style={filtrosBox}>
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

        <button type="button" style={botonBuscar} onClick={cargarMovimientos}>
          Buscar
        </button>
      </div>

      <div style={gridResumen}>
        <div style={card}>
          <strong>Total cobros</strong>
          <span>{formato(totales.cobros)}</span>
        </div>

        <div style={card}>
          <strong>Total pagos</strong>
          <span>{formato(totales.pagos)}</span>
        </div>

        <div style={card}>
          <strong>Total movimientos</strong>
          <span>{formato(totales.total)}</span>
        </div>
      </div>

      <div style={listadoBox}>
        <h2 style={tituloSeccion}>Movimientos registrados</h2>

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Fecha</th>
                <th style={th}>Tipo</th>
                <th style={th}>Documento</th>
                <th style={th}>Folio</th>
                <th style={th}>Tercero</th>
                <th style={thNumero}>Monto</th>
                <th style={th}>Banco/Caja</th>
                <th style={th}>Contraparte</th>
                <th style={th}>Estado</th>
                <th style={thAccion}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {movimientos.map((item) => (
                <tr key={item.id}>
                  <td style={td}>{fechaCL(item.fecha)}</td>
                  <td style={td}>{item.tipo_movimiento}</td>
                  <td style={td}>{item.tipo_documento}</td>
                  <td style={td}>{item.folio}</td>
                  <td style={td}>{item.nombre_tercero}</td>
                  <td style={tdNumero}>{formato(item.monto)}</td>
                  <td style={td}>
                    {item.banco_codigo} - {item.banco_nombre}
                  </td>
                  <td style={td}>
                    {item.contraparte_codigo} - {item.contraparte_nombre}
                  </td>
                  <td style={td}>
                    {item.contabilizado ? (
                      <span style={badgeOk}>Contabilizado</span>
                    ) : (
                      <span style={badgePendiente}>Pendiente</span>
                    )}
                  </td>
                  <td style={tdAccion}>
                    {!item.contabilizado && (
                      <button
                        type="button"
                        style={botonEliminar}
                        onClick={() => anular(item.id)}
                        title="Anular movimiento"
                        aria-label="Anular movimiento"
                      >
                        {"\u2715"}
                      </button>
                    )}

                    {item.contabilizado && (
                      <span style={textoSuave}>
                        Comp. #{item.comprobante_numero || item.comprobante_id}
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {movimientos.length === 0 && (
                <tr>
                  <td style={td} colSpan="10">
                    No hay movimientos para el rango seleccionado.
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

const formularioBox = {
  background: "white",
  borderRadius: "18px",
  padding: "25px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "20px",
};

const tituloSeccion = {
  color: "var(--sc-azul)",
  marginTop: 0,
};

const gridFormulario = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: "14px",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-text)",
  marginTop: "10px",
  marginBottom: "5px",
};

const input = {
  width: "100%",
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "10px",
  boxSizing: "border-box",
  height: "40px",
};

const checkLabel = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginTop: "14px",
  color: "var(--sc-text)",
  fontWeight: "bold",
};

const bloqueModoComprobante = {
  marginTop: "14px",
  background: "var(--sc-fondo-claro)",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "12px",
  padding: "12px",
};

const textoAyuda = {
  display: "block",
  marginTop: "8px",
  color: "#155e75",
};

const botonGuardar = {
  marginTop: "18px",
  background: "var(--sc-teal)",
  color: "white",
  border: "none",
  padding: "12px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const filtrosBox = {
  display: "flex",
  alignItems: "end",
  gap: "12px",
  background: "white",
  padding: "18px",
  borderRadius: "16px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "18px",
  flexWrap: "wrap",
};

const botonBuscar = {
  background: "var(--sc-azul)",
  color: "white",
  border: "none",
  padding: "10px 20px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const gridResumen = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
  marginBottom: "18px",
};

const card = {
  background: "white",
  borderRadius: "16px",
  padding: "16px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  color: "var(--sc-text)",
};

const listadoBox = {
  background: "white",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
};

const tablaBox = {
  overflowX: "auto",
};

const tabla = {
  width: "100%",
  borderCollapse: "collapse",
};

const th = {
  textAlign: "left",
  padding: "10px",
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  color: "var(--sc-azul)",
  whiteSpace: "nowrap",
};

const thNumero = {
  ...th,
  textAlign: "right",
};

const thAccion = {
  ...th,
  textAlign: "center",
};

const td = {
  padding: "9px",
  borderBottom: "1px solid var(--sc-borde-claro)",
  color: "var(--sc-text)",
  verticalAlign: "top",
};

const tdNumero = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const tdAccion = {
  ...td,
  textAlign: "center",
  whiteSpace: "nowrap",
};

const botonEliminar = {
  background: "linear-gradient(135deg, var(--sc-danger), var(--sc-warning))",
  color: "white",
  border: "none",
  borderRadius: "9px",
  width: "32px",
  height: "32px",
  padding: 0,
  cursor: "pointer",
  fontWeight: "bold",
  fontSize: "15px",
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const badgeOk = {
  background: "#dcfce7",
  color: "#166534",
  padding: "5px 8px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "12px",
};

const badgePendiente = {
  background: "#fef3c7",
  color: "#92400e",
  padding: "5px 8px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "12px",
};

const textoSuave = {
  color: "var(--sc-gris)",
  fontSize: "13px",
  fontWeight: "bold",
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
  marginTop: "25px",
  background: "var(--sc-naranja-fondo)",
  border: "1px solid #fed7aa",
  color: "var(--sc-naranja-texto)",
  padding: "16px",
  borderRadius: "14px",
  fontWeight: "bold",
};
