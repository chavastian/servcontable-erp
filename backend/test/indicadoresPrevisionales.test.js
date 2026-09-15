const assert = require("node:assert/strict");
const test = require("node:test");
const {
  extraerIndicadoresDesdeTexto,
  obtenerDiagnosticoPdfParser,
  validarArchivoPdfPrevired,
} = require("../src/helpers/indicadoresPrevisionales.helper");

test("detecta API real de pdf-parse instalada", () => {
  const diagnostico = obtenerDiagnosticoPdfParser();

  assert.equal(diagnostico.moduleType, "object");
  assert.equal(diagnostico.pdfParseClassType, "function");
});

test("rechaza archivo no PDF con mensaje seguro", () => {
  assert.throws(
    () =>
      validarArchivoPdfPrevired({
        originalname: "indicadores.txt",
        mimetype: "text/plain",
        size: 12,
        buffer: Buffer.from("Previred"),
      }),
    /PDF valido/
  );
});

test("rechaza PDF vacio con mensaje seguro", () => {
  assert.throws(
    () =>
      validarArchivoPdfPrevired({
        originalname: "indicadores.pdf",
        mimetype: "application/pdf",
        size: 0,
        buffer: Buffer.alloc(0),
      }),
    /vacio/
  );
});

test("mantiene parser de texto de indicadores Previred", () => {
  const texto = `
    PREVIRED Indicadores Previsionales
    Para Cotizaciones a Pagar en Febrero 2026 (Remuneraciones Enero 2026)
    $ 39.485,65 $ 39.123,45 $ 3.250.000 $ 529.000 $ 2.340.000
    Para Afiliados AFP: 87,8 UF
    Para afiliados al INP (60 UF)
    Para Seguro de Cesantia: 131,9 UF
    Tasa del Seguro de Invalidez y Sobrevivencia (SIS): 1,88%
    Capital 11,44% 0,10% 11,54% 12,98%
  `;

  const resultado = extraerIndicadoresDesdeTexto(texto);

  assert.equal(resultado.indicadores.periodo_remuneracion, "2026-01");
  assert.equal(resultado.indicadores.periodo_pago, "2026-02");
  assert.equal(resultado.indicadores.valor_uf, 39485.65);
  assert.equal(resultado.indicadores.renta_tope_afp_uf, 87.8);
  assert.equal(resultado.indicadores.renta_tope_ips_uf, 60);
  assert.equal(resultado.indicadores.tasa_sis, 1.88);
  assert.equal(resultado.afps.length, 1);
});
