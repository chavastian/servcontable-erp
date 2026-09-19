import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerDashboardFinanciero } from "../services/dashboardFinancieroService";
import {
  obtenerPeriodoTrabajo,
  obtenerRangoPeriodoTrabajo,
} from "../services/periodoTrabajoService";
import ModuloHero from "../components/ModuloHero";

export default function DashboardFinanciero({ irVista }) {
  const empresaActiva = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());

  const [data, setData] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (empresaActiva) {
      cargarDashboard();
    }
  }, []);

  async function cargarDashboard() {
    try {
      setError("");
      setMensaje("");

      const { fechaDesde, fechaHasta } = obtenerRangoPeriodoTrabajo(periodo);
      const respuesta = await obtenerDashboardFinanciero(
        empresaActiva.id,
        fechaDesde,
        fechaHasta
      );

      setData(respuesta);
      setMensaje("Dashboard financiero actualizado correctamente.");
    } catch (err) {
      setError(err.message);
    }
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  function fechaCL(fecha) {
    if (!fecha) return "";
    const texto = String(fecha).substring(0, 10);
    const partes = texto.split("-");
    if (partes.length !== 3) return texto;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  function porcentaje(valor, base) {
    const v = Number(valor || 0);
    const b = Number(base || 0);

    if (b <= 0) return 0;

    return Math.round((v / b) * 100);
  }

  if (!empresaActiva) {
    return (
      <div>
        <h1 style={titulo}>Dashboard Financiero</h1>
        <div style={alerta}>
          Debes seleccionar una empresa activa antes de ver el dashboard.
        </div>
      </div>
    );
  }

  const ventas = data?.ventas || {};
  const compras = data?.compras || {};
  const honorarios = data?.honorarios || {};
  const iva = data?.iva || {};
  const cuentas = data?.cuentas || {};
  const flujo = data?.flujo || {};
  const resultado = data?.resultado || {};
  const comprobantes = data?.comprobantes || {};
  const ultimosMovimientos = data?.ultimos_movimientos || [];

  return (
    <div>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <ModuloHero
        titulo="Dashboard Financiero"
        descripcion="Resumen ejecutivo de ventas, compras, IVA, flujo y cuentas pendientes."
      >
        <div style={filtrosBox}>
          <div>
          <label style={label}>Periodo</label>
          <input
            style={input}
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
          />
          </div>

          <button type="button" style={botonBuscar} onClick={cargarDashboard}>
            Actualizar
          </button>
        </div>
      </ModuloHero>

      <div style={gridPrincipal}>
        <CardKPI
          titulo="Ventas del período"
          valor={formato(ventas.total)}
          detalle={`${ventas.cantidad || 0} documentos`}
          icono={<IconoFinanciero tipo="ventas" />}
          color="#10b981"
          onClick={() => irVista && irVista("ventas")}
        />

        <CardKPI
          titulo="Compras del período"
          valor={formato(compras.total)}
          detalle={`${compras.cantidad || 0} documentos`}
          icono={<IconoFinanciero tipo="compras" />}
          color="#0ea5e9"
          onClick={() => irVista && irVista("compras")}
        />

        <CardKPI
          titulo="Cuentas por cobrar"
          valor={formato(cuentas.por_cobrar)}
          detalle={`${cuentas.por_cobrar_cantidad || 0} pendientes`}
          icono={<IconoFinanciero tipo="cobrar" />}
          color="#22c55e"
          onClick={() => irVista && irVista("cuentasPendientes")}
        />

        <CardKPI
          titulo="Cuentas por pagar"
          valor={formato(cuentas.por_pagar)}
          detalle={`${cuentas.por_pagar_cantidad || 0} pendientes`}
          icono={<IconoFinanciero tipo="pagar" />}
          color="#ef4444"
          onClick={() => irVista && irVista("cuentasPendientes")}
        />

        <CardKPI
          titulo="IVA a pagar"
          valor={formato(iva.iva_a_pagar)}
          detalle={
            iva.remanente_estimado > 0
              ? `Remanente estimado ${formato(iva.remanente_estimado)}`
              : "IVA determinado positivo"
          }
          icono={<IconoFinanciero tipo="iva" />}
          color={iva.iva_a_pagar > 0 ? "#ef4444" : "#22c55e"}
          onClick={() => irVista && irVista("resumenIVA")}
        />

        <CardKPI
          titulo="Resultado ejercicio"
          valor={formato(resultado.resultado_ejercicio)}
          detalle={
            Number(resultado.resultado_ejercicio || 0) >= 0
              ? "Utilidad estimada"
              : "Pérdida estimada"
          }
          icono={<IconoFinanciero tipo="resultado" />}
          color={
            Number(resultado.resultado_ejercicio || 0) >= 0
              ? "#10b981"
              : "#ef4444"
          }
          onClick={() => irVista && irVista("estadoResultados")}
        />
      </div>

      <div style={gridSecundario}>
        <div style={panel}>
          <div style={panelHeader}>
            <h2 style={tituloPanel}>Resumen IVA</h2>
            <button type="button"
              style={botonMini}
              onClick={() => irVista && irVista("resumenIVA")}
            >
              Ver IVA
            </button>
          </div>

          <FilaResumen label="IVA Débito" valor={formato(iva.debito)} />
          <FilaResumen label="IVA Crédito" valor={formato(iva.credito)} />
          <FilaResumen
            label="IVA determinado"
            valor={formato(iva.determinado)}
            destacado
          />
          <FilaResumen
            label="IVA a pagar"
            valor={formato(iva.iva_a_pagar)}
            rojo={iva.iva_a_pagar > 0}
          />
          <FilaResumen
            label="Remanente estimado"
            valor={formato(iva.remanente_estimado)}
            verde={iva.remanente_estimado > 0}
          />
        </div>

        <div style={panel}>
          <div style={panelHeader}>
            <h2 style={tituloPanel}>Resultado</h2>
            <button type="button"
              style={botonMini}
              onClick={() => irVista && irVista("estadoResultados")}
            >
              Ver EERR
            </button>
          </div>

          <FilaResumen label="Ingresos" valor={formato(resultado.ingresos)} />
          <FilaResumen label="Costos" valor={formato(resultado.costos)} />
          <FilaResumen label="Gastos" valor={formato(resultado.gastos)} />
          <FilaResumen
            label="Margen bruto"
            valor={formato(resultado.margen_bruto)}
          />
          <FilaResumen
            label="Resultado ejercicio"
            valor={formato(resultado.resultado_ejercicio)}
            destacado
          />
        </div>

        <div style={panel}>
          <div style={panelHeader}>
            <h2 style={tituloPanel}>Flujo caja/banco</h2>
            <button type="button"
              style={botonMini}
              onClick={() => irVista && irVista("pagosCobros")}
            >
              Ver pagos/cobros
            </button>
          </div>

          <FilaResumen label="Cobros registrados" valor={formato(flujo.cobros)} />
          <FilaResumen label="Pagos registrados" valor={formato(flujo.pagos)} />
          <FilaResumen
            label="Saldo neto estimado"
            valor={formato(flujo.saldo_estimado)}
            destacado
          />
          <FilaResumen label="Movimientos" valor={flujo.cantidad || 0} />
        </div>

        <div style={panel}>
          <div style={panelHeader}>
            <h2 style={tituloPanel}>Control contable</h2>
            <button type="button"
              style={botonMini}
              onClick={() => irVista && irVista("comprobantes")}
            >
              Ver comprobantes
            </button>
          </div>

          <FilaResumen
            label="Comprobantes"
            valor={comprobantes.cantidad || 0}
          />
          <FilaResumen
            label="Total debe"
            valor={formato(comprobantes.total_debe)}
          />
          <FilaResumen
            label="Total haber"
            valor={formato(comprobantes.total_haber)}
          />
          <FilaResumen
            label="Diferencia"
            valor={formato(comprobantes.diferencia)}
            destacado
            rojo={Number(comprobantes.diferencia || 0) !== 0}
            verde={Number(comprobantes.diferencia || 0) === 0}
          />
        </div>
      </div>

      <div style={gridTercero}>
        <div style={panelGrande}>
          <div style={panelHeader}>
            <h2 style={tituloPanel}>Composición de pendientes</h2>
            <button type="button"
              style={botonMini}
              onClick={() => irVista && irVista("cuentasPendientes")}
            >
              Ver cuentas
            </button>
          </div>

          <BarraIndicador
            label="Por cobrar"
            valor={cuentas.por_cobrar}
            total={Number(cuentas.por_cobrar || 0) + Number(cuentas.por_pagar || 0)}
            color="#10b981"
            formato={formato}
          />

          <BarraIndicador
            label="Por pagar compras"
            valor={cuentas.por_pagar_compras}
            total={Number(cuentas.por_cobrar || 0) + Number(cuentas.por_pagar || 0)}
            color="#ef4444"
            formato={formato}
          />

          <BarraIndicador
            label="Por pagar honorarios"
            valor={cuentas.por_pagar_honorarios}
            total={Number(cuentas.por_cobrar || 0) + Number(cuentas.por_pagar || 0)}
            color="#f97316"
            formato={formato}
          />
        </div>

        <div style={panelGrande}>
          <div style={panelHeader}>
            <h2 style={tituloPanel}>Últimos pagos y cobros</h2>
            <button type="button"
              style={botonMini}
              onClick={() => irVista && irVista("pagosCobros")}
            >
              Ver todos
            </button>
          </div>

          <div style={tablaBox}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={th}>Fecha</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Documento</th>
                  <th style={th}>Tercero</th>
                  <th style={thNumero}>Monto</th>
                </tr>
              </thead>

              <tbody>
                {ultimosMovimientos.map((item, index) => (
                  <tr key={index}>
                    <td style={td}>{fechaCL(item.fecha)}</td>
                    <td style={td}>{item.tipo_movimiento}</td>
                    <td style={td}>
                      {item.tipo_documento} {item.folio || ""}
                    </td>
                    <td style={td}>{item.nombre_tercero}</td>
                    <td style={tdNumero}>{formato(item.monto)}</td>
                  </tr>
                ))}

                {ultimosMovimientos.length === 0 && (
                  <tr>
                    <td style={td} colSpan="5">
                      No hay pagos o cobros registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={accesosRapidos}>
        <BotonAcceso texto="Registrar venta" icono={<IconoFinanciero tipo="ventas" />} onClick={() => irVista && irVista("ventas")} />
        <BotonAcceso texto="Registrar compra" icono={<IconoFinanciero tipo="compras" />} onClick={() => irVista && irVista("compras")} />
        <BotonAcceso texto="Nuevo comprobante" icono={<IconoFinanciero tipo="comprobante" />} onClick={() => irVista && irVista("comprobantes")} />
        <BotonAcceso texto="Registrar pago/cobro" icono={<IconoFinanciero tipo="banco" />} onClick={() => irVista && irVista("pagosCobros")} />
        <BotonAcceso texto="Honorarios" icono={<IconoFinanciero tipo="honorarios" />} onClick={() => irVista && irVista("honorarios")} />
        <BotonAcceso texto="Balance" icono={<IconoFinanciero tipo="balance" />} onClick={() => irVista && irVista("balance8")} />
      </div>
    </div>
  );
}

function CardKPI({ titulo, valor, detalle, icono, color, onClick }) {
  return (
    <button type="button" style={cardKpi(color)} onClick={onClick}>
      <div style={cardKpiTop}>
        <span style={cardIcono}>{icono}</span>
        <span style={{ ...cardLinea, background: color }} />
      </div>
      <strong style={cardTitulo}>{titulo}</strong>
      <span style={cardValor}>{valor}</span>
      <small style={cardDetalle}>{detalle}</small>
    </button>
  );
}

function FilaResumen({ label, valor, destacado, rojo, verde }) {
  return (
    <div style={destacado ? filaResumenDestacada : filaResumen}>
      <span>{label}</span>
      <strong
        style={{
          color: rojo ? "#ef4444" : verde ? "#10b981" : "#0f172a",
        }}
      >
        {valor}
      </strong>
    </div>
  );
}

function BarraIndicador({ label, valor, total, color, formato }) {
  const pct = total > 0 ? Math.round((Number(valor || 0) / total) * 100) : 0;

  return (
    <div style={barraBox}>
      <div style={barraTexto}>
        <strong>{label}</strong>
        <span>{formato(valor)}</span>
      </div>

      <div style={barraFondo}>
        <div
          style={{
            ...barraRelleno,
            width: `${pct}%`,
            background: color,
          }}
        />
      </div>

      <small style={barraPorcentaje}>{pct}% del total pendiente</small>
    </div>
  );
}

function BotonAcceso({ texto, icono, onClick }) {
  return (
    <button type="button" style={botonAcceso} onClick={onClick}>
      <span style={botonAccesoIcono}>{icono}</span>
      <strong>{texto}</strong>
    </button>
  );
}

function IconoFinanciero({ tipo }) {
  const props = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  const iconos = {
    ventas: (
      <svg {...props}>
        <path d="M7 3h10v18H7z" />
        <path d="M9 7h6" />
        <path d="M9 11h6" />
        <path d="M9 15h3" />
      </svg>
    ),
    compras: (
      <svg {...props}>
        <path d="M6 6h15l-2 8H8z" />
        <path d="M6 6 5 3H2" />
        <path d="M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
        <path d="M18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
      </svg>
    ),
    cobrar: (
      <svg {...props}>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
        <path d="M7 6h10" />
      </svg>
    ),
    pagar: (
      <svg {...props}>
        <path d="M12 21V9" />
        <path d="m7 14 5-5 5 5" />
        <path d="M5 3h14" />
        <path d="M7 18h10" />
      </svg>
    ),
    iva: (
      <svg {...props}>
        <path d="M4 7h16" />
        <path d="M4 17h16" />
        <path d="M7 4l10 16" />
      </svg>
    ),
    resultado: (
      <svg {...props}>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="m7 15 4-4 3 3 5-7" />
      </svg>
    ),
    comprobante: (
      <svg {...props}>
        <path d="M8 3h8l4 4v14H8z" />
        <path d="M16 3v5h4" />
        <path d="M4 7v14h4" />
        <path d="M11 13h6" />
        <path d="M11 17h4" />
      </svg>
    ),
    banco: (
      <svg {...props}>
        <path d="M3 10h18" />
        <path d="M5 10v9" />
        <path d="M9 10v9" />
        <path d="M15 10v9" />
        <path d="M19 10v9" />
        <path d="M4 19h16" />
        <path d="M12 4 4 10h16z" />
      </svg>
    ),
    honorarios: (
      <svg {...props}>
        <path d="M7 3h10v18l-2-1-2 1-2-1-2 1-2-1z" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
      </svg>
    ),
    balance: (
      <svg {...props}>
        <path d="M4 19h16" />
        <path d="M7 19V9" />
        <path d="M12 19V5" />
        <path d="M17 19v-7" />
      </svg>
    ),
  };

  return iconos[tipo] || iconos.comprobante;
}

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
  marginBottom: "18px",
};

const titulo = {
  fontSize: "34px",
  color: "#0f172a",
  marginBottom: "5px",
};

const subtitulo = {
  color: "#475569",
  marginBottom: "0",
};

const empresaCard = {
  background: "rgba(255,255,255,0.96)",
  borderRadius: "16px",
  padding: "16px 24px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  border: "1px solid rgba(169, 216, 239, 0.75)",
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  color: "#1e293b",
  minWidth: "220px",
};

const filtrosBox = {
  display: "flex",
  alignItems: "end",
  gap: "12px",
  flexWrap: "wrap",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "white",
  marginBottom: "5px",
};

const input = {
  padding: "10px",
  border: "1px solid #a9d8ef",
  borderRadius: "10px",
  minWidth: "170px",
  height: "40px",
  boxSizing: "border-box",
};

const botonBuscar = {
  background: "white",
  color: "#0369a1",
  border: "none",
  padding: "10px 20px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const gridPrincipal = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: "16px",
  marginBottom: "18px",
};

const cardKpi = (color) => ({
  background: "linear-gradient(180deg, #ffffff 0%, #f8fcff 100%)",
  border: "1px solid rgba(169, 216, 239, 0.78)",
  borderLeft: `5px solid ${color}`,
  borderRadius: "18px",
  padding: "18px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  textAlign: "left",
  cursor: "pointer",
  minHeight: "145px",
});

const cardKpiTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "8px",
};

const cardIcono = {
  width: "38px",
  height: "38px",
  borderRadius: "13px",
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  border: "1px solid #67e8f9",
  color: "#0369a1",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 8px 18px rgba(15, 76, 129, 0.12)",
};

const cardLinea = {
  width: "42px",
  height: "5px",
  borderRadius: "999px",
};

const cardTitulo = {
  display: "block",
  color: "#1e293b",
  marginBottom: "8px",
};

const cardValor = {
  display: "block",
  fontSize: "24px",
  fontWeight: "bold",
  color: "#0369a1",
  marginBottom: "5px",
};

const cardDetalle = {
  color: "#475569",
};

const gridSecundario = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "16px",
  marginBottom: "18px",
};

