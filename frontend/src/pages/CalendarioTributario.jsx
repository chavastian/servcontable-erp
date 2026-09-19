/**
 * Calendario de obligaciones tributarias y previsionales.
 *
 * Recuerda, no reemplaza el aviso oficial. Los feriados móviles y las prórrogas
 * del SII no están incluidos, y la pantalla lo dice en lugar de dejar que alguien
 * confíe en una fecha que puede haberse movido.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import EstadoPantalla from "../components/EstadoPantalla";
import { obtenerCalendarioTributario, obtenerPanelEstudio } from "../services/asistentesService";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerPeriodoAnterior, obtenerPeriodoTrabajo } from "../services/periodoTrabajoService";
import { estilos, pildora, pesos, numero, fechaCorta } from "../utils/estilosAsistentes";
import PeriodoMesSelector from "../components/PeriodoMesSelector";

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
  // IVA del período de la empresa activa, para mostrarlo junto al F29.
  const [ivaPeriodo, setIvaPeriodo] = useState(null);

  // Número de la última petición: cambiar el período dos veces seguidas no
  // debe dejar en pantalla el calendario de la primera.
  const ultimaPeticion = useRef(0);

  const cargar = useCallback(
    async (periodoPedido, conFacturacion, conPrevired) => {
      const marca = ++ultimaPeticion.current;

      setCargando(true);
      setError("");

      try {
        const respuesta = await obtenerCalendarioTributario(periodoPedido, {
          empresaId: empresa?.id,
          facturadorElectronico: conFacturacion,
          previredElectronico: conPrevired,
        });

        if (marca !== ultimaPeticion.current) return;
        setDatos(respuesta);
      } catch (problema) {
        if (marca !== ultimaPeticion.current) return;
        setError(problema.message || "No se pudo obtener el calendario");
        setDatos(null);
      } finally {
        if (marca === ultimaPeticion.current) setCargando(false);
      }

      // El IVA a pagar sale del panel del estudio, que ya lo calcula por
      // empresa y período. Es un dato de apoyo: si falla, el calendario igual
      // se muestra y el monto no aparece.
      if (!empresa?.id) {
        setIvaPeriodo(null);
        return;
      }

      try {
        const panel = await obtenerPanelEstudio(periodoPedido);

        if (marca !== ultimaPeticion.current) return;

        const fila = (panel?.empresas || []).find(
          (item) => Number(item.empresa_id) === Number(empresa.id)
        );

        setIvaPeriodo(fila?.iva || null);
      } catch {
        if (marca === ultimaPeticion.current) setIvaPeriodo(null);
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
          <PeriodoMesSelector
            id="calendario-periodo"
            style={estilos.input}
            value={periodo}
            onChange={setPeriodo}
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
              <span style={{ ...estilos.indicadorValor, color: "var(--sc-naranja-texto)" }}>
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
                          {obligacion.codigo === "f29" && ivaPeriodo ? (
                            <>
                              <br />
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: "bold",
                                  color: "var(--sc-primary)",
                                }}
                              >
                                IVA a pagar del período: {pesos(ivaPeriodo.a_pagar)}
                              </span>
                            </>
                          ) : null}
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
