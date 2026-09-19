import { useEffect, useState } from "react";
import { tasaRetencionVigente } from "../utils/retencionHonorarios";
import { obtenerEmpresaActiva } from "../services/empresaService";
import {
  crearHonorario,
  listarHonorarios,
  anularHonorario,
  contabilizarHonorario,
} from "../services/honorariosService";
import * as XLSX from "xlsx";
import {
  crearPDFClasico,
  encabezadoPDFClasico,
  marcarFilaTotalPDF,
  piePaginasPDFClasico,
  tablaPDFClasica,
} from "../utils/documentTheme";
import {
  obtenerFechaTrabajoHoyISO,
  obtenerRangoAnualTrabajo,
} from "../services/periodoTrabajoService";


export default function Honorarios() {
  const empresaActiva = obtenerEmpresaActiva();
  const rangoInicial = obtenerRangoAnualTrabajo();

  const [fechaDesde, setFechaDesde] = useState(rangoInicial.fechaDesde);
  const [fechaHasta, setFechaHasta] = useState(rangoInicial.fechaHasta);

  const [formulario, setFormulario] = useState({
    fecha_emision: obtenerFechaTrabajoHoyISO(),
    fecha_pago: "",
    tipo_documento: "Boleta de Honorarios",
    folio: "",
    rut_prestador: "",
    nombre_prestador: "",
    glosa: "",
    bruto: "",
    tasa_retencion: String(tasaRetencionVigente(new Date().toISOString().slice(0, 10))),
  });

  const [honorarios, setHonorarios] = useState([]);
  const [totales, setTotales] = useState({
    bruto: 0,
    retencion: 0,
    liquido: 0,
  });

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (empresaActiva) {
      cargarDatos();
    }
  }, []);

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

  function cambiarFormulario(e) {
    const { name, value } = e.target;

    setFormulario((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  const brutoCalculado = Number(formulario.bruto || 0);
  const tasaCalculada = Number(formulario.tasa_retencion || 0);
  const retencionCalculada = Math.round(brutoCalculado * (tasaCalculada / 100));
  const liquidoCalculado = brutoCalculado - retencionCalculada;

  async function cargarDatos() {
    try {
      setError("");
      setMensaje("");

      const data = await listarHonorarios(
        empresaActiva.id,
        fechaDesde,
        fechaHasta
      );

      setHonorarios(data.honorarios || []);
      setTotales(
        data.totales || {
          bruto: 0,
          retencion: 0,
          liquido: 0,
        }
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function guardarHonorario(e) {
    e.preventDefault();

    if (!empresaActiva) {
      setError("Debes seleccionar una empresa activa.");
      return;
    }

    try {
      setError("");
      setMensaje("");

      const data = await crearHonorario({
        empresa_id: empresaActiva.id,
        ...formulario,
        bruto: Number(formulario.bruto || 0),
        tasa_retencion: Number(formulario.tasa_retencion || 0),
      });

      setMensaje(data.mensaje);

      setFormulario({
        fecha_emision: formulario.fecha_emision,
        fecha_pago: "",
        tipo_documento: "Boleta de Honorarios",
        folio: "",
        rut_prestador: "",
        nombre_prestador: "",
        glosa: "",
        bruto: "",
        tasa_retencion: formulario.tasa_retencion,
      });

      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function anular(id) {
    const confirmar = window.confirm("¿Seguro deseas anular este honorario?");

    if (!confirmar) return;

    try {
      setError("");
      setMensaje("");

      const data = await anularHonorario(id, empresaActiva.id);

      setMensaje(data.mensaje);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function contabilizar(id) {
    const confirmar = window.confirm(
        "¿Deseas contabilizar este honorario y generar el comprobante contable?"
    );

    if (!confirmar) return;

    try {
        setError("");
        setMensaje("");

        const data = await contabilizarHonorario(id, empresaActiva.id);

        setMensaje(data.mensaje || "Honorario contabilizado correctamente");
        await cargarDatos();
    } catch (err) {
        setError(err.message);
    }
    }

  function exportarExcel() {
    const data = [];

    data.push(["LIBRO DE RETENCIONES - HONORARIOS"]);
    data.push([`Empresa: ${empresaActiva?.razon_social || ""}`]);
    data.push([`RUT: ${empresaActiva?.rut || ""}`]);
    data.push([`Desde: ${fechaDesde}`]);
    data.push([`Hasta: ${fechaHasta}`]);
    data.push([]);

    data.push([
      "Nro",
      "Fecha Emision",
      "Fecha Pago",
      "Tipo Documento",
      "Folio",
      "RUT Prestador",
      "Nombre Prestador",
      "Glosa",
      "Bruto",
      "Tasa Retencion",
      "Retencion",
      "Liquido",
    ]);

    honorarios.forEach((item, index) => {
      data.push([
        index + 1,
        fechaCL(item.fecha_emision),
        fechaCL(item.fecha_pago),
        item.tipo_documento || "",
        item.folio || "",
        item.rut_prestador || "",
        item.nombre_prestador || "",
        item.glosa || "",
        Number(item.bruto || 0),
        Number(item.tasa_retencion || 0),
        Number(item.retencion || 0),
        Number(item.liquido || 0),
      ]);
    });

    data.push([]);
    data.push([
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      Number(totales.bruto || 0),
      "",
      Number(totales.retencion || 0),
      Number(totales.liquido || 0),
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws["!cols"] = [
      { wch: 8 },
      { wch: 15 },
      { wch: 15 },
      { wch: 22 },
      { wch: 12 },
      { wch: 16 },
      { wch: 35 },
      { wch: 35 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Retenciones Honorarios");
    XLSX.writeFile(
      wb,
      `Libro_Retenciones_Honorarios_${fechaDesde}_${fechaHasta}.xlsx`
    );
  }

  function exportarPDF() {
    const doc = crearPDFClasico({ orientation: "l", format: "a4" });
    const margenX = 8;
    const yInicio = encabezadoPDFClasico(doc, {
      titulo: "Libro de Retenciones - Honorarios",
      empresa: empresaActiva?.razon_social,
      rut: empresaActiva?.rut,
      fechaDesde,
      fechaHasta,
      margenX,
    });

    const body = honorarios.map((item, index) => [
      index + 1,
      fechaCL(item.fecha_emision),
      fechaCL(item.fecha_pago),
      item.folio || "",
      item.rut_prestador || "",
      item.nombre_prestador || "",
      Number(item.bruto || 0).toLocaleString("es-CL"),
      `${Number(item.tasa_retencion || 0).toLocaleString("es-CL")}%`,
      Number(item.retencion || 0).toLocaleString("es-CL"),
      Number(item.liquido || 0).toLocaleString("es-CL"),
    ]);

    body.push([
      "Total",
      "",
      "",
      "",
      "",
      "",
      Number(totales.bruto || 0).toLocaleString("es-CL"),
      "",
      Number(totales.retencion || 0).toLocaleString("es-CL"),
      Number(totales.liquido || 0).toLocaleString("es-CL"),
    ]);

    tablaPDFClasica(doc, {
      startY: yInicio + 1,
      head: [
        [
          "Nro",
          "Fecha Emisión",
          "Fecha Pago",
          "Folio",
          "RUT",
          "Prestador",
          "Bruto",
          "Tasa",
          "Retención",
          "Líquido",
        ],
      ],
      body,
      margin: { left: margenX, right: margenX },
      styles: {
        fontSize: 6.2,
        cellPadding: 1.05,
      },
      columnStyles: {
        0: { cellWidth: 9 },
        1: { cellWidth: 18 },
        2: { cellWidth: 18 },
        3: { cellWidth: 12 },
        4: { cellWidth: 21 },
        5: { cellWidth: 50 },
        6: { cellWidth: 18, halign: "right" },
        7: { cellWidth: 13, halign: "right" },
        8: { cellWidth: 18, halign: "right" },
        9: { cellWidth: 18, halign: "right" },
      },
      didParseCell(data) {
        marcarFilaTotalPDF(data, data.row.raw?.[0] === "Total");
      },
    });

    piePaginasPDFClasico(doc, {
      texto: "Libro de Retenciones - Honorarios",
      margenX,
    });

    doc.save(`Libro_Retenciones_Honorarios_${fechaDesde}_${fechaHasta}.pdf`);
  }

  if (!empresaActiva) {
    return (
      <div>
        <h1 style={titulo}>Honorarios</h1>
        <div style={alerta}>
          Debes seleccionar una empresa activa antes de registrar honorarios.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={titulo}>Honorarios y Libro de Retenciones</h1>

      <p style={subtitulo}>
        Empresa activa: <strong>{empresaActiva.razon_social}</strong>
      </p>

      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <form style={formularioBox} onSubmit={guardarHonorario}>
        <h2 style={tituloSeccion}>Registrar honorario</h2>

        <div style={gridFormulario}>
          <div>
            <label style={label}>Fecha emision</label>
            <input
              style={input}
              type="date"
              min={rangoInicial.fechaDesde}
              max={rangoInicial.fechaHasta}
              name="fecha_emision"
              value={formulario.fecha_emision}
              onChange={cambiarFormulario}
            />
          </div>

          <div>
            <label style={label}>Fecha pago</label>
            <input
              style={input}
              type="date"
              min={rangoInicial.fechaDesde}
              max={rangoInicial.fechaHasta}
              name="fecha_pago"
              value={formulario.fecha_pago}
              onChange={cambiarFormulario}
            />
          </div>

          <div>
            <label style={label}>Folio</label>
            <input
              style={input}
              name="folio"
              value={formulario.folio}
              onChange={cambiarFormulario}
              placeholder="Ej: 123"
            />
          </div>

          <div>
            <label style={label}>RUT prestador</label>
            <input
              style={input}
              name="rut_prestador"
              value={formulario.rut_prestador}
              onChange={cambiarFormulario}
              placeholder="11.111.111-1"
            />
          </div>

          <div>
            <label style={label}>Nombre prestador</label>
            <input
              style={input}
              name="nombre_prestador"
              value={formulario.nombre_prestador}
              onChange={cambiarFormulario}
              placeholder="Nombre o razon social"
            />
          </div>

          <div>
            <label style={label}>Monto bruto</label>
            <input
              style={input}
              type="number"
              name="bruto"
              value={formulario.bruto}
              onChange={cambiarFormulario}
              placeholder="0"
            />
          </div>

          <div>
            <label style={label}>Tasa retencion %</label>
            <input
              style={input}
              type="number"
              step="0.01"
              name="tasa_retencion"
              value={formulario.tasa_retencion}
              onChange={cambiarFormulario}
            />
          </div>

          <div>
            <label style={label}>Retencion calculada</label>
            <input style={input} value={formato(retencionCalculada)} readOnly />
          </div>

          <div>
            <label style={label}>Liquido a pagar</label>
            <input style={input} value={formato(liquidoCalculado)} readOnly />
          </div>
        </div>

        <label style={label}>Glosa</label>
        <input
          style={input}
          name="glosa"
          value={formulario.glosa}
          onChange={cambiarFormulario}
          placeholder="Detalle del servicio"
        />

        <button style={botonGuardar} type="submit">
          Guardar honorario
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

        <button type="button" style={botonBuscar} onClick={cargarDatos}>
          Buscar
        </button>

        <button type="button" style={botonExcel} onClick={exportarExcel}>
          Exportar Excel
        </button>

        <button type="button" style={botonPDF} onClick={exportarPDF}>
          Exportar PDF
        </button>
      </div>

      <div style={gridResumen}>
        <div style={card}>
          <strong>Total bruto</strong>
          <span>{formato(totales.bruto)}</span>
        </div>

        <div style={card}>
          <strong>Total retencion</strong>
          <span>{formato(totales.retencion)}</span>
        </div>

        <div style={card}>
          <strong>Total liquido</strong>
          <span>{formato(totales.liquido)}</span>
        </div>
      </div>

      <div style={listadoBox}>
        <h2 style={tituloSeccion}>Libro de retenciones</h2>

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Fecha</th>
                <th style={th}>Folio</th>
                <th style={th}>RUT</th>
                <th style={th}>Prestador</th>
                <th style={th}>Glosa</th>
                <th style={thNumero}>Bruto</th>
                <th style={thNumero}>Tasa</th>
                <th style={thNumero}>Retencion</th>
                <th style={thNumero}>Liquido</th>
                <th style={th}>Estado</th>
                <th style={thAccion}>Accion</th>
              </tr>
            </thead>

            <tbody>
              {honorarios.map((item) => (
                <tr key={item.id}>
                  <td style={td}>{fechaCL(item.fecha_emision)}</td>
                  <td style={td}>{item.folio}</td>
                  <td style={td}>{item.rut_prestador}</td>
                  <td style={td}>{item.nombre_prestador}</td>
                  <td style={td}>{item.glosa}</td>
                  <td style={tdNumero}>{formato(item.bruto)}</td>
                  <td style={tdNumero}>
                    {Number(item.tasa_retencion || 0).toLocaleString("es-CL")}%
                  </td>
                  <td style={tdNumero}>{formato(item.retencion)}</td>
                  <td style={tdNumero}>{formato(item.liquido)}</td>
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
                        style={botonContabilizar}
                        onClick={() => contabilizar(item.id)}
                        title="Contabilizar honorario"
                        aria-label="Contabilizar honorario"
                        >
                        {"\u2713"}
                        </button>
                    )}

                    {!item.contabilizado && (
                        <button
                        type="button"
                        style={botonEliminar}
                        onClick={() => anular(item.id)}
                        title="Anular honorario"
                        aria-label="Anular honorario"
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

              {honorarios.length === 0 && (
                <tr>
                  <td style={td} colSpan="11">
                    No hay honorarios para el rango seleccionado.
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

const formularioBox = {
  background: "white",
  borderRadius: "18px",
  padding: "25px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "20px",
};

const tituloSeccion = {
  color: "#0369a1",
  marginTop: 0,
};

const gridFormulario = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "#1e293b",
  marginTop: "10px",
  marginBottom: "5px",
};

const input = {
  width: "100%",
  padding: "10px",
  border: "1px solid #a9d8ef",
  borderRadius: "10px",
  boxSizing: "border-box",
  height: "40px",
};

const botonGuardar = {
  marginTop: "18px",
  background: "#10b981",
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
  background: "#0369a1",
  color: "white",
  border: "none",
  padding: "10px 20px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const botonExcel = {
  background: "#10b981",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const botonPDF = {
  background: "#ef4444",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: "9px",
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
  color: "#1e293b",
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
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  color: "#0369a1",
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
  borderBottom: "1px solid #e2e8f0",
  color: "#1e293b",
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

const botonAccionBase = {
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

const botonEliminar = {
  ...botonAccionBase,
  background: "linear-gradient(135deg, #ef4444, #f97316)",
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

const botonContabilizar = {
  ...botonAccionBase,
  background: "linear-gradient(135deg, #10b981, #06b6d4)",
  marginRight: "6px",
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
  color: "#475569",
  fontSize: "13px",
  fontWeight: "bold",
};
