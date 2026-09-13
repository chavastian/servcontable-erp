import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../../services/empresaService";
import { obtenerDashboardRemuneraciones } from "../../services/dashboardRemuneracionesService";
import { obtenerPeriodoTrabajo } from "../../services/periodoTrabajoService";
import PeriodoMesSelector from "../../components/PeriodoMesSelector";
import ModuloHero from "../../components/ModuloHero";
import IconoSistema from "../../components/IconoSistema";

export default function DashboardRemuneraciones({ irSubmodulo }) {
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

      const data = await obtenerDashboardRemuneraciones(
        empresaActiva.id,
        periodo
      );

      setDatos(data);
      setMensaje("Dashboard actualizado correctamente.");
    } catch (err) {
      setError(err.message);
    }
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  const indicadores = datos?.indicadores || {
    totalTrabajadores: 0,
    totalLiquidaciones: 0,
    liquidacionesContabilizadas: 0,
    liquidacionesPendientes: 0,
    totalHaberes: 0,
    totalDescuentos: 0,
    totalLiquido: 0,
    totalCostoEmpresa: 0,
    totalCotizaciones: 0,
    totalPagado: 0,
    saldoPendientePagos: 0,
  };

  const variables = datos?.variables || {
    haberes_imponibles: 0,
    haberes_no_imponibles: 0,
    descuentos: 0,
    total_general: 0,
  };

  return (
    <div>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <ModuloHero
        titulo="Panel de Remuneraciones"
        descripcion="Resumen mensual de trabajadores, liquidaciones, cotizaciones y pagos."
      >
        <div style={filtros}>
          <div>
            <label style={label}>Periodo</label>
            <PeriodoMesSelector style={input} value={periodo} onChange={setPeriodo} />
          </div>

          <button style={botonBuscar} onClick={cargarDashboard}>
            Actualizar
          </button>
        </div>
      </ModuloHero>

      <div style={gridIndicadores}>
        <Indicador
          titulo="Trabajadores activos"
          valor={indicadores.totalTrabajadores}
          detalle="Trabajadores vigentes"
          icono={<IconoSistema tipo="trabajador" />}
        />

        <Indicador
          titulo="Liquidaciones emitidas"
          valor={indicadores.totalLiquidaciones}
          detalle={`${indicadores.liquidacionesContabilizadas} contabilizadas`}
          icono={<IconoSistema tipo="liquidacion" />}
        />

        <Indicador
          titulo="Pendientes de contabilizar"
          valor={indicadores.liquidacionesPendientes}
          detalle="Liquidaciones sin comprobante"
          icono={<IconoSistema tipo="comprobante" />}
          alerta={indicadores.liquidacionesPendientes > 0}
        />

        <Indicador
          titulo="Liquido a pagar"
          valor={formato(indicadores.totalLiquido)}
          detalle="Total liquido del periodo"
          icono={<IconoSistema tipo="dinero" />}
          destacado
        />

        <Indicador
          titulo="Cotizaciones estimadas"
          valor={formato(indicadores.totalCotizaciones)}
          detalle="AFP, salud, AFC, SIS y mutual"
          icono={<IconoSistema tipo="banco" />}
        />

        <Indicador
          titulo="Costo empresa"
          valor={formato(indicadores.totalCostoEmpresa)}
          detalle="Haberes + aportes empleador"
          icono={<IconoSistema tipo="balance" />}
        />

        <Indicador
          titulo="Pagos registrados"
          valor={formato(indicadores.totalPagado)}
          detalle="Pagos de remuneraciones"
          icono={<IconoSistema tipo="ok" />}
        />

        <Indicador
          titulo="Saldo pendiente"
          valor={formato(indicadores.saldoPendientePagos)}
          detalle="Obligaciones por pagar"
          icono={<IconoSistema tipo="alerta" />}
          alerta={indicadores.saldoPendientePagos > 0}
        />
      </div>

      <div style={gridDosColumnas}>
        <div style={card}>
          <h2 style={tituloSeccion}>Accesos rapidos</h2>

          <div style={gridAccesos}>
            <button style={acceso} onClick={() => irSubmodulo("trabajadores")}>
              <span style={accesoIcono}>
                <IconoSistema tipo="trabajador" />
              </span>
              <strong>Trabajadores</strong>
              <small>Crear y administrar fichas.</small>
            </button>

            <button
              style={acceso}
              onClick={() => irSubmodulo("haberesDescuentos")}
            >
              <span style={accesoIcono}>
                <IconoSistema tipo="dinero" />
              </span>
              <strong>Haberes y descuentos</strong>
              <small>Bonos, colacion, anticipos y variables.</small>
            </button>

            <button style={acceso} onClick={() => irSubmodulo("liquidaciones")}>
              <span style={accesoIcono}>
                <IconoSistema tipo="liquidacion" />
              </span>
              <strong>Liquidaciones</strong>
              <small>Calcular, guardar y contabilizar.</small>
            </button>

            <button style={acceso} onClick={() => irSubmodulo("libro")}>
              <span style={accesoIcono}>
                <IconoSistema tipo="comprobante" />
              </span>
              <strong>Libro remuneraciones</strong>
              <small>Exportar Excel y PDF.</small>
            </button>

            <button style={acceso} onClick={() => irSubmodulo("pagos")}>
              <span style={accesoIcono}>
                <IconoSistema tipo="banco" />
              </span>
              <strong>Pago remuneraciones</strong>
              <small>Registrar pagos y comprobantes.</small>
            </button>

            <button
              style={acceso}
              onClick={() => irSubmodulo("configuracionPrevisional")}
            >
              <span style={accesoIcono}>
                <IconoSistema tipo="configuracion" />
              </span>
              <strong>Configuracion previsional</strong>
              <small>Indicadores Previred, AFP, AFC y topes.</small>
            </button>

            <button
              style={acceso}
              onClick={() => irSubmodulo("configuracionContable")}
            >
              <span style={accesoIcono}>
                <IconoSistema tipo="comprobante" />
              </span>
              <strong>Configuracion contable</strong>
              <small>Cuentas para centralizacion y pagos.</small>
            </button>
          </div>
        </div>

        <div style={card}>
          <h2 style={tituloSeccion}>Variables del periodo</h2>

          <div style={listaResumen}>
            <FilaResumen
              label="Haberes imponibles variables"
              valor={formato(variables.haberes_imponibles)}
            />

            <FilaResumen
              label="Haberes no imponibles variables"
              valor={formato(variables.haberes_no_imponibles)}
            />

            <FilaResumen
              label="Descuentos variables"
              valor={formato(variables.descuentos)}
            />

            <FilaResumen
              label="Total variables registradas"
              valor={formato(variables.total_general)}
              destacado
            />
          </div>

          <button
            style={botonSecundario}
            onClick={() => irSubmodulo("haberesDescuentos")}
          >
            Revisar variables
          </button>
        </div>
      </div>

      <div style={card}>
        <h2 style={tituloSeccion}>Estado de pagos del periodo</h2>

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Concepto</th>
                <th style={thNumero}>Obligacion</th>
                <th style={thNumero}>Pagado</th>
                <th style={thNumero}>Saldo</th>
              </tr>
            </thead>

            <tbody>
              {(datos?.resumenPagos || []).map((item) => (
                <tr key={item.tipo_pago}>
                  <td style={td}>{item.descripcion}</td>
                  <td style={tdNumero}>{formato(item.total_obligacion)}</td>
                  <td style={tdNumero}>{formato(item.total_pagado)}</td>
                  <td
                    style={
                      Number(item.saldo_pendiente || 0) > 0
                        ? tdNumeroAlerta
                        : tdNumeroOk
                    }
                  >
                    {formato(item.saldo_pendiente)}
                  </td>
                </tr>
              ))}

              {(datos?.resumenPagos || []).length === 0 && (
                <tr>
                  <td style={td} colSpan="4">
                    No hay obligaciones de pago para este periodo. Primero
                    contabiliza liquidaciones.
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

function Indicador({ titulo, valor, detalle, icono, destacado, alerta }) {
  return (
    <div
      style={
        alerta
          ? indicadorAlerta
          : destacado
          ? indicadorDestacado
          : indicador
      }
    >
      <div style={indicadorIcono}>{icono}</div>
      <strong>{titulo}</strong>
      <span style={indicadorValor}>{valor}</span>
      <small>{detalle}</small>
    </div>
  );
}

function FilaResumen({ label, valor, destacado }) {
  return (
    <div style={destacado ? filaResumenDestacada : filaResumen}>
      <span>{label}</span>
      <strong>{valor}</strong>
    </div>
  );
}

const filtros = {
  display: "flex",
  gap: "12px",
  alignItems: "end",
  flexWrap: "wrap",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "#dff7ff",
  marginBottom: "5px",
};

const input = {
  width: "160px",
  padding: "10px",
  border: "1px solid #a9d8ef",
  borderRadius: "10px",
  height: "40px",
  boxSizing: "border-box",
};

const botonBuscar = {
  background: "white",
  color: "#0369a1",
  border: "none",
  padding: "10px 16px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const gridIndicadores = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "14px",
  marginBottom: "22px",
};

const indicador = {
  background: "linear-gradient(180deg, #ffffff 0%, #f8fcff 100%)",
  border: "1px solid rgba(169, 216, 239, 0.72)",
  borderRadius: "18px",
  padding: "18px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  color: "#1e293b",
  display: "flex",
  flexDirection: "column",
  gap: "7px",
  minHeight: "130px",
};

const indicadorDestacado = {
  ...indicador,
  border: "2px solid #10b981",
};

const indicadorAlerta = {
  ...indicador,
  border: "2px solid #f97316",
};

const indicadorIcono = {
  width: "38px",
  height: "38px",
  borderRadius: "13px",
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  border: "1px solid #67e8f9",
  color: "#0369a1",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 8px 18px rgba(15, 76, 129, 0.12)",
};

const indicadorValor = {
  fontSize: "23px",
  fontWeight: "bold",
  color: "#0369a1",
};

const gridDosColumnas = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 2fr) minmax(300px, 1fr)",
  gap: "20px",
  marginBottom: "22px",
};

const card = {
  background: "rgba(255,255,255,0.96)",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  border: "1px solid rgba(169, 216, 239, 0.7)",
};

const tituloSeccion = {
  color: "#0369a1",
  marginTop: 0,
};

const gridAccesos = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "14px",
};

const acceso = {
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  border: "1px solid #67e8f9",
  color: "#0369a1",
  padding: "16px",
  borderRadius: "14px",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  textAlign: "left",
};

const accesoIcono = {
  ...indicadorIcono,
  width: "34px",
  height: "34px",
  borderRadius: "12px",
};

const listaResumen = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const filaResumen = {
  display: "flex",
  justifyContent: "space-between",
  borderBottom: "1px solid #e2e8f0",
  paddingBottom: "9px",
  color: "#1e293b",
};

const filaResumenDestacada = {
  ...filaResumen,
  color: "#0369a1",
  fontWeight: "bold",
};

const botonSecundario = {
  marginTop: "16px",
  background: "linear-gradient(135deg, #0369a1, #06b6d4)",
  color: "white",
  border: "none",
  padding: "11px 15px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
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
};

const tdNumero = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const tdNumeroAlerta = {
  ...tdNumero,
  color: "#c2410c",
  fontWeight: "bold",
};

const tdNumeroOk = {
  ...tdNumero,
  color: "#166534",
  fontWeight: "bold",
};

const ok = {
  color: "#10b981",
  fontWeight: "bold",
};

const err = {
  color: "#ef4444",
  fontWeight: "bold",
};

