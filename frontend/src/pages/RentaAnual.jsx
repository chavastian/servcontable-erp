/**
 * Renta líquida imponible y propuesta de F22 (módulo 9 de la revisión del
 * 19-09-2026).
 *
 * La pantalla separa con cuidado dos cosas que se parecen y no son lo mismo:
 * las partidas que el sistema calculó de sus propios datos y las que escribió
 * una persona. Cada línea dice cuál es. Las del sistema se recalculan en cada
 * consulta; las manuales se conservan, porque el sistema no tiene manera de
 * volver a deducirlas.
 *
 * Lo que aquí NO se hace: presentar el F22. Lo que se muestra es una propuesta
 * de códigos para comparar contra lo que el contador va a declarar. Los códigos
 * del formulario cambian año a año y el sistema no los sigue.
 */

import { useCallback, useEffect, useState } from "react";
import EstadoPantalla from "../components/EstadoPantalla";
import { obtenerEmpresaActiva } from "../services/empresaService";
import {
  obtenerRentaAnual,
  obtenerPropuestaF22,
  guardarRentaAnual,
  cerrarRentaAnual,
  reabrirRentaAnual,
  guardarRegimen,
} from "../services/rentaAnualService";
import { estilos, pesos } from "../utils/estilosAsistentes";

const LINEA_VACIA = { concepto: "", tipo: "agregado", monto: "" };
const CLAVES_REGISTROS = ["RAI", "DDAN", "REX", "SAC"];

function aniosDisponibles() {
  const actual = new Date().getFullYear();

  return [actual, actual - 1, actual - 2, actual - 3];
}

