/**
 * Clasificación de documentos por historial.
 *
 * Los documentos que quedaron sin cuenta asignada, con la cuenta que esta misma
 * empresa usó antes para el mismo RUT. No es una clasificación inventada: es la
 * decisión que la empresa ya tomó, repetida.
 *
 * Se aplica solo lo que la persona marca. Aplicar todo de golpe sin mirar sería
 * cambiar la contabilidad de alguien a ciegas.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import EstadoPantalla from "../components/EstadoPantalla";
import {
  obtenerSugerenciasDeCuenta,
  aplicarSugerenciasDeCuenta,
} from "../services/asistentesService";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerPeriodoTrabajo } from "../services/periodoTrabajoService";
import { estilos, pesos, numero, fechaCorta } from "../utils/estilosAsistentes";

export default function ClasificarDocumentos() {
  const empresa = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [todoElHistorial, setTodoElHistorial] = useState(false);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [marcados, setMarcados] = useState({});
  const [aplicando, setAplicando] = useState(false);

  const cargar = useCallback(
    async (periodoPedido, sinFiltroDePeriodo) => {
      if (!empresa?.id) {
        setError("Selecciona una empresa para revisar los documentos.");
        setCargando(false);
        return;
      }

      setCargando(true);
      setError("");
      setMensaje("");

      try {
        const respuesta = await obtenerSugerenciasDeCuenta(
          empresa.id,
          sinFiltroDePeriodo ? "" : periodoPedido
        );

        setDatos(respuesta);

        // Vienen marcadas las que tienen sugerencia: es lo que la persona va a
        // querer aplicar casi siempre, y desmarcar es más rápido que marcar
        // cincuenta.
        const inicial = {};

        respuesta.documentos.forEach((documento) => {
          if (documento.sugerencia) {
            inicial[`${documento.libro}-${documento.id}`] = true;
          }
        });

        setMarcados(inicial);
      } catch (problema) {
        setError(problema.message || "No se pudieron obtener las sugerencias");
        setDatos(null);
      } finally {
        setCargando(false);
      }
    },
    [empresa?.id]
  );

  useEffect(() => {
    cargar(periodo, todoElHistorial);
  }, [cargar, periodo, todoElHistorial]);

  const documentos = datos?.documentos || [];
  const resumen = datos?.resumen || {};

  const seleccionados = useMemo(
    () =>
      documentos.filter(
        (documento) => documento.sugerencia && marcados[`${documento.libro}-${documento.id}`]
      ),
    [documentos, marcados]
  );

  function alternar(documento) {
    const clave = `${documento.libro}-${documento.id}`;

    setMarcados((previos) => ({ ...previos, [clave]: !previos[clave] }));
  }

  async function aplicar() {
    if (seleccionados.length === 0) return;

    setAplicando(true);
    setError("");
    setMensaje("");

    try {
      const respuesta = await aplicarSugerenciasDeCuenta(
        empresa.id,
        seleccionados.map((documento) => ({
          libro: documento.libro,
          id: documento.id,
          cuenta_id: documento.sugerencia.cuenta_id,
        }))
      );

      setMensaje(
        `${numero(respuesta.aplicados)} documento(s) clasificados. ${
          respuesta.rechazados > 0 ? `${numero(respuesta.rechazados)} no se pudieron.` : ""
        } ${respuesta.aviso || ""}`
      );

      await cargar(periodo, todoElHistorial);
    } catch (problema) {
      setError(problema.message || "No se pudieron aplicar las sugerencias");
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.barraFiltros}>
        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="clasificar-periodo">
            Período
          </label>
          <input
            id="clasificar-periodo"
            type="month"
            style={estilos.input}
            value={periodo}
            disabled={todoElHistorial}
            onChange={(evento) => setPeriodo(evento.target.value)}
          />
        </div>

        <label style={{ ...estilos.campo, flexDirection: "row", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={todoElHistorial}
            onChange={(evento) => setTodoElHistorial(evento.target.checked)}
          />
          <span style={{ fontSize: 12.5 }}>Revisar todos los períodos</span>
        </label>

        <button
          type="button"
          className="sc-btn sc-btn--primary"
          onClick={() => cargar(periodo, todoElHistorial)}
          disabled={cargando}
        >
          {cargando ? "Buscando..." : "Buscar documentos sin cuenta"}
        </button>

        <button
          type="button"
          className="sc-btn sc-btn--success"
          onClick={aplicar}
          disabled={aplicando || seleccionados.length === 0}
        >
          {aplicando
            ? "Aplicando..."
            : `Aplicar ${numero(seleccionados.length)} seleccionado(s)`}
        </button>
      </div>

      {mensaje ? <div className="sc-message sc-message--ok">{mensaje}</div> : null}

      <EstadoPantalla
        cargando={cargando}
        error={error}
        vacio={!cargando && !error && documentos.length === 0}
        alReintentar={() => cargar(periodo, todoElHistorial)}
        mensajeCargando="Buscando documentos sin cuenta asignada..."
        tituloVacio="No hay documentos sin clasificar"
        mensajeVacio="Todos los documentos del período tienen su cuenta asignada."
      >
        <>
          <div style={estilos.resumenGrilla}>
            <div style={estilos.indicador}>
              <span style={estilos.indicadorValor}>{numero(resumen.sin_cuenta)}</span>
              <span style={estilos.indicadorTexto}>Documentos sin cuenta</span>
            </div>
            <div style={estilos.indicador}>
              <span style={{ ...estilos.indicadorValor, color: "#065f46" }}>
                {numero(resumen.con_sugerencia)}
              </span>
              <span style={estilos.indicadorTexto}>Con cuenta sugerida por historial</span>
            </div>
            <div style={estilos.indicador}>
              <span style={{ ...estilos.indicadorValor, color: "#9a3412" }}>
                {numero(resumen.sin_historial)}
              </span>
              <span style={estilos.indicadorTexto}>Sin historial: van a mano</span>
            </div>
          </div>

          <div style={estilos.tarjeta}>
            <h3 style={estilos.titulo}>Documentos sin cuenta asignada</h3>
            <p style={estilos.subtitulo}>
              La cuenta sugerida es la que esta empresa usó antes para el mismo
              RUT. Desmarca lo que no corresponda antes de aplicar.
            </p>

            <div style={{ ...estilos.contenedorTabla, marginTop: 12 }}>
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    <th style={estilos.th}>Aplicar</th>
                    <th style={estilos.th}>Libro</th>
                    <th style={estilos.th}>Fecha</th>
                    <th style={estilos.th}>Documento</th>
                    <th style={estilos.th}>RUT / Nombre</th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>Total</th>
                    <th style={estilos.th}>Cuenta sugerida</th>
                  </tr>
                </thead>
                <tbody>
                  {documentos.map((documento) => {
                    const clave = `${documento.libro}-${documento.id}`;

                    return (
                      <tr
                        key={clave}
                        style={{
                          background: documento.sugerencia ? "#ffffff" : "#fbfbfb",
                        }}
                      >
                        <td style={estilos.td}>
                          {documento.sugerencia ? (
                            <input
                              type="checkbox"
                              checked={marcados[clave] === true}
                              onChange={() => alternar(documento)}
                              aria-label={`Aplicar la cuenta sugerida al folio ${documento.folio}`}
                            />
                          ) : (
                            <span style={{ color: "var(--sc-muted)", fontSize: 11.5 }}>
                              sin sugerencia
                            </span>
                          )}
                        </td>

                        <td style={estilos.td}>{documento.libro}</td>
                        <td style={estilos.td}>{fechaCorta(documento.fecha)}</td>

                        <td style={estilos.td}>
                          {documento.tipo_documento} {documento.folio}
                        </td>

                        <td style={estilos.td}>
                          {documento.tercero}
                          <br />
                          <span style={{ fontSize: 11.5, color: "var(--sc-muted)" }}>
                            {documento.rut}
                          </span>
                        </td>

                        <td style={estilos.tdNumero}>{pesos(documento.total)}</td>

                        <td style={estilos.td}>
                          {documento.sugerencia ? (
                            <>
                              <strong>
                                {documento.sugerencia.codigo} {documento.sugerencia.nombre}
                              </strong>
                              <br />
                              <span style={{ fontSize: 11.5, color: "var(--sc-muted)" }}>
                                Usada en {numero(documento.sugerencia.basada_en)} documento(s)
                                anteriores de este RUT
                              </span>
                            </>
                          ) : (
                            <span style={{ color: "var(--sc-muted)" }}>
                              Sin documentos anteriores de este RUT con cuenta asignada
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={estilos.aviso}>
            Asignar la cuenta al documento no rehace el asiento ya generado. Si el
            documento tiene comprobante, hay que regenerarlo para que el gasto
            quede en la cuenta nueva.
          </div>
        </>
      </EstadoPantalla>
    </div>
  );
}
