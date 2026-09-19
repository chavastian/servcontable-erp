/**
 * Libro de Remuneraciones Electrónico (LRE) de la Dirección del Trabajo.
 *
 * Primera versión del archivo de carga: CSV separado por punto y coma, una
 * fila por liquidación emitida del período, cabecera con los códigos de
 * concepto de la DT. No existía: el libro se exportaba a Excel con columnas
 * propias y el cliente lo redigitaba en el portal.
 *
 * REQUIERE VALIDACIÓN LABORAL: los códigos y el orden siguen el "Formato de
 * carga del LRE" publicado por la DT; cada columna tiene que cotejarse con la
 * versión vigente del formato antes de cargar el archivo en el portal. Las
 * columnas que el sistema no registra van en cero o vacías.
 */

const pool = require("../database/db");
const { aFechaISO } = require("../helpers/fecha.helper");

const SEPARADOR = ";";

// Código DT, descripción, función que toma (liquidación, trabajador) y
// devuelve el valor. Las descripciones no van al archivo; son para el
// mantenedor.
const COLUMNAS = [
  ["1101", "Rut trabajador", (l, t) => rutLre(t.rut)],
  ["1102", "Fecha inicio contrato", (l, t) => fechaLre(t.fecha_ingreso)],
  ["1103", "Fecha término contrato", (l, t) => fechaLre(t.fecha_termino)],
  ["1104", "Causal término", () => ""],
  ["1105", "Región prestación de servicios", () => ""],
  ["1106", "Comuna prestación de servicios", () => ""],
  ["1107", "Tipo impuesto (1 único, 2 adicional)", () => 1],
  ["1108", "Técnico extranjero exento (0/1)", () => 0],
  ["1109", "Tipo jornada", (l, t) => codigoJornada(t.jornada)],
  ["1110", "Persona con discapacidad (0/1)", () => 0],
  ["1111", "Pensionado (0/1)", () => 0],
  ["1112", "Tipo contrato", (l, t) => codigoContrato(t.tipo_contrato)],
  ["1113", "Tipo relación laboral", () => 1],
  ["1114", "Régimen previsional", (l, t) => (String(t.regimen_previsional || "AFP").toUpperCase() === "AFP" ? "AFP" : "IPS")],
  ["1115", "Número de cargas", (l, t) => entero(t.cargas)],
  ["1116", "Cargas simples", (l, t) => entero(t.cargas)],
  ["1117", "Cargas maternales", () => 0],
  ["1118", "Cargas inválidas", () => 0],
  ["1119", "Tramo asignación familiar", (l, t) => tramo(t.tramo_asignacion)],
  ["1121", "AFP (código Previred)", (l, t) => t.codigo_afp_previred || ""],
  ["1131", "Salud (código Previred)", (l, t) => t.codigo_salud_previred || ""],
  ["1141", "Plan de salud en UF", (l, t) => decimal(t.plan_salud_uf)],
  ["1151", "Mutual (código)", (l, t) => t.codigo_mutual_previred || ""],
  ["1161", "Afiliado seguro cesantía (0/1)", (l, t) => (String(t.seguro_cesantia || "SI").toUpperCase() === "SI" ? 1 : 0)],
  ["2101", "Días trabajados", (l) => entero(l.dias_trabajados)],
  ["2102", "Días de licencia", () => 0],
  ["2103", "Días de vacaciones", () => 0],
  ["2104", "Subsidio trabajador joven", () => 0],
  ["2105", "Sueldo base", (l) => entero(l.sueldo_proporcional || l.sueldo_base)],
  ["2106", "Sobresueldo (horas extra)", (l) => entero(l.monto_horas_extras)],
  ["2107", "Comisiones", () => 0],
  ["2108", "Semana corrida", (l) => entero(l.semana_corrida_horas_extras)],
  ["2110", "Gratificación", (l) => entero(l.gratificacion)],
  ["2120", "Otros haberes imponibles", (l) => entero(l.variables_haberes_imponibles)],
  ["2161", "Haberes no imponibles", (l) => entero(l.total_haberes_no_imponibles)],
  ["3101", "Cotización AFP", (l) => entero(l.descuento_afp)],
  ["3103", "Cotización salud 7%", (l) => entero(l.descuento_salud) - entero(l.descuento_salud_adicional)],
  ["3104", "Cotización adicional Isapre", (l) => entero(l.descuento_salud_adicional)],
  ["3141", "Cotización seguro cesantía trabajador", (l) => entero(l.descuento_afc)],
  ["3161", "Impuesto único", (l) => entero(l.impuesto_unico)],
  ["3191", "Otros descuentos", (l) => entero(l.otros_descuentos)],
  ["4101", "Total haberes", (l) => entero(l.total_haberes)],
  ["4102", "Total haberes imponibles", (l) => entero(l.total_haberes_imponibles)],
  ["4103", "Total haberes no imponibles", (l) => entero(l.total_haberes_no_imponibles)],
  ["4151", "Total descuentos legales", (l) => entero(l.descuento_afp) + entero(l.descuento_salud) + entero(l.descuento_afc) + entero(l.impuesto_unico)],
  ["4152", "Total otros descuentos", (l) => entero(l.otros_descuentos)],
  ["4155", "Total líquido", (l) => entero(l.liquido_pagar)],
  ["5201", "Aporte AFC empleador", (l) => entero(l.aporte_afc_empleador)],
  ["5202", "Aporte SIS empleador", (l) => entero(l.aporte_sis_empleador)],
  ["5203", "Aporte mutual empleador", (l) => entero(l.aporte_mutual_empleador)],
  ["5204", "Aporte seguro social empleador (Ley 21.735)", (l) => entero(l.aporte_seguro_social_empleador)],
  ["5210", "Total aportes empleador", (l) => entero(l.aporte_afc_empleador) + entero(l.aporte_sis_empleador) + entero(l.aporte_mutual_empleador) + entero(l.aporte_seguro_social_empleador)],
  ["5301", "Total costo empresa", (l) => entero(l.costo_empresa)],
];

