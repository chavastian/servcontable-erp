/**
 * Corrección monetaria del artículo 41 (módulo 8 de la revisión del
 * 19-09-2026).
 *
 * Esta pantalla existe sobre todo para decir que no puede calcular. El cálculo
 * necesita dos cosas que nadie puede deducir de la contabilidad:
 *
 * 1. El IPC de cada mes del año. Si falta un mes, no hay factor, y la pantalla
 *    dice qué meses faltan en lugar de inventar una variación.
 * 2. Qué cuentas son monetarias. La caja no se corrige; las maquinarias sí. El
 *    sistema propone una clasificación por tipo y nombre, pero no contabiliza
 *    hasta que alguien la confirma.
 *
 * Y el criterio se escribe antes de contabilizar, no después: una corrección
 * monetaria que no se puede explicar no se puede defender ante el SII.
 */

import { useCallback, useEffect, useState } from "react";
import EstadoPantalla from "../components/EstadoPantalla";
import { obtenerEmpresaActiva } from "../services/empresaService";
import {
  obtenerCorreccionMonetaria,
  obtenerClasificaciones,
  guardarClasificaciones,
  contabilizarCorreccion,
  guardarVariacionIpc,
} from "../services/correccionMonetariaService";
import { estilos, pesos } from "../utils/estilosAsistentes";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const CLASIFICACIONES = [
  { valor: "monetaria", etiqueta: "Monetaria (no se corrige)" },
  { valor: "no_monetaria", etiqueta: "No monetaria (se corrige)" },
  { valor: "patrimonio", etiqueta: "Patrimonio" },
];

function aniosDisponibles() {
  const actual = new Date().getFullYear();

  return [actual, actual - 1, actual - 2, actual - 3];
}

