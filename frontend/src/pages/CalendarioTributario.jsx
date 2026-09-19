/**
 * Calendario de obligaciones tributarias y previsionales.
 *
 * Recuerda, no reemplaza el aviso oficial. Los feriados móviles y las prórrogas
 * del SII no están incluidos, y la pantalla lo dice en lugar de dejar que alguien
 * confíe en una fecha que puede haberse movido.
 */

import { useCallback, useEffect, useState } from "react";
import EstadoPantalla from "../components/EstadoPantalla";
import { obtenerCalendarioTributario } from "../services/asistentesService";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerPeriodoAnterior, obtenerPeriodoTrabajo } from "../services/periodoTrabajoService";
import { estilos, pildora, numero, fechaCorta } from "../utils/estilosAsistentes";

const ESTADO_VISUAL = {
  vencida: { pildora: "error", texto: "Vencida" },
  urgente: { pildora: "error", texto: "Urgente" },
  proxima: { pildora: "aviso", texto: "Próxima" },
  futura: { pildora: "ok", texto: "A tiempo" },
};

function plazoEnPalabras(dias) {
  if (dias < 0) return `hace ${numero(Math.abs(dias))} día(s)`;
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";

  return `en ${numero(dias)} día(s)`;
}

export default function CalendarioTributario() {
  const empresa = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoAnterior(obtenerPeriodoTrabajo()));
  const [facturadorElectronico, setFacturadorElectronico] = useState(true);
  const [previredElectronico, setPreviredElectronico] = useState(true);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(
    async (periodoPedido, conFacturacion, conPrevired) => {
      setCargando(true);
      setError("");

      try {
        setDatos(
          await obtenerCalendarioTributario(periodoPedido, {
            empresaId: empresa?.id,
            facturadorElectronico: conFacturacion,
            previredElectronico: conPrevired,
          })
        );
      } catch (problema) {
        setError(problema.message || "No se pudo obtener el calendario");
        setDatos(null);
      } finally {
        setCargando(false);
      }
    },
    [empresa?.id]
  );

  useEffect(() => {
    cargar(periodo, facturadorElectronico, previredElectronico);
  }, [cargar, periodo, facturadorElectronico, previredElectronico]);

  const obligaciones = datos?.obligaciones || [];
  const resumen = datos?.resumen || {};

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.barraFiltros}>
        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="calendario-periodo">
            Período que se declara
          </label>
          <input
            id="calendario-periodo"
            type="month"
            style={estilos.input}
            value={periodo}
            onChange={(evento) => setPeriodo(evento.target.value)}
          />
        </div>

        <label style={{ ...estilos.campo, flexDirection: "row", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={facturadorElectronico}
            onChange={(evento) => setFacturadorElectronico(evento.target.checked)}
          />
          <span style={{ fontSize: 12.5 }}>Solo documentos electrónicos (F29 al 20)</span>
        </label>

        <label style={{ ...estilos.campo, flexDirection: "row", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={previredElectronico}
            onChange={(evento) => setPreviredElectronico(evento.target.checked)}
          />
          <span style={{ fontSize: 12.5 }}>Paga cotizaciones en Previred (al 13)</span>
        </label>
      </div>

      <EstadoPantalla
        cargando={cargando}
        error={error}
        alReintentar={() => cargar(periodo, facturadorElectronico, previredElectronico)}
        mensajeCargando="Armando el calendario..."
      >
        <>
          <div style={estilos.resumenGrilla}>
            <div style={estilos.indicador}>
              <span style={{ ...estilos.indicadorValor, color: "#991b1b" }}>
                {numero(resumen.vencidas)}
              </span>
              <span style={estilos.indicadorTexto}>Ya vencidas</span>
            </div>
            <div style={estilos.indicador}>
              <span style={{ ...estilos.indicadorValor, color: "#991b1b" }}>
                {numero(resumen.urgentes)}
              </span>
              <span style={estilos.indicadorTexto}>Vencen en tres días o menos</span>
            </div>
            <div style={estilos.indicador}>
              <span style={{ ...estilos.indicadorValor, color: "#9a3412" }}>
                {numero(resumen.proximas)}
              </span>
              <span style={estilos.indicadorTexto}>Vencen dentro de diez días</span>
            </div>
          </div>

          <div style={estilos.tarjeta}>
            <h3 style={estilos.titulo}>Obligaciones del período {periodo}</h3>
            <p style={estilos.subtitulo}>
              {datos?.alcance === "empresa" && empresa?.razon_social
                ? `Empresa: ${empresa.razon_social}`
                : `Aplica a las ${numero(datos?.empresas?.length)} empresa(s) del estudio`}
            </p>

            <div style={{ ...estilos.contenedorTabla, marginTop: 12 }}>
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    <th style={estilos.th}>Estado</th>
                    <th style={estilos.th}>Obligación</th>
                    <th style={estilos.th}>Organismo</th>
                    <th style={estilos.th}>Vence</th>
                    <th style={estilos.th}>Plazo</th>
                    <th style={estilos.th}>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {obligaciones.map((obligacion) => {
                    const visual = ESTADO_VISUAL[obligacion.estado] || ESTADO_VISUAL.futura;

                    return (
                      <tr key={obligacion.codigo}>
                        <td style={estilos.td}>
                          <span style={pildora(visual.pildora)}>{visual.texto}</span>
                        </td>

                        <td style={estilos.td}>
                          <strong>{obligacion.titulo}</strong>
                          <br />
                          <span style={{ fontSize: 11.5, color: "var(--sc-muted)" }}>
                            {obligacion.descripcion}
                          </span>
                        </td>

                        <td style={estilos.td}>{obligacion.organismo}</td>

                        <td style={estilos.td}>
                          <strong>{fechaCorta(obligacion.vence)}</strong>
                          {obligacion.movida_por_dia_no_habil ? (
                            <>
                              <br />
                              <span style={{ fontSize: 11.5, color: "var(--sc-muted)" }}>
                                corrido desde el {fechaCorta(obligacion.vence_nominal)} por
                                caer en día no hábil
                              </span>
                            </>
                          ) : null}
                        </td>

                        <td style={estilos.td}>
                          {plazoEnPalabras(obligacion.dias_restantes)}
                        </td>

                        <td style={estilos.td}>{obligacion.nota}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={estilos.aviso}>
            <strong>Requiere validación tributaria.</strong> {datos?.aviso}
          </div>
        </>
      </EstadoPantalla>
    </div>
  );
}
