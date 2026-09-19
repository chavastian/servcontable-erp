/**
 * Resumen F29 del período y registro del formulario presentado.
 *
 * Todo lo que se muestra lo calcula el servidor con una sola función, la misma
 * que usan el control de remanente y el cierre mensual. La tasa de PPM sale de
 * la configuración contable de la empresa, no de un campo de esta pantalla:
 * antes se digitaba aquí y no se guardaba.
 *
 * Registrar el F29 presentado (folio, fecha, monto) fija el remanente en UTM
 * para el mes siguiente y deja contra qué comparar en el cierre mensual.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerF29, registrarF29Presentada } from "../services/f29Service";
import { obtenerPeriodoAnterior, obtenerPeriodoTrabajo } from "../services/periodoTrabajoService";
import EstadoPantalla from "../components/EstadoPantalla";
import { estilos, pesos, numero, fechaCorta } from "../utils/estilosAsistentes";
import PeriodoMesSelector from "../components/PeriodoMesSelector";

function Fila({ etiqueta, valor, fuerte = false, nota = "" }) {
  return (
    <tr>
      <td style={fuerte ? { ...estilos.td, fontWeight: "bold" } : estilos.td}>
        {etiqueta}
        {nota ? (
          <>
            <br />
            <span style={{ fontSize: 11.5, color: "var(--sc-muted)" }}>{nota}</span>
          </>
        ) : null}
      </td>
      <td style={fuerte ? { ...estilos.tdNumero, fontWeight: "bold" } : estilos.tdNumero}>{valor}</td>
    </tr>
  );
}

export default function ResumenF29() {
  const empresaActiva = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoAnterior(obtenerPeriodoTrabajo()));
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [errorAccion, setErrorAccion] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [presentacion, setPresentacion] = useState({
    folio_sii: "",
    fecha_presentacion: new Date().toISOString().slice(0, 10),
    total_pagado: "",
    rectifica: false,
  });
  const ultimaPeticion = useRef(0);

  const cargar = useCallback(
    async (periodoPedido) => {
      if (!empresaActiva?.id) {
        setErrorCarga("Selecciona una empresa activa antes de ver el resumen F29.");
        setCargando(false);
        return;
      }

      const marca = ++ultimaPeticion.current;
      setCargando(true);
      setErrorCarga("");
      setErrorAccion("");

      try {
        const respuesta = await obtenerF29(empresaActiva.id, periodoPedido);

        if (marca !== ultimaPeticion.current) return;
        setDatos(respuesta);
        setPresentacion((previa) => ({
          ...previa,
          total_pagado: String(respuesta.total_f29_estimado || 0),
          rectifica: Boolean(respuesta.presentada),
        }));
      } catch (problema) {
        if (marca !== ultimaPeticion.current) return;
        setErrorCarga(problema.message || "No se pudo calcular el F29");
        setDatos(null);
      } finally {
        if (marca === ultimaPeticion.current) setCargando(false);
      }
    },
    [empresaActiva?.id]
  );

  useEffect(() => {
    cargar(periodo);
  }, [cargar, periodo]);

  async function registrar(evento) {
    evento.preventDefault();

    if (guardando) return;

    setGuardando(true);
    setErrorAccion("");
    setMensaje("");

    try {
      const respuesta = await registrarF29Presentada({
        empresa_id: empresaActiva.id,
        periodo,
        folio_sii: presentacion.folio_sii || null,
        fecha_presentacion: presentacion.fecha_presentacion,
        total_pagado: presentacion.total_pagado === "" ? null : Number(presentacion.total_pagado),
        rectifica: presentacion.rectifica,
      });

      setMensaje(respuesta.mensaje);
      await cargar(periodo);
    } catch (problema) {
      setErrorAccion(problema.message || "No se pudo registrar el F29");
    } finally {
      setGuardando(false);
    }
  }

  const ventas = datos?.ventas || {};
  const compras = datos?.compras || {};
  const iva = datos?.iva || {};
  const ppm = datos?.ppm || {};
  const honorarios = datos?.honorarios || {};
  const proporcionalidad = datos?.proporcionalidad || {};
  const presentada = datos?.presentada || null;

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.barraFiltros}>
        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="f29-periodo">
            Período que se declara
          </label>
          <PeriodoMesSelector
            id="f29-periodo"
            style={estilos.input}
            value={periodo}
            onChange={setPeriodo}
            permitirOtroAnio
          />
        </div>

        <button
          type="button"
          className="sc-btn sc-btn--primary"
          onClick={() => cargar(periodo)}
          disabled={cargando}
        >
          {cargando ? "Calculando..." : "Recalcular"}
        </button>

        <p style={{ ...estilos.subtitulo, marginLeft: "auto", maxWidth: "44ch" }}>
          {empresaActiva?.razon_social ? `Empresa: ${empresaActiva.razon_social}. ` : ""}
          La tasa de PPM y las condiciones del plazo se toman de Configuración Contable.
        </p>
      </div>

      {mensaje ? <div className="sc-message sc-message--ok">{mensaje}</div> : null}
      {errorAccion ? <div className="sc-message sc-message--error">{errorAccion}</div> : null}

      <EstadoPantalla
        cargando={cargando}
        error={errorCarga}
        alReintentar={() => cargar(periodo)}
        mensajeCargando="Calculando el F29..."
      >
        <>
          <div style={estilos.resumenGrilla}>
            <div style={estilos.indicador}>
              <span style={estilos.indicadorValor}>{pesos(iva.iva_debito)}</span>
              <span style={estilos.indicadorTexto}>IVA débito</span>
            </div>
            <div style={estilos.indicador}>
              <span style={estilos.indicadorValor}>{pesos(iva.iva_credito)}</span>
              <span style={estilos.indicadorTexto}>IVA crédito, con uso común proporcional</span>
            </div>
            <div style={estilos.indicador}>
              <span style={estilos.indicadorValor}>{pesos(iva.remanente_anterior)}</span>
              <span style={estilos.indicadorTexto}>
                Remanente anterior ({numero(iva.remanente_anterior_utm)} UTM)
              </span>
            </div>
            <div style={estilos.indicador}>
              <span style={{ ...estilos.indicadorValor, color: iva.iva_pagar > 0 ? "#991b1b" : "#065f46" }}>
                {pesos(iva.iva_pagar)}
              </span>
              <span style={estilos.indicadorTexto}>IVA a pagar</span>
            </div>
            <div style={estilos.indicador}>
              <span style={estilos.indicadorValor}>{pesos(datos?.total_f29_estimado)}</span>
              <span style={estilos.indicadorTexto}>Total F29 estimado</span>
            </div>
          </div>

          {(datos?.avisos || []).length > 0 ? (
            <div style={estilos.aviso}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {datos.avisos.map((aviso) => (
                  <li key={aviso}>{aviso}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
            <div style={estilos.tarjeta}>
              <h3 style={estilos.titulo}>Ventas del período</h3>
              <div style={estilos.contenedorTabla}>
                <table style={estilos.tabla}>
                  <tbody>
                    <Fila etiqueta="Ventas netas afectas" valor={pesos(ventas.neto)} />
                    <Fila etiqueta="Ventas exentas" valor={pesos(ventas.exento)} />
                    <Fila etiqueta="IVA débito fiscal" valor={pesos(ventas.iva_debito)} />
                    <Fila etiqueta="Total ventas" valor={pesos(ventas.total)} fuerte />
                    <Fila etiqueta="Documentos" valor={numero(ventas.documentos)} />
                  </tbody>
                </table>
              </div>
            </div>

            <div style={estilos.tarjeta}>
              <h3 style={estilos.titulo}>Compras del período</h3>
              <div style={estilos.contenedorTabla}>
                <table style={estilos.tabla}>
                  <tbody>
                    <Fila etiqueta="Compras netas afectas" valor={pesos(compras.neto)} />
                    <Fila etiqueta="Compras exentas" valor={pesos(compras.exento)} />
                    <Fila etiqueta="IVA crédito directo" valor={pesos(compras.iva_credito)} />
                    <Fila
                      etiqueta="IVA de uso común"
                      valor={pesos(compras.iva_uso_comun)}
                      nota={
                        proporcionalidad.aplica
                          ? `Factor ${numero(Math.round((proporcionalidad.factor || 0) * 10000) / 100)}%: crédito ${pesos(
                              compras.credito_uso_comun
                            )}, no recuperable ${pesos(compras.uso_comun_no_recuperable)}`
                          : "Sin IVA de uso común en el período"
                      }
                    />
                    <Fila etiqueta="IVA no recuperable" valor={pesos(compras.iva_no_recuperable)} />
                    <Fila
                      etiqueta="Activo fijo"
                      valor={pesos(compras.iva_activo_fijo)}
                      nota={`Neto ${pesos(compras.neto_activo_fijo)}. Informativo para el artículo 27 bis.`}
                    />
                    <Fila
                      etiqueta="Facturas de compra (tipo 46)"
                      valor={numero(compras.facturas_compra)}
                      nota="Su IVA lo retiene la empresa y va como IVA retenido."
                    />
                    <Fila etiqueta="Total compras" valor={pesos(compras.total)} fuerte />
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div style={estilos.tarjeta}>
            <h3 style={estilos.titulo}>Determinación del F29</h3>
            <p style={estilos.subtitulo}>
              Remanente en UTM del período ({numero(datos?.valor_utm)} por UTM), PPM sobre ingresos
              brutos, retenciones por mes de pago.
            </p>
            <div style={{ ...estilos.contenedorTabla, marginTop: 10 }}>
              <table style={estilos.tabla}>
                <tbody>
                  <Fila etiqueta="IVA débito fiscal" valor={pesos(iva.iva_debito)} />
                  <Fila etiqueta="Menos IVA crédito fiscal" valor={pesos(iva.iva_credito)} />
                  <Fila
                    etiqueta="Menos remanente del período anterior"
                    valor={pesos(iva.remanente_anterior)}
                    nota={`${numero(iva.remanente_anterior_utm)} UTM reconvertidas con la UTM de este mes`}
                  />
                  <Fila etiqueta="IVA determinado" valor={pesos(iva.iva_determinado)} fuerte />
                  <Fila etiqueta="IVA a pagar" valor={pesos(iva.iva_pagar)} />
                  <Fila
                    etiqueta="Remanente para el mes siguiente"
                    valor={pesos(iva.remanente_siguiente)}
                    nota={iva.remanente_siguiente_utm !== null ? `${numero(iva.remanente_siguiente_utm)} UTM` : "Sin UTM del período: se arrastra en pesos"}
                  />
                  <Fila etiqueta="IVA retenido en facturas de compra" valor={pesos(iva.iva_retenido)} />
                  <Fila
                    etiqueta="PPM"
                    valor={pesos(ppm.monto_ppm)}
                    nota={`${numero(ppm.tasa_ppm)}% sobre ingresos brutos de ${pesos(ppm.base_ppm)}`}
                  />
                  <Fila
                    etiqueta="Retención de honorarios"
                    valor={pesos(honorarios.retencion)}
                    nota={
                      honorarios.sin_fecha_pago > 0
                        ? `${numero(honorarios.sin_fecha_pago)} boleta(s) sin fecha de pago, tomadas por emisión`
                        : "Por mes de pago"
                    }
                  />
                  <Fila etiqueta="Total F29 estimado" valor={pesos(datos?.total_f29_estimado)} fuerte />
                </tbody>
              </table>
            </div>
            <p style={{ ...estilos.subtitulo, marginTop: 10 }}>
              Estimación interna. No reemplaza el formulario oficial ni los códigos que puedan aplicar
              a la empresa.
            </p>
          </div>

          <div style={estilos.tarjeta}>
            <h3 style={estilos.titulo}>
              {presentada ? "F29 presentado" : "Registrar el F29 presentado"}
            </h3>
            {presentada ? (
              <p style={estilos.subtitulo}>
                Folio {presentada.folio_sii || "sin folio"}, presentado el{" "}
                {fechaCorta(presentada.fecha_presentacion)} por {pesos(presentada.total_pagado)}.
                {presentada.diferencia_contra_calculado
                  ? ` Difiere en ${pesos(presentada.diferencia_contra_calculado)} de lo calculado hoy.`
                  : " Coincide con lo calculado hoy."}{" "}
                Si presentaste una rectificatoria, regístrala abajo.
              </p>
            ) : (
              <p style={estilos.subtitulo}>
                Registrar el folio y la fecha fija el remanente del período y permite que el cierre
                mensual detecte documentos modificados después de declarar.
              </p>
            )}

            <form
              onSubmit={registrar}
              style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginTop: 10 }}
            >
              <div style={estilos.campo}>
                <label style={estilos.etiqueta} htmlFor="f29-folio">
                  Folio SII
                </label>
                <input
                  id="f29-folio"
                  style={estilos.input}
                  value={presentacion.folio_sii}
                  onChange={(evento) => setPresentacion({ ...presentacion, folio_sii: evento.target.value })}
                />
              </div>
              <div style={estilos.campo}>
                <label style={estilos.etiqueta} htmlFor="f29-fecha">
                  Fecha de presentación
                </label>
                <input
                  id="f29-fecha"
                  type="date"
                  style={estilos.input}
                  value={presentacion.fecha_presentacion}
                  onChange={(evento) =>
                    setPresentacion({ ...presentacion, fecha_presentacion: evento.target.value })
                  }
                  required
                />
              </div>
              <div style={estilos.campo}>
                <label style={estilos.etiqueta} htmlFor="f29-total">
                  Total pagado
                </label>
                <input
                  id="f29-total"
                  type="number"
                  style={estilos.input}
                  value={presentacion.total_pagado}
                  onChange={(evento) => setPresentacion({ ...presentacion, total_pagado: evento.target.value })}
                />
              </div>
              {presentada ? (
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
                  <input
                    type="checkbox"
                    checked={presentacion.rectifica}
                    onChange={(evento) => setPresentacion({ ...presentacion, rectifica: evento.target.checked })}
                  />
                  Es una rectificatoria
                </label>
              ) : null}
              <button type="submit" className="sc-btn sc-btn--success" disabled={guardando}>
                {guardando ? "Guardando..." : presentada ? "Registrar rectificatoria" : "Registrar F29"}
              </button>
            </form>
          </div>
        </>
      </EstadoPantalla>
    </div>
  );
}
