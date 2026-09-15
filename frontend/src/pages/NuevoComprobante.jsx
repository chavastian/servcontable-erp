import { Fragment, useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { listarCuentas } from "../services/cuentaService";
import AccountSelector from "../components/AccountSelector";
import {
  crearComprobante,
  listarComprobantes,
  obtenerComprobante,
  actualizarComprobante,
  anularComprobante,
  obtenerSiguienteNumeroComprobante,
} from "../services/comprobanteService";
import {
  obtenerAnioActivo,
  obtenerFechaTrabajoHoyISO,
} from "../services/periodoTrabajoService";
import { imprimirComprobantePDF } from "../utils/comprobantePdf";

function detalleVacio() {
  return {
    cuenta_id: "",
    folio: "",
    centro_costo: "",
    rut_auxiliar: "",
    glosa: "",
    debe: 0,
    haber: 0,
  };
}

function obtenerFechaHoy() {
  return obtenerFechaTrabajoHoyISO();
}

export default function NuevoComprobante() {
  const empresaActiva = obtenerEmpresaActiva();

  const [cuentas, setCuentas] = useState([]);
  const [comprobantes, setComprobantes] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [detalleVisibleId, setDetalleVisibleId] = useState(null);
  const [detalleComprobante, setDetalleComprobante] = useState([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [imprimiendoComprobanteId, setImprimiendoComprobanteId] = useState(null);

  const [cabecera, setCabecera] = useState({
    fecha: obtenerFechaHoy(),
    tipo: "Traspaso",
    numero: "",
    glosa: "",
  });

  const [detalle, setDetalle] = useState([detalleVacio(), detalleVacio()]);

  const [comprobanteEditandoId, setComprobanteEditandoId] = useState(null);

  useEffect(() => {
    if (empresaActiva) {
      cargarDatos();
      cargarSiguienteNumero("Traspaso");
    }
  }, []);

  async function cargarDatos() {
    try {
      setError("");
      const anioActivo = obtenerAnioActivo();

      const cuentasData = await listarCuentas(empresaActiva.id);
      const comprobantesData = await listarComprobantes(empresaActiva.id, {
        anio: anioActivo,
      });

      setCuentas(
        Array.isArray(cuentasData?.cuentas)
          ? cuentasData.cuentas
          : Array.isArray(cuentasData)
          ? cuentasData
          : []
      );

      setComprobantes(
        Array.isArray(comprobantesData?.comprobantes)
          ? comprobantesData.comprobantes
          : Array.isArray(comprobantesData)
          ? comprobantesData
          : []
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function cargarSiguienteNumero(tipoSeleccionado) {
    try {
      if (!empresaActiva || !tipoSeleccionado) return;

      const data = await obtenerSiguienteNumeroComprobante(
        empresaActiva.id,
        tipoSeleccionado
      );

      setCabecera((prev) => ({
        ...prev,
        numero: data.siguiente || "",
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  function cambiarCabecera(e) {
    const { name, value } = e.target;

    setCabecera({
      ...cabecera,
      [name]: value,
    });
  }

  function actualizarLinea(index, campo, valor) {
    const nuevasLineas = [...detalle];

    nuevasLineas[index] = {
      ...nuevasLineas[index],
      [campo]: valor,
    };

    if (campo === "debe" && Number(valor || 0) > 0) {
      nuevasLineas[index].haber = 0;
    }

    if (campo === "haber" && Number(valor || 0) > 0) {
      nuevasLineas[index].debe = 0;
    }

    setDetalle(nuevasLineas);
  }

  function agregarLinea() {
    setDetalle([...detalle, detalleVacio()]);
  }

  function eliminarLinea(index) {
    if (detalle.length <= 2) {
      setError("El comprobante debe tener al menos 2 líneas.");
      return;
    }

    const nuevasLineas = detalle.filter((_, i) => i !== index);
    setDetalle(nuevasLineas);
  }

  function formatoMonto(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  const totalDebe = detalle.reduce(
    (total, item) => total + Number(item.debe || 0),
    0
  );

  const totalHaber = detalle.reduce(
    (total, item) => total + Number(item.haber || 0),
    0
  );

  const diferencia = totalDebe - totalHaber;

  async function editarComprobante(id) {
    try {
      setMensaje("");
      setError("");

      const data = await obtenerComprobante(id);
      const comp = data.comprobante;

      setComprobanteEditandoId(comp.id);

      setCabecera({
        fecha: comp.fecha?.substring(0, 10) || obtenerFechaHoy(),
        tipo: comp.tipo || "Traspaso",
        numero: comp.numero || "",
        glosa: comp.glosa || "",
      });

      const detallesBackend = Array.isArray(data.detalles)
        ? data.detalles
        : Array.isArray(data.detalle)
        ? data.detalle
        : [];

      const detalleMapeado = detallesBackend.map((item) => ({
        cuenta_id: item.cuenta_id || "",
        folio: item.folio || "",
        centro_costo: item.centro_costo || "",
        rut_auxiliar: item.rut_auxiliar || "",
        glosa: item.glosa || "",
        debe: Number(item.debe || 0),
        haber: Number(item.haber || 0),
      }));

      setDetalle(
        detalleMapeado.length >= 2
          ? detalleMapeado
          : [detalleVacio(), detalleVacio()]
      );

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message);
    }
  }

  function cancelarEdicion() {
    setComprobanteEditandoId(null);

    setCabecera({
      fecha: obtenerFechaHoy(),
      tipo: "Traspaso",
      numero: "",
      glosa: "",
    });

    setDetalle([detalleVacio(), detalleVacio()]);

    cargarSiguienteNumero("Traspaso");
  }

  function validarDetalle() {
    const lineasValidas = detalle.filter((item) => {
      return (
        item.cuenta_id &&
        (Number(item.debe || 0) > 0 || Number(item.haber || 0) > 0)
      );
    });

    if (lineasValidas.length < 2) {
      setError("Debes ingresar al menos 2 líneas con cuenta y monto.");
      return null;
    }

    return lineasValidas;
  }

  async function guardarComprobante(e) {
    e.preventDefault();

    if (!empresaActiva) {
      setError("Debes seleccionar una empresa activa.");
      return;
    }

    if (diferencia !== 0 || totalDebe <= 0) {
      setError("El comprobante debe cuadrar y tener movimientos.");
      return;
    }

    try {
      setMensaje("");
      setError("");

      const lineasValidas = validarDetalle();

      if (!lineasValidas) return;

      const payload = {
        empresa_id: empresaActiva.id,
        fecha: cabecera.fecha,
        tipo: cabecera.tipo,
        numero: Number(cabecera.numero || 0),
        glosa: cabecera.glosa || "",
        detalles: lineasValidas.map((item) => ({
          cuenta_id: Number(item.cuenta_id),
          folio: item.folio || "",
          centro_costo: item.centro_costo || "",
          rut_auxiliar: item.rut_auxiliar || "",
          glosa: item.glosa || "",
          debe: Number(item.debe || 0),
          haber: Number(item.haber || 0),
        })),
      };

      const data = comprobanteEditandoId
        ? await actualizarComprobante(comprobanteEditandoId, payload)
        : await crearComprobante(payload);

      setMensaje(data.mensaje || "Comprobante guardado correctamente.");
      setComprobanteEditandoId(null);

      setCabecera({
        fecha: obtenerFechaHoy(),
        tipo: "Traspaso",
        numero: "",
        glosa: "",
      });

      setDetalle([detalleVacio(), detalleVacio()]);

      await cargarDatos();
      await cargarSiguienteNumero("Traspaso");
    } catch (err) {
      setError(err.message);
    }
  }

  if (!empresaActiva) {
    return (
      <div>
        <h1 style={titulo}>Nuevo comprobante</h1>
        <div style={alerta}>
          Debes seleccionar una empresa activa antes de crear comprobantes.
        </div>
      </div>
    );
  }


  async function eliminarAsiento(id) {
    const confirmar = window.confirm(
      "Se eliminara el asiento. Si estaba asociado a pagos/cobros, esos documentos volveran a pendiente. Deseas continuar?"
    );

    if (!confirmar) return;

    try {
      setMensaje("");
      setError("");

      const data = await anularComprobante(id, empresaActiva.id);

      setMensaje(data.mensaje || "Asiento eliminado correctamente.");

      if (detalleVisibleId === id) {
        setDetalleVisibleId(null);
        setDetalleComprobante([]);
      }

      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function imprimirComprobante(id) {
    try {
      setMensaje("");
      setError("");
      setImprimiendoComprobanteId(id);

      const data = await obtenerComprobante(id);
      const detallesBackend = Array.isArray(data.detalles)
        ? data.detalles
        : Array.isArray(data.detalle)
        ? data.detalle
        : [];

      const impresionIniciada = imprimirComprobantePDF({
        empresa: empresaActiva,
        comprobante: data.comprobante,
        detalles: detallesBackend,
      });

      if (!impresionIniciada) {
        setError("Ya hay una impresión en curso. Cierra la ventana actual antes de imprimir otra vez.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setImprimiendoComprobanteId(null);
    }
  }

  async function verDetalleComprobante(id) {
    try {
      setMensaje("");
      setError("");

      if (detalleVisibleId === id) {
        setDetalleVisibleId(null);
        setDetalleComprobante([]);
        return;
      }

      setCargandoDetalle(true);

      const data = await obtenerComprobante(id);

      const detallesBackend = Array.isArray(data.detalles)
        ? data.detalles
        : Array.isArray(data.detalle)
        ? data.detalle
        : [];

      setDetalleVisibleId(id);
      setDetalleComprobante(detallesBackend);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargandoDetalle(false);
    }
  }

  return (
    <div>
      <h1 style={titulo}>Nuevo comprobante</h1>

      <p style={subtitulo}>
        Empresa activa: <strong>{empresaActiva.razon_social}</strong>
      </p>

      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <form style={formularioBox} onSubmit={guardarComprobante}>
        <h2 style={tituloSeccion}>Cabecera</h2>

        <div style={gridCabecera}>
          <div>
            <label style={label}>Fecha</label>
            <input
              style={input}
              type="date"
              name="fecha"
              value={cabecera.fecha}
              onChange={cambiarCabecera}
            />
          </div>

          <div>
            <label style={label}>Tipo</label>
            <select
              style={input}
              name="tipo"
              value={cabecera.tipo}
              onChange={(e) => {
                const nuevoTipo = e.target.value;

                setCabecera((prev) => ({
                  ...prev,
                  tipo: nuevoTipo,
                  numero: "",
                }));

                cargarSiguienteNumero(nuevoTipo);
              }}
            >
              <option value="Traspaso">Traspaso</option>
              <option value="Ingreso">Ingreso</option>
              <option value="Egreso">Egreso</option>
              <option value="Compra">Compra</option>
              <option value="Venta">Venta</option>
            </select>
          </div>

          <div>
            <label style={label}>Número</label>
            <input
              style={input}
              value={cabecera.numero || "Automático"}
              readOnly
            />
            <p style={ayuda}>Número automático según tipo de comprobante.</p>
          </div>
        </div>

        <label style={label}>Glosa general</label>
        <input
          style={inputGlosaCompacta}
          name="glosa"
          value={cabecera.glosa}
          onChange={cambiarCabecera}
          placeholder="Glosa del comprobante"
        />

        <h2 style={tituloSeccion}>Detalle contable</h2>

        <div style={tablaBoxEdicion}>
          <table style={tablaEdicion}>
            <colgroup>
              <col style={{ width: "27%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thCompacto}>Cuenta</th>
                <th style={thCompacto}>Folio</th>
                <th style={thCompacto}>Centro costo</th>
                <th style={thCompacto}>RUT auxiliar</th>
                <th style={thCompacto}>Glosa</th>
                <th style={thNumeroCompacto}>Debe</th>
                <th style={thNumeroCompacto}>Haber</th>
                <th style={thAccionCompacto}>Accion</th>
              </tr>
            </thead>

            <tbody>
              {detalle.map((linea, index) => (
                <tr key={index}>
                  <td style={tdCompacto}>
                    <AccountSelector
                      cuentas={cuentas}
                      style={inputCuentaCompacto}
                      name="cuenta_id"
                      value={linea.cuenta_id}
                      onChange={(e) =>
                        actualizarLinea(index, "cuenta_id", e.target.value)
                      }
                      placeholder="Codigo o nombre"
                    />
                  </td>

                  <td style={tdCompacto}>
                    <input
                      style={inputTablaCompacto}
                      value={linea.folio}
                      onChange={(e) =>
                        actualizarLinea(index, "folio", e.target.value)
                      }
                      placeholder="Folio"
                    />
                  </td>

                  <td style={tdCompacto}>
                    <input
                      style={inputTablaCompacto}
                      value={linea.centro_costo}
                      onChange={(e) =>
                        actualizarLinea(index, "centro_costo", e.target.value)
                      }
                      placeholder="Centro costo"
                    />
                  </td>

                  <td style={tdCompacto}>
                    <input
                      style={inputTablaCompacto}
                      value={linea.rut_auxiliar}
                      onChange={(e) =>
                        actualizarLinea(index, "rut_auxiliar", e.target.value)
                      }
                      placeholder="76.123.456-7"
                    />
                  </td>

                  <td style={tdCompacto}>
                    <input
                      style={inputTablaCompacto}
                      value={linea.glosa}
                      onChange={(e) =>
                        actualizarLinea(index, "glosa", e.target.value)
                      }
                      placeholder="Detalle"
                    />
                  </td>

                  <td style={tdCompacto}>
                    <input
                      style={inputNumeroCompacto}
                      type="number"
                      value={linea.debe}
                      onChange={(e) =>
                        actualizarLinea(index, "debe", e.target.value)
                      }
                    />
                  </td>

                  <td style={tdCompacto}>
                    <input
                      style={inputNumeroCompacto}
                      type="number"
                      value={linea.haber}
                      onChange={(e) =>
                        actualizarLinea(index, "haber", e.target.value)
                      }
                    />
                  </td>

                  <td style={tdAccionCompacto}>
                    <button
                      type="button"
                      style={botonEliminarCompacto}
                      onClick={() => eliminarLinea(index)}
                    >
                      X
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="button" style={botonSecundario} onClick={agregarLinea}>
          + Agregar linea
        </button>

        <div style={totalesBox}>
          <div>
            <strong>Total Debe:</strong> {formatoMonto(totalDebe)}
          </div>

          <div>
            <strong>Total Haber:</strong> {formatoMonto(totalHaber)}
          </div>

          <div style={diferencia === 0 ? diferenciaOk : diferenciaError}>
            <strong>Diferencia:</strong> {formatoMonto(diferencia)}
          </div>
        </div>

        <button
          style={
            diferencia === 0 && totalDebe > 0 ? botonGuardar : botonBloqueado
          }
          type="submit"
          disabled={diferencia !== 0 || totalDebe <= 0}
        >
          {comprobanteEditandoId
            ? "Actualizar comprobante"
            : "Guardar comprobante"}
        </button>

        {comprobanteEditandoId && (
          <button
            type="button"
            style={botonCancelar}
            onClick={cancelarEdicion}
          >
            Cancelar edición
          </button>
        )}
      </form>

      <div style={listadoBox}>
        <h2 style={tituloSeccion}>Comprobantes registrados</h2>

        <table style={tablaComprobantes}>
          <colgroup>
            <col style={{ width: "110px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "90px" }} />
            <col />
            <col style={{ width: "130px" }} />
            <col style={{ width: "130px" }} />
            <col style={{ width: "200px" }} />
          </colgroup>

          <thead>
            <tr>
              <th style={th}>Fecha</th>
              <th style={th}>Tipo</th>
              <th style={th}>Número</th>
              <th style={th}>Glosa</th>
              <th style={thMonto}>Debe</th>
              <th style={thMonto}>Haber</th>
              <th style={thAccion}>Acción</th>
            </tr>
          </thead>

          <tbody>
            {comprobantes.length === 0 ? (
              <tr>
                <td style={td} colSpan="7">
                  No hay comprobantes registrados.
                </td>
              </tr>
            ) : (
              comprobantes.map((comp) => (
                <Fragment key={comp.id}>
                  <tr>
                    <td style={td}>{comp.fecha?.substring(0, 10)}</td>
                    <td style={td}>{comp.tipo}</td>
                    <td style={td}>{comp.numero}</td>
                    <td style={tdGlosa}>{comp.glosa}</td>
                    <td style={tdMonto}>{formatoMonto(comp.total_debe)}</td>
                    <td style={tdMonto}>{formatoMonto(comp.total_haber)}</td>

                    <td style={tdAccion}>
                      <div style={accionesFila}>
                        <button
                          type="button"
                          style={botonDetalle}
                          onClick={() => verDetalleComprobante(comp.id)}
                          title={detalleVisibleId === comp.id ? "Ocultar detalle" : "Ver detalle"}
                          aria-label={detalleVisibleId === comp.id ? "Ocultar detalle" : "Ver detalle"}
                        >
                          {detalleVisibleId === comp.id ? "\u25B4" : "\u25C9"}
                        </button>

                        <button
                          type="button"
                          style={botonEditar}
                          onClick={() => editarComprobante(comp.id)}
                          title="Editar asiento"
                          aria-label="Editar asiento"
                        >
                          {"\u270E"}
                        </button>

                        <button
                          type="button"
                          style={
                            imprimiendoComprobanteId === comp.id
                              ? botonAccionDeshabilitado
                              : botonImprimir
                          }
                          onClick={() => imprimirComprobante(comp.id)}
                          disabled={imprimiendoComprobanteId === comp.id}
                          title="Imprimir comprobante"
                          aria-label="Imprimir comprobante"
                        >
                          {"\u2399"}
                        </button>

                        <button
                          type="button"
                          style={botonEliminarAsiento}
                          onClick={() => eliminarAsiento(comp.id)}
                          title="Eliminar asiento"
                          aria-label="Eliminar asiento"
                        >
                          {"\u2715"}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {detalleVisibleId === comp.id && (
                    <tr>
                      <td style={tdDetalleContenedor} colSpan="7">
                        <div style={detalleComprobanteBox}>
                          <h3 style={tituloDetalleComprobante}>
                            Detalle contable del comprobante
                          </h3>

                          {cargandoDetalle ? (
                            <p style={textoSuave}>Cargando detalle...</p>
                          ) : (
                            <div style={tablaBox}>
                              <table style={tablaDetalleComprobante}>
                                <thead>
                                  <tr>
                                    <th style={th}>Cuenta</th>
                                    <th style={th}>Folio</th>
                                    <th style={th}>Centro costo</th>
                                    <th style={th}>RUT auxiliar</th>
                                    <th style={th}>Glosa detalle</th>
                                    <th style={thMonto}>Debe</th>
                                    <th style={thMonto}>Haber</th>
                                  </tr>
                                </thead>

                                <tbody>
                                  {detalleComprobante.length === 0 ? (
                                    <tr>
                                      <td style={td} colSpan="7">
                                        Este comprobante no tiene detalle registrado.
                                      </td>
                                    </tr>
                                  ) : (
                                    detalleComprobante.map((det) => (
                                      <tr key={det.id || det.detalle_id}>
                                        <td style={td}>
                                          {det.cuenta_codigo
                                            ? `${det.cuenta_codigo} - ${det.cuenta_nombre}`
                                            : det.cuenta_nombre || det.cuenta_id}
                                        </td>

                                        <td style={td}>{det.folio || "-"}</td>
                                        <td style={td}>{det.centro_costo || "-"}</td>
                                        <td style={td}>{det.rut_auxiliar || "-"}</td>
                                        <td style={tdGlosa}>{det.glosa || "-"}</td>
                                        <td style={tdMonto}>{formatoMonto(det.debe)}</td>
                                        <td style={tdMonto}>{formatoMonto(det.haber)}</td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const titulo = {
  fontSize: "28px",
  color: "#0f172a",
  marginBottom: "5px",
};

const subtitulo = {
  color: "#475569",
  marginBottom: "12px",
};

const formularioBox = {
  background: "white",
  borderRadius: "14px",
  padding: "16px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
};

const tituloSeccion = {
  color: "#0369a1",
  marginTop: "0",
  marginBottom: "8px",
  fontSize: "22px",
};

const gridCabecera = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: "10px",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "#1e293b",
  marginTop: "8px",
  marginBottom: "4px",
  fontSize: "13px",
};

const input = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #a9d8ef",
  borderRadius: "8px",
  boxSizing: "border-box",
  fontSize: "13px",
};

const inputGlosaCompacta = {
  ...input,
  height: "34px",
};

const ayuda = {
  fontSize: "12px",
  color: "#475569",
  marginTop: "5px",
};

const tablaBox = {
  overflowX: "auto",
  marginTop: "15px",
};

const tablaBoxEdicion = {
  overflowX: "hidden",
  marginTop: "8px",
  width: "100%",
};

const tablaEdicion = {
  width: "100%",
  tableLayout: "fixed",
  borderCollapse: "collapse",
};

const tablaComprobantes = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
};

const th = {
  textAlign: "left",
  padding: "12px",
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  color: "#0369a1",
  whiteSpace: "nowrap",
};

const thMonto = {
  ...th,
  textAlign: "right",
};

const thAccion = {
  ...th,
  textAlign: "center",
};

const thCompacto = {
  ...th,
  padding: "6px 8px",
  fontSize: "12px",
};

const thNumeroCompacto = {
  ...thCompacto,
  textAlign: "right",
};

const thAccionCompacto = {
  ...thCompacto,
  textAlign: "center",
};

const td = {
  padding: "10px",
  borderBottom: "1px solid #e2e8f0",
  color: "#1e293b",
  verticalAlign: "top",
};

const tdGlosa = {
  ...td,
  whiteSpace: "normal",
  wordBreak: "break-word",
};

const tdMonto = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const tdAccion = {
  ...td,
  textAlign: "center",
};

const tdCompacto = {
  ...td,
  padding: "4px 5px",
  verticalAlign: "middle",
};

const tdAccionCompacto = {
  ...tdCompacto,
  textAlign: "center",
};

const inputTabla = {
  width: "100%",
  minWidth: "140px",
  padding: "9px",
  border: "1px solid #a9d8ef",
  borderRadius: "8px",
  boxSizing: "border-box",
};

const inputTablaCompacto = {
  ...inputTabla,
  minWidth: 0,
  width: "100%",
  height: "32px",
  padding: "6px 8px",
  fontSize: "12px",
  borderRadius: "7px",
};

const inputCuentaCompacto = {
  ...inputTablaCompacto,
  minWidth: 0,
};

const inputNumeroCompacto = {
  ...inputTablaCompacto,
  textAlign: "right",
};

const botonEliminar = {
  background: "linear-gradient(135deg, #ef4444, #f97316)",
  color: "white",
  border: "none",
  borderRadius: "8px",
  padding: "8px 10px",
  cursor: "pointer",
};

const botonEliminarCompacto = {
  ...botonEliminar,
  width: "30px",
  minWidth: "30px",
  height: "30px",
  padding: "0",
  borderRadius: "7px",
  fontSize: "12px",
};

const botonSecundario = {
  marginTop: "15px",
  background: "#0ea5e9",
  color: "white",
  border: "none",
  borderRadius: "10px",
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: "bold",
};

const botonCancelar = {
  ...botonSecundario,
  background: "#475569",
  marginLeft: "10px",
};

const totalesBox = {
  marginTop: "20px",
  display: "flex",
  gap: "20px",
  flexWrap: "wrap",
  background: "#f8fcff",
  padding: "16px",
  borderRadius: "14px",
};

const diferenciaOk = {
  color: "#10b981",
};

const diferenciaError = {
  color: "#ef4444",
};

const botonGuardar = {
  width: "100%",
  marginTop: "20px",
  background: "#10b981",
  color: "white",
  border: "none",
  padding: "14px",
  borderRadius: "12px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonBloqueado = {
  ...botonGuardar,
  background: "#94a3b8",
  cursor: "not-allowed",
};

const listadoBox = {
  marginTop: "25px",
  background: "white",
  borderRadius: "18px",
  padding: "25px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  overflowX: "auto",
};

const botonEditar = {
  background: "linear-gradient(135deg, #0369a1, #06b6d4)",
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

const botonImprimir = {
  background: "linear-gradient(135deg, #0f766e, #14b8a6)",
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

const botonAccionDeshabilitado = {
  ...botonImprimir,
  background: "#94a3b8",
  cursor: "not-allowed",
  opacity: 0.7,
};

const botonEliminarAsiento = {
  background: "linear-gradient(135deg, #ef4444, #f97316)",
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

const ok = {
  color: "#10b981",
  fontWeight: "bold",
};

const err = {
  color: "#ef4444",
  fontWeight: "bold",
};

const alerta = {
  marginTop: "25px",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  padding: "16px",
  borderRadius: "14px",
  fontWeight: "bold",
};

const accionesFila = {
  display: "flex",
  justifyContent: "center",
  gap: "6px",
  flexWrap: "nowrap",
  alignItems: "center",
};

const botonDetalle = {
  background: "linear-gradient(135deg, #0369a1, #06b6d4)",
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

const tdDetalleContenedor = {
  padding: "0",
  borderBottom: "1px solid #e2e8f0",
};

const detalleComprobanteBox = {
  background: "#f8fcff",
  border: "1px solid #dbeafe",
  borderRadius: "14px",
  padding: "16px",
  margin: "10px",
};

const tituloDetalleComprobante = {
  color: "#0369a1",
  marginTop: 0,
  marginBottom: "12px",
};

const textoSuave = {
  color: "#475569",
};

const tablaDetalleComprobante = {
  width: "100%",
  minWidth: "1050px",
  borderCollapse: "collapse",
};
