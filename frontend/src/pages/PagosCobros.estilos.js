/**
 * Estilos de PagosCobros.
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

export const formularioBox = {
  background: "white",
  borderRadius: "18px",
  padding: "25px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "20px",
};

export const tituloSeccion = {
  color: "var(--sc-azul)",
  marginTop: 0,
};

export const gridFormulario = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: "14px",
};

export const label = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-text)",
  marginTop: "10px",
  marginBottom: "5px",
};

export const input = {
  width: "100%",
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "10px",
  boxSizing: "border-box",
  height: "40px",
};

export const checkLabel = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginTop: "14px",
  color: "var(--sc-text)",
  fontWeight: "bold",
};

export const bloqueModoComprobante = {
  marginTop: "14px",
  background: "var(--sc-fondo-claro)",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "12px",
  padding: "12px",
};

export const textoAyuda = {
  display: "block",
  marginTop: "8px",
  color: "#155e75",
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

export const listadoBox = {
  background: "white",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
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

export const botonEliminar = {
  background: "linear-gradient(135deg, var(--sc-danger), var(--sc-warning))",
  color: "white",
  border: "none",
  borderRadius: "9px",
  width: "32px",
  height: "32px",
  padding: 0,
  cursor: "pointer",
  fontWeight: "bold",
  fontSize: "15px",
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
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

export const textoSuave = {
  color: "var(--sc-gris)",
  fontSize: "13px",
  fontWeight: "bold",
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
