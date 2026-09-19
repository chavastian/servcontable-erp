/**
 * Declaraciones juradas anuales (módulo 10 de la revisión del 19-09-2026).
 *
 * Todo esto ya estaba en el sistema y había que sacarlo a mano cada marzo: los
 * honorarios con su retención para la 1879, y las liquidaciones con su impuesto
 * único para la 1887. Acá se ven los dos resúmenes, se descarga el archivo de
 * carga y se emite el certificado de cada contribuyente.
 *
 * Los avisos de validación van a la vista y también impresos en el certificado:
 * el formato del SII cambia casi todos los años y las cifras no están
 * reajustadas.
 */

import { useCallback, useEffect, useState } from "react";
import EstadoPantalla from "../components/EstadoPantalla";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerEjercicioActivo } from "../services/ejerciciosService";
import {
  obtenerDeclaracion,
  descargarDeclaracion,
  obtenerCertificado,
} from "../services/declaracionesJuradasService";
import { estilos, pesos, numero } from "../utils/estilosAsistentes";
import { exportarExcel } from "../utils/exportUtils";

function anioComercialPorDefecto() {
  const ejercicio = obtenerEjercicioActivo();

  return String(Number(ejercicio?.anio) || new Date().getFullYear() - 1);
}

export default function DeclaracionesJuradas() {
  const empresa = obtenerEmpresaActiva();

  const [anio, setAnio] = useState(anioComercialPorDefecto);
  const [tipo, setTipo] = useState("1879");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [emitiendo, setEmitiendo] = useState("");

  const cargar = useCallback(async () => {
    if (!empresa?.id) {
      setError("Selecciona una empresa para ver las declaraciones juradas.");
      setCargando(false);
      return;
    }

    setCargando(true);
    setError("");
    setMensaje("");

    try {
      const respuesta = await obtenerDeclaracion(tipo, empresa.id, anio);
      setDatos(respuesta);
    } catch (problema) {
      setError(problema.message);
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [empresa?.id, tipo, anio]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function descargar() {
    try {
      setError("");
      const blob = await descargarDeclaracion(tipo, empresa.id, anio);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");

      enlace.href = url;
      enlace.download = `DJ${tipo}_${anio}.csv`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);

      setMensaje(
        `Archivo DJ${tipo} generado. Coteja los códigos de columna con la resolución del año tributario ${Number(anio) + 1} antes de subirlo al SII.`
      );
    } catch (problema) {
      setError(problema.message);
    }
  }

  function exportarPlanilla() {
    if (!datos) return;

    const filas =
      tipo === "1879"
        ? datos.detalle.map((fila) => ({
            RUT: fila.rut,
            Nombre: fila.nombre,
            Documentos: fila.documentos,
            "Honorarios brutos": fila.honorarios_brutos,
            Retención: fila.retencion,
            "Sin fecha de pago": fila.sin_fecha_pago,
          }))
        : datos.detalle.map((fila) => ({
            RUT: fila.rut,
            Nombre: fila.nombre,
            Meses: fila.meses,
            "Renta imponible": fila.renta_imponible,
            "Renta tributable": fila.renta_tributable,
            "Impuesto único": fila.impuesto_unico,
            "Rentas no gravadas": fila.rentas_no_gravadas,
            "Cotizaciones previsionales": fila.cotizaciones_previsionales,
          }));

    exportarExcel(`DJ${tipo}_${anio}`, filas);
  }

  async function emitirCertificado(fila) {
    setEmitiendo(fila.rut);
    setError("");

    try {
      const certificado = await obtenerCertificado({
        tipo: tipo === "1879" ? "honorarios" : "sueldos",
        empresaId: empresa.id,
        anio,
        rut: fila.rut,
      });

      // El PDF se carga solo cuando hace falta: pesa más que la pantalla.
      const { exportarCertificadoPDF } = await import("../utils/certificadoPdf");

      exportarCertificadoPDF(certificado);
      setMensaje(`Certificado de ${fila.nombre} emitido.`);
    } catch (problema) {
      setError(problema.message);
    } finally {
      setEmitiendo("");
    }
  }

  const es1879 = tipo === "1879";

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.tarjeta}>
        <h2 style={estilos.titulo}>Declaraciones juradas anuales</h2>
        <p style={estilos.subtitulo}>
          La 1879 declara las retenciones de honorarios por fecha de pago; la 1887, las
          rentas y el impuesto único de los sueldos. El año que se elige es el comercial:
          el año tributario es el siguiente.
        </p>
      </div>

      {mensaje && <div style={estilos.aviso}>{mensaje}</div>}

      <div style={estilos.barraFiltros}>
        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="dj-tipo">
            Declaración
          </label>
          <select
            id="dj-tipo"
            style={estilos.input}
            value={tipo}
            onChange={(evento) => setTipo(evento.target.value)}
          >
            <option value="1879">1879 · Honorarios</option>
            <option value="1887">1887 · Sueldos</option>
          </select>
        </div>

        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="dj-anio">
            Año comercial
          </label>
          <input
            id="dj-anio"
            style={{ ...estilos.input, width: 110 }}
            type="number"
            value={anio}
            onChange={(evento) => setAnio(evento.target.value)}
          />
        </div>

        <button type="button" className="sc-btn sc-btn--primary" onClick={cargar}>
          Ver declaración
        </button>

        {datos && datos.detalle.length > 0 && (
          <>
            <button type="button" className="sc-btn sc-btn--outline" onClick={descargar}>
              Archivo de carga (CSV)
            </button>
            <button type="button" className="sc-btn sc-btn--outline" onClick={exportarPlanilla}>
              Exportar Excel
            </button>
          </>
        )}
      </div>

      {datos?.avisos?.filter(Boolean).map((aviso) => (
        <div key={aviso} style={estilos.aviso}>
          {aviso}
        </div>
      ))}

      <EstadoPantalla
        cargando={cargando}
        error={error}
        vacio={!datos || datos.detalle.length === 0}
        mensajeCargando="Armando la declaración…"
        tituloVacio={`Sin datos para la ${tipo} del año comercial ${anio}`}
        mensajeVacio={
          es1879
            ? "No hay honorarios pagados en ese año. La 1879 va por fecha de pago."
            : "No hay liquidaciones emitidas en ese año."
        }
        alReintentar={cargar}
      >
        {datos && (
          <>
            <div style={estilos.resumenGrilla}>
              {es1879 ? (
                <>
                  <Indicador titulo="Prestadores" valor={numero(datos.totales.prestadores)} />
                  <Indicador titulo="Boletas" valor={numero(datos.totales.documentos)} />
                  <Indicador titulo="Honorarios brutos" valor={pesos(datos.totales.honorarios_brutos)} />
                  <Indicador titulo="Retención declarada" valor={pesos(datos.totales.retencion)} />
                </>
              ) : (
                <>
                  <Indicador titulo="Trabajadores" valor={numero(datos.totales.trabajadores)} />
                  <Indicador titulo="Renta imponible" valor={pesos(datos.totales.renta_imponible)} />
                  <Indicador titulo="Impuesto único" valor={pesos(datos.totales.impuesto_unico)} />
                  <Indicador titulo="Rentas no gravadas" valor={pesos(datos.totales.rentas_no_gravadas)} />
                </>
              )}
            </div>

            <div style={{ ...estilos.tarjeta, overflowX: "auto" }}>
              <h3 style={estilos.titulo}>
                {datos.declaracion} · {datos.nombre} · AT {datos.anio_tributario}
              </h3>

              <table style={{ ...estilos.tabla, marginTop: 12 }}>
                <thead>
                  {es1879 ? (
                    <tr>
                      <th style={estilos.th}>RUT</th>
                      <th style={estilos.th}>Prestador</th>
                      <th style={estilos.th}>Boletas</th>
                      <th style={estilos.th}>Brutos</th>
                      <th style={estilos.th}>Retención</th>
                      <th style={estilos.th}>Sin fecha de pago</th>
                      <th style={estilos.th}>Certificado</th>
                    </tr>
                  ) : (
                    <tr>
                      <th style={estilos.th}>RUT</th>
                      <th style={estilos.th}>Trabajador</th>
                      <th style={estilos.th}>Meses</th>
                      <th style={estilos.th}>Renta imponible</th>
                      <th style={estilos.th}>Renta tributable</th>
                      <th style={estilos.th}>Impuesto único</th>
                      <th style={estilos.th}>No gravadas</th>
                      <th style={estilos.th}>Certificado</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {datos.detalle.map((fila) => (
                    <tr key={fila.rut}>
                      <td style={estilos.td}>{fila.rut}</td>
                      <td style={estilos.td}>{fila.nombre}</td>
                      {es1879 ? (
                        <>
                          <td style={estilos.tdNumero}>{fila.documentos}</td>
                          <td style={estilos.tdNumero}>{pesos(fila.honorarios_brutos)}</td>
                          <td style={estilos.tdNumero}>{pesos(fila.retencion)}</td>
                          <td style={estilos.tdNumero}>{fila.sin_fecha_pago || "—"}</td>
                        </>
                      ) : (
                        <>
                          <td style={estilos.tdNumero}>{fila.meses}</td>
                          <td style={estilos.tdNumero}>{pesos(fila.renta_imponible)}</td>
                          <td style={estilos.tdNumero}>{pesos(fila.renta_tributable)}</td>
                          <td style={estilos.tdNumero}>{pesos(fila.impuesto_unico)}</td>
                          <td style={estilos.tdNumero}>{pesos(fila.rentas_no_gravadas)}</td>
                        </>
                      )}
                      <td style={estilos.td}>
                        <button
                          type="button"
                          className="sc-btn sc-btn--outline"
                          onClick={() => emitirCertificado(fila)}
                          disabled={emitiendo === fila.rut}
                        >
                          {emitiendo === fila.rut ? "Emitiendo…" : "Certificado PDF"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </EstadoPantalla>
    </div>
  );
}

function Indicador({ titulo, valor }) {
  return (
    <div style={estilos.indicador}>
      <span style={estilos.indicadorTexto}>{titulo}</span>
      <strong style={estilos.indicadorValor}>{valor}</strong>
    </div>
  );
}
