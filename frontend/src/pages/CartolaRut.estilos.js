/**
 * Estilos de CartolaRut.
 *
 * Estaban al final de la pagina, que por eso pasaba de las mil lineas.
 * Se movieron tal cual: los mismos nombres y los mismos valores.
 */

export const titulo = {
  fontSize: "34px",
  color: "var(--sc-ink)",
  marginBottom: "5px",
};

export const subtitulo = {
  color: "var(--sc-gris)",
  marginBottom: "18px",
};

export const filtrosBox = {
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

export const filtrosAvanzados = {
  ...filtrosBox,
  marginBottom: "18px",
};

export const campoBusqueda = {
  minWidth: "320px",
  flex: "1 1 340px",
};

export const label = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-text)",
  marginBottom: "5px",
};

export const input = {
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "10px",
  minWidth: "145px",
  height: "40px",
  boxSizing: "border-box",
};

export const inputBusqueda = {
  ...input,
  width: "100%",
};

export const botonBase = {
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

export const botonBuscar = {
  ...botonBase,
  background: "var(--sc-azul)",
};

export const botonSecundario = {
  ...botonBase,
  background: "#0891b2",
};

export const botonLimpiar = {
  ...botonBase,
  background: "var(--sc-gris)",
};

export const botonExcel = {
  ...botonBase,
  background: "var(--sc-teal)",
};

export const botonPDF = {
  ...botonBase,
  background: "var(--sc-danger)",
};

export const botonImprimir = {
  ...botonBase,
  background: "var(--sc-ink)",
};

export const gridResumen = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
  marginBottom: "18px",
};

export const card = {
  background: "white",
  borderRadius: "16px",
  padding: "16px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  color: "var(--sc-text)",
};

export const accionesBox = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginBottom: "14px",
};

export const sugerenciasBox = {
  background: "white",
  border: "1px solid #bae6fd",
  borderRadius: "14px",
  marginBottom: "14px",
  overflow: "hidden",
};

export const sugerenciaItem = {
  width: "100%",
  background: "white",
  border: "none",
  borderBottom: "1px solid var(--sc-borde-claro)",
  padding: "11px 14px",
  display: "grid",
  gridTemplateColumns: "1.5fr 150px 180px",
  gap: "10px",
  textAlign: "left",
  cursor: "pointer",
  color: "var(--sc-ink)",
};

export const checkBox = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  height: "40px",
  color: "var(--sc-text)",
  fontWeight: "bold",
};

export const seccionBox = {
  background: "white",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "22px",
};

export const tablaHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
};

export const tituloSeccion = {
  color: "var(--sc-azul)",
  marginTop: 0,
};

export const contador = {
  color: "var(--sc-gris)",
  fontWeight: "bold",
};

export const tablaBox = {
  overflowX: "auto",
};

export const tabla = {
  width: "100%",
  borderCollapse: "collapse",
};

export const th = {
  textAlign: "left",
  padding: "10px",
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  color: "var(--sc-azul)",
  whiteSpace: "nowrap",
};

export const thNumero = {
  ...th,
  textAlign: "right",
};

export const thAccion = {
  ...th,
  textAlign: "center",
};

export const td = {
  padding: "9px",
  borderBottom: "1px solid var(--sc-borde-claro)",
  color: "var(--sc-text)",
  verticalAlign: "top",
};

export const tdNumero = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

export const tdAccion = {
  ...td,
  textAlign: "center",
  whiteSpace: "nowrap",
};

export const glosa = {
  display: "block",
  color: "#64748b",
  marginTop: "3px",
};

export const botonVer = {
  background: "var(--sc-azul)",
  color: "white",
  border: "none",
  borderRadius: "8px",
  padding: "6px 10px",
  fontWeight: "bold",
  cursor: "pointer",
};

export const paginacionBox = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: "12px",
  paddingTop: "14px",
  color: "var(--sc-text)",
  fontWeight: "bold",
};

export const botonPagina = {
  ...botonBase,
  background: "var(--sc-azul)",
  height: "36px",
};

export const badgeOk = {
  background: "#dcfce7",
  color: "#166534",
  padding: "5px 8px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "12px",
};

export const badgePendiente = {
  background: "#fef3c7",
  color: "#92400e",
  padding: "5px 8px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "12px",
};

export const badgeParcial = {
  background: "#e0f2fe",
  color: "#075985",
  padding: "5px 8px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "12px",
};

export const badgeAnulado = {
  background: "#fee2e2",
  color: "#991b1b",
  padding: "5px 8px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "12px",
};

export const ok = {
  color: "var(--sc-teal)",
  fontWeight: "bold",
};

export const err = {
  color: "var(--sc-danger)",
  fontWeight: "bold",
};

export const nota = {
  color: "var(--sc-gris)",
  fontWeight: "bold",
};

export const alerta = {
  marginTop: "25px",
  background: "var(--sc-naranja-fondo)",
  border: "1px solid #fed7aa",
  color: "var(--sc-naranja-texto)",
  padding: "16px",
  borderRadius: "14px",
  fontWeight: "bold",
};
