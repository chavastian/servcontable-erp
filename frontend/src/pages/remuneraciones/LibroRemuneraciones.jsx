import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../../services/empresaService";
import { listarLiquidaciones, descargarLre } from "../../services/liquidacionesService";
import { obtenerPeriodoTrabajo } from "../../services/periodoTrabajoService";
import PeriodoMesSelector from "../../components/PeriodoMesSelector";
import * as XLSX from "xlsx";
import {
  crearPDFClasico,
  encabezadoPDFClasico,
  marcarFilaTotalPDF,
  paginaPDF,
  piePaginasPDFClasico,
  seccionPDFClasica,
  tablaPDFClasica,
} from "../../utils/documentTheme";

export default function LibroRemuneraciones() {
  const empresaActiva = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [liquidaciones, setLiquidaciones] = useState([]);

  const [totales, setTotales] = useState({
    total_haberes: 0,
    total_descuentos: 0,
    liquido_pagar: 0,
    costo_empresa: 0,
    descuento_ausencias: 0,
    dias_ausencia: 0,
  });

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (empresaActiva) {
      cargarLibro();
    }
  }, []);

  async function cargarLibro() {
    try {
      setMensaje("");
      setError("");

      const data = await listarLiquidaciones(empresaActiva.id, periodo);

      setLiquidaciones(data.liquidaciones || []);

      setTotales(
        data.totales || {
          total_haberes: 0,
          total_descuentos: 0,
          liquido_pagar: 0,
          costo_empresa: 0,
          descuento_ausencias: 0,
          dias_ausencia: 0,
        }
      );

      setMensaje("Libro de remuneraciones actualizado correctamente.");
    } catch (err) {
      setError(err.message);
    }
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  function numero(valor) {
    return Number(valor || 0);
  }

  function nombreTrabajador(item) {
    return `${item.nombres || ""} ${item.apellidos || ""}`.trim();
  }

  // Archivo de carga del LRE de la Dirección del Trabajo. Primera versión:
  // los códigos requieren validación contra el formato vigente.
  async function exportarLreClick() {
    try {
      setMensaje("");
      setError("");

      const blob = await descargarLre(empresaActiva.id, periodo);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");

      enlace.href = url;
      enlace.download = `LRE_${periodo}.csv`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);

      setMensaje("Archivo LRE generado. Revisa los códigos contra el formato vigente de la DT antes de cargarlo.");
    } catch (err) {
      setError(err.message);
    }
  }

  function exportarExcel() {
    const data = [];

    data.push(["LIBRO DE REMUNERACIONES"]);
    data.push([`Empresa: ${empresaActiva?.razon_social || ""}`]);
    data.push([`RUT: ${empresaActiva?.rut || ""}`]);
    data.push([`Período: ${periodo}`]);
    data.push([`Fecha emisión: ${new Date().toLocaleDateString("es-CL")}`]);
    data.push([]);

    data.push([
      "RUT",
      "Trabajador",
      "Cargo",
      "AFP",
      "Salud",
      "Días trabajados",
      "Días ausencia",
      "Sueldo base",
      "Sueldo proporcional",
      "Gratificación",
      "Horas extras",
      "Variables imponibles",
      "Variables no imponibles",
      "Variables descuentos",
      "Desc. ausencias",
      "Base imponible",
      "Base afecta descuentos",
      "Haberes imponibles",
      "Haberes no imponibles",
      "Total haberes",
      "Descuento AFP",
      "Descuento salud",
      "Descuento AFC",
      "Impuesto único",
      "Otros descuentos",
      "Total descuentos",
      "Líquido a pagar",
      "SIS empleador",
      "AFC empleador",
      "Mutual empleador",
      "Costo empresa",
      "Estado",
    ]);

    liquidaciones.forEach((item) => {
      data.push([
        item.rut || "",
        nombreTrabajador(item),
        item.cargo || "",
        item.afp || "",
        item.salud || "",
        numero(item.dias_trabajados),
        numero(item.dias_ausencia),
        numero(item.sueldo_base),
        numero(item.sueldo_proporcional),
        numero(item.gratificacion),
        numero(item.monto_horas_extras),
        numero(item.variables_haberes_imponibles),
        numero(item.variables_haberes_no_imponibles),
        numero(item.variables_descuentos),
        numero(item.descuento_ausencias),
        numero(item.base_imponible),
        numero(item.base_afecta_descuentos),
        numero(item.total_haberes_imponibles),
        numero(item.total_haberes_no_imponibles),
        numero(item.total_haberes),
        numero(item.descuento_afp),
        numero(item.descuento_salud),
        numero(item.descuento_afc),
        numero(item.impuesto_unico),
        numero(item.otros_descuentos),
        numero(item.total_descuentos),
        numero(item.liquido_pagar),
        numero(item.aporte_sis_empleador),
        numero(item.aporte_afc_empleador),
        numero(item.aporte_mutual_empleador),
        numero(item.costo_empresa),
        item.estado || "",
      ]);
    });

    data.push([]);
    data.push([
      "TOTALES",
      "",
      "",
      "",
      "",
      "",
      numero(totales.dias_ausencia),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      numero(totales.descuento_ausencias),
      "",
      "",
      "",
      "",
      numero(totales.total_haberes),
      "",
      "",
      "",
      "",
      "",
      numero(totales.total_descuentos),
      numero(totales.liquido_pagar),
      "",
      "",
      "",
      numero(totales.costo_empresa),
      "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws["!cols"] = [
      { wch: 14 },
      { wch: 35 },
      { wch: 22 },
      { wch: 15 },
      { wch: 15 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 20 },
      { wch: 16 },
      { wch: 16 },
      { wch: 22 },
      { wch: 24 },
      { wch: 20 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
      { wch: 20 },
      { wch: 22 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Libro Remuneraciones");

    XLSX.writeFile(wb, `Libro_Remuneraciones_${periodo}.xlsx`);
  }

  function exportarPDF() {
    const doc = crearPDFClasico({ orientation: "l", format: "a4" });
    const margenX = 10;
    const { ancho: anchoPagina, alto: altoPagina } = paginaPDF(doc);
    const yInicio = encabezadoPDFClasico(doc, {
      titulo: "Libro de Remuneraciones",
      empresa: empresaActiva?.razon_social,
      rut: empresaActiva?.rut,
      periodo,
      margenX,
    });

    tablaPDFClasica(doc, {
      startY: yInicio + 1,
      head: [
        [
          "RUT",
          "Trabajador",
          "Cargo",
          "Días",
          "Aus.",
          "Desc. Aus.",
          "Haberes",
          "Descuentos",
          "Líquido",
          "Costo Empresa",
          "Estado",
        ],
      ],
      body: [
        ...liquidaciones.map((item) => [
          item.rut || "",
          nombreTrabajador(item),
          item.cargo || "",
          numero(item.dias_trabajados).toLocaleString("es-CL"),
          numero(item.dias_ausencia).toLocaleString("es-CL"),
          numero(item.descuento_ausencias).toLocaleString("es-CL"),
          numero(item.total_haberes).toLocaleString("es-CL"),
          numero(item.total_descuentos).toLocaleString("es-CL"),
          numero(item.liquido_pagar).toLocaleString("es-CL"),
          numero(item.costo_empresa).toLocaleString("es-CL"),
          item.estado || "",
        ]),
        [
          "TOTAL",
          "",
          "",
          "",
          numero(totales.dias_ausencia).toLocaleString("es-CL"),
          numero(totales.descuento_ausencias).toLocaleString("es-CL"),
          numero(totales.total_haberes).toLocaleString("es-CL"),
          numero(totales.total_descuentos).toLocaleString("es-CL"),
          numero(totales.liquido_pagar).toLocaleString("es-CL"),
          numero(totales.costo_empresa).toLocaleString("es-CL"),
          "",
        ],
      ],
      margin: { left: margenX, right: margenX },
      styles: {
        fontSize: 6.4,
        cellPadding: 1.2,
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 48 },
        2: { cellWidth: 32 },
        3: { cellWidth: 12, halign: "right" },
        4: { cellWidth: 12, halign: "right" },
        5: { cellWidth: 24, halign: "right" },
        6: { cellWidth: 26, halign: "right" },
        7: { cellWidth: 26, halign: "right" },
        8: { cellWidth: 26, halign: "right" },
        9: { cellWidth: 28, halign: "right" },
        10: { cellWidth: 18 },
      },
      didParseCell: function (data) {
        marcarFilaTotalPDF(data, data.row.raw?.[0] === "TOTAL");
      },
    });

    let y = doc.lastAutoTable.finalY + 10;

    if (y < altoPagina - 45) {
      y = seccionPDFClasica(doc, "Resumen del período", y, { margenX });

      tablaPDFClasica(doc, {
        startY: y,
        head: [["Concepto", "Monto"]],
        body: [
          [
            "Total haberes",
            numero(totales.total_haberes).toLocaleString("es-CL"),
          ],
          [
            "Total descuentos",
            numero(totales.total_descuentos).toLocaleString("es-CL"),
          ],
          [
            "Descuento ausencias",
            numero(totales.descuento_ausencias).toLocaleString("es-CL"),
          ],
          [
            "Líquido a pagar",
            numero(totales.liquido_pagar).toLocaleString("es-CL"),
          ],
          [
            "Costo empresa",
            numero(totales.costo_empresa).toLocaleString("es-CL"),
          ],
        ],
        margin: { left: margenX, right: anchoPagina - 120 },
        styles: {
          fontSize: 8,
          cellPadding: 2,
        },
        columnStyles: {
          1: { halign: "right" },
        },
      });
    }

    piePaginasPDFClasico(doc, { texto: "Libro de Remuneraciones", margenX });

    doc.save(`Libro_Remuneraciones_${periodo}.pdf`);
  }

  return (
    <div>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <div style={card}>
        <h2 style={tituloSeccion}>Libro de Remuneraciones</h2>

        <div style={filtros}>
          <div>
            <label style={label}>Período</label>
            <PeriodoMesSelector style={input} value={periodo} onChange={setPeriodo} />
          </div>

          <button type="button" style={botonBuscar} onClick={cargarLibro}>
            Buscar
          </button>

          <button type="button" style={botonExcel} onClick={exportarExcel}>
            Exportar Excel
          </button>

          <button type="button" style={botonPDF} onClick={exportarPDF}>
            Exportar PDF
          </button>

          <button type="button" style={botonExcel} onClick={exportarLreClick}>
            Archivo LRE (DT)
          </button>
        </div>
      </div>

      <div style={gridResumen}>
        <div style={cardResumen}>
          <strong>Total haberes</strong>
          <span>{formato(totales.total_haberes)}</span>
        </div>

        <div style={cardResumen}>
          <strong>Total descuentos</strong>
          <span>{formato(totales.total_descuentos)}</span>
        </div>

        <div style={cardResumen}>
          <strong>Desc. ausencias</strong>
          <span>{formato(totales.descuento_ausencias)}</span>
        </div>

        <div style={cardResumenVerde}>
          <strong>Líquido a pagar</strong>
          <span>{formato(totales.liquido_pagar)}</span>
        </div>

        <div style={cardResumen}>
          <strong>Costo empresa</strong>
          <span>{formato(totales.costo_empresa)}</span>
        </div>
      </div>

      <div style={card}>
        <h2 style={tituloSeccion}>Detalle mensual</h2>

        <div style={alerta}>
          Este libro muestra las liquidaciones emitidas del período. El descuento
          por ausencias ya viene incorporado dentro de total descuentos.
        </div>

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>RUT</th>
                <th style={th}>Trabajador</th>
                <th style={th}>Cargo</th>
                <th style={th}>AFP</th>
                <th style={th}>Salud</th>
                <th style={thNumero}>Días</th>
                <th style={thNumero}>Días ausencia</th>
                <th style={thNumero}>Var. imponibles</th>
                <th style={thNumero}>Var. no imponibles</th>
                <th style={thNumero}>Var. descuentos</th>
                <th style={thNumero}>Desc. ausencias</th>
                <th style={thNumero}>Haberes</th>
                <th style={thNumero}>Descuentos</th>
                <th style={thNumero}>Líquido</th>
                <th style={thNumero}>Costo empresa</th>
                <th style={th}>Estado</th>
              </tr>
            </thead>

            <tbody>
              {liquidaciones.map((item) => (
                <tr key={item.id}>
                  <td style={td}>{item.rut}</td>
                  <td style={td}>{nombreTrabajador(item)}</td>
                  <td style={td}>{item.cargo}</td>
                  <td style={td}>{item.afp}</td>
                  <td style={td}>{item.salud}</td>
                  <td style={tdNumero}>{numero(item.dias_trabajados)}</td>
                  <td style={tdNumero}>{numero(item.dias_ausencia)}</td>
                  <td style={tdNumero}>
                    {formato(item.variables_haberes_imponibles)}
                  </td>
                  <td style={tdNumero}>
                    {formato(item.variables_haberes_no_imponibles)}
                  </td>
                  <td style={tdNumero}>{formato(item.variables_descuentos)}</td>
                  <td style={tdNumero}>{formato(item.descuento_ausencias)}</td>
                  <td style={tdNumero}>{formato(item.total_haberes)}</td>
                  <td style={tdNumero}>{formato(item.total_descuentos)}</td>
                  <td style={tdNumero}>{formato(item.liquido_pagar)}</td>
                  <td style={tdNumero}>{formato(item.costo_empresa)}</td>
                  <td style={td}>{item.estado}</td>
                </tr>
              ))}

              {liquidaciones.length === 0 && (
                <tr>
                  <td style={td} colSpan="16">
                    No hay liquidaciones emitidas para este período.
                  </td>
                </tr>
              )}
            </tbody>

            {liquidaciones.length > 0 && (
              <tfoot>
                <tr>
                  <td style={tdTotal} colSpan="6">
                    TOTALES
                  </td>
                  <td style={tdTotalNumero}>{totales.dias_ausencia}</td>
                  <td style={tdTotal}></td>
                  <td style={tdTotal}></td>
                  <td style={tdTotal}></td>
                  <td style={tdTotalNumero}>
                    {formato(totales.descuento_ausencias)}
                  </td>
                  <td style={tdTotalNumero}>{formato(totales.total_haberes)}</td>
                  <td style={tdTotalNumero}>
                    {formato(totales.total_descuentos)}
                  </td>
                  <td style={tdTotalNumero}>{formato(totales.liquido_pagar)}</td>
                  <td style={tdTotalNumero}>{formato(totales.costo_empresa)}</td>
                  <td style={tdTotal}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

const card = {
  background: "white",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "20px",
};

const tituloSeccion = {
  color: "var(--sc-azul)",
  marginTop: 0,
};

const filtros = {
  display: "flex",
  alignItems: "end",
  gap: "12px",
  flexWrap: "wrap",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-text)",
  marginBottom: "5px",
};

const input = {
  width: "170px",
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "10px",
  height: "40px",
  boxSizing: "border-box",
};

const botonBase = {
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const botonBuscar = {
  ...botonBase,
  background: "var(--sc-azul)",
};

const botonExcel = {
  ...botonBase,
  background: "var(--sc-teal)",
};

const botonPDF = {
  ...botonBase,
  background: "var(--sc-danger)",
};

const gridResumen = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "14px",
  marginBottom: "20px",
};

const cardResumen = {
  background: "white",
  borderRadius: "16px",
  padding: "16px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  color: "var(--sc-text)",
};

const cardResumenVerde = {
  ...cardResumen,
  border: "1px solid #22c55e",
};

const alerta = {
  background: "var(--sc-naranja-fondo)",
  border: "1px solid #fed7aa",
  color: "var(--sc-naranja-texto)",
  padding: "12px",
  borderRadius: "12px",
  marginBottom: "16px",
  fontWeight: "bold",
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

const td = {
  padding: "9px",
  borderBottom: "1px solid var(--sc-borde-claro)",
  color: "var(--sc-text)",
};

const tdNumero = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const tdTotal = {
  ...td,
  fontWeight: "bold",
  background: "var(--sc-fondo-claro)",
  color: "var(--sc-azul)",
};

const tdTotalNumero = {
  ...tdTotal,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const ok = {
  color: "var(--sc-teal)",
  fontWeight: "bold",
};

const err = {
  color: "var(--sc-danger)",
  fontWeight: "bold",
};