const gridTercero = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
  gap: "16px",
  marginBottom: "18px",
};

const panel = {
  background: "rgba(255,255,255,0.96)",
  borderRadius: "18px",
  padding: "18px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  border: "1px solid rgba(169, 216, 239, 0.7)",
};

const panelGrande = {
  ...panel,
  minHeight: "260px",
};

const panelHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "12px",
};

const tituloPanel = {
  color: "#0369a1",
  fontSize: "20px",
  margin: 0,
};

const botonMini = {
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  color: "#0369a1",
  border: "1px solid #67e8f9",
  borderRadius: "9px",
  padding: "8px 12px",
  fontWeight: "bold",
  cursor: "pointer",
};

const filaResumen = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: "1px solid #e2e8f0",
  padding: "9px 0",
  color: "#1e293b",
};

const filaResumenDestacada = {
  ...filaResumen,
  background: "linear-gradient(135deg, #ecfeff, #f8fcff)",
  padding: "10px",
  borderRadius: "10px",
  borderBottom: "none",
  marginTop: "8px",
};

const barraBox = {
  marginBottom: "16px",
};

const barraTexto = {
  display: "flex",
  justifyContent: "space-between",
  color: "#1e293b",
  marginBottom: "6px",
};

const barraFondo = {
  background: "#e2e8f0",
  height: "10px",
  borderRadius: "999px",
  overflow: "hidden",
};

const barraRelleno = {
  height: "100%",
  borderRadius: "999px",
};

const barraPorcentaje = {
  display: "block",
  marginTop: "4px",
  color: "#475569",
};

const tablaBox = {
  overflowX: "auto",
};

const tabla = {
  width: "100%",
  borderCollapse: "collapse",
};

const th = {
  textAlign: "left",
  padding: "10px",
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  color: "#0369a1",
  whiteSpace: "nowrap",
};

const thNumero = {
  ...th,
  textAlign: "right",
};

const td = {
  padding: "9px",
  borderBottom: "1px solid #e2e8f0",
  color: "#1e293b",
  verticalAlign: "top",
};

const tdNumero = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const accesosRapidos = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px",
};

const botonAcceso = {
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  color: "#0369a1",
  border: "1px solid #67e8f9",
  borderRadius: "14px",
  padding: "14px",
  cursor: "pointer",
  fontWeight: "bold",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
};

const botonAccesoIcono = {
  color: "#0369a1",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const ok = {
  color: "#10b981",
  fontWeight: "bold",
};

const err = {
  color: "#ef4444",
  fontWeight: "bold",
};

const alerta = {
  marginTop: "25px",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  padding: "16px",
  borderRadius: "14px",
  fontWeight: "bold",
};
