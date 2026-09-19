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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AccountSelector from "../components/AccountSelector";
import EstadoPantalla from "../components/EstadoPantalla";
import {
  obtenerSugerenciasDeCuenta,
  aplicarSugerenciasDeCuenta,
} from "../services/asistentesService";
import { listarCuentas } from "../services/cuentaService";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerPeriodoTrabajo } from "../services/periodoTrabajoService";
import { estilos, pesos, numero, fechaCorta } from "../utils/estilosAsistentes";

export default function ClasificarDocumentos() {
  const empresa = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [todoElHistorial, setTodoElHistorial] = useState(false);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  // El error de la consulta reemplaza la tabla; el de aplicar se muestra encima
  // sin borrarla, porque lo marcado sigue ahí y se puede reintentar.
  const [errorCarga, setErrorCarga] = useState("");
  const [errorAccion, setErrorAccion] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [marcados, setMarcados] = useState({});
  // Cuenta elegida a mano para los documentos sin historial, por clave libro-id.
  const [manuales, setManuales] = useState({});
  const [cuentas, setCuentas] = useState([]);
  const [aplicando, setAplicando] = useState(false);

  // Número de la última petición: cambiar el período o el filtro dos veces
  // seguidas no debe dejar en pantalla la respuesta de la primera.
  const ultimaPeticion = useRef(0);

  const cargar = useCallback(
    async (periodoPedido, sinFiltroDePeriodo) => {
      if (!empresa?.id) {
        setErrorCarga("Selecciona una empresa para revisar los documentos.");
        setCargando(false);
        return;
      }

      const marca = ++ultimaPeticion.current;

      setCargando(true);
      setErrorCarga("");
      setErrorAccion("");
      setMensaje("");

      try {
        const respuesta = await obtenerSugerenciasDeCuenta(
          empresa.id,
          sinFiltroDePeriodo ? "" : periodoPedido
        );

        if (marca !== ultimaPeticion.current) return;

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
        setManuales({});
      } catch (problema) {
        if (marca !== ultimaPeticion.current) return;
        setErrorCarga(problema.message || "No se pudieron obtener las sugerencias");
        setDatos(null);
      } finally {
        if (marca === ultimaPeticion.current) setCargando(false);
      }
    },
    [empresa?.id]
  );

  useEffect(() => {
    cargar(periodo, todoElHistorial);
  }, [cargar, periodo, todoElHistorial]);

  // El plan de cuentas alimenta el selector de las filas sin historial. Si no
  // se puede cargar, la pantalla sigue sirviendo para las que sí tienen
  // sugerencia; por eso el fallo no va a errorCarga.
  useEffect(() => {
    if (!empresa?.id) return undefined;

    let vigente = true;

    listarCuentas(empresa.id)
      .then((respuesta) => {
        if (vigente) setCuentas(respuesta?.cuentas || []);
      })
      .catch(() => {
        if (vigente) setCuentas([]);
      });

    return () => {
      vigente = false;
    };
  }, [empresa?.id]);

  const documentos = datos?.documentos || [];
  const resumen = datos?.resumen || {};

  // Lo que se va a enviar: las sugerencias marcadas más las cuentas elegidas a
  // mano, en el mismo formato que espera el backend.
  const porAplicar = useMemo(
    () =>
      documentos
        .map((documento) => {
          const clave = `${documento.libro}-${documento.id}`;
          const cuentaId = documento.sugerencia
            ? marcados[clave] && documento.sugerencia.cuenta_id
            : manuales[clave];

          if (!cuentaId) return null;

          return { libro: documento.libro, id: documento.id, cuenta_id: Number(cuentaId) };
        })
        .filter(Boolean),
    [documentos, marcados, manuales]
  );

  function alternar(documento) {
    const clave = `${documento.libro}-${documento.id}`;

    setMarcados((previos) => ({ ...previos, [clave]: !previos[clave] }));
  }

  function elegirCuentaManual(documento, cuentaId) {
    const clave = `${documento.libro}-${documento.id}`;

    setManuales((previos) => ({ ...previos, [clave]: cuentaId || "" }));
  }

  // Compras van a una cuenta de gasto, costo, pérdida o activo; ventas a una
  // de ingreso o ganancia. Ofrecer el plan completo invitaba a equivocarse.
  function tiposParaLibro(libro) {
    return String(libro || "").toLowerCase() === "ventas"
      ? ["Ganancia", "Ingreso"]
      : ["Perdida", "Gasto", "Costo", "Activo"];
  }

  async function aplicar() {
    if (porAplicar.length === 0 || aplicando) return;

    setAplicando(true);
    setErrorAccion("");
    setMensaje("");

    try {
      const respuesta = await aplicarSugerenciasDeCuenta(empresa.id, porAplicar);

      setMensaje(
        `${numero(respuesta.aplicados)} documento(s) clasificados. ${
          respuesta.rechazados > 0 ? `${numero(respuesta.rechazados)} no se pudieron.` : ""
        } ${respuesta.aviso || ""}`
      );

      await cargar(periodo, todoElHistorial);
    } catch (problema) {
      setErrorAccion(problema.message || "No se pudieron aplicar las sugerencias");
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
          disabled={aplicando || porAplicar.length === 0}
        >
          {aplicando
            ? "Aplicando..."
            : `Aplicar ${numero(porAplicar.length)} seleccionado(s)`}
        </button>
      </div>

      {mensaje ? <div className="sc-message sc-message--ok">{mensaje}</div> : null}
      {errorAccion ? <div className="sc-message sc-message--error">{errorAccion}</div> : null}

      <EstadoPantalla
        cargando={cargando}
        error={errorCarga}
        vacio={!cargando && !errorCarga && documentos.length === 0}
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
              RUT. Desmarca lo que no corresponda antes de aplicar. Para las que no
              tienen historial, elige la cuenta a mano: se aplican en el mismo envío.
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
                              {manuales[clave] ? "con cuenta elegida" : "a mano"}
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
                            <div style={{ minWidth: 260 }}>
                              <AccountSelector
                                cuentas={cuentas}
                                value={manuales[clave] || ""}
                                tiposPermitidos={tiposParaLibro(documento.libro)}
                                placeholder="Elegir cuenta a mano..."
                                style={estilos.input}
                                onChange={(evento) =>
                                  elegirCuentaManual(documento, evento.target.value)
                                }
                              />
                              <span style={{ fontSize: 11.5, color: "var(--sc-muted)" }}>
                                Sin documentos anteriores de este RUT con cuenta asignada
                              </span>
                            </div>
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
