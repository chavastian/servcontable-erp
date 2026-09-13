import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../../services/empresaService";
import { listarLiquidaciones } from "../../services/liquidacionesService";
import { obtenerPeriodoTrabajo } from "../../services/periodoTrabajoService";
import { listarHaberesDescuentos } from "../../services/haberesDescuentosService";
import PeriodoMesSelector from "../../components/PeriodoMesSelector";
import {
  DOCUMENT_THEME,
  asegurarEspacioPDF,
  crearPDFClasico,
  encabezadoPDFClasico,
  escribirParrafoPDF,
  paginaPDF,
  piePaginasPDFClasico,
  seccionPDFClasica,
  tablaPDFClasica,
} from "../../utils/documentTheme";

export default function LiquidacionPDF() {
  const empresaActiva = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [liquidacionId, setLiquidacionId] = useState("");
  const [liquidacionSeleccionada, setLiquidacionSeleccionada] = useState(null);
  const [detalleConceptos, setDetalleConceptos] = useState({
    haberes_no_imponibles: [],
    descuentos_variables: [],
  });

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (empresaActiva) {
      cargarLiquidaciones();
    }
  }, []);

  async function cargarLiquidaciones() {
    try {
      setMensaje("");
      setError("");

      const data = await listarLiquidaciones(empresaActiva.id, periodo);

      setLiquidaciones(data.liquidaciones || []);
      setLiquidacionId("");
      setLiquidacionSeleccionada(null);
      setDetalleConceptos({
        haberes_no_imponibles: [],
        descuentos_variables: [],
      });

      setMensaje("Liquidaciones cargadas correctamente.");
    } catch (err) {
      setError(err.message);
    }
  }

  function agruparConceptos(items = [], tipo) {
    const mapa = new Map();

    for (const item of items) {
      if (item.tipo !== tipo) continue;

      const nombre = String(item.nombre || "").trim() || "Concepto sin nombre";
      const monto = Number(item.monto || 0);
      mapa.set(nombre, (mapa.get(nombre) || 0) + monto);
    }

    return Array.from(mapa.entries())
      .map(([concepto, monto]) => ({ concepto, monto }))
      .sort((a, b) => a.concepto.localeCompare(b.concepto, "es"));
  }

  async function cargarDetalleConceptos(item) {
    if (!item?.trabajador_id || !item?.periodo) {
      setDetalleConceptos({
        haberes_no_imponibles: [],
        descuentos_variables: [],
      });
      return;
    }

    try {
      const data = await listarHaberesDescuentos(
        empresaActiva.id,
        item.periodo,
        item.trabajador_id,
        true
      );

      const lista = data.items || [];

      setDetalleConceptos({
        haberes_no_imponibles: agruparConceptos(lista, "HABER_NO_IMPONIBLE"),
        descuentos_variables: agruparConceptos(lista, "DESCUENTO"),
      });
    } catch {
      setDetalleConceptos({
        haberes_no_imponibles: [],
        descuentos_variables: [],
      });
    }
  }

  async function seleccionarLiquidacion(id) {
    setLiquidacionId(id);

    const encontrada = liquidaciones.find(
      (item) => String(item.id) === String(id)
    );

    setLiquidacionSeleccionada(encontrada || null);

    if (encontrada) {
      await cargarDetalleConceptos(encontrada);
    } else {
      setDetalleConceptos({
        haberes_no_imponibles: [],
        descuentos_variables: [],
      });
    }
  }
  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  function numero(valor) {
    return Number(valor || 0);
  }

  function fechaCL(fecha) {
    if (!fecha) return "";

    const texto = String(fecha).substring(0, 10);
    const partes = texto.split("-");

    if (partes.length !== 3) return texto;

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  function nombreTrabajador(item) {
    return `${item?.nombres || ""} ${item?.apellidos || ""}`.trim();
  }

  function detalleConceptosTexto(items = []) {
    if (!Array.isArray(items) || items.length === 0) {
      return "Sin conceptos.";
    }

    return items
      .map((item) => `${item.concepto}: ${formato(item.monto)}`)
      .join(" | ");
  }

  function exportarPDF() {
    if (!liquidacionSeleccionada) {
      setError("Debes seleccionar una liquidación antes de exportar.");
      return;
    }

    const item = liquidacionSeleccionada;
    const doc = crearPDFClasico({ orientation: "p", format: "a4" });

    const margenX = 12;
    const { ancho: anchoPagina } = paginaPDF(doc);
    const anchoUtil = anchoPagina - margenX * 2;

    const monto = (valor) => `$ ${numero(valor).toLocaleString("es-CL")}`;
    const textoPlano = (valor, defecto = "-") => {
      const texto = String(valor ?? "").replace(/\s+/g, " ").trim();
      return texto || defecto;
    };

    const mesTexto = (() => {
      const texto = String(periodo || "");
      const partes = texto.split("-");
      if (partes.length !== 2) return texto;
      const meses = [
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Septiembre",
        "Octubre",
        "Noviembre",
        "Diciembre",
      ];
      const idx = Number(partes[1]) - 1;
      if (idx < 0 || idx > 11) return texto;
      return `${meses[idx]} ${partes[0]}`;
    })();

    const tasaAfp = Number(item.tasa_afp || 0);
    const previsionTexto = `${item.afp || "-"}` + (tasaAfp > 0
      ? ` (${tasaAfp.toLocaleString("es-CL", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}%)`
      : "");

    const uf = Number(item.valor_uf || 0);
    const ufTexto =
      uf > 0
        ? `$ ${uf.toLocaleString("es-CL", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
        : "-";

    const haberesImponibles = [];
    if (numero(item.sueldo_proporcional || item.sueldo_base) > 0) {
      haberesImponibles.push([
        "Sueldo Base",
        monto(item.sueldo_proporcional || item.sueldo_base),
      ]);
    }
    if (numero(item.gratificacion) > 0) {
      haberesImponibles.push(["Gratificación", monto(item.gratificacion)]);
    }
    if (numero(item.monto_horas_extras) > 0) {
      haberesImponibles.push(["Horas extras", monto(item.monto_horas_extras)]);
    }
    if (numero(item.variables_haberes_imponibles) > 0) {
      haberesImponibles.push([
        "Variables imponibles",
        monto(item.variables_haberes_imponibles),
      ]);
    }
    if (haberesImponibles.length === 0) {
      haberesImponibles.push(["Sin haberes imponibles", "$ 0"]);
    }

    const haberesNoImponibles = [];
    if (detalleConceptos.haberes_no_imponibles.length > 0) {
      for (const detalle of detalleConceptos.haberes_no_imponibles) {
        haberesNoImponibles.push([detalle.concepto, monto(detalle.monto)]);
      }
    } else if (numero(item.variables_haberes_no_imponibles) > 0) {
      haberesNoImponibles.push([
        "Haberes no imponibles",
        monto(item.variables_haberes_no_imponibles),
      ]);
    } else {
      haberesNoImponibles.push(["Sin haberes no imponibles", "$ 0"]);
    }

    const descuentosLegales = [];
    if (numero(item.descuento_afp) > 0) {
      descuentosLegales.push([
        "Cotiz. Previ. Obligatoria",
        monto(item.descuento_afp),
      ]);
    }
    if (numero(item.descuento_salud) > 0) {
      descuentosLegales.push([
        "Cotiz. Salud Obligatoria",
        monto(item.descuento_salud),
      ]);
    }
    if (numero(item.descuento_afc) > 0) {
      descuentosLegales.push(["Cotiz. AFC Trabajador", monto(item.descuento_afc)]);
    }
    if (numero(item.impuesto_unico) > 0) {
      descuentosLegales.push(["Impuesto Único", monto(item.impuesto_unico)]);
    }
    if (numero(item.descuento_ausencias) > 0) {
      descuentosLegales.push(["Desc. ausencias", monto(item.descuento_ausencias)]);
    }
    if (descuentosLegales.length === 0) {
      descuentosLegales.push(["Sin descuentos legales", "$ 0"]);
    }

    const otrosDescuentos = [];
    if (detalleConceptos.descuentos_variables.length > 0) {
      for (const detalle of detalleConceptos.descuentos_variables) {
        otrosDescuentos.push([detalle.concepto, monto(detalle.monto)]);
      }
    } else if (numero(item.variables_descuentos) > 0) {
      otrosDescuentos.push(["Descuentos variables", monto(item.variables_descuentos)]);
    } else {
      otrosDescuentos.push(["Sin descuentos variables", "$ 0"]);
    }

    const totalDescuentosLegales =
      numero(item.descuento_afp) +
      numero(item.descuento_salud) +
      numero(item.descuento_afc) +
      numero(item.impuesto_unico) +
      numero(item.descuento_ausencias);
    const totalOtrosDescuentos =
      detalleConceptos.descuentos_variables.length > 0
        ? detalleConceptos.descuentos_variables.reduce(
            (acc, detalle) => acc + numero(detalle.monto),
            0
          )
        : numero(item.variables_descuentos);

    let y = encabezadoPDFClasico(doc, {
      titulo: "Liquidación de Sueldo",
      empresa: empresaActiva?.razon_social,
      rut: empresaActiva?.rut,
      periodo: mesTexto,
      margenX,
    });

    const asegurarEspacio = (altoNecesario) => {
      const nuevoY = asegurarEspacioPDF(doc, y, altoNecesario, 18);
      if (nuevoY !== y) {
        y = nuevoY;
      }
    };

    const dibujarTablaDetalle = (titulo, total, filas) => {
      asegurarEspacio(26);
      tablaPDFClasica(doc, {
        startY: y,
        margin: { left: margenX, right: margenX },
        head: [[titulo, total]],
        body: filas,
        styles: {
          fontSize: 8.2,
          cellPadding: 1.7,
        },
        columnStyles: {
          0: { cellWidth: anchoUtil - 42 },
          1: { cellWidth: 42, halign: "right", fontStyle: "bold" },
        },
        didParseCell: (data) => {
          if (data.section === "head" && data.column.index === 1) {
            data.cell.styles.halign = "right";
          }
        },
      });
      y = doc.lastAutoTable.finalY + 4;
    };

    const filaEncabezado = (titulo, total) => [
      {
        content: titulo,
        styles: {
          fontStyle: "bold",
          lineWidth: DOCUMENT_THEME.line.strong,
        },
      },
      {
        content: total,
        styles: {
          fontStyle: "bold",
          halign: "right",
          lineWidth: DOCUMENT_THEME.line.strong,
        },
      },
    ];

    const filaTotal = (titulo, total) => [
      {
        content: titulo,
        styles: {
          fontStyle: "bold",
          lineWidth: DOCUMENT_THEME.line.strong,
        },
      },
      {
        content: total,
        styles: {
          fontStyle: "bold",
          halign: "right",
          lineWidth: DOCUMENT_THEME.line.strong,
        },
      },
    ];

    const dibujarTablaColumna = (x, ancho, filas) => {
      tablaPDFClasica(doc, {
        startY: y,
        margin: { left: x, right: anchoPagina - x - ancho },
        body: filas,
        styles: {
          fontSize: 7.7,
          cellPadding: 1.45,
          overflow: "linebreak",
          valign: "top",
        },
        columnStyles: {
          0: { cellWidth: ancho - 33 },
          1: { cellWidth: 33, halign: "right", fontStyle: "bold" },
        },
      });

      return doc.lastAutoTable.finalY;
    };

    y = seccionPDFClasica(doc, "Información general", y, { margenX });

    tablaPDFClasica(doc, {
      startY: y,
      margin: { left: margenX, right: margenX },
      body: [
        ["Trabajador", textoPlano(nombreTrabajador(item)), "RUT", textoPlano(item.rut)],
        ["Cargo", textoPlano(item.cargo), "Contrato", textoPlano(item.tipo_contrato)],
        [
          "Inicio contrato",
          textoPlano(fechaCL(item.fecha_ingreso)),
          "Días trabajados",
          `${numero(item.dias_trabajados)} días`,
        ],
        ["Previsión", textoPlano(previsionTexto), "Salud", textoPlano(item.salud)],
        [
          "UF",
          ufTexto,
          "Sueldo base",
          monto(item.sueldo_proporcional || item.sueldo_base),
        ],
      ],
      styles: {
        fontSize: 7.8,
        cellPadding: 1.55,
        overflow: "linebreak",
        valign: "top",
      },
      columnStyles: {
        0: { cellWidth: 32, fontStyle: "bold" },
        1: { cellWidth: 74 },
        2: { cellWidth: 33, fontStyle: "bold" },
        3: { cellWidth: anchoUtil - 32 - 74 - 33 },
      },
    });

    y = doc.lastAutoTable.finalY + 6;

    asegurarEspacio(22);
    tablaPDFClasica(doc, {
      startY: y,
      margin: { left: margenX, right: margenX },
      body: [
        [
          "TOTAL HABERES",
          monto(item.total_haberes),
          "TOTAL DESCUENTOS",
          monto(item.total_descuentos),
          "LIQUIDO A PAGAR",
          monto(item.liquido_pagar),
        ],
      ],
      styles: {
        fontSize: 8.2,
        cellPadding: 1.8,
        fontStyle: "bold",
        lineWidth: DOCUMENT_THEME.line.strong,
      },
      columnStyles: {
        0: { cellWidth: 31 },
        1: { cellWidth: 28, halign: "right" },
        2: { cellWidth: 39 },
        3: { cellWidth: 28, halign: "right" },
        4: { cellWidth: 34 },
        5: { cellWidth: anchoUtil - 160, halign: "right" },
      },
    });
    y = doc.lastAutoTable.finalY + 6;

    const filasHaberes = [
      filaEncabezado("HABERES IMPONIBLES", monto(item.total_haberes_imponibles)),
      ...haberesImponibles,
      filaEncabezado(
        "HABERES NO IMPONIBLES",
        monto(item.total_haberes_no_imponibles)
      ),
      ...haberesNoImponibles,
      filaTotal("TOTAL HABERES", monto(item.total_haberes)),
    ];
    const filasDescuentos = [
      filaEncabezado("DESCUENTOS LEGALES", monto(totalDescuentosLegales)),
      ...descuentosLegales,
      filaEncabezado("OTROS DESCUENTOS", monto(totalOtrosDescuentos)),
      ...otrosDescuentos,
      filaTotal("TOTAL DESCUENTOS", monto(item.total_descuentos)),
    ];
    const conceptosDetalle = [
      ...haberesImponibles,
      ...haberesNoImponibles,
      ...descuentosLegales,
      ...otrosDescuentos,
    ].map(([concepto]) => String(concepto || ""));
    const usarColumnasDetalle =
      haberesImponibles.length + haberesNoImponibles.length <= 7 &&
      descuentosLegales.length + otrosDescuentos.length <= 7 &&
      conceptosDetalle.every((concepto) => concepto.length <= 55);

    y = seccionPDFClasica(doc, "Detalle de haberes y descuentos", y, {
      margenX,
    });

    if (usarColumnasDetalle) {
      const espacioColumnas = Math.max(
        filasHaberes.length,
        filasDescuentos.length
      ) * 6.5;
      asegurarEspacio(espacioColumnas + 6);
      const anchoColumna = (anchoUtil - 6) / 2;
      const finalHaberes = dibujarTablaColumna(
        margenX,
        anchoColumna,
        filasHaberes
      );
      const finalDescuentos = dibujarTablaColumna(
        margenX + anchoColumna + 6,
        anchoColumna,
        filasDescuentos
      );

      y = Math.max(finalHaberes, finalDescuentos) + 4;
    } else {
      dibujarTablaDetalle(
        "HABERES IMPONIBLES",
        monto(item.total_haberes_imponibles),
        haberesImponibles
      );
      dibujarTablaDetalle(
        "HABERES NO IMPONIBLES",
        monto(item.total_haberes_no_imponibles),
        haberesNoImponibles
      );
      dibujarTablaDetalle(
        "DESCUENTOS LEGALES",
        monto(totalDescuentosLegales),
        descuentosLegales
      );
      dibujarTablaDetalle(
        "OTROS DESCUENTOS",
        monto(totalOtrosDescuentos),
        otrosDescuentos
      );
    }

    asegurarEspacio(22);
    tablaPDFClasica(doc, {
      startY: y,
      margin: { left: margenX, right: margenX },
      styles: {
        fontSize: 8,
        cellPadding: 1.7,
        fontStyle: "bold",
        overflow: "linebreak",
      },
      body: [
        [
          `IMP. PREV./SALUD: ${monto(item.base_afecta_descuentos)}`,
          `IMP. CESANTÍA: ${monto(item.base_afecta_descuentos)}`,
          `BASE TRIBUTABLE: ${monto(item.base_tributable)}`,
        ],
      ],
      columnStyles: {
        0: { halign: "center" },
        1: { halign: "center" },
        2: { halign: "center" },
      },
    });

    y = doc.lastAutoTable.finalY + 3;
    asegurarEspacio(18);

    tablaPDFClasica(doc, {
      startY: y,
      margin: { left: margenX, right: margenX },
      styles: {
        fontSize: 11.5,
        cellPadding: 3,
        lineWidth: DOCUMENT_THEME.line.strong,
        fontStyle: "bold",
      },
      body: [[`LÍQUIDO A RECIBIR: ${monto(item.liquido_pagar)}`]],
      columnStyles: {
        0: { halign: "center" },
      },
    });

    y = doc.lastAutoTable.finalY + 11;

    const textoCertificado =
      `Certifico que he recibido de ${empresaActiva?.razon_social || ""} (${empresaActiva?.rut || ""}) ` +
      "a mi entera satisfacción el saldo indicado en la presente liquidación y no tengo cargo ni cobro posterior que hacer.";
    const certificadoLineas = doc.splitTextToSize(textoCertificado, anchoUtil - 4);
    asegurarEspacio(certificadoLineas.length * 4.5 + 34);

    doc.setFont(DOCUMENT_THEME.font, "normal");
    doc.setFontSize(8.8);
    doc.setTextColor(...DOCUMENT_THEME.color.black);
    y = escribirParrafoPDF(doc, textoCertificado, y, {
      x: margenX + 2,
      ancho: anchoUtil - 4,
      lineHeight: 4.2,
    });

    y += 18;
    doc.setDrawColor(...DOCUMENT_THEME.color.black);
    doc.setLineWidth(DOCUMENT_THEME.line.normal);
    doc.line(margenX + anchoUtil / 2 - 35, y, margenX + anchoUtil / 2 + 35, y);
    doc.setFont(DOCUMENT_THEME.font, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...DOCUMENT_THEME.color.black);
    doc.text("FIRMA CONFORME", margenX + anchoUtil / 2, y + 6, {
      align: "center",
    });

    piePaginasPDFClasico(doc, {
      texto: "ServContable PRO - Liquidación de sueldo",
      margenX,
    });

    const marcaTiempo = new Date()
      .toISOString()
      .replace(/[:T]/g, "-")
      .slice(0, 16);
    const nombreArchivo = `Liquidacion_${periodo}_${item.rut || "trabajador"}_${marcaTiempo}.pdf`;

    doc.save(nombreArchivo);
  }
  return (
    <div>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <div style={card}>
        <h2 style={tituloSeccion}>Liquidación PDF individual</h2>

        <div style={filtros}>
          <div>
            <label style={label}>Período</label>
            <PeriodoMesSelector style={input} value={periodo} onChange={setPeriodo} />
          </div>

          <button style={botonBuscar} onClick={cargarLiquidaciones}>
            Buscar liquidaciones
          </button>
        </div>
      </div>

      <div style={card}>
        <h2 style={tituloSeccion}>Seleccionar trabajador</h2>

        <div style={grid}>
          <div>
            <label style={label}>Liquidación</label>
            <select
              style={inputFull}
              value={liquidacionId}
              onChange={(e) => seleccionarLiquidacion(e.target.value)}
            >
              <option value="">Seleccionar liquidación</option>

              {liquidaciones.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.rut} - {nombreTrabajador(item)} - Líquido{" "}
                  {formato(item.liquido_pagar)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label}>Acción</label>
            <button style={botonPDF} onClick={exportarPDF}>
              Exportar PDF
            </button>
          </div>
        </div>
      </div>

      {liquidacionSeleccionada && (
        <div style={cardResultado}>
          <h2 style={tituloSeccion}>Vista previa de liquidación</h2>

          {numero(liquidacionSeleccionada.descuento_ausencias) > 0 && (
            <div style={alertaAusencias}>
              Esta liquidación incluye descuento por ausencias, permisos sin
              goce, atrasos o suspensiones:{" "}
              <strong>
                {formato(liquidacionSeleccionada.descuento_ausencias)}
              </strong>
            </div>
          )}

          <div style={gridResumen}>
            <Resumen
              label="Trabajador"
              valor={nombreTrabajador(liquidacionSeleccionada)}
            />
            <Resumen label="RUT" valor={liquidacionSeleccionada.rut} />
            <Resumen label="Cargo" valor={liquidacionSeleccionada.cargo} />
            <Resumen label="AFP" valor={liquidacionSeleccionada.afp} />
            <Resumen label="Salud" valor={liquidacionSeleccionada.salud} />
            <Resumen
              label="Días trabajados"
              valor={liquidacionSeleccionada.dias_trabajados}
            />
            <Resumen
              label="Días ausencia"
              valor={liquidacionSeleccionada.dias_ausencia || 0}
            />
            <Resumen
              label="Desc. ausencias"
              valor={formato(liquidacionSeleccionada.descuento_ausencias)}
            />
            <Resumen
              label="Variables imponibles"
              valor={formato(
                liquidacionSeleccionada.variables_haberes_imponibles
              )}
            />
            <Resumen
              label="Horas extras"
              valor={formato(liquidacionSeleccionada.monto_horas_extras)}
              detalle={`${Number(liquidacionSeleccionada.horas_extras || 0).toLocaleString("es-CL")} hrs x ${formato(liquidacionSeleccionada.valor_hora_extra)}`}
            />
            <Resumen
              label="Variables no imponibles"
              valor={formato(
                liquidacionSeleccionada.variables_haberes_no_imponibles
              )}
              detalle={detalleConceptosTexto(detalleConceptos.haberes_no_imponibles)}
            />
            <Resumen
              label="Variables descuentos"
              valor={formato(liquidacionSeleccionada.variables_descuentos)}
              detalle={detalleConceptosTexto(detalleConceptos.descuentos_variables)}
            />
            <Resumen
              label="Total haberes"
              valor={formato(liquidacionSeleccionada.total_haberes)}
            />
            <Resumen
              label="Total descuentos"
              valor={formato(liquidacionSeleccionada.total_descuentos)}
            />
            <Resumen
              label="Líquido a pagar"
              valor={formato(liquidacionSeleccionada.liquido_pagar)}
              destacado
            />
          </div>
        </div>
      )}

      <div style={card}>
        <h2 style={tituloSeccion}>Liquidaciones disponibles</h2>

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>RUT</th>
                <th style={th}>Trabajador</th>
                <th style={th}>Cargo</th>
                <th style={thNumero}>Haberes</th>
                <th style={thNumero}>Descuentos</th>
                <th style={thNumero}>Desc. ausencias</th>
                <th style={thNumero}>Líquido</th>
                <th style={th}>Estado</th>
                <th style={th}>Contab.</th>
              </tr>
            </thead>

            <tbody>
              {liquidaciones.map((item) => (
                <tr key={item.id}>
                  <td style={td}>{item.rut}</td>
                  <td style={td}>{nombreTrabajador(item)}</td>
                  <td style={td}>{item.cargo}</td>
                  <td style={tdNumero}>{formato(item.total_haberes)}</td>
                  <td style={tdNumero}>{formato(item.total_descuentos)}</td>
                  <td style={tdNumero}>{formato(item.descuento_ausencias)}</td>
                  <td style={tdNumero}>{formato(item.liquido_pagar)}</td>
                  <td style={td}>{item.estado}</td>
                  <td style={td}>
                    {item.contabilizada ? (
                      <span style={badgeOk}>Sí</span>
                    ) : (
                      <span style={badgePendiente}>No</span>
                    )}
                  </td>
                </tr>
              ))}

              {liquidaciones.length === 0 && (
                <tr>
                  <td style={td} colSpan="9">
                    No hay liquidaciones emitidas para este período.
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

function Resumen({ label, valor, detalle, destacado }) {
  return (
    <div style={destacado ? resumenDestacado : resumen}>
      <strong>{label}</strong>
      <span>{valor}</span>
      {detalle ? <small style={detalleResumen}>{detalle}</small> : null}
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

const cardResultado = {
  ...card,
  border: "2px solid #0ea5e9",
};

const tituloSeccion = {
  color: "#0369a1",
  marginTop: 0,
};

const filtros = {
  display: "flex",
  alignItems: "end",
  gap: "12px",
  flexWrap: "wrap",
};

const grid = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, 1fr) 180px",
  gap: "14px",
  alignItems: "end",
};

const gridResumen = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "12px",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "#1e293b",
  marginBottom: "5px",
};

const input = {
  width: "170px",
  padding: "10px",
  border: "1px solid #a9d8ef",
  borderRadius: "10px",
  height: "40px",
  boxSizing: "border-box",
};

const inputFull = {
  ...input,
  width: "100%",
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
  background: "#0369a1",
};

const botonPDF = {
  ...botonBase,
  background: "#ef4444",
  width: "100%",
};

const resumen = {
  background: "#f8fcff",
  padding: "14px",
  borderRadius: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  color: "#1e293b",
};

const detalleResumen = {
  color: "#475569",
  fontSize: "12px",
  lineHeight: 1.4,
};

const resumenDestacado = {
  ...resumen,
  background: "#dcfce7",
  color: "#166534",
  fontWeight: "bold",
};

const alertaAusencias = {
  background: "#fff7ed",
  border: "1px solid #fdba74",
  color: "#9a3412",
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
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  color: "#0369a1",
  whiteSpace: "nowrap",
};

const thNumero = {
  ...th,
  textAlign: "right",
};

const td = {
  padding: "9px",
  borderBottom: "1px solid #e2e8f0",
  color: "#1e293b",
};

const tdNumero = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
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

const ok = {
  color: "#10b981",
  fontWeight: "bold",
};

const err = {
  color: "#ef4444",
  fontWeight: "bold",
};