export default function RentaAnual() {
  const empresa = obtenerEmpresaActiva();

  const [anio, setAnio] = useState(new Date().getFullYear() - 1);
  const [pestana, setPestana] = useState("rli");
  const [datos, setDatos] = useState(null);
  const [f22, setF22] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  const [manuales, setManuales] = useState([]);
  const [nueva, setNueva] = useState(LINEA_VACIA);
  const [saldos, setSaldos] = useState({});
  const [criterio, setCriterio] = useState("");
  const [regimen, setRegimen] = useState("");

  const cargar = useCallback(async () => {
    if (!empresa?.id) {
      setError("Selecciona una empresa para determinar la renta.");
      setCargando(false);
      return;
    }

    setCargando(true);
    setError("");

    try {
      const respuesta = await obtenerRentaAnual(empresa.id, anio);
      setDatos(respuesta);
      setManuales((respuesta.lineas || []).filter((linea) => linea.origen === "manual"));
      setRegimen(respuesta.regimen?.codigo || "");
      setCriterio(respuesta.renta_guardada?.criterio || "");
      setSaldos(
        Object.fromEntries(
          CLAVES_REGISTROS.map((clave) => [clave, respuesta.registros?.[clave]?.saldo_inicial ?? 0])
        )
      );
    } catch (problema) {
      setError(problema.message);
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [empresa?.id, anio]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (pestana !== "f22" || !empresa?.id) return;

    obtenerPropuestaF22(empresa.id, anio)
      .then(setF22)
      .catch((problema) => setError(problema.message));
  }, [pestana, empresa?.id, anio]);

  function agregarLinea() {
    if (!nueva.concepto.trim() || !Number(nueva.monto)) return;

    setManuales((previo) => [...previo, { ...nueva, monto: Number(nueva.monto), origen: "manual" }]);
    setNueva(LINEA_VACIA);
  }

  function quitarLinea(indice) {
    setManuales((previo) => previo.filter((_, i) => i !== indice));
  }

  async function guardar() {
    setTrabajando(true);
    setError("");

    try {
      const respuesta = await guardarRentaAnual({
        empresaId: empresa.id,
        anio,
        lineas: manuales,
        saldosIniciales: saldos,
        criterio,
      });
      setMensaje(respuesta.mensaje);
      await cargar();
    } catch (problema) {
      setError(problema.message);
    } finally {
      setTrabajando(false);
    }
  }

  async function cerrar() {
    setTrabajando(true);
    setError("");

    try {
      const respuesta = await cerrarRentaAnual({ empresaId: empresa.id, anio, criterio });
      setMensaje(respuesta.mensaje);
      await cargar();
    } catch (problema) {
      setError(problema.message);
    } finally {
      setTrabajando(false);
    }
  }

  async function reabrir() {
    const motivo = window.prompt("¿Por qué se reabre la renta de este año?");

    if (!motivo || motivo.trim().length < 5) return;

    setTrabajando(true);
    setError("");

    try {
      const respuesta = await reabrirRentaAnual({ empresaId: empresa.id, anio, motivo });
      setMensaje(respuesta.mensaje);
      await cargar();
    } catch (problema) {
      setError(problema.message);
    } finally {
      setTrabajando(false);
    }
  }

  async function cambiarRegimen(codigo) {
    setRegimen(codigo);

    if (!codigo) return;

    setTrabajando(true);
    setError("");

    try {
      await guardarRegimen(empresa.id, codigo);
      setMensaje("Régimen guardado.");
      await cargar();
    } catch (problema) {
      setError(problema.message);
    } finally {
      setTrabajando(false);
    }
  }

  const cerrada = datos?.renta_guardada?.estado === "cerrada";
  const delSistema = (datos?.lineas || []).filter((linea) => linea.origen === "sistema");

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.tarjeta}>
        <h2 style={estilos.titulo}>Renta anual</h2>
        <p style={estilos.subtitulo}>
          Parte del resultado según balance y le suma o resta partidas. Las que el sistema puede
          calcular vienen marcadas; el resto se agrega a mano.
        </p>
      </div>

      {mensaje && <div style={estilos.aviso}>{mensaje}</div>}
      {error && (
        <div style={{ ...estilos.aviso, borderColor: "#ef4444", color: "#991b1b" }}>{error}</div>
      )}

      <div style={estilos.barraFiltros}>
        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="renta-anio">
            Año comercial
          </label>
          <select
            id="renta-anio"
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

        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="renta-regimen">
            Régimen tributario
          </label>
          <select
            id="renta-regimen"
            value={regimen}
            onChange={(evento) => cambiarRegimen(evento.target.value)}
            style={estilos.input}
          >
            <option value="">Sin definir</option>
            {(datos?.regimenes_disponibles || []).map((opcion) => (
              <option key={opcion.codigo} value={opcion.codigo}>
                {opcion.nombre || opcion.codigo}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <button
            type="button"
            className={pestana === "rli" ? "sc-btn sc-btn--primary" : "sc-btn sc-btn--secondary"}
            onClick={() => setPestana("rli")}
          >
            Renta líquida
          </button>
          <button
            type="button"
            className={pestana === "f22" ? "sc-btn sc-btn--primary" : "sc-btn sc-btn--secondary"}
            onClick={() => setPestana("f22")}
          >
            Propuesta F22
          </button>
        </div>
      </div>

      <EstadoPantalla
        cargando={cargando}
        error={error && !datos ? error : ""}
        alReintentar={cargar}
        mensajeCargando="Determinando la renta líquida imponible..."
      >
        {pestana === "rli" && datos && (
          <>
            <div style={estilos.resumenGrilla}>
              <Indicador
                titulo="Resultado según balance"
                valor={pesos(datos.balance?.resultado)}
                texto={`ingresos ${pesos(datos.balance?.ingresos)}`}
              />
              <Indicador
                titulo="Agregados"
                valor={pesos(datos.total_agregados)}
                texto="suman a la renta"
              />
              <Indicador
                titulo="Deducciones"
                valor={pesos(datos.total_deducciones)}
                texto="restan de la renta"
              />
              <Indicador
                titulo="Renta líquida imponible"
                valor={pesos(datos.renta_liquida_imponible)}
                texto={
                  datos.impuesto_primera_categoria === null
                    ? "sin régimen no se calcula el impuesto"
                    : `impuesto ${pesos(datos.impuesto_primera_categoria)}`
                }
              />
            </div>

            {(datos.avisos || []).map((aviso) => (
              <div key={aviso} style={estilos.aviso}>
                {aviso}
              </div>
            ))}

            <div style={estilos.tarjeta}>
              <h3 style={estilos.titulo}>Partidas</h3>
              <div style={estilos.contenedorTabla}>
                <table style={estilos.tabla}>
                  <thead>
                    <tr>
                      <th style={estilos.th}>Concepto</th>
                      <th style={estilos.th}>Tipo</th>
                      <th style={estilos.th}>Monto</th>
                      <th style={estilos.th}>Origen</th>
                      <th style={estilos.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {delSistema.map((linea) => (
                      <tr key={`sistema-${linea.concepto}`}>
                        <td style={estilos.td}>{linea.concepto}</td>
                        <td style={estilos.td}>{linea.tipo}</td>
                        <td style={estilos.tdNumero}>{pesos(linea.monto)}</td>
                        <td style={estilos.td}>calculado: {linea.referencia}</td>
                        <td style={estilos.td}></td>
                      </tr>
                    ))}
                    {manuales.map((linea, indice) => (
                      <tr key={`manual-${indice}-${linea.concepto}`}>
                        <td style={estilos.td}>{linea.concepto}</td>
                        <td style={estilos.td}>{linea.tipo}</td>
                        <td style={estilos.tdNumero}>{pesos(linea.monto)}</td>
                        <td style={estilos.td}>agregada a mano</td>
                        <td style={estilos.td}>
                          {!cerrada && (
                            <button
                              type="button"
                              className="sc-btn sc-btn--secondary"
                              onClick={() => quitarLinea(indice)}
                            >
                              Quitar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!cerrada && (
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <div style={estilos.campo}>
                    <label style={estilos.etiqueta} htmlFor="renta-concepto">
                      Concepto
                    </label>
                    <input
                      id="renta-concepto"
                      value={nueva.concepto}
                      onChange={(evento) =>
                        setNueva((previo) => ({ ...previo, concepto: evento.target.value }))
                      }
                      style={estilos.input}
                    />
                  </div>
                  <div style={estilos.campo}>
                    <label style={estilos.etiqueta} htmlFor="renta-tipo">
                      Tipo
                    </label>
                    <select
                      id="renta-tipo"
                      value={nueva.tipo}
                      onChange={(evento) =>
                        setNueva((previo) => ({ ...previo, tipo: evento.target.value }))
                      }
                      style={estilos.input}
                    >
                      <option value="agregado">Agregado</option>
                      <option value="deduccion">Deducción</option>
                    </select>
                  </div>
                  <div style={estilos.campo}>
                    <label style={estilos.etiqueta} htmlFor="renta-monto">
                      Monto
                    </label>
                    <input
                      id="renta-monto"
                      type="number"
                      value={nueva.monto}
                      onChange={(evento) =>
                        setNueva((previo) => ({ ...previo, monto: evento.target.value }))
                      }
                      style={estilos.input}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <button
                      type="button"
                      className="sc-btn sc-btn--secondary"
                      onClick={agregarLinea}
                    >
                      Agregar partida
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={estilos.tarjeta}>
              <h3 style={estilos.titulo}>Registros del artículo 14</h3>
              <p style={estilos.subtitulo}>{datos.registros?.aviso}</p>
              <div style={estilos.contenedorTabla}>
                <table style={estilos.tabla}>
                  <thead>
                    <tr>
                      <th style={estilos.th}>Registro</th>
                      <th style={estilos.th}>Saldo inicial</th>
                      <th style={estilos.th}>Movimiento del año</th>
                      <th style={estilos.th}>Saldo final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CLAVES_REGISTROS.map((clave) => {
                      const registro = datos.registros?.[clave] || {};

                      return (
                        <tr key={clave}>
                          <td style={estilos.td}>
                            {clave} — {registro.nombre}
                            {registro.requiere && (
                              <div style={estilos.indicadorTexto}>{registro.requiere}</div>
                            )}
                          </td>
                          <td style={estilos.td}>
                            <input
                              type="number"
                              aria-label={`Saldo inicial de ${clave}`}
                              value={saldos[clave] ?? 0}
                              disabled={cerrada}
                              onChange={(evento) =>
                                setSaldos((previo) => ({
                                  ...previo,
                                  [clave]: Number(evento.target.value),
                                }))
                              }
                              style={estilos.input}
                            />
                          </td>
                          <td style={estilos.tdNumero}>
                            {registro.movimiento === null ? "—" : pesos(registro.movimiento)}
                          </td>
                          <td style={estilos.tdNumero}>
                            {registro.saldo_final === null ? "—" : pesos(registro.saldo_final)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={estilos.tarjeta}>
              <h3 style={estilos.titulo}>
                {cerrada ? "Renta cerrada" : "Guardar o cerrar la determinación"}
              </h3>
              <div style={estilos.campo}>
                <label style={estilos.etiqueta} htmlFor="renta-criterio">
                  Criterio aplicado
                </label>
                <textarea
                  id="renta-criterio"
                  rows={3}
                  value={criterio}
                  disabled={cerrada}
                  onChange={(evento) => setCriterio(evento.target.value)}
                  placeholder="Qué se agregó, qué se dedujo y por qué."
                  style={{ ...estilos.input, resize: "vertical" }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {!cerrada && (
                  <>
                    <button
                      type="button"
                      className="sc-btn sc-btn--secondary"
                      onClick={guardar}
                      disabled={trabajando}
                    >
                      Guardar borrador
                    </button>
                    <button
                      type="button"
                      className="sc-btn sc-btn--primary"
                      onClick={cerrar}
                      disabled={trabajando || !regimen || criterio.trim().length < 10}
                    >
                      Cerrar la renta del año
                    </button>
                  </>
                )}
                {cerrada && (
                  <button
                    type="button"
                    className="sc-btn sc-btn--secondary"
                    onClick={reabrir}
                    disabled={trabajando}
                  >
                    Reabrir
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {pestana === "f22" && f22 && (
          <>
            {(f22.avisos || []).map((aviso) => (
              <div key={aviso} style={estilos.aviso}>
                {aviso}
              </div>
            ))}
            <div style={estilos.tarjeta}>
              <h3 style={estilos.titulo}>
                Propuesta de códigos, año tributario {f22.anio_tributario}
              </h3>
              <div style={estilos.contenedorTabla}>
                <table style={estilos.tabla}>
                  <thead>
                    <tr>
                      <th style={estilos.th}>Código</th>
                      <th style={estilos.th}>Concepto</th>
                      <th style={estilos.th}>Valor</th>
                      <th style={estilos.th}>De dónde sale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(f22.codigos || []).map((fila) => (
                      <tr key={fila.codigo}>
                        <td style={estilos.td}>{fila.codigo}</td>
                        <td style={estilos.td}>{fila.concepto}</td>
                        <td style={estilos.tdNumero}>
                          {fila.valor === null ? "—" : pesos(fila.valor)}
                        </td>
                        <td style={estilos.td}>{fila.origen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
