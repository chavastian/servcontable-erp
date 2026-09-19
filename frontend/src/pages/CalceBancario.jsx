/**
 * Calce automático de la cartola.
 *
 * Propone a qué documento corresponde cada movimiento pendiente del banco. No
 * concilia nada por su cuenta: la persona revisa y marca. Un calce equivocado
 * ensucia la contabilidad, y ahorrar un clic no vale eso.
 *
 * Lo que sí ahorra es la búsqueda: hasta ahora había que recorrer la cartola
 * línea por línea comparando montos a ojo.
 */

import { useCallback, useEffect, useState } from "react";
import EstadoPantalla from "../components/EstadoPantalla";
import { obtenerSugerenciasDeCalce } from "../services/asistentesService";
import { actualizarEstadoConciliacion } from "../services/conciliacionBancariaService";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerPeriodoTrabajo } from "../services/periodoTrabajoService";
import { estilos, pildora, pesos, numero, fechaCorta } from "../utils/estilosAsistentes";

const TEXTO_CONFIANZA = {
  alta: "Coincide monto, fecha y RUT",
  media: "Coincide monto y fecha",
  baja: "Coincide el monto, la fecha está lejos",
};

const ESTADO_POR_CONFIANZA = { alta: "ok", media: "aviso", baja: "error" };

