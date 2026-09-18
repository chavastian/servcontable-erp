/**
 * Analisis de los archivos del SII.
 *
 * csv-parse subio de la version 6 a la 7 para cerrar una vulnerabilidad, y
 * nodemailer de la 8 a la 10. Estas pruebas fijan el comportamiento que la
 * importacion necesita, con las mismas opciones que usan los controladores y
 * con archivos con la forma real de los libros del SII.
 *
 *   node --test test/csvSii.test.js
 */

const test = require("node:test");
const assert = require("node:assert");
const { parse } = require("csv-parse/sync");

const {
  convertirFechaSII,
  convertirNumeroSII,
  obtenerPeriodoDesdeFecha,
} = require("../src/helpers/siiCsv.helper");

const OPCIONES = {
  columns: true,
  delimiter: ";",
  skip_empty_lines: true,
  bom: true,
  relax_column_count: true,
  trim: true,
};

test("lee un libro de compras del SII con cabeceras y punto y coma", () => {
  const csv = [
    "Nro;Tipo Doc;RUT Proveedor;Razon Social;Folio;Fecha Docto;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto Total",
    "1;33;76123456-7;PROVEEDOR UNO LTDA;1001;15/01/2026;0;1.000.000;190.000;1.190.000",
    "2;34;77964779-K;PROVEEDOR DOS SPA;1002;20/01/2026;50.000;0;0;50.000",
  ].join("\n");

  const registros = parse(csv, OPCIONES);

  assert.equal(registros.length, 2);
  assert.equal(registros[0]["RUT Proveedor"], "76123456-7");
  assert.equal(registros[0]["Fecha Docto"], "15/01/2026");
  assert.equal(registros[1]["Razon Social"], "PROVEEDOR DOS SPA");
});

test("tolera el BOM que traen los archivos del SII", () => {
  const csv = "﻿Nro;Folio\n1;1001";
  const registros = parse(csv, OPCIONES);

  assert.equal(registros.length, 1);
  assert.equal(registros[0].Nro, "1", "la primera columna no debe quedar con el BOM pegado");
});

test("tolera filas con menos columnas que la cabecera", () => {
  const csv = ["Nro;Folio;Monto Total", "1;1001;1190", "2;1002"].join("\n");
  const registros = parse(csv, OPCIONES);

  assert.equal(registros.length, 2);
  assert.equal(registros[1].Folio, "1002");
});

test("ignora lineas vacias", () => {
  const csv = ["Nro;Folio", "1;1001", "", "  ", "2;1002"].join("\n");
  const registros = parse(csv, OPCIONES);

  assert.equal(registros.length, 2);
});

test("un nombre de columna peligroso no contamina el prototipo", () => {
  // La vulnerabilidad cerrada en csv-parse 7.0.2 permitia escribir en el
  // prototipo a traves del nombre de una columna.
  const csv = "__proto__;Folio\ncontaminado;1001";
  const registros = parse(csv, OPCIONES);

  assert.equal({}.Folio, undefined, "el prototipo de Object no debe quedar tocado");
  assert.equal(registros.length, 1);
});

test("convierte las fechas del SII", () => {
  assert.equal(convertirFechaSII("15/01/2026"), "2026-01-15");
  assert.equal(convertirFechaSII("5/3/2026"), "2026-03-05");
  assert.equal(convertirFechaSII(""), null);
  assert.equal(convertirFechaSII("2026-01-15"), null, "solo acepta el formato del SII");
});

test("convierte los montos con separador de miles chileno", () => {
  assert.equal(convertirNumeroSII("1.190.000"), 1190000);
  assert.equal(convertirNumeroSII("1.000,50"), 1000.5);
  assert.equal(convertirNumeroSII(""), 0);
  assert.equal(convertirNumeroSII(null), 0);
  assert.equal(convertirNumeroSII("0"), 0);
});

test("obtiene el periodo desde la fecha", () => {
  assert.equal(obtenerPeriodoDesdeFecha("2026-01-15"), "2026-01");
});

test("nodemailer expone createTransport tras subir de version mayor", () => {
  const nodemailer = require("nodemailer");

  assert.equal(typeof nodemailer.createTransport, "function");

  const transporte = nodemailer.createTransport({
    host: "localhost",
    port: 587,
    auth: { user: "x", pass: "y" },
  });

  assert.equal(typeof transporte.sendMail, "function");
});

test("el ayudante de correo no envia nada si falta la configuracion SMTP", async () => {
  // Es lo que mantiene seguro el entorno de pruebas, que tiene copia de datos
  // reales: sin SMTP configurado no puede escribirle a ningun cliente.
  const previos = {
    host: process.env.SMTP_HOST,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    port: process.env.SMTP_PORT,
  };

  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_PORT;

  try {
    const { enviarCorreoRecuperacionPassword } = require("../src/helpers/mail.helper");

    const resultado = await enviarCorreoRecuperacionPassword({
      email: "cliente@ejemplo.cl",
      resetUrl: "https://app.servcontablepro.cl/reset?token=x",
    });

    assert.equal(resultado.enviado, false);
    assert.match(resultado.motivo, /SMTP/);
  } finally {
    Object.entries(previos).forEach(([clave, valor]) => {
      if (valor !== undefined) {
        process.env[`SMTP_${clave.toUpperCase()}`] = valor;
      }
    });
  }
});
