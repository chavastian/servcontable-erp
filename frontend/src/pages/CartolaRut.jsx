import { useState } from "react";
import * as XLSX from "xlsx";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerRangoAnualTrabajo } from "../services/periodoTrabajoService";
import {
  buscarTercerosCartola,
  obtenerCartolaRut,
} from "../services/cartolaRutService";
import {
  PRINT_STYLE_CLASICO,
  crearPDFClasico,
  encabezadoPDFClasico,
  marcarFilaTotalPDF,
  piePaginasPDFClasico,
  seccionPDFClasica,
  tablaPDFClasica,
} from "../utils/documentTheme";

const ORIGENES = [
  { value: "", label: "Todos" },
  { value: "ventas", label: "Ventas" },
  { value: "compras", label: "Compras" },
  { value: "honorarios", label: "Honorarios" },
  { value: "remuneraciones", label: "Remuneraciones" },
  { value: "pagos_cobros", label: "Pagos/Cobros" },
  { value: "contabilidad", label: "Contabilidad" },
];

const ROLES = [
  { value: "", label: "Todos" },
  { value: "cliente", label: "Cliente" },
  { value: "proveedor", label: "Proveedor" },
  { value: "prestador", label: "Prestador" },
  { value: "trabajador", label: "Trabajador" },
  { value: "auxiliar", label: "Auxiliar contable" },
];

const ESTADOS = [
  { value: "", label: "Todos" },
  { value: "pendiente", label: "Pendiente" },
  { value: "parcial", label: "Parcial" },
  { value: "pagado", label: "Pagado" },
  { value: "vigente", label: "Vigente" },
  { value: "anulado", label: "Anulado" },
  { value: "aplicado", label: "Aplicado" },
];

function formatoMonto(valor) {
  return `$${Number(valor || 0).toLocaleString("es-CL")}`;
}

function formatoNumero(valor) {
  return Number(valor || 0).toLocaleString("es-CL");
}

