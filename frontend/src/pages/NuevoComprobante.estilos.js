/**
 * Estilos de NuevoComprobante.
 *
 * Estaban al final de la pagina, que por eso pasaba de las mil lineas.
 * Se movieron tal cual: los mismos nombres y los mismos valores.
 */

export const titulo = {
  fontSize: "28px",
  color: "var(--sc-ink)",
  marginBottom: "5px",
};

export const subtitulo = {
  color: "var(--sc-gris)",
  marginBottom: "12px",
};

export const formularioBox = {
  background: "white",
  borderRadius: "14px",
  padding: "16px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
};

export const tituloSeccion = {
  color: "var(--sc-azul)",
  marginTop: "0",
  marginBottom: "8px",
  fontSize: "22px",
};

export const gridCabecera = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: "10px",
};

export const label = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-text)",
  marginTop: "8px",
  marginBottom: "4px",
  fontSize: "13px",
};

export const input = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "8px",
  boxSizing: "border-box",
  fontSize: "13px",
};

export const inputGlosaCompacta = {
  ...input,
  height: "34px",
};

export const ayuda = {
  fontSize: "12px",
  color: "var(--sc-gris)",
  marginTop: "5px",
};

export const tablaBox = {
  overflowX: "auto",
  marginTop: "15px",
};

export const tablaBoxEdicion = {
  overflowX: "hidden",
  marginTop: "8px",
  width: "100%",
};

export const tablaEdicion = {
  width: "100%",
  tableLayout: "fixed",
  borderCollapse: "collapse",
};

export const tablaComprobantes = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
};

export const th = {
  textAlign: "left",
  padding: "12px",
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  color: "var(--sc-azul)",
  whiteSpace: "nowrap",
};

export const thMonto = {
  ...th,
  textAlign: "right",
};

export const thAccion = {
  ...th,
  textAlign: "center",
};

export const thCompacto = {
  ...th,
  padding: "6px 8px",
  fontSize: "12px",
};

export const thNumeroCompacto = {
  ...thCompacto,
  textAlign: "right",
};

export const thAccionCompacto = {
  ...thCompacto,
  textAlign: "center",
};

export const td = {
  padding: "10px",
  borderBottom: "1px solid var(--sc-borde-claro)",
  color: "var(--sc-text)",
  verticalAlign: "top",
};

export const tdGlosa = {
  ...td,
  whiteSpace: "normal",
  wordBreak: "break-word",
};

export const tdMonto = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

export const tdAccion = {
  ...td,
  textAlign: "center",
};

export const tdCompacto = {
  ...td,
  padding: "4px 5px",
  verticalAlign: "middle",
};

export const tdAccionCompacto = {
  ...tdCompacto,
  textAlign: "center",
};

export const inputTabla = {
  width: "100%",
  minWidth: "140px",
  padding: "9px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "8px",
  boxSizing: "border-box",
};

export const inputTablaCompacto = {
  ...inputTabla,
  minWidth: 0,
  width: "100%",
  height: "32px",
  padding: "6px 8px",
  fontSize: "12px",
  borderRadius: "7px",
};

export const inputCuentaCompacto = {
  ...inputTablaCompacto,
  minWidth: 0,
};

export const inputNumeroCompacto = {
  ...inputTablaCompacto,
  textAlign: "right",
};

export const botonEliminar = {
  background: "linear-gradient(135deg, var(--sc-danger), var(--sc-warning))",
  color: "white",
  border: "none",
  borderRadius: "8px",
  padding: "8px 10px",
  cursor: "pointer",
};

export const botonEliminarCompacto = {
  ...botonEliminar,
  width: "30px",
  minWidth: "30px",
  height: "30px",
  padding: "0",
  borderRadius: "7px",
  fontSize: "12px",
};

export const botonSecundario = {
  marginTop: "15px",
  background: "#0ea5e9",
  color: "white",
  border: "none",
  borderRadius: "10px",
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: "bold",
};

export const botonCancelar = {
  ...botonSecundario,
  background: "var(--sc-gris)",
  marginLeft: "10px",
};

export const totalesBox = {
  marginTop: "20px",
  display: "flex",
  gap: "20px",
  flexWrap: "wrap",
  background: "var(--sc-fondo-claro)",
  padding: "16px",
  borderRadius: "14px",
};

export const diferenciaOk = {
  color: "var(--sc-teal)",
};

export const diferenciaError = {
  color: "var(--sc-danger)",
};

export const botonGuardar = {
  width: "100%",
  marginTop: "20px",
  background: "var(--sc-teal)",
  color: "white",
  border: "none",
  padding: "14px",
  borderRadius: "12px",
  fontWeight: "bold",
  cursor: "pointer",
};

export const botonBloqueado = {
  ...botonGuardar,
  background: "#94a3b8",
  cursor: "not-allowed",
};

export const listadoBox = {
  marginTop: "25px",
  background: "white",
  borderRadius: "18px",
  padding: "25px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  overflowX: "auto",
};

export const botonEditar = {
  background: "linear-gradient(135deg, var(--sc-azul), var(--sc-cian-medio))",
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

export const botonImprimir = {
  background: "linear-gradient(135deg, #0f766e, #14b8a6)",
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

export const botonAccionDeshabilitado = {
  ...botonImprimir,
  background: "#94a3b8",
  cursor: "not-allowed",
  opacity: 0.7,
};

export const botonEliminarAsiento = {
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

export const accionesFila = {
  display: "flex",
  justifyContent: "center",
  gap: "6px",
  flexWrap: "nowrap",
  alignItems: "center",
};

export const botonDetalle = {
  background: "linear-gradient(135deg, var(--sc-azul), var(--sc-cian-medio))",
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

export const tdDetalleContenedor = {
  padding: "0",
  borderBottom: "1px solid var(--sc-borde-claro)",
};

export const detalleComprobanteBox = {
  background: "var(--sc-fondo-claro)",
  border: "1px solid #dbeafe",
  borderRadius: "14px",
  padding: "16px",
  margin: "10px",
};

export const tituloDetalleComprobante = {
  color: "var(--sc-azul)",
  marginTop: 0,
  marginBottom: "12px",
};

export const textoSuave = {
  color: "var(--sc-gris)",
};

export const tablaDetalleComprobante = {
  width: "100%",
  minWidth: "1050px",
  borderCollapse: "collapse",
};
