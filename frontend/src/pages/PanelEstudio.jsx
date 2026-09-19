/**
 * Panel del estudio contable.
 *
 * Todas las empresas del usuario en una pantalla, con un semáforo por cada una.
 * Antes, para saber si a una empresa le faltaba algo había que entrar a ella,
 * elegir el ejercicio y mirar módulo por módulo. Con veinte clientes eso no se
 * hace nunca, y los problemas aparecían al declarar.
 *
 * Rojo es algo que hace que lo declarado no cuadre. Amarillo es algo que conviene
 * mirar. Verde es que no hay nada pendiente en el período.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import EstadoPantalla from "../components/EstadoPantalla";
import { obtenerPanelEstudio } from "../services/asistentesService";
import { guardarEmpresaActiva } from "../services/empresaService";
import { obtenerPeriodoTrabajo } from "../services/periodoTrabajoService";
import {
  estilos,
  pildora,
  colorEstado,
  pesos,
  numero,
  fechaCorta,
} from "../utils/estilosAsistentes";

// Las mismas nueve revisiones que corre el cierre mensual, con la misma
// gravedad. Si el panel mirara menos cosas, pintaria verde una empresa que el
// cierre marca en rojo, y un semaforo que contradice al detalle no se vuelve a
// mirar.
const PENDIENTES = [
  { clave: "asientos_descuadrados", texto: "Asientos descuadrados", gravedad: "error" },
  { clave: "documentos_duplicados", texto: "Documentos duplicados", gravedad: "error" },
  { clave: "documentos_sin_cuenta", texto: "Sin cuenta asignada", gravedad: "error" },
  { clave: "iva_descuadrado", texto: "IVA del libro no cuadra con lo contabilizado", gravedad: "error" },
  { clave: "documentos_sin_asiento", texto: "Sin contabilizar", gravedad: "aviso" },
  { clave: "movimientos_banco_sin_conciliar", texto: "Banco sin conciliar", gravedad: "aviso" },
  { clave: "liquidaciones_faltantes", texto: "Liquidaciones faltantes", gravedad: "aviso" },
  { clave: "folios_de_venta_faltantes", texto: "Folios de venta faltantes", gravedad: "aviso" },
  { clave: "montos_atipicos", texto: "Compras fuera de lo habitual", gravedad: "aviso" },
  {
    clave: "cuentas_de_iva_sin_configurar",
    texto: "Falta configurar las cuentas de IVA: no se pudo comparar",
    gravedad: "aviso",
  },
];

// Los contadores que no tienen sentido mostrar como cantidad: son un si o un no.
const SIN_CANTIDAD = ["iva_descuadrado", "cuentas_de_iva_sin_configurar"];

export default function PanelEstudio({ alAbrirEmpresa }) {
  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // Número de la última petición. Cambiar el período dos veces seguidas
  // lanzaba dos consultas, y si la primera respondía después pisaba a la
  // segunda: la pantalla mostraba un período con la etiqueta de otro.
  const ultimaPeticion = useRef(0);

  const cargar = useCallback(async (periodoPedido) => {
    const marca = ++ultimaPeticion.current;

    setCargando(true);
    setError("");

    try {
      const respuesta = await obtenerPanelEstudio(periodoPedido);

      if (marca !== ultimaPeticion.current) return;
      setDatos(respuesta);
    } catch (problema) {
      if (marca !== ultimaPeticion.current) return;
      setError(problema.message || "No se pudo cargar el panel");
      setDatos(null);
    } finally {
      if (marca === ultimaPeticion.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(periodo);
  }, [cargar, periodo]);

  /**
   * Entrar a la empresa desde el panel: es el movimiento natural después de ver
   * que a una le falta algo. Sin esto habría que volver al selector y buscarla.
   */
  function abrirEmpresa(fila) {
    const empresa = {
      id: fila.empresa_id,
      rut: fila.rut,
      razon_social: fila.razon_social,
      rol_empresa: fila.rol_empresa,
    };

    // La aplicacion es quien sabe cambiar de empresa: limpia el ejercicio y
    // lleva al selector. La version anterior recargaba la pagina con la
    // empresa nueva pero el ejercicio de la anterior, y la cabecera mostraba
    // el ano y el estado de otra empresa.
    if (typeof alAbrirEmpresa === "function") {
      alAbrirEmpresa(empresa);
      return;
    }

    guardarEmpresaActiva(empresa);
    sessionStorage.removeItem("ejercicioActivo");
    window.location.reload();
  }

  const resumen = datos?.resumen || {};
  const empresas = datos?.empresas || [];

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.barraFiltros}>
        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="panel-periodo">
            Período
          </label>
          <input
            id="panel-periodo"
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
          {cargando ? "Revisando..." : "Actualizar"}
        </button>

        <p style={{ ...estilos.subtitulo, marginLeft: "auto", maxWidth: "42ch" }}>
          Una línea por empresa. El color resume el estado del período: rojo
          impide declarar tranquilo, amarillo conviene mirarlo.
        </p>
      </div>

      <EstadoPantalla
        cargando={cargando}
        error={error}
        vacio={!cargando && !error && empresas.length === 0}
        alReintentar={() => cargar(periodo)}
        mensajeCargando="Revisando todas las empresas..."
        tituloVacio="No hay empresas para revisar"
        mensajeVacio="Cuando tengas empresas asignadas, acá vas a ver el estado de cada una."
      >
        <>
          <div style={estilos.resumenGrilla}>
            <div style={estilos.indicador}>
              <span style={{ ...estilos.indicadorValor, color: "#991b1b" }}>
                {numero(resumen.con_errores)}
              </span>
              <span style={estilos.indicadorTexto}>Con problemas que impiden declarar</span>
            </div>
            <div style={estilos.indicador}>
              <span style={{ ...estilos.indicadorValor, color: "var(--sc-naranja-texto)" }}>
                {numero(resumen.con_avisos)}
              </span>
              <span style={estilos.indicadorTexto}>Con algo por revisar</span>
            </div>
            <div style={estilos.indicador}>
              <span style={{ ...estilos.indicadorValor, color: "#065f46" }}>
                {numero(resumen.al_dia)}
              </span>
              <span style={estilos.indicadorTexto}>Al día</span>
            </div>
            <div style={estilos.indicador}>
              <span style={estilos.indicadorValor}>{pesos(resumen.iva_a_pagar_total)}</span>
              <span style={estilos.indicadorTexto}>IVA a pagar, sumando las empresas</span>
            </div>
            <div style={estilos.indicador}>
              <span style={estilos.indicadorValor}>
                {numero(resumen.documentos_del_periodo)}
              </span>
              <span style={estilos.indicadorTexto}>Documentos del período</span>
            </div>
          </div>

          <div style={estilos.tarjeta}>
            <h3 style={estilos.titulo}>Empresas del período {periodo}</h3>
            <p style={estilos.subtitulo}>
              Las que necesitan atención van primero. Haz clic en una para entrar
              a trabajarla.
            </p>

            <div style={{ ...estilos.contenedorTabla, marginTop: 12 }}>
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    <th style={estilos.th}>Estado</th>
                    <th style={estilos.th}>Empresa</th>
                    <th style={estilos.th}>Qué falta</th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>Docs.</th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>IVA a pagar</th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>Remanente</th>
                    <th style={estilos.th}>Ejercicio</th>
                    <th style={estilos.th}>Última actividad</th>
                    <th style={estilos.th} aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {empresas.map((fila) => {
                    const color = colorEstado(fila.estado);
                    const faltas = PENDIENTES.filter(
                      (p) => Number(fila.pendientes?.[p.clave] || 0) > 0
                    );

                    return (
                      <tr key={fila.empresa_id} style={{ background: color.fondo }}>
                        <td style={estilos.td}>
                          <span style={pildora(fila.estado)}>{color.etiqueta}</span>
                        </td>

                        <td style={estilos.td}>
                          <strong>{fila.razon_social}</strong>
                          <br />
                          <span style={{ color: "var(--sc-muted)", fontSize: 11.5 }}>
                            {fila.rut} · {fila.rol_empresa}
                          </span>
                        </td>

                        <td style={estilos.td}>
                          {faltas.length === 0 ? (
                            <span style={{ color: "#065f46" }}>Nada pendiente</span>
                          ) : (
                            <ul style={{ margin: 0, paddingLeft: 16 }}>
                              {faltas.map((falta) => (
                                <li
                                  key={falta.clave}
                                  style={{
                                    color:
                                      falta.gravedad === "error" ? "#991b1b" : "var(--sc-naranja-texto)",
                                  }}
                                >
                                  {falta.texto}
                                  {SIN_CANTIDAD.includes(falta.clave)
                                    ? ""
                                    : `: ${numero(fila.pendientes[falta.clave])}`}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>

                        <td style={estilos.tdNumero}>{numero(fila.documentos_del_periodo)}</td>
                        <td style={estilos.tdNumero}>{pesos(fila.iva?.a_pagar)}</td>
                        <td style={estilos.tdNumero}>{pesos(fila.iva?.remanente)}</td>

                        <td style={estilos.td}>
                          {fila.ejercicio?.estado === "sin_crear"
                            ? `${fila.ejercicio.anio} sin crear`
                            : `${fila.ejercicio?.anio} ${fila.ejercicio?.estado}`}
                        </td>

                        <td style={estilos.td}>
                          {fila.ultima_actividad
                            ? fechaCorta(fila.ultima_actividad)
                            : "Sin movimientos"}
                        </td>

                        <td style={estilos.td}>
                          <button
                            type="button"
                            className="sc-btn sc-btn--outline"
                            onClick={() => abrirEmpresa(fila)}
                          >
                            Entrar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      </EstadoPantalla>
    </div>
  );
}