function fechaCL(fecha) {
  if (!fecha) return "-";
  const texto = String(fecha).substring(0, 10);
  const partes = texto.split("-");
  if (partes.length !== 3) return texto;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function estadoAmigable(estado) {
  const mapa = {
    pendiente: "Pendiente",
    parcial: "Parcial",
    pagado: "Pagado",
    vigente: "Vigente",
    anulado: "Anulado",
    aplicado: "Aplicado",
  };
  return mapa[String(estado || "").toLowerCase()] || estado || "-";
}

function origenAmigable(origen) {
  const item = ORIGENES.find((opcion) => opcion.value === origen);
  return item?.label || origen || "-";
}

function filasExcel(movimientos) {
  return movimientos.map((item) => [
    fechaCL(item.fecha),
    item.periodo || "",
    item.rol || "",
    origenAmigable(item.origen),
    item.tipo || "",
    item.documento_tipo || "",
    item.folio || "",
    item.rut_tercero || "",
    item.nombre_tercero || "",
    item.glosa || "",
    Number(item.cargo || 0),
    Number(item.abono || 0),
    Number(item.saldo_acumulado || 0),
    Number(item.saldo_pendiente || 0),
    estadoAmigable(item.estado_cartola),
    item.comprobante_id || "",
  ]);
}

export default function CartolaRut({ irVista }) {
  const empresaActiva = obtenerEmpresaActiva();
  const rangoInicial = obtenerRangoAnualTrabajo();

  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState(rangoInicial.fechaDesde);
  const [fechaHasta, setFechaHasta] = useState(rangoInicial.fechaHasta);
  const [vista, setVista] = useState("comercial");
  const [origen, setOrigen] = useState("");
  const [rol, setRol] = useState("");
  const [estado, setEstado] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [cartola, setCartola] = useState(null);
  const [sugerencias, setSugerencias] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const movimientos = cartola?.movimientos || [];
  const pendientes = cartola?.documentos_pendientes || [];
  const resumen = cartola?.resumen || {};
  const paginacion = cartola?.paginacion || { pagina: 1, paginas: 1, total: 0 };
  const esContable = vista === "contable";

  async function cargarDatos(paginaSolicitada = 1, busquedaManual = busqueda) {
    if (!empresaActiva) return;

    if (!String(busquedaManual || "").trim()) {
      setError("Ingresa un RUT, nombre o razon social para consultar.");
      setMensaje("");
      return;
    }

    try {
      setCargando(true);
      setError("");
      setMensaje("");

      const data = await obtenerCartolaRut({
        empresaId: empresaActiva.id,
        busqueda: busquedaManual,
        fechaDesde,
        fechaHasta,
        vista,
        origen,
        rol,
        estado,
        soloPendientes,
        pagina: paginaSolicitada,
        limite: 100,
      });

      setCartola(data);
      setPagina(paginaSolicitada);
      setMensaje("Cartola actualizada correctamente.");
    } catch (err) {
      setError(err.message);
      setCartola(null);
    } finally {
      setCargando(false);
    }
  }

  async function buscarTerceros() {
    if (!empresaActiva) return;

    try {
      setCargando(true);
      setError("");
      setMensaje("");

      const data = await buscarTercerosCartola(empresaActiva.id, busqueda, 30);
      setSugerencias(data.terceros || []);

      if ((data.terceros || []).length === 0) {
        setMensaje("No se encontraron terceros con esa busqueda.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  function seleccionarTercero(tercero) {
    const valor = tercero.rut || tercero.rut_limpio || tercero.nombre || "";
    setBusqueda(valor);
    setSugerencias([]);
    cargarDatos(1, valor);
  }

  function limpiarFiltros() {
    setOrigen("");
    setRol("");
    setEstado("");
    setSoloPendientes(false);
    setVista("comercial");
    setCartola(null);
    setSugerencias([]);
    setMensaje("");
    setError("");
    setPagina(1);
  }

  function exportarExcel() {
    if (!movimientos.length) {
      setError("No hay movimientos para exportar.");
      return;
    }

    const data = [
      ["CARTOLA DE MOVIMIENTOS POR RUT"],
      [`Empresa: ${empresaActiva?.razon_social || ""}`],
      [`RUT empresa: ${empresaActiva?.rut || ""}`],
      [`Tercero: ${busqueda}`],
      [`Desde: ${fechaDesde}`],
      [`Hasta: ${fechaHasta}`],
      [`Vista: ${vista}`],
      [],
      ["Resumen"],
      ["Saldo anterior", resumen.saldo_anterior || 0],
      ["Cargos", resumen.cargos || 0],
      ["Abonos", resumen.abonos || 0],
      ["Saldo actual", resumen.saldo_actual || 0],
      ["Pendiente por cobrar", resumen.pendiente_por_cobrar || 0],
      ["Pendiente por pagar", resumen.pendiente_por_pagar || 0],
      [],
      [
        "Fecha",
        "Periodo",
        "Rol",
        "Origen",
        "Tipo",
        "Documento",
        "Folio",
        "RUT",
        "Tercero",
        "Glosa",
        "Cargo",
        "Abono",
        "Saldo acumulado",
        "Saldo pendiente",
        "Estado",
        "Comprobante",
      ],
      ...filasExcel(movimientos),
    ];

    const hoja = XLSX.utils.aoa_to_sheet(data);
    hoja["!cols"] = [
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
      { wch: 16 },
      { wch: 22 },
      { wch: 18 },
      { wch: 14 },
      { wch: 16 },
      { wch: 36 },
      { wch: 48 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
    ];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Cartola RUT");
    XLSX.writeFile(libro, `Cartola_RUT_${fechaDesde}_${fechaHasta}.xlsx`);
  }

  function exportarPDF() {
    if (!movimientos.length) {
      setError("No hay movimientos para exportar.");
      return;
    }

    const doc = crearPDFClasico({ orientation: "l", format: "a4" });
    const margenX = 8;
    let y = encabezadoPDFClasico(doc, {
      titulo: "Cartola de movimientos por RUT",
      empresa: empresaActiva?.razon_social,
      rut: empresaActiva?.rut,
      fechaDesde,
      fechaHasta,
      margenX,
    });

    y = seccionPDFClasica(doc, `Tercero: ${busqueda}`, y, { margenX });

    tablaPDFClasica(doc, {
      startY: y,
      head: [["Concepto", "Monto"]],
      body: [
        ["Saldo anterior", formatoNumero(resumen.saldo_anterior)],
        ["Cargos", formatoNumero(resumen.cargos)],
        ["Abonos", formatoNumero(resumen.abonos)],
        ["Saldo actual", formatoNumero(resumen.saldo_actual)],
        ["Pendiente por cobrar", formatoNumero(resumen.pendiente_por_cobrar)],
        ["Pendiente por pagar", formatoNumero(resumen.pendiente_por_pagar)],
      ],
      margin: { left: margenX, right: margenX },
      styles: { fontSize: 7, cellPadding: 1.2 },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 38, halign: "right" },
      },
      didParseCell(data) {
        marcarFilaTotalPDF(data, data.row.raw?.[0] === "Saldo actual");
      },
    });

    y = doc.lastAutoTable.finalY + 5;
    y = seccionPDFClasica(doc, "Movimientos", y, { margenX });

    tablaPDFClasica(doc, {
      startY: y,
      head: [["Fecha", "Rol", "Origen", "Tipo", "Folio", "Tercero", "Cargo", "Abono", "Saldo", "Estado"]],
      body: movimientos.map((item) => [
        fechaCL(item.fecha),
        item.rol || "",
        origenAmigable(item.origen),
        item.tipo || "",
        item.folio || "",
        item.nombre_tercero || item.rut_tercero || "",
        formatoNumero(item.cargo),
        formatoNumero(item.abono),
        formatoNumero(item.saldo_acumulado),
        estadoAmigable(item.estado_cartola),
      ]),
      margin: { left: margenX, right: margenX },
      styles: { fontSize: 5.9, cellPadding: 1 },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 20 },
        2: { cellWidth: 24 },
        3: { cellWidth: 30 },
        4: { cellWidth: 18 },
        5: { cellWidth: 82 },
        6: { cellWidth: 23, halign: "right" },
        7: { cellWidth: 23, halign: "right" },
        8: { cellWidth: 24, halign: "right" },
        9: { cellWidth: 22 },
      },
    });

    piePaginasPDFClasico(doc, {
      texto: "Cartola de movimientos por RUT",
      margenX,
    });
    doc.save(`Cartola_RUT_${fechaDesde}_${fechaHasta}.pdf`);
  }

  function imprimir() {
    if (!movimientos.length) {
      setError("No hay movimientos para imprimir.");
      return;
    }

    const filas = movimientos
      .map(
        (item) => `
          <tr>
            <td>${fechaCL(item.fecha)}</td>
            <td>${item.rol || ""}</td>
            <td>${origenAmigable(item.origen)}</td>
            <td>${item.tipo || ""}</td>
            <td>${item.folio || ""}</td>
            <td>${item.nombre_tercero || item.rut_tercero || ""}</td>
            <td class="monto">${formatoNumero(item.cargo)}</td>
            <td class="monto">${formatoNumero(item.abono)}</td>
            <td class="monto">${formatoNumero(item.saldo_acumulado)}</td>
            <td>${estadoAmigable(item.estado_cartola)}</td>
          </tr>
        `
      )
      .join("");

    const ventana = window.open("", "_blank", "width=1100,height=800");
    if (!ventana) {
      setError("No se pudo abrir la ventana de impresion.");
      return;
    }

    ventana.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Cartola de movimientos por RUT</title>
          <style>${PRINT_STYLE_CLASICO}</style>
        </head>
        <body>
          <div class="pagina">
            <h1 class="titulo-documento">Cartola de movimientos por RUT</h1>
            <div class="bloque">
              <div class="fila"><span><strong>Empresa:</strong> ${empresaActiva?.razon_social || ""}</span><span><strong>RUT:</strong> ${empresaActiva?.rut || ""}</span></div>
              <div class="fila"><span><strong>Tercero:</strong> ${busqueda}</span><span><strong>Periodo:</strong> ${fechaCL(fechaDesde)} al ${fechaCL(fechaHasta)}</span></div>
            </div>
            <div class="bloque">
              <div class="fila"><span><strong>Saldo anterior:</strong> ${formatoMonto(resumen.saldo_anterior)}</span><span><strong>Cargos:</strong> ${formatoMonto(resumen.cargos)}</span><span><strong>Abonos:</strong> ${formatoMonto(resumen.abonos)}</span><span><strong>Saldo actual:</strong> ${formatoMonto(resumen.saldo_actual)}</span></div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Rol</th>
                  <th>Origen</th>
                  <th>Tipo</th>
                  <th>Folio</th>
                  <th>Tercero</th>
                  <th>Cargo</th>
                  <th>Abono</th>
                  <th>Saldo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>${filas}</tbody>
            </table>
          </div>
        </body>
      </html>
    `);

    ventana.document.close();
    ventana.focus();
    setTimeout(() => {
      ventana.print();
    }, 250);
  }

  function verOrigen(item) {
    localStorage.setItem("cartolaRutOrigen", JSON.stringify(item));

    if (!irVista) return;

    const rutas = {
      ventas: "ventas",
      compras: "compras",
      honorarios: "honorarios",
      pagos_cobros: "pagosCobros",
      remuneraciones: "remLiquidaciones",
      contabilidad: "comprobantes",
    };

    const vistaDestino = rutas[item.origen];
    if (vistaDestino) {
      irVista(vistaDestino);
    }
  }

  if (!empresaActiva) {
    return (
      <div>
        <h1 style={titulo}>Cartola por RUT</h1>
        <div style={alerta}>
          Debes seleccionar una empresa activa antes de consultar movimientos por RUT.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={titulo}>Cartola de movimientos por RUT</h1>
      <p style={subtitulo}>
        Empresa activa: <strong>{empresaActiva.razon_social}</strong>
      </p>

      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <div style={filtrosBox}>
        <div style={campoBusqueda}>
          <label style={label}>RUT, nombre o razon social</label>
          <input
            style={inputBusqueda}
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Ej: 16.153.127-8 o nombre del tercero"
            onKeyDown={(e) => {
              if (e.key === "Enter") cargarDatos(1);
            }}
          />
        </div>

        <div>
          <label style={label}>Desde</label>
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
          <label style={label}>Hasta</label>
          <input
            style={input}
            type="date"
            min={rangoInicial.fechaDesde}
            max={rangoInicial.fechaHasta}
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
          />
        </div>

        <div>
          <label style={label}>Vista</label>
          <select
            style={input}
            value={vista}
            onChange={(e) => setVista(e.target.value)}
          >
            <option value="comercial">Comercial</option>
            <option value="contable">Contable</option>
          </select>
        </div>

        <button style={botonSecundario} type="button" onClick={buscarTerceros}>
          Buscar tercero
        </button>
        <button style={botonBuscar} type="button" onClick={() => cargarDatos(1)}>
          Ver cartola
        </button>
      </div>

      {sugerencias.length > 0 && (
        <div style={sugerenciasBox}>
          {sugerencias.map((tercero) => (
            <button
              key={tercero.rut_limpio}
              style={sugerenciaItem}
              type="button"
              onClick={() => seleccionarTercero(tercero)}
            >
              <strong>{tercero.nombre}</strong>
              <span>{tercero.rut}</span>
              <small>{(tercero.roles || []).join(", ")}</small>
            </button>
          ))}
        </div>
      )}

      <div style={filtrosAvanzados}>
        <div>
          <label style={label}>Origen</label>
          <select style={input} value={origen} onChange={(e) => setOrigen(e.target.value)}>
            {ORIGENES.map((opcion) => (
              <option key={opcion.value} value={opcion.value}>
                {opcion.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={label}>Rol</label>
          <select style={input} value={rol} onChange={(e) => setRol(e.target.value)}>
            {ROLES.map((opcion) => (
              <option key={opcion.value} value={opcion.value}>
                {opcion.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={label}>Estado</label>
          <select style={input} value={estado} onChange={(e) => setEstado(e.target.value)}>
            {ESTADOS.map((opcion) => (
              <option key={opcion.value} value={opcion.value}>
                {opcion.label}
              </option>
            ))}
          </select>
        </div>

        <label style={checkBox}>
          <input
            type="checkbox"
            checked={soloPendientes}
            disabled={esContable}
            onChange={(e) => setSoloPendientes(e.target.checked)}
          />
          Solo documentos pendientes
        </label>

        <button style={botonLimpiar} type="button" onClick={limpiarFiltros}>
          Limpiar
        </button>
      </div>

      {cartola && (
        <>
          <div style={gridResumen}>
            <ResumenCard titulo="Saldo anterior" valor={formatoMonto(resumen.saldo_anterior)} />
            <ResumenCard titulo="Cargos" valor={formatoMonto(resumen.cargos)} />
            <ResumenCard titulo="Abonos" valor={formatoMonto(resumen.abonos)} />
            <ResumenCard titulo="Saldo actual" valor={formatoMonto(resumen.saldo_actual)} />
            <ResumenCard titulo="Pendiente por cobrar" valor={formatoMonto(resumen.pendiente_por_cobrar)} />
            <ResumenCard titulo="Pendiente por pagar" valor={formatoMonto(resumen.pendiente_por_pagar)} />
            <ResumenCard titulo="Documentos pendientes" valor={formatoNumero(resumen.documentos_pendientes)} />
            <ResumenCard titulo="Ultimo movimiento" valor={fechaCL(resumen.ultima_fecha)} />
          </div>

          <div style={accionesBox}>
            <button style={botonExcel} type="button" onClick={exportarExcel}>
              Exportar Excel
            </button>
            <button style={botonPDF} type="button" onClick={exportarPDF}>
              Exportar PDF
            </button>
            <button style={botonImprimir} type="button" onClick={imprimir}>
              Imprimir
            </button>
          </div>

          {!cartola.permisos?.incluye_remuneraciones && (
            <p style={nota}>
              Las liquidaciones de trabajadores solo se incluyen para usuarios con acceso a remuneraciones.
            </p>
          )}

          {esContable && (
            <p style={nota}>
              Vista contable: muestra asientos con RUT auxiliar. No mezcla documentos comerciales para evitar doble conteo.
            </p>
          )}

          {!esContable && pendientes.length > 0 && (
            <div style={seccionBox}>
              <h2 style={tituloSeccion}>Documentos pendientes</h2>
              <TablaPendientes
                pendientes={pendientes}
                formatoMonto={formatoMonto}
                fechaCL={fechaCL}
                verOrigen={verOrigen}
              />
            </div>
          )}

          <div style={seccionBox}>
            <div style={tablaHeader}>
              <h2 style={tituloSeccion}>Movimientos</h2>
              <span style={contador}>
                {paginacion.total} movimiento(s) encontrados
              </span>
            </div>

            <TablaMovimientos
              movimientos={movimientos}
              formatoMonto={formatoMonto}
              fechaCL={fechaCL}
              verOrigen={verOrigen}
            />

            <div style={paginacionBox}>
              <button
                style={botonPagina}
                type="button"
                disabled={pagina <= 1 || cargando}
                onClick={() => cargarDatos(pagina - 1)}
              >
                Anterior
              </button>
              <span>
                Pagina {paginacion.pagina} de {paginacion.paginas}
              </span>
              <button
                style={botonPagina}
                type="button"
                disabled={pagina >= paginacion.paginas || cargando}
                onClick={() => cargarDatos(pagina + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}

      {cargando && <p style={nota}>Cargando informacion...</p>}
    </div>
  );
}

function ResumenCard({ titulo, valor }) {
  return (
    <div style={card}>
      <strong>{titulo}</strong>
      <span>{valor}</span>
    </div>
  );
}

function TablaPendientes({ pendientes, formatoMonto, fechaCL, verOrigen }) {
  return (
    <div style={tablaBox}>
      <table style={tabla}>
        <thead>
          <tr>
            <th style={th}>Fecha</th>
            <th style={th}>Rol</th>
            <th style={th}>Documento</th>
            <th style={th}>Folio</th>
            <th style={th}>Tercero</th>
            <th style={thNumero}>Total</th>
            <th style={thNumero}>Pagado</th>
            <th style={thNumero}>Saldo</th>
            <th style={th}>Estado</th>
            <th style={thAccion}>Accion</th>
          </tr>
        </thead>
        <tbody>
          {pendientes.map((item) => (
            <tr key={item.source_key}>
              <td style={td}>{fechaCL(item.fecha)}</td>
              <td style={td}>{item.rol}</td>
              <td style={td}>{item.documento_tipo || item.tipo}</td>
              <td style={td}>{item.folio}</td>
              <td style={td}>{item.nombre_tercero || item.rut_tercero}</td>
              <td style={tdNumero}>{formatoMonto(item.total_documento)}</td>
              <td style={tdNumero}>{formatoMonto(item.total_pagado)}</td>
              <td style={tdNumero}>{formatoMonto(item.saldo_pendiente)}</td>
              <td style={td}>
                <span style={badge(item.estado_cartola)}>
                  {estadoAmigable(item.estado_cartola)}
                </span>
              </td>
              <td style={tdAccion}>
                <button type="button" style={botonVer} onClick={() => verOrigen(item)}>
                  Ver
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaMovimientos({ movimientos, formatoMonto, fechaCL, verOrigen }) {
  return (
    <div style={tablaBox}>
      <table style={tabla}>
        <thead>
          <tr>
            <th style={th}>Fecha</th>
            <th style={th}>Rol</th>
            <th style={th}>Origen</th>
            <th style={th}>Tipo</th>
            <th style={th}>Folio</th>
            <th style={th}>Tercero / Glosa</th>
            <th style={thNumero}>Cargo</th>
            <th style={thNumero}>Abono</th>
            <th style={thNumero}>Saldo</th>
            <th style={th}>Estado</th>
            <th style={thAccion}>Accion</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((item) => (
            <tr key={item.source_key}>
              <td style={td}>{fechaCL(item.fecha)}</td>
              <td style={td}>{item.rol}</td>
              <td style={td}>{origenAmigable(item.origen)}</td>
              <td style={td}>{item.tipo}</td>
              <td style={td}>{item.folio}</td>
              <td style={td}>
                <strong>{item.nombre_tercero || item.rut_tercero || "-"}</strong>
                <small style={glosa}>{item.glosa}</small>
              </td>
              <td style={tdNumero}>{formatoMonto(item.cargo)}</td>
              <td style={tdNumero}>{formatoMonto(item.abono)}</td>
              <td style={tdNumero}>{formatoMonto(item.saldo_acumulado)}</td>
              <td style={td}>
                <span style={badge(item.estado_cartola)}>
                  {estadoAmigable(item.estado_cartola)}
                </span>
              </td>
              <td style={tdAccion}>
                <button type="button" style={botonVer} onClick={() => verOrigen(item)}>
                  Ver
                </button>
              </td>
            </tr>
          ))}

          {movimientos.length === 0 && (
            <tr>
              <td style={td} colSpan="11">
                No hay movimientos para el rango y filtros seleccionados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function badge(estado) {
  const estadoNormal = String(estado || "").toLowerCase();
  if (estadoNormal === "pagado" || estadoNormal === "vigente" || estadoNormal === "aplicado") {
    return badgeOk;
  }
  if (estadoNormal === "parcial") {
    return badgeParcial;
  }
  if (estadoNormal === "anulado") {
    return badgeAnulado;
  }
  return badgePendiente;
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

const filtrosBox = {
  display: "flex",
  alignItems: "end",
  gap: "12px",
  background: "white",
  padding: "18px",
  borderRadius: "16px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "12px",
  flexWrap: "wrap",
};

const filtrosAvanzados = {
  ...filtrosBox,
  marginBottom: "18px",
};

const campoBusqueda = {
  minWidth: "320px",
  flex: "1 1 340px",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "#1e293b",
  marginBottom: "5px",
};

const input = {
  padding: "10px",
  border: "1px solid #a9d8ef",
  borderRadius: "10px",
  minWidth: "145px",
  height: "40px",
  boxSizing: "border-box",
};

const inputBusqueda = {
  ...input,
  width: "100%",
};

const botonBase = {
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const botonBuscar = {
  ...botonBase,
  background: "#0369a1",
};

const botonSecundario = {
  ...botonBase,
  background: "#0891b2",
};

const botonLimpiar = {
  ...botonBase,
  background: "#475569",
};

const botonExcel = {
  ...botonBase,
  background: "#10b981",
};

const botonPDF = {
  ...botonBase,
  background: "#ef4444",
};

const botonImprimir = {
  ...botonBase,
  background: "#0f172a",
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

const accionesBox = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginBottom: "14px",
};

const sugerenciasBox = {
  background: "white",
  border: "1px solid #bae6fd",
  borderRadius: "14px",
  marginBottom: "14px",
  overflow: "hidden",
};

const sugerenciaItem = {
  width: "100%",
  background: "white",
  border: "none",
  borderBottom: "1px solid #e2e8f0",
  padding: "11px 14px",
  display: "grid",
  gridTemplateColumns: "1.5fr 150px 180px",
  gap: "10px",
  textAlign: "left",
  cursor: "pointer",
  color: "#0f172a",
};

const checkBox = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  height: "40px",
  color: "#1e293b",
  fontWeight: "bold",
};

const seccionBox = {
  background: "white",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "22px",
};

const tablaHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
};

const tituloSeccion = {
  color: "#0369a1",
  marginTop: 0,
};

const contador = {
  color: "#475569",
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

const glosa = {
  display: "block",
  color: "#64748b",
  marginTop: "3px",
};

const botonVer = {
  background: "#0369a1",
  color: "white",
  border: "none",
  borderRadius: "8px",
  padding: "6px 10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const paginacionBox = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: "12px",
  paddingTop: "14px",
  color: "#1e293b",
  fontWeight: "bold",
};

const botonPagina = {
  ...botonBase,
  background: "#0369a1",
  height: "36px",
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

const badgeParcial = {
  background: "#e0f2fe",
  color: "#075985",
  padding: "5px 8px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "12px",
};

const badgeAnulado = {
  background: "#fee2e2",
  color: "#991b1b",
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

const nota = {
  color: "#475569",
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