export default function CalceBancario() {
  const empresa = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [confirmando, setConfirmando] = useState(null);
  const [confirmados, setConfirmados] = useState([]);

  const cargar = useCallback(
    async (periodoPedido) => {
      if (!empresa?.id) {
        setError("Selecciona una empresa para buscar calces.");
        setCargando(false);
        return;
      }

      setCargando(true);
      setError("");
      setMensaje("");

      try {
        setDatos(await obtenerSugerenciasDeCalce(empresa.id, periodoPedido));
        setConfirmados([]);
      } catch (problema) {
        setError(problema.message || "No se pudieron buscar los calces");
        setDatos(null);
      } finally {
        setCargando(false);
      }
    },
    [empresa?.id]
  );

  useEffect(() => {
    cargar(periodo);
  }, [cargar, periodo]);

  /**
   * Confirmar un calce marca el movimiento como conciliado por la misma vía que
   * la pantalla de conciliación: un solo lugar donde se escribe el estado.
   */
  async function confirmar(propuesta) {
    setConfirmando(propuesta.movimiento_id);
    setMensaje("");

    try {
      await actualizarEstadoConciliacion(
        propuesta.movimiento_id,
        empresa.id,
        "conciliado",
        propuesta.calza_con?.comprobante_id || null
      );

      setConfirmados((previos) => [...previos, propuesta.movimiento_id]);
      setMensaje(
        `Movimiento del ${fechaCorta(propuesta.fecha)} marcado como conciliado con ${
          propuesta.calza_con?.origen
        } folio ${propuesta.calza_con?.folio}.`
      );
    } catch (problema) {
      setError(problema.message || "No se pudo confirmar el calce");
    } finally {
      setConfirmando(null);
    }
  }

  const resumen = datos?.resumen || {};
  const propuestas = (datos?.propuestas || []).filter(
    (p) => !confirmados.includes(p.movimiento_id)
  );
  const ambiguos = datos?.ambiguos || [];
  const sinCalce = datos?.sin_calce || [];

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.barraFiltros}>
        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="calce-periodo">
            Período de la cartola
          </label>
          <input
            id="calce-periodo"
            type="month"
            style={estilos.input}
            value={periodo}
            onChange={(evento) => setPeriodo(evento.target.value)}
          />
        </div>

        <button
          type="button"
          className="sc-btn sc-btn--primary"
          onClick={() => cargar(periodo)}
          disabled={cargando}
        >
          {cargando ? "Buscando..." : "Buscar calces"}
        </button>
      </div>

      {mensaje ? <div className="sc-message sc-message--ok">{mensaje}</div> : null}

      <EstadoPantalla
        cargando={cargando}
        error={error}
        alReintentar={() => cargar(periodo)}
        mensajeCargando="Comparando la cartola con los documentos..."
      >
        <>
          <div style={estilos.aviso}>
            Son propuestas. Nada se concilió: cada calce queda registrado recién
            cuando lo confirmas.
          </div>

          <div style={estilos.resumenGrilla}>
            <div style={estilos.indicador}>
              <span style={estilos.indicadorValor}>{numero(datos?.revisados)}</span>
              <span style={estilos.indicadorTexto}>Movimientos pendientes revisados</span>
            </div>
            <div style={estilos.indicador}>
              <span style={{ ...estilos.indicadorValor, color: "#065f46" }}>
                {numero(resumen.con_propuesta)}
              </span>
              <span style={estilos.indicadorTexto}>Con un documento propuesto</span>
            </div>
            <div style={estilos.indicador}>
              <span style={{ ...estilos.indicadorValor, color: "#9a3412" }}>
                {numero(resumen.ambiguos)}
              </span>
              <span style={estilos.indicadorTexto}>Con más de un candidato</span>
            </div>
            <div style={estilos.indicador}>
              <span style={estilos.indicadorValor}>{numero(resumen.sin_calce)}</span>
              <span style={estilos.indicadorTexto}>Sin documento con ese monto</span>
            </div>
          </div>

          <div style={estilos.tarjeta}>
            <h3 style={estilos.titulo}>Calces propuestos</h3>
            <p style={estilos.subtitulo}>
              Ordenados por fecha. Revisa el documento antes de confirmar.
            </p>

            {propuestas.length === 0 ? (
              <p style={{ ...estilos.subtitulo, marginTop: 10 }}>
                No quedan calces propuestos por confirmar.
              </p>
            ) : (
              <div style={{ ...estilos.contenedorTabla, marginTop: 12 }}>
                <table style={estilos.tabla}>
                  <thead>
                    <tr>
                      <th style={estilos.th}>Fecha</th>
                      <th style={estilos.th}>Movimiento del banco</th>
                      <th style={{ ...estilos.th, textAlign: "right" }}>Cargo</th>
                      <th style={{ ...estilos.th, textAlign: "right" }}>Abono</th>
                      <th style={estilos.th}>Documento propuesto</th>
                      <th style={estilos.th}>Por qué</th>
                      <th style={estilos.th} aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {propuestas.map((propuesta) => (
                      <tr key={propuesta.movimiento_id}>
                        <td style={estilos.td}>{fechaCorta(propuesta.fecha)}</td>
                        <td style={estilos.td}>{propuesta.descripcion}</td>
                        <td style={estilos.tdNumero}>
                          {propuesta.cargo ? pesos(propuesta.cargo) : ""}
                        </td>
                        <td style={estilos.tdNumero}>
                          {propuesta.abono ? pesos(propuesta.abono) : ""}
                        </td>
                        <td style={estilos.td}>
                          <strong>
                            {propuesta.calza_con?.origen} folio {propuesta.calza_con?.folio}
                          </strong>
                          <br />
                          <span style={{ fontSize: 11.5, color: "var(--sc-muted)" }}>
                            {fechaCorta(propuesta.calza_con?.fecha)} ·{" "}
                            {propuesta.calza_con?.tercero} · {pesos(propuesta.calza_con?.monto)}
                          </span>
                        </td>
                        <td style={estilos.td}>
                          <span style={pildora(ESTADO_POR_CONFIANZA[propuesta.confianza])}>
                            {TEXTO_CONFIANZA[propuesta.confianza] || propuesta.motivo}
                          </span>
                        </td>
                        <td style={estilos.td}>
                          <button
                            type="button"
                            className="sc-btn sc-btn--success"
                            onClick={() => confirmar(propuesta)}
                            disabled={confirmando === propuesta.movimiento_id}
                          >
                            {confirmando === propuesta.movimiento_id
                              ? "Guardando..."
                              : "Confirmar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {ambiguos.length > 0 ? (
            <div style={estilos.tarjeta}>
              <h3 style={estilos.titulo}>Hay que elegir a mano</h3>
              <p style={estilos.subtitulo}>
                Más de un documento calza por el mismo monto. Adivinar entre dos
                sería peor que no proponer.
              </p>

              <div style={{ ...estilos.contenedorTabla, marginTop: 12 }}>
                <table style={estilos.tabla}>
                  <thead>
                    <tr>
                      <th style={estilos.th}>Fecha</th>
                      <th style={estilos.th}>Movimiento</th>
                      <th style={{ ...estilos.th, textAlign: "right" }}>Monto</th>
                      <th style={estilos.th}>Candidatos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ambiguos.map((item) => (
                      <tr key={item.movimiento_id}>
                        <td style={estilos.td}>{fechaCorta(item.fecha)}</td>
                        <td style={estilos.td}>{item.descripcion}</td>
                        <td style={estilos.tdNumero}>
                          {pesos(item.cargo || item.abono)}
                        </td>
                        <td style={estilos.td}>
                          <ul style={{ margin: 0, paddingLeft: 16 }}>
                            {item.candidatos.map((candidato) => (
                              <li key={`${candidato.origen}-${candidato.id}`}>
                                {candidato.origen} folio {candidato.folio} ·{" "}
                                {fechaCorta(candidato.fecha)} · {candidato.tercero}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {sinCalce.length > 0 ? (
            <div style={estilos.tarjeta}>
              <h3 style={estilos.titulo}>Sin documento que calce</h3>
              <p style={estilos.subtitulo}>
                Ningún documento tiene ese monto. Puede ser un gasto que todavía no
                se registró, una comisión del banco o un movimiento entre cuentas
                propias.
              </p>

              <div style={{ ...estilos.contenedorTabla, marginTop: 12 }}>
                <table style={estilos.tabla}>
                  <thead>
                    <tr>
                      <th style={estilos.th}>Fecha</th>
                      <th style={estilos.th}>Movimiento</th>
                      <th style={{ ...estilos.th, textAlign: "right" }}>Cargo</th>
                      <th style={{ ...estilos.th, textAlign: "right" }}>Abono</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sinCalce.map((item) => (
                      <tr key={item.movimiento_id}>
                        <td style={estilos.td}>{fechaCorta(item.fecha)}</td>
                        <td style={estilos.td}>{item.descripcion}</td>
                        <td style={estilos.tdNumero}>{item.cargo ? pesos(item.cargo) : ""}</td>
                        <td style={estilos.tdNumero}>{item.abono ? pesos(item.abono) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      </EstadoPantalla>
    </div>
  );
}
