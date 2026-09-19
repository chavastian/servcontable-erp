/**
 * Importar boletas de honorarios electrónicas desde el archivo del SII
 * (módulo 11 de la revisión del 19-09-2026).
 *
 * La pantalla tiene dos pasos que no se pueden saltar, y eso es deliberado.
 *
 * El hallazgo C-10 de la revisión fue un importador que adivinaba los nombres
 * de las columnas: cuando el SII cambió el encabezado, el archivo entró con
 * todos los montos en cero y nadie lo notó hasta el F29. Así que acá primero se
 * revisa —sin escribir nada— y se muestra qué columna se leyó como qué. Si algo
 * no calza, se asigna a mano. Solo después aparece el botón de importar.
 *
 * Lo segundo que la pantalla deja claro es qué NO va a hacer: las boletas ya
 * registradas con montos distintos a los del SII no se tocan. Corregir un monto
 * contabilizado es una decisión de quien lleva la contabilidad.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerCamposBhe, revisarBhe, importarBhe } from "../services/bheSiiService";
import { estilos, pesos } from "../utils/estilosAsistentes";

export default function ImportarBhe() {
  const empresa = obtenerEmpresaActiva();

  const [campos, setCampos] = useState([]);
  const [avisoCampos, setAvisoCampos] = useState("");
  const [archivo, setArchivo] = useState(null);
  const [mapeo, setMapeo] = useState({});
  const [revision, setRevision] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [encabezados, setEncabezados] = useState([]);

  useEffect(() => {
    obtenerCamposBhe()
      .then((datos) => {
        setCampos(datos.campos || []);
        setAvisoCampos(datos.aviso || "");
      })
      .catch(() => setCampos([]));
  }, []);

  const faltanObligatorios = revision?.columnas?.faltan_obligatorios || [];

  const elegirArchivo = useCallback((evento) => {
    // Cambiar el archivo invalida la revisión anterior: importar con el
    // resultado de otra revisión es exactamente cómo se cargan datos que nadie
    // vio.
    setArchivo(evento.target.files?.[0] || null);
    setRevision(null);
    setResultado(null);
    setMapeo({});
    setEncabezados([]);
    setError("");
    setMensaje("");
  }, []);

  async function revisar() {
    if (!empresa?.id) {
      setError("Selecciona una empresa antes de importar.");
      return;
    }

    if (!archivo) {
      setError("Elige el archivo CSV que descargaste del SII.");
      return;
    }

    setTrabajando(true);
    setError("");
    setMensaje("");
    setResultado(null);

    try {
      const datos = await revisarBhe({ empresaId: empresa.id, archivo, mapeo });
      setRevision(datos);
      setEncabezados(datos.encabezados_del_archivo || []);
      setMensaje(
        `Archivo leído: ${datos.filas_leidas} boleta(s). Nada se ha guardado todavía.`
      );
    } catch (problema) {
      // El backend devuelve los encabezados del archivo cuando no reconoció las
      // columnas esenciales, justamente para poder asignarlas acá.
      const datos = problema.datos || {};
      setEncabezados(datos.encabezados_del_archivo || []);
      setRevision(datos.columnas ? { columnas: datos.columnas } : null);
      setError(problema.message);
    } finally {
      setTrabajando(false);
    }
  }

  async function importar() {
    if (!revision || faltanObligatorios.length > 0) return;

    setTrabajando(true);
    setError("");

    try {
      const datos = await importarBhe({ empresaId: empresa.id, archivo, mapeo });
      setResultado(datos);
      setRevision(null);
      setMensaje(datos.mensaje);
    } catch (problema) {
      setError(problema.message);
    } finally {
      setTrabajando(false);
    }
  }

  function asignar(campo, encabezado) {
    setMapeo((previo) => {
      const siguiente = { ...previo };

      if (encabezado) siguiente[campo] = encabezado;
      else delete siguiente[campo];

      return siguiente;
    });
    // Cambiar el mapeo obliga a revisar de nuevo: el cruce anterior se hizo con
    // otra lectura del archivo.
    setRevision(null);
    setMensaje("");
  }

  const reconocidos = useMemo(() => {
    const mapa = revision?.columnas?.mapeo || {};

    return campos.map((campo) => ({
      ...campo,
      columna: mapeo[campo.campo] || mapa[campo.campo] || "",
      manual: Boolean(mapeo[campo.campo]),
    }));
  }, [campos, mapeo, revision]);

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.tarjeta}>
        <h2 style={estilos.titulo}>Importar boletas de honorarios del SII</h2>
        <p style={estilos.subtitulo}>
          Se revisa primero y se importa después. La revisión no guarda nada: muestra qué columna
          se leyó como qué y qué boletas entrarían.
        </p>
      </div>

      {avisoCampos && <div style={estilos.aviso}>{avisoCampos}</div>}
      {mensaje && <div style={estilos.aviso}>{mensaje}</div>}
      {error && (
        <div style={{ ...estilos.aviso, borderColor: "#ef4444", color: "#991b1b" }}>{error}</div>
      )}

      <div style={estilos.tarjeta}>
        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="bhe-archivo">
            Archivo CSV descargado del SII
          </label>
          <input
            id="bhe-archivo"
            type="file"
            accept=".csv,text/csv"
            onChange={elegirArchivo}
            style={estilos.input}
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            className="sc-btn sc-btn--secondary"
            onClick={revisar}
            disabled={trabajando || !archivo}
          >
            {trabajando ? "Revisando..." : "1. Revisar el archivo"}
          </button>
          <button
            type="button"
            className="sc-btn sc-btn--primary"
            onClick={importar}
            disabled={
              trabajando ||
              !revision ||
              faltanObligatorios.length > 0 ||
              !(revision.cruce?.nuevas > 0)
            }
          >
            {revision?.cruce
              ? `2. Importar ${revision.cruce.nuevas} boleta(s) nueva(s)`
              : "2. Importar"}
          </button>
        </div>
      </div>

      {encabezados.length > 0 && (
        <div style={estilos.tarjeta}>
          <h3 style={estilos.titulo}>Qué columna es qué</h3>
          <p style={estilos.subtitulo}>
            Lo que dice «sin asignar» y es obligatorio impide la importación. Asígnalo y vuelve a
            revisar.
          </p>
          <div style={estilos.contenedorTabla}>
            <table style={estilos.tabla}>
              <thead>
                <tr>
                  <th style={estilos.th}>Dato</th>
                  <th style={estilos.th}>Columna del archivo</th>
                  <th style={estilos.th}>Obligatorio</th>
                </tr>
              </thead>
              <tbody>
                {reconocidos.map((campo) => (
                  <tr key={campo.campo}>
                    <td style={estilos.td}>
                      {campo.etiqueta}
                      {campo.manual && (
                        <span style={{ ...estilos.indicadorTexto, marginLeft: 6 }}>
                          asignado a mano
                        </span>
                      )}
                    </td>
                    <td style={estilos.td}>
                      <select
                        aria-label={`Columna para ${campo.etiqueta}`}
                        value={campo.columna}
                        onChange={(evento) => asignar(campo.campo, evento.target.value)}
                        style={estilos.input}
                      >
                        <option value="">Sin asignar</option>
                        {encabezados.map((encabezado) => (
                          <option key={encabezado} value={encabezado}>
                            {encabezado}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={estilos.td}>{campo.obligatorio ? "Sí" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {revision?.cruce && (
        <>
          <div style={estilos.resumenGrilla}>
            <Indicador titulo="Nuevas" valor={revision.cruce.nuevas} texto="se van a insertar" />
            <Indicador
              titulo="Ya registradas"
              valor={revision.cruce.coinciden}
              texto="coinciden, no se tocan"
            />
            <Indicador
              titulo="Con diferencias"
              valor={revision.cruce.difieren}
              texto="registradas con otro monto"
            />
            <Indicador
              titulo="Solo en el sistema"
              valor={revision.cruce.solo_en_sistema}
              texto="no vienen en el archivo"
            />
          </div>

          {revision.errores?.length > 0 && (
            <div style={estilos.tarjeta}>
              <h3 style={estilos.titulo}>Filas que no se pudieron leer</h3>
              <ul>
                {revision.errores.map((problema, indice) => (
                  <li key={indice} style={estilos.indicadorTexto}>
                    Fila {problema.fila}: {problema.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {revision.avisos?.length > 0 && (
            <div style={estilos.tarjeta}>
              <h3 style={estilos.titulo}>Avisos</h3>
              <ul>
                {revision.avisos.map((aviso) => (
                  <li key={aviso} style={estilos.indicadorTexto}>
                    {aviso}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <TablaBoletas titulo="Se van a insertar" boletas={revision.detalle?.nuevas} />
          <TablaBoletas
            titulo="Registradas con montos distintos (no se modifican)"
            boletas={revision.detalle?.difieren}
          />
          <TablaBoletas
            titulo="Están en el sistema y no en el archivo"
            boletas={revision.detalle?.solo_en_sistema}
          />
        </>
      )}

      {resultado && (
        <div style={estilos.tarjeta}>
          <h3 style={estilos.titulo}>Resultado de la importación</h3>
          <p style={estilos.subtitulo}>
            Insertadas: {resultado.insertadas}. Anuladas: {resultado.anuladas}. Ya estaban:{" "}
            {resultado.ya_registradas}.
          </p>
          {resultado.aviso_diferencias && (
            <div style={estilos.aviso}>{resultado.aviso_diferencias}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Indicador({ titulo, valor, texto }) {
  return (
    <div style={estilos.indicador}>
      <span style={estilos.indicadorTexto}>{titulo}</span>
      <span style={estilos.indicadorValor}>{valor ?? 0}</span>
      <span style={estilos.indicadorTexto}>{texto}</span>
    </div>
  );
}

function TablaBoletas({ titulo, boletas }) {
  if (!boletas || boletas.length === 0) return null;

  return (
    <div style={estilos.tarjeta}>
      <h3 style={estilos.titulo}>
        {titulo} ({boletas.length})
      </h3>
      <div style={estilos.contenedorTabla}>
        <table style={estilos.tabla}>
          <thead>
            <tr>
              <th style={estilos.th}>RUT</th>
              <th style={estilos.th}>Folio</th>
              <th style={estilos.th}>Emisión</th>
              <th style={estilos.th}>Bruto</th>
              <th style={estilos.th}>Retención</th>
              <th style={estilos.th}>Nota</th>
            </tr>
          </thead>
          <tbody>
            {boletas.map((boleta, indice) => (
              <tr key={`${boleta.rut_prestador}-${boleta.folio}-${indice}`}>
                <td style={estilos.td}>{boleta.rut_prestador}</td>
                <td style={estilos.td}>{boleta.folio}</td>
                <td style={estilos.td}>{boleta.fecha_emision || "—"}</td>
                <td style={estilos.tdNumero}>{pesos(boleta.bruto)}</td>
                <td style={estilos.tdNumero}>{pesos(boleta.retencion)}</td>
                <td style={estilos.td}>{boleta.diferencia || boleta.nota || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