export default function CorreccionMonetaria() {
  const empresa = obtenerEmpresaActiva();

  const [anio, setAnio] = useState(new Date().getFullYear() - 1);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const [sugerencias, setSugerencias] = useState([]);
  const [sinConfirmar, setSinConfirmar] = useState(0);
  const [elegidas, setElegidas] = useState({});

  const [criterio, setCriterio] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [ipc, setIpc] = useState({});

  const cargar = useCallback(async () => {
    if (!empresa?.id) {
      setError("Selecciona una empresa para calcular la corrección monetaria.");
      setCargando(false);
      return;
    }

    setCargando(true);
    setError("");

    try {
      const respuesta = await obtenerCorreccionMonetaria(empresa.id, anio);
      setDatos(respuesta);
    } catch (problema) {
      setError(problema.message);
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [empresa?.id, anio]);

  const cargarSugerencias = useCallback(async () => {
    if (!empresa?.id) return;

    try {
      const respuesta = await obtenerClasificaciones(empresa.id, anio);
      setSugerencias(respuesta.sugerencias || []);
      setSinConfirmar(respuesta.sin_confirmar || 0);
      // Se parte de lo que el sistema propone, pero cada fila se puede cambiar
      // antes de confirmar en bloque.
      setElegidas(
        Object.fromEntries(
          (respuesta.sugerencias || []).map((s) => [s.cuenta_id, s.clasificacion_sugerida])
        )
      );
    } catch {
      setSugerencias([]);
      setSinConfirmar(0);
    }
  }, [empresa?.id, anio]);

  useEffect(() => {
    cargar();
    cargarSugerencias();
  }, [cargar, cargarSugerencias]);

  async function confirmarClasificaciones() {
    setTrabajando(true);
    setError("");

    try {
      const clasificaciones = sugerencias.map((s) => ({
        cuenta_id: s.cuenta_id,
        clasificacion: elegidas[s.cuenta_id] || s.clasificacion_sugerida,
      }));
      const respuesta = await guardarClasificaciones(empresa.id, clasificaciones);
      setMensaje(respuesta.mensaje);
      await cargarSugerencias();
      await cargar();
    } catch (problema) {
      setError(problema.message);
    } finally {
      setTrabajando(false);
    }
  }

  async function contabilizar() {
    setTrabajando(true);
    setError("");
    setMensaje("");

    try {
      const respuesta = await contabilizarCorreccion({ empresaId: empresa.id, anio, criterio });
      setMensaje(
        `${respuesta.mensaje}. Comprobante N° ${respuesta.comprobante?.numero || "—"}.`
      );
      setCriterio("");
      await cargar();
    } catch (problema) {
      setError(problema.message);
    } finally {
      setTrabajando(false);
    }
  }

  async function guardarIpc(periodo) {
    const valor = ipc[periodo];

    if (valor === undefined || valor === "") return;

    setTrabajando(true);
    setError("");

    try {
      await guardarVariacionIpc(periodo, Number(valor));
      setMensaje(`IPC de ${periodo} guardado.`);
      await cargar();
    } catch (problema) {
      setError(problema.message);
    } finally {
      setTrabajando(false);
    }
  }

  const registrada = datos?.correccion_registrada;
  const puedeCalcular = datos?.puede_calcular;

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.tarjeta}>
        <h2 style={estilos.titulo}>Corrección monetaria</h2>
        <p style={estilos.subtitulo}>
          Artículo 41 de la Ley de la Renta. Se corrigen las partidas no monetarias y el capital
          propio inicial con el factor del año.
        </p>
      </div>

      {mensaje && <div style={estilos.aviso}>{mensaje}</div>}
      {error && (
        <div style={{ ...estilos.aviso, borderColor: "#ef4444", color: "#991b1b" }}>{error}</div>
      )}

      <div style={estilos.barraFiltros}>
        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="cm-anio">
            Año comercial
          </label>
          <select
            id="cm-anio"
            value={anio}
            onChange={(evento) => setAnio(Number(evento.target.value))}
            style={estilos.input}
          >
            {aniosDisponibles().map((valor) => (
              <option key={valor} value={valor}>
                {valor}
              </option>
            ))}
          </select>
        </div>
      </div>

      <EstadoPantalla
        cargando={cargando}
        error={error && !datos ? error : ""}
        alReintentar={cargar}
        mensajeCargando="Calculando la corrección monetaria..."
      >
        {registrada && (
          <div style={estilos.tarjeta}>
            <h3 style={estilos.titulo}>Ya contabilizada</h3>
            <p style={estilos.subtitulo}>
              Comprobante N° {registrada.comprobante_numero || "—"}, factor{" "}
              {registrada.factor_anual}. Resultado por corrección:{" "}
              {pesos(registrada.resultado_correccion)}.
            </p>
            <p style={estilos.subtitulo}>Criterio registrado: {registrada.criterio}</p>
          </div>
        )}

        {datos && !puedeCalcular && (
          <div style={estilos.tarjeta}>
            <h3 style={estilos.titulo}>Falta el IPC para poder calcular</h3>
            <p style={estilos.subtitulo}>{datos.motivo}</p>
            <div style={estilos.contenedorTabla}>
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    <th style={estilos.th}>Mes</th>
                    <th style={estilos.th}>Variación del IPC (%)</th>
                    <th style={estilos.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {(datos.meses_sin_ipc || []).map((periodo) => (
                    <tr key={periodo}>
                      <td style={estilos.td}>
                        {MESES[Number(periodo.slice(5, 7)) - 1]} {periodo.slice(0, 4)}
                      </td>
                      <td style={estilos.td}>
                        <input
                          type="number"
                          step="0.01"
                          aria-label={`Variación del IPC de ${periodo}`}
                          value={ipc[periodo] ?? ""}
                          onChange={(evento) =>
                            setIpc((previo) => ({ ...previo, [periodo]: evento.target.value }))
                          }
                          style={estilos.input}
                        />
                      </td>
                      <td style={estilos.td}>
                        <button
                          type="button"
                          className="sc-btn sc-btn--secondary"
                          onClick={() => guardarIpc(periodo)}
                          disabled={trabajando}
                        >
                          Guardar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={estilos.indicadorTexto}>
              El IPC es un dato nacional: lo carga quien administra el sistema. Si el botón devuelve
              «no tienes permiso», pídelo a soporte con la publicación del INE.
            </p>
          </div>
        )}

        {sugerencias.length > 0 && (
          <div style={estilos.tarjeta}>
            <h3 style={estilos.titulo}>
              Clasificar cuentas ({sinConfirmar} sin confirmar)
            </h3>
            <p style={estilos.subtitulo}>
              La propuesta viene del tipo y el nombre de la cuenta. Revísala: de esto depende qué se
              corrige y qué no.
            </p>
            <div style={estilos.contenedorTabla}>
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    <th style={estilos.th}>Código</th>
                    <th style={estilos.th}>Cuenta</th>
                    <th style={estilos.th}>Saldo inicial</th>
                    <th style={estilos.th}>Clasificación</th>
                  </tr>
                </thead>
                <tbody>
                  {sugerencias.map((cuenta) => (
                    <tr key={cuenta.cuenta_id}>
                      <td style={estilos.td}>{cuenta.codigo}</td>
                      <td style={estilos.td}>{cuenta.nombre}</td>
                      <td style={estilos.tdNumero}>{pesos(cuenta.saldo_inicial)}</td>
                      <td style={estilos.td}>
                        <select
                          aria-label={`Clasificación de ${cuenta.nombre}`}
                          value={elegidas[cuenta.cuenta_id] || ""}
                          onChange={(evento) =>
                            setElegidas((previo) => ({
                              ...previo,
                              [cuenta.cuenta_id]: evento.target.value,
                            }))
                          }
                          style={estilos.input}
                        >
                          {CLASIFICACIONES.map((opcion) => (
                            <option key={opcion.valor} value={opcion.valor}>
                              {opcion.etiqueta}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="sc-btn sc-btn--primary"
              onClick={confirmarClasificaciones}
              disabled={trabajando}
              style={{ marginTop: 12 }}
            >
              Confirmar estas clasificaciones
            </button>
          </div>
        )}

        {datos && puedeCalcular && (
          <>
            <div style={estilos.resumenGrilla}>
              <Indicador
                titulo="Factor del año"
                valor={datos.factor_anual}
                texto={`IPC acumulado de ${anio}`}
              />
              <Indicador
                titulo="Capital propio inicial"
                valor={pesos(datos.capital_propio_inicial?.capital_propio)}
                texto="activos menos pasivos al 1 de enero"
              />
              <Indicador
                titulo="Revalorización del capital"
                valor={pesos(datos.correccion_capital_propio)}
                texto="abona al patrimonio"
              />
              <Indicador
                titulo="Resultado por corrección"
                valor={pesos(datos.resultado_correccion)}
                texto="al resultado del ejercicio"
              />
            </div>

            {(datos.avisos || []).map((aviso) => (
              <div key={aviso} style={estilos.aviso}>
                {aviso}
              </div>
            ))}

            <div style={estilos.tarjeta}>
              <h3 style={estilos.titulo}>Partidas no monetarias que se corrigen</h3>
              <div style={estilos.contenedorTabla}>
                <table style={estilos.tabla}>
                  <thead>
                    <tr>
                      <th style={estilos.th}>Código</th>
                      <th style={estilos.th}>Cuenta</th>
                      <th style={estilos.th}>Base</th>
                      <th style={estilos.th}>Factor</th>
                      <th style={estilos.th}>Corrección</th>
                      <th style={estilos.th}>Clasificación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(datos.lineas || []).map((linea) => (
                      <tr key={linea.cuenta_id}>
                        <td style={estilos.td}>{linea.codigo}</td>
                        <td style={estilos.td}>{linea.nombre}</td>
                        <td style={estilos.tdNumero}>{pesos(linea.base)}</td>
                        <td style={estilos.tdNumero}>{linea.factor}</td>
                        <td style={estilos.tdNumero}>{pesos(linea.correccion)}</td>
                        <td style={estilos.td}>
                          {linea.clasificacion_confirmada ? "confirmada" : "solo sugerida"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {!registrada && (
              <div style={estilos.tarjeta}>
                <h3 style={estilos.titulo}>Contabilizar al 31 de diciembre</h3>
                <div style={estilos.campo}>
                  <label style={estilos.etiqueta} htmlFor="cm-criterio">
                    Criterio aplicado (queda guardado con el asiento)
                  </label>
                  <textarea
                    id="cm-criterio"
                    rows={3}
                    value={criterio}
                    onChange={(evento) => setCriterio(evento.target.value)}
                    placeholder="Qué partidas se corrigieron, con qué factor y por qué."
                    style={{ ...estilos.input, resize: "vertical" }}
                  />
                </div>
                <button
                  type="button"
                  className="sc-btn sc-btn--primary"
                  onClick={contabilizar}
                  disabled={trabajando || criterio.trim().length < 10}
                  style={{ marginTop: 12 }}
                >
                  Contabilizar la corrección monetaria
                </button>
              </div>
            )}
          </>
        )}
      </EstadoPantalla>
    </div>
  );
}

function Indicador({ titulo, valor, texto }) {
  return (
    <div style={estilos.indicador}>
      <span style={estilos.indicadorTexto}>{titulo}</span>
      <span style={estilos.indicadorValor}>{valor ?? "—"}</span>
      <span style={estilos.indicadorTexto}>{texto}</span>
    </div>
  );
}