function entero(valor) {
  return Math.round(Number(valor || 0));
}

function decimal(valor) {
  return Number(valor || 0) === 0 ? "" : String(Number(valor)).replace(".", ",");
}

function rutLre(rut) {
  // Sin puntos, con guion y dígito verificador en mayúscula.
  const limpio = String(rut || "").replace(/\./g, "").replace(/\s/g, "").toUpperCase();

  if (!limpio) return "";
  if (limpio.includes("-")) return limpio;

  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

function fechaLre(fecha) {
  const iso = aFechaISO(fecha);

  if (!iso) return "";

  const [a, m, d] = iso.split("-");

  return `${d}/${m}/${a}`;
}

function codigoJornada(jornada) {
  const j = String(jornada || "").toLowerCase();

  if (j.includes("parcial")) return 2;
  if (j.includes("excepcional")) return 3;

  return 1;
}

function codigoContrato(tipo) {
  const t = String(tipo || "").toLowerCase();

  if (t.includes("plazo fijo")) return 2;
  if (t.includes("obra") || t.includes("faena")) return 3;

  return 1;
}

function tramo(valor) {
  const t = String(valor || "").trim().toUpperCase();

  return ["A", "B", "C", "D"].includes(t) ? t : "D";
}

function celda(valor) {
  const texto = valor === null || valor === undefined ? "" : String(valor);

  return texto.includes(SEPARADOR) || texto.includes('"') || texto.includes("\n")
    ? `"${texto.replace(/"/g, '""')}"`
    : texto;
}

async function filasLre(empresaId, periodo) {
  const { rows } = await pool.query(
    `SELECT l.*,
            t.rut, t.fecha_ingreso, t.fecha_termino, t.jornada, t.tipo_contrato,
            t.regimen_previsional, t.cargas, t.tramo_asignacion, t.codigo_afp_previred,
            t.codigo_salud_previred, t.codigo_mutual_previred, t.seguro_cesantia,
            COALESCE(t.plan_salud_uf, 0) AS plan_salud_uf
     FROM liquidaciones l
     JOIN trabajadores t ON t.id = l.trabajador_id AND t.empresa_id = l.empresa_id
     WHERE l.empresa_id = $1 AND l.periodo = $2 AND l.estado = 'emitida'
     ORDER BY t.apellidos, t.nombres, l.id`,
    [empresaId, periodo]
  );

  return rows;
}

function construirCsv(filas) {
  const lineas = [COLUMNAS.map((c) => c[0]).join(SEPARADOR)];

  for (const fila of filas) {
    lineas.push(COLUMNAS.map(([, , valor]) => celda(valor(fila, fila))).join(SEPARADOR));
  }

  return `${lineas.join("\r\n")}\r\n`;
}

async function exportarLre(req, res) {
  try {
    const { empresa_id, periodo } = req.query;

    if (!empresa_id || !/^\d{4}-\d{2}$/.test(String(periodo || ""))) {
      return res.status(400).json({ error: "Debe indicar empresa_id y periodo AAAA-MM" });
    }

    const filas = await filasLre(empresa_id, periodo);

    if (filas.length === 0) {
      return res.status(404).json({ error: "No hay liquidaciones emitidas en el período." });
    }

    const csv = construirCsv(filas);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="LRE_${periodo}.csv"`);
    res.setHeader("X-Lre-Filas", String(filas.length));

    return res.send(`﻿${csv}`);
  } catch (error) {
    console.error("Error al exportar LRE:", error);

    return res.status(error.statusCode || 500).json({
      // El mensaje de PostgreSQL no vuelve al cliente.
      error: error.statusCode ? error.message : "Error interno al exportar el libro electrónico",
    });
  }
}

module.exports = { exportarLre, construirCsv, filasLre, COLUMNAS };
