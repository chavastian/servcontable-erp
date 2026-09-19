/**
 * Estilos y formatos que comparten las pantallas nuevas.
 *
 * Están juntos para que las seis se vean como una sola cosa y no como seis
 * pantallas pegadas: los mismos colores del semáforo, la misma tarjeta, la misma
 * forma de escribir un peso.
 */

const COLORES_ESTADO = {
  ok: { fondo: "#e7f8f1", borde: "#10b981", texto: "#065f46", etiqueta: "Al día" },
  aviso: { fondo: "#fef6e7", borde: "#f97316", texto: "#9a3412", etiqueta: "Revisar" },
  error: { fondo: "#fdecec", borde: "#ef4444", texto: "#991b1b", etiqueta: "Con problemas" },
};

function colorEstado(estado) {
  return COLORES_ESTADO[estado] || COLORES_ESTADO.aviso;
}

/**
 * Pesos chilenos, sin decimales: la contabilidad se declara en pesos enteros.
 */
function pesos(valor) {
  const numero = Number(valor || 0);

  return numero.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

function numero(valor) {
  return Number(valor || 0).toLocaleString("es-CL");
}

/**
 * Una fecha como la lee una persona en Chile: 12-05-2026.
 */
function fechaCorta(valor) {
  if (!valor) return "";

  const texto = String(valor).slice(0, 10);
  const [anio, mes, dia] = texto.split("-");

  return dia ? `${dia}-${mes}-${anio}` : texto;
}

const estilos = {
  contenedor: { display: "flex", flexDirection: "column", gap: 16 },

  barraFiltros: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-end",
    background: "var(--sc-card)",
    border: "1px solid var(--sc-border)",
    borderRadius: 10,
    padding: 14,
    boxShadow: "var(--sc-shadow)",
  },

  campo: { display: "flex", flexDirection: "column", gap: 4 },

  etiqueta: { fontSize: 12, fontWeight: "bold", color: "var(--sc-muted)" },

  input: {
    padding: "7px 9px",
    border: "1px solid var(--sc-border)",
    borderRadius: 7,
    fontSize: 13,
    background: "#fff",
    color: "var(--sc-text)",
  },

  tarjeta: {
    background: "var(--sc-card)",
    border: "1px solid var(--sc-border)",
    borderRadius: 10,
    padding: 16,
    boxShadow: "var(--sc-shadow)",
  },

  titulo: {
    margin: "0 0 4px",
    fontSize: 15,
    fontWeight: "bold",
    color: "var(--sc-primary)",
  },

  subtitulo: { margin: 0, fontSize: 12.5, color: "var(--sc-muted)" },

  resumenGrilla: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 12,
  },

  indicador: {
    background: "var(--sc-soft)",
    border: "1px solid var(--sc-line)",
    borderRadius: 9,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },

  indicadorValor: { fontSize: 20, fontWeight: "bold", color: "var(--sc-primary)" },

  indicadorTexto: { fontSize: 12, color: "var(--sc-muted)" },

  tabla: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12.5,
    background: "#fff",
  },

  th: {
    textAlign: "left",
    padding: "8px 9px",
    background: "var(--sc-table-head)",
    borderBottom: "1px solid var(--sc-border)",
    color: "var(--sc-ink-soft)",
    fontSize: 12,
    whiteSpace: "nowrap",
  },

  td: {
    padding: "8px 9px",
    borderBottom: "1px solid #eef2f7",
    verticalAlign: "top",
  },

  tdNumero: {
    padding: "8px 9px",
    borderBottom: "1px solid #eef2f7",
    textAlign: "right",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  },

  aviso: {
    background: "#fffbeb",
    border: "1px solid #fcd34d",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 12.5,
    color: "#854d0e",
  },

  contenedorTabla: { overflowX: "auto" },
};

/**
 * Píldora de estado. La misma en las seis pantallas: el color siempre dice lo
 * mismo.
 */
function pildora(estado) {
  const color = colorEstado(estado);

  return {
    display: "inline-block",
    padding: "3px 9px",
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: "bold",
    background: color.fondo,
    color: color.texto,
    border: `1px solid ${color.borde}`,
    whiteSpace: "nowrap",
  };
}

export { estilos, pildora, colorEstado, COLORES_ESTADO, pesos, numero, fechaCorta };
