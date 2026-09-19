/**
 * Cierre mensual asistido.
 *
 * Las comprobaciones que un contador hace antes de declarar, todas en una
 * pantalla y con una respuesta clara arriba: se puede declarar o no.
 *
 * Antes cada revisión vivía en otro lugar (el balance para ver si cuadraba, el
 * libro de compras para ver si faltaban cuentas, la conciliación aparte) y nadie
 * las juntaba. Un error se descubría después de presentar el F29.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import EstadoPantalla from "../components/EstadoPantalla";
import { obtenerCierreMensual } from "../services/asistentesService";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerPeriodoTrabajo } from "../services/periodoTrabajoService";
import PeriodoMesSelector from "../components/PeriodoMesSelector";
import {
  estilos,
  pildora,
  colorEstado,
  pesos,
  numero,
  fechaCorta,
} from "../utils/estilosAsistentes";

function Afectado({ item }) {
  const partes = [];

  if (item.referencia) partes.push(item.referencia);
  if (item.fecha) partes.push(fechaCorta(item.fecha));
  if (item.tercero) partes.push(item.tercero);
  if (item.diferencia !== undefined) partes.push(`diferencia ${pesos(item.diferencia)}`);
  else if (item.total !== undefined) partes.push(pesos(item.total));
  if (item.detalle) partes.push(item.detalle);

  return <li style={{ marginBottom: 2 }}>{partes.join(" · ")}</li>;
}

export default function CierreMensual() {
  const empresa = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [abiertas, setAbiertas] = useState({});

  // Número de la última petición: una respuesta lenta de un período anterior
  // no debe pisar la del período que se está mirando.
  const ultimaPeticion = useRef(0);

  const cargar = useCallback(
    async (periodoPedido) => {
      if (!empresa?.id) {
        setError("Selecciona una empresa para revisar el cierre.");
        setCargando(false);
        return;
      }

      const marca = ++ultimaPeticion.current;

      setCargando(true);
      setError("");

      try {
        const respuesta = await obtenerCierreMensual(empresa.id, periodoPedido);

        if (marca !== ultimaPeticion.current) return;
        setDatos(respuesta);
      } catch (problema) {
        if (marca !== ultimaPeticion.current) return;
        setError(problema.message || "No se pudo revisar el período");
        setDatos(null);
      } finally {
        if (marca === ultimaPeticion.current) setCargando(false);
      }
    },
    [empresa?.id]
  );

  useEffect(() => {
    cargar(periodo);
  }, [cargar, periodo]);

  const resumen = datos?.resumen || {};
  const revisiones = datos?.revisiones || [];
  const color = colorEstado(resumen.estado);

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.barraFiltros}>
        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="cierre-periodo">
            Período a revisar
          </label>
          <PeriodoMesSelector
            id="cierre-periodo"
            style={estilos.input}
            value={periodo}
            onChange={setPeriodo}
          />
        </div>

        <button
          type="button"
          className="sc-btn sc-btn--primary"
          onClick={() => cargar(periodo)}
          disabled={cargando}
        >
          {cargando ? "Revisando..." : "Revisar el período"}
        </button>

        <p style={{ ...estilos.subtitulo, marginLeft: "auto", maxWidth: "40ch" }}>
          {empresa?.razon_social
            ? `Empresa: ${empresa.razon_social}`
            : "Sin empresa seleccionada"}
        </p>
      </div>

      <EstadoPantalla
        cargando={cargando}
        error={error}
        alReintentar={() => cargar(periodo)}
        mensajeCargando="Corriendo las revisiones del período..."
      >
        <>
          <div
            style={{
              ...estilos.tarjeta,
              background: color.fondo,
              border: `1px solid ${color.borde}`,
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span style={pildora(resumen.estado)}>{color.etiqueta}</span>
              <strong style={{ fontSize: 14.5, color: color.texto }}>{datos?.mensaje}</strong>
            </div>

            <p style={{ ...estilos.subtitulo, marginTop: 8 }}>
              {numero(resumen.errores)} problema(s), {numero(resumen.avisos)} aviso(s) y{" "}
              {numero(resumen.correctas)} revisión(es) sin nada que observar, entre el{" "}
              {fechaCorta(datos?.desde)} y el {fechaCorta(datos?.hasta)}.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {revisiones.map((revision) => {
              const colorRevision = colorEstado(revision.estado);
              const abierta = abiertas[revision.codigo] === true;
              const tieneDetalle = (revision.afectados || []).length > 0;

              return (
                <div
                  key={revision.codigo}
                  style={{
                    ...estilos.tarjeta,
                    padding: "12px 14px",
                    borderLeft: `4px solid ${colorRevision.borde}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={pildora(revision.estado)}>
                      {revision.estado === "ok"
                        ? "Sin observaciones"
                        : revision.estado === "aviso"
                        ? "Aviso"
                        : "Problema"}
                    </span>

                    <strong style={{ fontSize: 13.5 }}>{revision.titulo}</strong>

                    {revision.cantidad > 0 ? (
                      <span style={{ color: "var(--sc-muted)", fontSize: 12 }}>
                        {numero(revision.cantidad)} caso(s)
                      </span>
                    ) : null}

                    {tieneDetalle ? (
                      <button
                        type="button"
                        className="sc-btn sc-btn--ghost"
                        style={{ marginLeft: "auto" }}
                        onClick={() =>
                          setAbiertas((previas) => ({
                            ...previas,
                            [revision.codigo]: !abierta,
                          }))
                        }
                      >
                        {abierta ? "Ocultar detalle" : "Ver detalle"}
                      </button>
                    ) : null}
                  </div>

                  <p style={{ ...estilos.subtitulo, marginTop: 6 }}>{revision.detalle}</p>

                  {abierta && tieneDetalle ? (
                    <ul
                      style={{
                        margin: "8px 0 0",
                        paddingLeft: 18,
                        fontSize: 12.5,
                        color: "var(--sc-text)",
                      }}
                    >
                      {revision.afectados.map((item, indice) => (
                        <Afectado key={`${revision.codigo}-${item.id || indice}`} item={item} />
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      </EstadoPantalla>
    </div>
  );
}
