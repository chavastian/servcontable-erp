import { PRINT_STYLE_CLASICO } from "./documentTheme";

let impresionEnCurso = false;
let ultimoIntentoImpresion = 0;

function textoSeguro(valor, respaldo = "-") {
  const texto = String(valor ?? "").trim();
  return texto || respaldo;
}

function escaparHtml(valor) {
  return textoSeguro(valor, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fechaCL(fecha) {
  if (!fecha) return "-";
  const texto = String(fecha).substring(0, 10);
  const partes = texto.split("-");
  if (partes.length !== 3) return texto;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function formatoMonto(valor) {
  return `$${Number(valor || 0).toLocaleString("es-CL")}`;
}

function referenciaDetalle(item) {
  return [
    `Folio: ${textoSeguro(item.folio)}`,
    `C. costo: ${textoSeguro(item.centro_costo)}`,
    `RUT: ${textoSeguro(item.rut_auxiliar)}`,
  ].join("\n");
}

function cuentaDetalle(item) {
  if (item.cuenta_codigo) {
    return `${item.cuenta_codigo} - ${textoSeguro(item.cuenta_nombre, "")}`;
  }

  return textoSeguro(item.cuenta_nombre || item.cuenta_id);
}

function crearFilasDetalle(detalles) {
  const lineas = Array.isArray(detalles) ? detalles : [];

  if (lineas.length === 0) {
    return `
      <tr>
        <td colspan="5" class="sin-detalle">Este comprobante no tiene detalle registrado.</td>
      </tr>
    `;
  }

  return lineas
    .map(
      (item) => `
        <tr>
          <td>${escaparHtml(cuentaDetalle(item))}</td>
          <td class="preline">${escaparHtml(referenciaDetalle(item))}</td>
          <td>${escaparHtml(item.glosa || "-")}</td>
          <td class="monto">${escaparHtml(formatoMonto(item.debe))}</td>
          <td class="monto">${escaparHtml(formatoMonto(item.haber))}</td>
        </tr>
      `
    )
    .join("");
}

export function crearHtmlComprobanteImprimible({ empresa, comprobante, detalles }) {
  const empresaNombre = escaparHtml(empresa?.razon_social || "Empresa");
  const empresaRut = escaparHtml(empresa?.rut || "-");
  const tipo = escaparHtml(comprobante?.tipo || "Comprobante");
  const numero = escaparHtml(comprobante?.numero || "-");
  const fecha = escaparHtml(fechaCL(comprobante?.fecha));
  const periodo = escaparHtml(comprobante?.periodo || "-");
  const estado = escaparHtml(comprobante?.estado || "vigente");
  const glosa = escaparHtml(comprobante?.glosa || "-");
  const totalDebe = escaparHtml(formatoMonto(comprobante?.total_debe));
  const totalHaber = escaparHtml(formatoMonto(comprobante?.total_haber));
  const impreso = escaparHtml(new Date().toLocaleString("es-CL"));
  const filasDetalle = crearFilasDetalle(detalles);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Comprobante contable ${tipo} ${numero}</title>
  <style>
    @page {
      size: letter landscape;
      margin: 11mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: #0f172a;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      line-height: 1.25;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .pagina {
      width: 100%;
    }

    .encabezado {
      align-items: center;
      background: #0369a1;
      border-radius: 12px;
      color: white;
      display: flex;
      justify-content: space-between;
      margin-bottom: 16px;
      padding: 14px 18px;
    }

    .encabezado h1 {
      font-size: 22px;
      line-height: 1;
      margin: 0;
    }

    .encabezado .impreso {
      font-size: 11px;
      text-align: right;
      white-space: nowrap;
    }

    .cabecera-superior {
      align-items: start;
      display: grid;
      gap: 16px;
      grid-template-columns: 1fr 270px;
      margin-bottom: 14px;
    }

    .empresa h2 {
      font-size: 16px;
      margin: 0 0 7px;
    }

    .empresa p,
    .resumen-comprobante p {
      margin: 0;
    }

    .resumen-comprobante {
      border: 1px solid #0369a1;
      border-radius: 10px;
      padding: 11px 14px;
    }

    .resumen-comprobante .fila-principal {
      align-items: baseline;
      display: flex;
      font-size: 14px;
      font-weight: 700;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .tipo {
      color: #0369a1;
    }

    .ficha {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      display: grid;
      gap: 10px 18px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-bottom: 14px;
      padding: 12px 14px;
    }

    .ficha .label {
      color: #475569;
      display: block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.02em;
      margin-bottom: 5px;
      text-transform: uppercase;
    }

    .ficha .valor {
      font-size: 14px;
    }

    .glosa {
      grid-column: 1 / -1;
    }

    table {
      border-collapse: collapse;
      table-layout: fixed;
      width: 100%;
    }

    thead {
      display: table-header-group;
    }

    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    th,
    td {
      border: 1px solid #cbd5e1;
      padding: 6px 7px;
      vertical-align: top;
      word-break: break-word;
    }

    th {
      background: #e0f2fe;
      color: #0369a1;
      font-weight: 700;
      text-align: center;
    }

    tbody tr:nth-child(odd) td {
      background: #f8fafc;
    }

    .col-cuenta {
      width: 31%;
    }

    .col-referencia {
      width: 17%;
    }

    .col-glosa {
      width: 32%;
    }

    .col-monto {
      width: 10%;
    }

    .preline {
      white-space: pre-line;
    }

    .monto {
      text-align: right;
      white-space: nowrap;
    }

    .sin-detalle {
      color: #475569;
      padding: 14px;
      text-align: center;
    }

    .totales {
      border: 1px solid #0369a1;
      border-radius: 10px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      margin: 12px 0 14px auto;
      overflow: hidden;
      width: 330px;
    }

    .totales div {
      background: #f8fafc;
      padding: 8px 10px;
    }

    .totales .titulo {
      color: #0369a1;
      font-weight: 700;
    }

    .totales .monto-total {
      font-size: 13px;
      font-weight: 700;
      text-align: right;
    }

    .firmas {
      break-inside: avoid;
      display: grid;
      gap: 18px;
      grid-template-columns: 1fr 1fr;
      margin-top: 14px;
      page-break-inside: avoid;
    }

    .firma {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      min-height: 84px;
      padding: 30px 24px 14px;
      text-align: center;
    }

    .linea-firma {
      border-top: 1.5px solid #0369a1;
      margin: 0 auto 12px;
      max-width: 320px;
    }

    .firma strong {
      color: #0369a1;
      display: block;
      font-size: 14px;
      margin-bottom: 10px;
    }

    .firma small {
      color: #475569;
    }

    .pie {
      align-items: center;
      color: #475569;
      display: flex;
      font-size: 9px;
      justify-content: space-between;
      margin-top: 14px;
    }

    @media screen {
      body {
        background: #eaf8ff;
        padding: 18px;
      }

      .pagina {
        background: white;
        border-radius: 14px;
        box-shadow: 0 14px 32px rgba(3, 105, 161, 0.12);
        margin: 0 auto;
        max-width: 1050px;
        padding: 18px;
      }
    }

    ${PRINT_STYLE_CLASICO}

    @page {
      size: A4 landscape;
      margin: 10mm;
    }

    body {
      background: white !important;
      color: #000 !important;
      font-family: 'Courier New', 'Liberation Mono', monospace !important;
      font-size: 9pt !important;
    }

    .pagina {
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      max-width: none !important;
      padding: 0 !important;
    }

    .encabezado,
    .ficha,
    .resumen-comprobante,
    .totales,
    .firma {
      background: white !important;
      border: 1px solid #000 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      color: #000 !important;
    }

    .encabezado {
      display: block !important;
      margin-bottom: 8px !important;
      padding: 6px !important;
      text-align: center !important;
    }

    .encabezado h1 {
      color: #000 !important;
      font-size: 13pt !important;
      margin: 0 0 4px !important;
      text-transform: uppercase !important;
    }

    .encabezado .impreso {
      color: #000 !important;
      font-size: 8pt !important;
      text-align: center !important;
    }

    .empresa h2,
    .tipo,
    .ficha .label,
    .totales .titulo,
    .firma strong {
      color: #000 !important;
    }

    .ficha,
    .cabecera-superior {
      gap: 8px !important;
      margin-bottom: 8px !important;
    }

    .ficha {
      padding: 7px !important;
    }

    th,
    td,
    .totales div {
      background: white !important;
      border-color: #000 !important;
      color: #000 !important;
    }

    tbody tr:nth-child(odd) td {
      background: white !important;
    }

    .total td,
    .monto-total,
    .fila-principal {
      font-weight: 700 !important;
    }

    .firmas {
      gap: 12px !important;
      margin-top: 10px !important;
    }

    .linea-firma {
      border-color: #000 !important;
    }

    .pie {
      border-top: 1px solid #000;
      color: #000 !important;
      padding-top: 5px;
    }
  </style>
</head>
<body>
  <main class="pagina">
    <section class="encabezado">
      <h1>Comprobante contable</h1>
      <div class="impreso">Impreso: ${impreso}</div>
    </section>

    <section class="cabecera-superior">
      <div class="empresa">
        <h2>${empresaNombre}</h2>
        <p>RUT: ${empresaRut}</p>
      </div>

      <div class="resumen-comprobante">
        <div class="fila-principal">
          <span class="tipo">${tipo}</span>
          <span>N° ${numero}</span>
        </div>
        <p>Fecha: ${fecha}</p>
      </div>
    </section>

    <section class="ficha">
      <div>
        <span class="label">Periodo</span>
        <span class="valor">${periodo}</span>
      </div>
      <div>
        <span class="label">Estado</span>
        <span class="valor">${estado}</span>
      </div>
      <div>
        <span class="label">Total debe</span>
        <span class="valor">${totalDebe}</span>
      </div>
      <div>
        <span class="label">Total haber</span>
        <span class="valor">${totalHaber}</span>
      </div>
      <div class="glosa">
        <span class="label">Glosa</span>
        <span>${glosa}</span>
      </div>
    </section>

    <table>
      <thead>
        <tr>
          <th class="col-cuenta">Cuenta</th>
          <th class="col-referencia">Referencia</th>
          <th class="col-glosa">Glosa</th>
          <th class="col-monto">Debe</th>
          <th class="col-monto">Haber</th>
        </tr>
      </thead>
      <tbody>
        ${filasDetalle}
      </tbody>
    </table>

    <section class="totales">
      <div class="titulo">Totales</div>
      <div class="monto-total">${totalDebe}</div>
      <div class="monto-total">${totalHaber}</div>
    </section>

    <section class="firmas">
      <div class="firma">
        <div class="linea-firma"></div>
        <strong>Firma Aprobado</strong>
        <small>Nombre / RUT / Fecha</small>
      </div>
      <div class="firma">
        <div class="linea-firma"></div>
        <strong>Firma Contabilizado</strong>
        <small>Nombre / RUT / Fecha</small>
      </div>
    </section>

    <footer class="pie">
      <span>ServContable PRO - Comprobante para firma y respaldo contable</span>
      <span>${tipo} N° ${numero}</span>
    </footer>
  </main>
</body>
</html>`;
}

export function imprimirComprobantePDF({ empresa, comprobante, detalles }) {
  const ahora = Date.now();

  if (impresionEnCurso || ahora - ultimoIntentoImpresion < 1500) {
    return false;
  }

  impresionEnCurso = true;
  ultimoIntentoImpresion = ahora;

  const html = crearHtmlComprobanteImprimible({
    empresa,
    comprobante,
    detalles,
  });
  const iframe = document.createElement("iframe");
  let impresionLanzada = false;
  let liberado = false;

  function liberar() {
    if (liberado) return;
    liberado = true;

    window.setTimeout(() => {
      iframe.remove();
      impresionEnCurso = false;
    }, 1000);
  }

  iframe.title = "Impresion comprobante contable";
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "1100px";
  iframe.style.height = "800px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";

  iframe.onload = () => {
    if (impresionLanzada) return;
    impresionLanzada = true;

    window.setTimeout(() => {
      try {
        const frameWindow = iframe.contentWindow;
        if (!frameWindow) {
          throw new Error("No se pudo abrir el documento de impresion");
        }

        frameWindow.onafterprint = liberar;
        frameWindow.focus();
        frameWindow.print();
        window.setTimeout(liberar, 45000);
      } catch {
        liberar();
      }
    }, 250);
  };

  iframe.srcdoc = html;
  document.body.appendChild(iframe);

  return true;
}
