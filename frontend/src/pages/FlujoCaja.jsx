/**
 * Antigüedad de la cartera y flujo de caja proyectado.
 *
 * La antigüedad es un hecho: el saldo existe y la fecha del documento existe. La
 * proyección es una estimación, y la pantalla lo dice con sus supuestos a la
 * vista, porque el sistema no guarda fecha de vencimiento y el plazo lo pone
 * quien consulta.
 */

import { useCallback, useEffect, useState } from "react";
import EstadoPantalla from "../components/EstadoPantalla";
import { obtenerFlujoCaja } from "../services/asistentesService";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { estilos, pesos, numero, fechaCorta } from "../utils/estilosAsistentes";

function TablaTramos({ titulo, datos, color }) {
  return (
    <div style={estilos.tarjeta}>
      <h3 style={{ ...estilos.titulo, color }}>{titulo}</h3>
      <p style={estilos.subtitulo}>
        {numero(datos.documentos)} documento(s) por {pesos(datos.total)}.
      </p>

      <div style={{ ...estilos.contenedorTabla, marginTop: 12 }}>
        <table style={estilos.tabla}>
          <thead>
            <tr>
              <th style={estilos.th}>Antigüedad</th>
              <th style={{ ...estilos.th, textAlign: "right" }}>Documentos</th>
              <th style={{ ...estilos.th, textAlign: "right" }}>Monto</th>
              <th style={{ ...estilos.th, textAlign: "right" }}>Del total</th>
            </tr>
          </thead>
          <tbody>
            {datos.tramos.map((tramo) => (
              <tr key={tramo.codigo}>
                <td style={estilos.td}>{tramo.titulo}</td>
                <td style={estilos.tdNumero}>{numero(tramo.documentos)}</td>
                <td style={estilos.tdNumero}>{pesos(tramo.monto)}</td>
                <td style={estilos.tdNumero}>
                  {datos.total > 0
                    ? `${Math.round((tramo.monto / datos.total) * 100)}%`
                    : "0%"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FlujoCaja() {
  const empresa = obtenerEmpresaActiva();

  const [plazoDias, setPlazoDias] = useState(30);
  const [semanas, setSemanas] = useState(8);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [verDetalle, setVerDetalle] = useState(false);

  const cargar = useCallback(
    async (plazo, cantidadSemanas) => {
      if (!empresa?.id) {
        setError("Selecciona una empresa para ver el flujo de caja.");
        setCargando(false);
        return;
      }

      setCargando(true);
      setError("");

      try {
        setDatos(
          await obtenerFlujoCaja(empresa.id, {
            plazoDias: plazo,
            semanas: cantidadSemanas,
          })
        );
      } catch (problema) {
        setError(problema.message || "No se pudo calcular el flujo de caja");
        setDatos(null);
      } finally {
        setCargando(false);
      }
    },
    [empresa?.id]
  );

  useEffect(() => {
    cargar(plazoDias, semanas);
  }, [cargar, plazoDias, semanas]);

  // El JSX de los hijos se evalua aunque EstadoPantalla decida no mostrarlos,
  // asi que ninguna lectura puede asumir que ya llegaron los datos.
  const VACIO = { total: 0, documentos: 0, tramos: [], detalle: [] };
  const porCobrar = datos?.por_cobrar || VACIO;
  const porPagar = datos?.por_pagar || VACIO;
  const proyeccion = datos?.proyeccion || null;
  const posicion = datos?.posicion_actual || {};

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.barraFiltros}>
        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="flujo-plazo">
            Plazo de pago en días
          </label>
          <input
            id="flujo-plazo"
            type="number"
            min="0"
            max="365"
            style={{ ...estilos.input, width: 90 }}
            value={plazoDias}
            onChange={(evento) => setPlazoDias(Number(evento.target.value))}
          />
        </div>

        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="flujo-semanas">
            Semanas a proyectar
          </label>
          <input
            id="flujo-semanas"
            type="number"
            min="1"
            max="26"
            style={{ ...estilos.input, width: 90 }}
            value={semanas}
            onChange={(evento) => setSemanas(Number(evento.target.value))}
          />
        </div>

        <button
          type="button"
          className="sc-btn sc-btn--primary"
          onClick={() => cargar(plazoDias, semanas)}
          disabled={cargando}
        >
          {cargando ? "Calculando..." : "Recalcular"}
        </button>

        <p style={{ ...estilos.subtitulo, marginLeft: "auto", maxWidth: "40ch" }}>
          El sistema no guarda fecha de vencimiento. El plazo que indiques acá es
          el que se usa para estimar cuándo entra o sale cada peso.
        </p>
      </div>

      <EstadoPantalla
        cargando={cargando}
        error={error}
        alReintentar={() => cargar(plazoDias, semanas)}
        mensajeCargando="Calculando saldos y proyección..."
      >
        <>
          <div style={estilos.resumenGrilla}>
            <div style={estilos.indicador}>
              <span style={{ ...estilos.indicadorValor, color: "#065f46" }}>
                {pesos(posicion.por_cobrar)}
              </span>
              <span style={estilos.indicadorTexto}>Por cobrar hoy</span>
            </div>
            <div style={estilos.indicador}>
              <span style={{ ...estilos.indicadorValor, color: "#991b1b" }}>
                {pesos(posicion.por_pagar)}
              </span>
              <span style={estilos.indicadorTexto}>Por pagar hoy</span>
            </div>
            <div style={estilos.indicador}>
              <span
                style={{
                  ...estilos.indicadorValor,
                  color: posicion.diferencia >= 0 ? "#065f46" : "#991b1b",
                }}
              >
                {pesos(posicion.diferencia)}
              </span>
              <span style={estilos.indicadorTexto}>Diferencia</span>
            </div>
            <div style={estilos.indicador}>
              <span style={estilos.indicadorValor}>{pesos(proyeccion?.vencido?.ingresos)}</span>
              <span style={estilos.indicadorTexto}>Por cobrar ya vencido</span>
            </div>
            <div style={estilos.indicador}>
              <span style={estilos.indicadorValor}>{pesos(proyeccion?.vencido?.egresos)}</span>
              <span style={estilos.indicadorTexto}>Por pagar ya vencido</span>
            </div>
          </div>

          <TablaTramos
            titulo="Por cobrar, según antigüedad"
            datos={porCobrar}
            color="#065f46"
          />

          <TablaTramos
            titulo="Por pagar, según antigüedad"
            datos={porPagar}
            color="#991b1b"
          />

          <div style={estilos.tarjeta}>
            <h3 style={estilos.titulo}>Proyección semana a semana</h3>
            <p style={estilos.subtitulo}>
              Estimación, no un dato cierto. Lo ya vencido se muestra aparte
              arriba y no se reparte en las semanas.
            </p>

            <div style={{ ...estilos.contenedorTabla, marginTop: 12 }}>
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    <th style={estilos.th}>Semana</th>
                    <th style={estilos.th}>Desde</th>
                    <th style={estilos.th}>Hasta</th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>Entra</th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>Sale</th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>Neto</th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {(proyeccion?.semanas || []).map((semana) => (
                    <tr
                      key={semana.semana}
                      style={{ background: semana.acumulado < 0 ? "#fdecec" : "#ffffff" }}
                    >
                      <td style={estilos.td}>{semana.semana}</td>
                      <td style={estilos.td}>{fechaCorta(semana.desde)}</td>
                      <td style={estilos.td}>{fechaCorta(semana.hasta)}</td>
                      <td style={estilos.tdNumero}>{pesos(semana.ingresos)}</td>
                      <td style={estilos.tdNumero}>{pesos(semana.egresos)}</td>
                      <td style={estilos.tdNumero}>{pesos(semana.neto)}</td>
                      <td
                        style={{
                          ...estilos.tdNumero,
                          fontWeight: "bold",
                          color: semana.acumulado < 0 ? "#991b1b" : "#065f46",
                        }}
                      >
                        {pesos(semana.acumulado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {proyeccion?.resumen?.primera_semana_negativa ? (
              <div style={{ ...estilos.aviso, marginTop: 12 }}>
                Según esta estimación, en la semana{" "}
                {proyeccion.resumen.primera_semana_negativa} el acumulado queda
                negativo: lo que sale supera a lo que entra.
              </div>
            ) : null}
          </div>

          <div style={estilos.tarjeta}>
            <h3 style={estilos.titulo}>Supuestos de la proyección</h3>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
              {(proyeccion?.supuestos || []).map((supuesto) => (
                <li key={supuesto} style={{ marginBottom: 3 }}>
                  {supuesto}
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="sc-btn sc-btn--ghost"
              style={{ marginTop: 12 }}
              onClick={() => setVerDetalle((previo) => !previo)}
            >
              {verDetalle ? "Ocultar documentos" : "Ver documento por documento"}
            </button>

            {verDetalle ? (
              <div style={{ ...estilos.contenedorTabla, marginTop: 12 }}>
                <table style={estilos.tabla}>
                  <thead>
                    <tr>
                      <th style={estilos.th}>Origen</th>
                      <th style={estilos.th}>Fecha</th>
                      <th style={estilos.th}>Documento</th>
                      <th style={estilos.th}>Tercero</th>
                      <th style={{ ...estilos.th, textAlign: "right" }}>Saldo</th>
                      <th style={estilos.th}>Vence (estimado)</th>
                      <th style={{ ...estilos.th, textAlign: "right" }}>Días vencido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...porCobrar.detalle, ...porPagar.detalle].map(
                      (documento) => (
                        <tr key={`${documento.origen}-${documento.id}`}>
                          <td style={estilos.td}>{documento.origen}</td>
                          <td style={estilos.td}>{fechaCorta(documento.fecha)}</td>
                          <td style={estilos.td}>
                            {documento.tipo_documento} {documento.folio}
                          </td>
                          <td style={estilos.td}>{documento.tercero}</td>
                          <td style={estilos.tdNumero}>{pesos(documento.saldo)}</td>
                          <td style={estilos.td}>
                            {fechaCorta(documento.vencimiento_estimado)}
                          </td>
                          <td style={estilos.tdNumero}>
                            {documento.dias_vencido > 0 ? numero(documento.dias_vencido) : "—"}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </>
      </EstadoPantalla>
    </div>
  );
}
