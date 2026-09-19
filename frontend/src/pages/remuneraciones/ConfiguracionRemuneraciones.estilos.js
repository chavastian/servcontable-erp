/**
 * Estilos de ConfiguracionRemuneraciones.
 *
 * Estaban al final de la pagina, que por eso pasaba de las mil lineas.
 * Se movieron tal cual: los mismos nombres y los mismos valores.
 */

export const hero = {
  background: "linear-gradient(135deg, var(--sc-ink), var(--sc-azul), #0ea5e9)",
  borderRadius: "22px",
  padding: "28px",
  color: "white",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "end",
  gap: "20px",
  flexWrap: "wrap",
  marginBottom: "22px",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.18)",
};

export const titulo = {
  margin: 0,
  fontSize: "32px",
};

export const subtitulo = {
  color: "var(--sc-celeste-suave)",
  marginBottom: 0,
};

export const filtrosHero = {
  display: "flex",
  gap: "12px",
  alignItems: "end",
  flexWrap: "wrap",
};

export const labelHero = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-celeste-suave)",
  marginBottom: "5px",
};

export const inputHero = {
  width: "160px",
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "10px",
  height: "40px",
  boxSizing: "border-box",
};

export const botonHero = {
  background: "white",
  color: "var(--sc-azul)",
  border: "none",
  padding: "10px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

export const card = {
  background: "white",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "20px",
};

export const cardHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "center",
  flexWrap: "wrap",
};

export const tituloSeccion = {
  color: "var(--sc-azul)",
  marginTop: 0,
  marginBottom: "5px",
  display: "flex",
  alignItems: "center",
  gap: "9px",
};

export const tituloSeccionSeparado = {
  color: "var(--sc-azul)",
  marginTop: "26px",
  paddingTop: "18px",
  borderTop: "1px solid var(--sc-borde-claro)",
  display: "flex",
  alignItems: "center",
  gap: "9px",
};

export const tituloIcono = {
  width: "36px",
  height: "36px",
  borderRadius: "12px",
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  border: "1px solid #67e8f9",
  color: "var(--sc-azul)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 8px 18px rgba(15, 76, 129, 0.12)",
};

export const textoMuted = {
  color: "var(--sc-gris)",
  marginTop: 0,
};

export const notaSalud = {
  gridColumn: "1 / -1",
  background: "var(--sc-cian-fondo)",
  border: "1px solid #67e8f9",
  color: "var(--sc-azul)",
  padding: "12px",
  borderRadius: "12px",
  fontWeight: "bold",
};

export const importBox = {
  display: "grid",
  gridTemplateColumns: "minmax(260px, 1fr) auto",
  gap: "12px",
  alignItems: "center",
  marginTop: "14px",
};

export const inputFile = {
  width: "100%",
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "10px",
  boxSizing: "border-box",
  height: "auto",
  minHeight: "42px",
  background: "var(--sc-fondo-claro)",
};

export const botonImportar = {
  background: "linear-gradient(135deg, #7c3aed, #a21caf)",
  color: "white",
  border: "none",
  padding: "12px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  minHeight: "42px",
};

export const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
};

export const gridAfp = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
};

export const labelStyle = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-text)",
  marginBottom: "5px",
};

export const inputStyle = {
  width: "100%",
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "10px",
  height: "40px",
  boxSizing: "border-box",
};

export const inputSoloLectura = {
  ...inputStyle,
  background: "#f1f5f9",
  color: "#334155",
  cursor: "not-allowed",
};

export const ayudaCampo = {
  display: "block",
  color: "#64748b",
  fontSize: "12px",
  lineHeight: "1.35",
  marginTop: "5px",
};

export const botonGuardar = {
  marginTop: "18px",
  background: "var(--sc-teal)",
  color: "white",
  border: "none",
  padding: "12px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
};

export const botonCancelar = {
  marginTop: "18px",
  marginLeft: "10px",
  background: "#f8fafc",
  color: "#334155",
  border: "1px solid #cbd5e1",
  padding: "12px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

export const botonIcono = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export const badgeInfo = {
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  color: "var(--sc-azul)",
  padding: "8px 12px",
  borderRadius: "999px",
  fontWeight: "bold",
};

export const tablaBox = {
  overflowX: "auto",
  marginTop: "18px",
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

export const botonEditar = {
  background: "#e0f2fe",
  color: "var(--sc-azul)",
  border: "1px solid #7dd3fc",
  height: "32px",
  padding: "0 10px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
  marginRight: "8px",
};

export const botonEliminar = {
  background: "linear-gradient(135deg, var(--sc-danger), var(--sc-warning))",
  color: "white",
  border: "none",
  width: "32px",
  height: "32px",
  padding: 0,
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
  fontSize: "15px",
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export const ok = {
  color: "var(--sc-teal)",
  fontWeight: "bold",
};

export const err = {
  color: "var(--sc-danger)",
  fontWeight: "bold",
};
