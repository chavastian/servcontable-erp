import { useEffect, useMemo, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerLibroVentas, obtenerLibroCompras } from "../services/librosTributariosService";
import { listarPagosCobros } from "../services/pagosCobrosService";
import { obtenerRangoAnualTrabajo } from "../services/periodoTrabajoService";

function moneda(valor) {
  return Number(valor || 0).toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

function formatoFecha(fecha) {
  return fecha ? String(fecha).substring(0, 10) : "-";
}

const TITULOS = {
  registro: {
    titulo: "Registro Simplificado",
    descripcion: "Resumen compacto de ingresos y egresos tributarios del ejercicio.",
  },
  caja: {
    titulo: "Libro de Caja",
    descripcion: "Entradas y salidas de caja/banco desde pagos y cobros registrados.",
  },
  ingresosEgresos: {
    titulo: "Libro de Ingresos y Egresos",
    descripcion: "Vista simplificada para control de ingresos, compras y resultado.",
  },
};

export default function ContabilidadSimplificada({ vista = "registro" }) {
  const empresa = obtenerEmpresaActiva();
  const rangoInicial = obtenerRangoAnualTrabajo();
  const [fechaDesde, setFechaDesde] = useState(rangoInicial.fechaDesde);
  const [fechaHasta, setFechaHasta] = useState(rangoInicial.fechaHasta);
  const [ventas, setVentas] = useState([]);
  const [compras, setCompras] = useState([]);
  const [movimientosCaja, setMovimientosCaja] = useState([]);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const meta = TITULOS[vista] || TITULOS.registro;

  async function cargarDatos() {
    if (!empresa?.id) return;

    try {
      setError("");
      setMensaje("");
      const [ventasData, comprasData, cajaData] = await Promise.all([
        obtenerLibroVentas(empresa.id, fechaDesde, fechaHasta),
        obtenerLibroCompras(empresa.id, fechaDesde, fechaHasta),
        listarPagosCobros(empresa.id, fechaDesde, fechaHasta),
      ]);
      setVentas(ventasData.ventas || ventasData.libro || []);
      setCompras(comprasData.compras || comprasData.libro || []);
      setMovimientosCaja(cajaData.movimientos || []);
      setMensaje("Información simplificada actualizada correctamente.");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    cargarDatos();
  }, [empresa?.id, vista]);

  const totales = useMemo(() => {
    const totalVentas = ventas.reduce((acc, item) => acc + Number(item.total || 0), 0);
    const totalCompras = compras.reduce((acc, item) => acc + Number(item.total || 0), 0);
    const ingresosCaja = movimientosCaja
      .filter((mov) => String(mov.tipo || "").toLowerCase().includes("cobro"))
      .reduce((acc, mov) => acc + Number(mov.monto || 0), 0);
    const egresosCaja = movimientosCaja
      .filter((mov) => String(mov.tipo || "").toLowerCase().includes("pago"))
      .reduce((acc, mov) => acc + Number(mov.monto || 0), 0);

    return {
      totalVentas,
      totalCompras,
      resultado: totalVentas - totalCompras,
      ingresosCaja,
      egresosCaja,
      saldoCaja: ingresosCaja - egresosCaja,
    };
  }, [ventas, compras, movimientosCaja]);

  const filasRegistro = useMemo(() => {
    if (vista === "caja") {
      return movimientosCaja.map((mov) => ({
        id: `caja-${mov.id}`,
        fecha: mov.fecha,
        tipo: String(mov.tipo || "").toLowerCase().includes("pago") ? "Egreso" : "Ingreso",
        documento: mov.documento || mov.folio || "-",
        tercero: mov.tercero || mov.glosa || "-",
        ingreso: String(mov.tipo || "").toLowerCase().includes("pago") ? 0 : Number(mov.monto || 0),
        egreso: String(mov.tipo || "").toLowerCase().includes("pago") ? Number(mov.monto || 0) : 0,
      }));
    }

    return [
      ...ventas.map((venta) => ({
        id: `venta-${venta.id || venta.folio}`,
        fecha: venta.fecha,
        tipo: "Ingreso",
        documento: `${venta.tipo_documento || "Venta"} ${venta.folio || ""}`.trim(),
        tercero: venta.razon_social_cliente || "Cliente",
        neto: Number(venta.neto || 0),
        iva: Number(venta.iva || 0),
        total: Number(venta.total || 0),
      })),
      ...compras.map((compra) => ({
        id: `compra-${compra.id || compra.folio}`,
        fecha: compra.fecha,
        tipo: "Egreso",
        documento: `${compra.tipo_documento || "Compra"} ${compra.folio || ""}`.trim(),
        tercero: compra.razon_social_proveedor || "Proveedor",
        neto: Number(compra.neto || 0) + Number(compra.exento || 0),
        iva: Number(compra.iva_credito || compra.iva || 0),
        total: Number(compra.total || 0),
      })),
    ].sort((a, b) => String(a.fecha || "").localeCompare(String(b.fecha || "")));
  }, [vista, ventas, compras, movimientosCaja]);

  const filasIngresosEgresos = [
    { concepto: "Ventas registradas", ingresos: totales.totalVentas, egresos: 0 },
    { concepto: "Compras registradas", ingresos: 0, egresos: totales.totalCompras },
    { concepto: "Cobros en caja/banco", ingresos: totales.ingresosCaja, egresos: 0 },
    { concepto: "Pagos en caja/banco", ingresos: 0, egresos: totales.egresosCaja },
  ];

  return (
    <div style={page}>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={bad}>{error}</p>}

      <section style={card}>
        <h2 style={title}>{meta.titulo}</h2>
        <p style={hint}>{meta.descripcion}</p>
        <div style={filters}>
          <label style={field}>
            Fecha desde
            <input style={input} type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
          </label>
          <label style={field}>
            Fecha hasta
            <input style={input} type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
          </label>
          <button style={primaryButton} type="button" onClick={cargarDatos}>
            Buscar
          </button>
        </div>
      </section>

      <div style={summaryGrid}>
        <Card titulo={vista === "caja" ? "Ingresos caja" : "Ingresos"} valor={moneda(vista === "caja" ? totales.ingresosCaja : totales.totalVentas)} />
        <Card titulo={vista === "caja" ? "Egresos caja" : "Egresos"} valor={moneda(vista === "caja" ? totales.egresosCaja : totales.totalCompras)} />
        <Card titulo={vista === "caja" ? "Saldo caja" : "Resultado"} valor={moneda(vista === "caja" ? totales.saldoCaja : totales.resultado)} destacado />
      </div>

      <section style={card}>
        {vista === "ingresosEgresos" ? (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Concepto</th>
                <th style={thRight}>Ingresos</th>
                <th style={thRight}>Egresos</th>
                <th style={thRight}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {filasIngresosEgresos.map((fila) => (
                <tr key={fila.concepto}>
                  <td style={td}>{fila.concepto}</td>
                  <td style={tdRight}>{moneda(fila.ingresos)}</td>
                  <td style={tdRight}>{moneda(fila.egresos)}</td>
                  <td style={tdRight}>{moneda(Number(fila.ingresos || 0) - Number(fila.egresos || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Fecha</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Documento</th>
                  <th style={th}>Tercero / Glosa</th>
                  {vista === "caja" ? (
                    <>
                      <th style={thRight}>Ingreso</th>
                      <th style={thRight}>Egreso</th>
                    </>
                  ) : (
                    <>
                      <th style={thRight}>Neto</th>
                      <th style={thRight}>IVA</th>
                      <th style={thRight}>Total</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filasRegistro.length === 0 ? (
                  <tr>
                    <td style={td} colSpan={vista === "caja" ? 6 : 7}>
                      No hay movimientos para el rango seleccionado.
                    </td>
                  </tr>
                ) : (
                  filasRegistro.map((fila) => (
                    <tr key={fila.id}>
                      <td style={td}>{formatoFecha(fila.fecha)}</td>
                      <td style={td}>{fila.tipo}</td>
                      <td style={td}>{fila.documento}</td>
                      <td style={td}>{fila.tercero}</td>
                      {vista === "caja" ? (
                        <>
                          <td style={tdRight}>{moneda(fila.ingreso)}</td>
                          <td style={tdRight}>{moneda(fila.egreso)}</td>
                        </>
                      ) : (
                        <>
                          <td style={tdRight}>{moneda(fila.neto)}</td>
                          <td style={tdRight}>{moneda(fila.iva)}</td>
                          <td style={tdRight}>{moneda(fila.total)}</td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ titulo, valor, destacado = false }) {
  return (
    <div style={{ ...smallCard, borderColor: destacado ? "#10b981" : "#bae6fd" }}>
      <p style={cardLabel}>{titulo}</p>
      <strong style={cardValue}>{valor}</strong>
    </div>
  );
}

const page = { display: "flex", flexDirection: "column", gap: "12px" };
const ok = { color: "#059669", fontWeight: "bold", margin: 0 };
const bad = { color: "#dc2626", fontWeight: "bold", margin: 0 };
const card = { background: "white", borderRadius: "16px", padding: "16px", boxShadow: "0 14px 30px rgba(3, 105, 161, 0.08)" };
const title = { color: "#0369a1", margin: "0 0 4px", fontSize: "22px" };
const hint = { color: "#475569", margin: "0 0 12px" };
const filters = { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "end" };
const field = { display: "flex", flexDirection: "column", gap: "5px", fontWeight: "bold" };
const input = { border: "1px solid #93c5fd", borderRadius: "10px", padding: "9px 10px", minHeight: "38px" };
const primaryButton = { border: "none", borderRadius: "10px", padding: "10px 18px", color: "white", fontWeight: "bold", background: "linear-gradient(135deg, #0369a1, #06b6d4)", cursor: "pointer" };
const summaryGrid = { display: "grid", gridTemplateColumns: "repeat(3, minmax(160px, 1fr))", gap: "10px" };
const smallCard = { background: "white", border: "1px solid #bae6fd", borderRadius: "14px", padding: "12px", boxShadow: "0 12px 26px rgba(3, 105, 161, 0.08)" };
const cardLabel = { margin: "0 0 6px", color: "#0f172a", fontWeight: "bold" };
const cardValue = { color: "#0369a1", fontSize: "18px" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: "13px" };
const th = { background: "#dff4ff", color: "#075985", padding: "9px", textAlign: "left" };
const thRight = { ...th, textAlign: "right" };
const td = { borderBottom: "1px solid #dbeafe", padding: "8px", color: "#0f172a" };
const tdRight = { ...td, textAlign: "right" };
