/**
 * Estilos de LibrosCompraVenta.
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
  marginBottom: "18px",
  flexWrap: "wrap",
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
  minWidth: "170px",
  height: "40px",
  boxSizing: "border-box",
};

export const botonBuscar = {
  background: "var(--sc-azul)",
  color: "white",
  border: "none",
  padding: "10px 20px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
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

export const seccionBox = {
  background: "white",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "22px",
};

export const seccionHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "12px",
};

export const tituloSeccion = {
  color: "var(--sc-azul)",
  margin: 0,
};

export const acciones = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
};

export const botonExcel = {
  background: "var(--sc-teal)",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
};

export const botonPDF = {
  background: "var(--sc-danger)",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
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

export const ok = {
  color: "var(--sc-teal)",
  fontWeight: "bold",
};

export const err = {
  color: "var(--sc-danger)",
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
