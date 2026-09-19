import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../../services/empresaService";
import { obtenerDashboardContable } from "../../services/dashboardContableService";
import {
  obtenerPeriodoTrabajo,
  obtenerRangoPeriodoTrabajo,
} from "../../services/periodoTrabajoService";
import ModuloHero from "../../components/ModuloHero";
import PeriodoMesSelector from "../../components/PeriodoMesSelector";

export default function DashboardContable({ irVista }) {
  const empresaActiva = obtenerEmpresaActiva();
  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [datos, setDatos] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (empresaActiva) {
      cargarDashboard();
    }
  }, []);

  async function cargarDashboard() {
    try {
      setMensaje("");
      setError("");

      const { fechaDesde, fechaHasta } = obtenerRangoPeriodoTrabajo(periodo);
      const data = await obtenerDashboardContable(
        empresaActiva.id,
        fechaDesde,
        fechaHasta
      );

      setDatos(data);
      setMensaje("Dashboard contable actualizado correctamente.");
    } catch (err) {
      setError(err.message);
    }
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  const vacio = {
    ventas: { total: 0, neto: 0, iva: 0, cantidad: 0 },
    compras: { total: 0, neto: 0, iva: 0, cantidad: 0 },
    iva: { debito: 0, credito: 0, determinado: 0, estado: "" },
    honorarios: { bruto: 0, retencion: 0, liquido: 0, cantidad: 0 },
    remuneraciones: {
      costo_empresa: 0,
      liquido_pagar: 0,
      contabilizadas: 0,
      pendientes: 0,
    },
    finiquitos: { total_finiquito: 0, contabilizados: 0, pendientes: 0 },
    comprobantes: { cantidad: 0, total_debe: 0, total_haber: 0, diferencia: 0 },
    resultado: { ingresos: 0, gastos: 0, resultado_periodo: 0 },
    ultimos_comprobantes: [],
  };

  const info = datos || vacio;

  return (
    <div>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <ModuloHero
        titulo="Dashboard Contable"
        descripcion="Resumen financiero, tributario y contable de la empresa activa."
      >
        <div style={filtrosHero}>
          <div>
            <label style={labelHero} htmlFor="dashboard-contable-periodo">Período</label>
            <PeriodoMesSelector
              id="dashboard-contable-periodo"
              style={inputHero}
              value={periodo}
              onChange={setPeriodo}
            />
          </div>

          <button type="button" style={botonHero} onClick={cargarDashboard}>
            Actualizar
          </button>
        </div>
      </ModuloHero>

      <div style={gridIndicadores}>
        <Indicador
          icono={<IconoDashboard tipo="ventas" />}
          titulo="Ventas del periodo"
          valor={formato(info.ventas.total)}
          detalle={`${info.ventas.cantidad} documentos`}
        />

        <Indicador
          icono={<IconoDashboard tipo="compras" />}
          titulo="Compras del periodo"
          valor={formato(info.compras.total)}
          detalle={`${info.compras.cantidad} documentos`}
        />

        <Indicador
          icono={<IconoDashboard tipo="iva" />}
          titulo="IVA determinado"
          valor={formato(info.iva.determinado)}
          detalle={info.iva.estado}
          alerta={Number(info.iva.determinado || 0) > 0}
        />

        <Indicador
          icono={<IconoDashboard tipo="resultado" />}
          titulo="Resultado del periodo"
          valor={formato(info.resultado.resultado_periodo)}
          detalle={`Ingresos ${formato(info.resultado.ingresos)} / Gastos ${formato(
            info.resultado.gastos
          )}`}
          destacado={Number(info.resultado.resultado_periodo || 0) >= 0}
          alerta={Number(info.resultado.resultado_periodo || 0) < 0}
        />

        <Indicador
          icono={<IconoDashboard tipo="comprobantes" />}
          titulo="Comprobantes"
          valor={info.comprobantes.cantidad}
          detalle={`Debe ${formato(info.comprobantes.total_debe)} / Haber ${formato(
            info.comprobantes.total_haber
          )}`}
        />

        <Indicador
          icono={<IconoDashboard tipo="remuneraciones" />}
          titulo="Remuneraciones"
          valor={formato(info.remuneraciones.costo_empresa)}
          detalle={`${info.remuneraciones.pendientes} pendientes de contabilizar`}
          alerta={Number(info.remuneraciones.pendientes || 0) > 0}
        />

        <Indicador
          icono={<IconoDashboard tipo="finiquitos" />}
          titulo="Finiquitos"
          valor={formato(info.finiquitos.total_finiquito)}
          detalle={`${info.finiquitos.pendientes} pendientes de contabilizar`}
          alerta={Number(info.finiquitos.pendientes || 0) > 0}
        />

        <Indicador
          icono={<IconoDashboard tipo="honorarios" />}
          titulo="Honorarios"
          valor={formato(info.honorarios.bruto)}
          detalle={`Retencion ${formato(info.honorarios.retencion)}`}
        />
      </div>

      <div style={gridDos}>
        <div style={card}>
          <h2 style={tituloSeccion}>Resumen IVA</h2>

          <Fila label="IVA débito ventas" valor={formato(info.iva.debito)} />
          <Fila label="IVA crédito compras" valor={formato(info.iva.credito)} />
          <Fila
            label={info.iva.estado || "IVA determinado"}
            valor={formato(info.iva.determinado)}
            destacado
          />

          <button
            type="button"
            style={botonSecundario}
            onClick={() => irVista && irVista("resumenIVA")}
          >
            Ir a Resumen IVA
          </button>
        </div>

        <div style={card}>
          <h2 style={tituloSeccion}>Accesos rápidos</h2>

          <div style={gridAccesos}>
            <button
              type="button"
              style={acceso}
              onClick={() => irVista && irVista("comprobantes")}
            >
              <span style={accesoIcono}>
                <IconoDashboard tipo="nuevo" />
              </span>
              Nuevo comprobante
            </button>

            <button
              type="button"
              style={acceso}
              onClick={() => irVista && irVista("libroDiario")}
            >
              <span style={accesoIcono}>
                <IconoDashboard tipo="libro" />
              </span>
              Libro diario
            </button>

            <button
              type="button"
              style={acceso}
              onClick={() => irVista && irVista("balance8")}
            >
              <span style={accesoIcono}>
                <IconoDashboard tipo="balance" />
              </span>
              Balance 8 columnas
            </button>

            <button
              type="button"
              style={acceso}
              onClick={() => irVista && irVista("librosCompraVenta")}
            >
              <span style={accesoIcono}>
                <IconoDashboard tipo="comprasVentas" />
              </span>
              Compras y ventas
            </button>
          </div>
        </div>
      </div>

      <div style={card}>
        <h2 style={tituloSeccion}>Últimos comprobantes</h2>

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Fecha</th>
                <th style={th}>Tipo</th>
                <th style={th}>N°</th>
                <th style={th}>Glosa</th>
                <th style={thNumero}>Debe</th>
                <th style={thNumero}>Haber</th>
              </tr>
            </thead>

            <tbody>
              {info.ultimos_comprobantes.map((item) => (
                <tr key={item.id}>
                  <td style={td}>{String(item.fecha || "").substring(0, 10)}</td>
                  <td style={td}>{item.tipo}</td>
                  <td style={td}>{item.numero}</td>
                  <td style={td}>{item.glosa}</td>
                  <td style={tdNumero}>{formato(item.total_debe)}</td>
                  <td style={tdNumero}>{formato(item.total_haber)}</td>
                </tr>
              ))}

              {info.ultimos_comprobantes.length === 0 && (
                <tr>
                  <td style={td} colSpan="6">
                    No hay comprobantes registrados para este rango.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Indicador({ icono, titulo, valor, detalle, destacado, alerta }) {
  return (
    <div style={alerta ? indicadorAlerta : destacado ? indicadorDestacado : indicador}>
      <span style={indicadorIcono}>{icono}</span>
      <strong>{titulo}</strong>
      <span style={indicadorValor}>{valor}</span>
      <small>{detalle}</small>
    </div>
  );
}

function IconoDashboard({ tipo }) {
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
    comprobantes: (
      <svg {...props}>
        <path d="M8 3h8l4 4v14H8z" />
        <path d="M16 3v5h4" />
        <path d="M4 7v14h4" />
        <path d="M11 13h6" />
        <path d="M11 17h4" />
      </svg>
    ),
    remuneraciones: (
      <svg {...props}>
        <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
        <path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
        <path d="M20 21v-2a3 3 0 0 0-2-2.8" />
        <path d="M17 4.2a3 3 0 0 1 0 5.6" />
      </svg>
    ),
    finiquitos: (
      <svg {...props}>
        <path d="M9 4h6l1 2h3v15H5V6h3z" />
        <path d="m8 13 3 3 5-6" />
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
    nuevo: (
      <svg {...props}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
        <path d="M4 4h6" />
        <path d="M4 20h16" />
      </svg>
    ),
    libro: (
      <svg {...props}>
        <path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3-3z" />
        <path d="M5 4v13" />
        <path d="M9 8h5" />
        <path d="M9 12h5" />
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
    comprasVentas: (
      <svg {...props}>
        <path d="M7 7h13l-2 6H9z" />
        <path d="M7 7 6 4H3" />
        <path d="M6 18h12" />
        <path d="m15 15 3 3-3 3" />
      </svg>
    ),
  };

  return iconos[tipo] || iconos.comprobantes;
}

function Fila({ label, valor, destacado }) {
  return (
    <div style={destacado ? filaDestacada : fila}>
      <span>{label}</span>
      <strong>{valor}</strong>
    </div>
  );
}

const filtrosHero = {
  display: "flex",
  gap: "12px",
  alignItems: "end",
  flexWrap: "wrap",
};

const labelHero = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-celeste-suave)",
  marginBottom: "5px",
};

const inputHero = {
  width: "160px",
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "10px",
  height: "40px",
  boxSizing: "border-box",
};

const botonHero = {
  background: "white",
  color: "var(--sc-azul)",
  border: "none",
  padding: "10px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const gridIndicadores = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
  marginBottom: "22px",
};

const indicador = {
  background: "linear-gradient(180deg, #ffffff 0%, var(--sc-fondo-claro) 100%)",
  border: "1px solid rgba(169, 216, 239, 0.72)",
  borderRadius: "18px",
  padding: "18px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  color: "var(--sc-text)",
  display: "flex",
  flexDirection: "column",
  gap: "7px",
  minHeight: "130px",
};

const indicadorIcono = {
  width: "38px",
  height: "38px",
  borderRadius: "13px",
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  border: "1px solid #67e8f9",
  color: "var(--sc-azul)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 8px 18px rgba(15, 76, 129, 0.12)",
};

const indicadorDestacado = {
  ...indicador,
  border: "2px solid var(--sc-teal)",
};

const indicadorAlerta = {
  ...indicador,
  border: "2px solid var(--sc-warning)",
};

const indicadorValor = {
  fontSize: "23px",
  fontWeight: "bold",
  color: "var(--sc-azul)",
};

const gridDos = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "20px",
  marginBottom: "22px",
};

const card = {
  background: "rgba(255,255,255,0.96)",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "20px",
  border: "1px solid rgba(169, 216, 239, 0.7)",
};

const tituloSeccion = {
  color: "var(--sc-azul)",
  marginTop: 0,
};

const fila = {
  display: "flex",
  justifyContent: "space-between",
  borderBottom: "1px solid var(--sc-borde-claro)",
  padding: "10px 0",
  color: "var(--sc-text)",
};

const filaDestacada = {
  ...fila,
  color: "var(--sc-azul)",
  fontWeight: "bold",
};

const botonSecundario = {
  marginTop: "16px",
  background: "linear-gradient(135deg, var(--sc-azul), var(--sc-cian-medio))",
  color: "white",
  border: "none",
  padding: "11px 15px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const gridAccesos = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px",
};

const acceso = {
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  border: "1px solid #67e8f9",
  color: "var(--sc-azul)",
  padding: "14px",
  borderRadius: "12px",
  cursor: "pointer",
  fontWeight: "bold",
  textAlign: "left",
  display: "flex",
  alignItems: "center",
  gap: "9px",
};

const accesoIcono = {
  color: "var(--sc-azul)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
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
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  color: "var(--sc-azul)",
  whiteSpace: "nowrap",
};

const thNumero = {
  ...th,
  textAlign: "right",
};

const td = {
  padding: "9px",
  borderBottom: "1px solid var(--sc-borde-claro)",
  color: "var(--sc-text)",
};

const tdNumero = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const ok = {
  color: "var(--sc-teal)",
  fontWeight: "bold",
};

const err = {
  color: "var(--sc-danger)",
  fontWeight: "bold",
};
