/**
 * Activo fijo y depreciación (módulo 7 de la revisión del 19-09-2026).
 *
 * Tres cosas en una pantalla, porque es un solo trabajo: el registro de bienes,
 * la depreciación del mes (ver y contabilizar) y el libro a una fecha.
 *
 * La distinción que la pantalla tiene que dejar clara: la depreciación normal
 * es la que se contabiliza, y la acelerada del artículo 31 N°5 existe solo para
 * la renta líquida imponible. Se muestran las dos, en columnas separadas.
 */

import { useCallback, useEffect, useState } from "react";
import EstadoPantalla from "../components/EstadoPantalla";
import PeriodoMesSelector from "../components/PeriodoMesSelector";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerPeriodoTrabajo } from "../services/periodoTrabajoService";
import { listarCuentas } from "../services/cuentaService";
import { listarCentrosCosto } from "../services/centrosCostoService";
import {
  listarActivosFijos,
  obtenerVidasUtiles,
  crearActivoFijo,
  darDeBajaActivoFijo,
  obtenerDepreciacionPeriodo,
  contabilizarDepreciacion,
  obtenerLibroActivoFijo,
} from "../services/activosFijosService";
import { estilos, pesos } from "../utils/estilosAsistentes";
import { exportarExcel } from "../utils/exportUtils";

const FORMULARIO_VACIO = {
  codigo: "",
  nombre: "",
  categoria: "",
  fecha_adquisicion: "",
  fecha_inicio_depreciacion: "",
  valor_adquisicion: "",
  valor_residual: "",
  vida_util_meses: "",
  aplica_acelerada: false,
  cuenta_activo_id: "",
  cuenta_depreciacion_acumulada_id: "",
  cuenta_gasto_depreciacion_id: "",
  centro_costo_id: "",
  observacion: "",
};

export default function ActivoFijo() {
  const empresa = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [pestana, setPestana] = useState("bienes");

  const [activos, setActivos] = useState([]);
  const [totales, setTotales] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [avisos, setAvisos] = useState([]);

  const [vidasUtiles, setVidasUtiles] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [centros, setCentros] = useState([]);

  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [depreciacion, setDepreciacion] = useState(null);
  const [libro, setLibro] = useState(null);

  const cargar = useCallback(async () => {
    if (!empresa?.id) {
      setError("Selecciona una empresa para ver el activo fijo.");
      setCargando(false);
      return;
    }

    setCargando(true);
    setError("");

    try {
      const datos = await listarActivosFijos({ empresaId: empresa.id, periodo });
      setActivos(datos.activos || []);
      setTotales(datos.totales || null);
    } catch (problema) {
      setError(problema.message);
      setActivos([]);
    } finally {
      setCargando(false);
    }
  }, [empresa?.id, periodo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!empresa?.id) return;

    obtenerVidasUtiles()
      .then((datos) => setVidasUtiles(datos.vidas_utiles || []))
      .catch(() => setVidasUtiles([]));
    listarCuentas(empresa.id)
      .then((datos) => setCuentas(datos.cuentas || []))
      .catch(() => setCuentas([]));
    listarCentrosCosto(empresa.id, "vigente")
      .then((datos) => setCentros(datos.centros || []))
      .catch(() => setCentros([]));
  }, [empresa?.id]);

  function cambiar(evento) {
    const { name, value, type, checked } = evento.target;

    setFormulario((previo) => {
      const siguiente = { ...previo, [name]: type === "checkbox" ? checked : value };

      // Elegir la categoría sugerida rellena la vida útil, que igual se puede
      // corregir: la decide el contador.
      if (name === "categoria") {
        const sugerida = vidasUtiles.find((fila) => fila.categoria === value);

        if (sugerida) siguiente.vida_util_meses = String(sugerida.meses);
      }

      // La depreciación no puede empezar antes de la compra.
      if (name === "fecha_adquisicion" && !previo.fecha_inicio_depreciacion) {
        siguiente.fecha_inicio_depreciacion = value;
      }

      return siguiente;
    });
  }

  async function guardar(evento) {
    evento.preventDefault();

    if (guardando) return;

    setGuardando(true);
    setError("");
    setMensaje("");
    setAvisos([]);

    try {
      const datos = await crearActivoFijo({
        empresa_id: empresa.id,
        ...formulario,
        valor_adquisicion: Number(formulario.valor_adquisicion || 0),
        valor_residual: Number(formulario.valor_residual || 0),
        vida_util_meses: Number(formulario.vida_util_meses || 0),
        cuenta_activo_id: formulario.cuenta_activo_id || null,
        cuenta_depreciacion_acumulada_id: formulario.cuenta_depreciacion_acumulada_id || null,
        cuenta_gasto_depreciacion_id: formulario.cuenta_gasto_depreciacion_id || null,
        centro_costo_id: formulario.centro_costo_id || null,
        fecha_inicio_depreciacion:
          formulario.fecha_inicio_depreciacion || formulario.fecha_adquisicion,
      });

      setMensaje(datos.mensaje);
      setAvisos(datos.avisos || []);
      setFormulario(FORMULARIO_VACIO);
      setMostrarFormulario(false);
      await cargar();
    } catch (problema) {
      setError(problema.message);
    } finally {
      setGuardando(false);
    }
  }

  async function darDeBaja(activo) {
    const motivo = window.prompt(
      `Motivo de la baja de ${activo.codigo} ${activo.nombre} (queda registrado):`
    );

    if (motivo === null) return;

    const fecha = window.prompt("Fecha de la baja (AAAA-MM-DD):", `${periodo}-01`);

    if (!fecha) return;

    try {
      setError("");
      const datos = await darDeBajaActivoFijo(activo.id, {
        empresa_id: empresa.id,
        fecha_baja: fecha,
        motivo,
      });

      setMensaje(
        `${datos.mensaje}. Valor libro a la baja: ${pesos(datos.valor_libro_a_la_baja)}.`
      );
      setAvisos([datos.aviso]);
      await cargar();
    } catch (problema) {
      setError(problema.message);
    }
  }

  async function verDepreciacion() {
    try {
      setError("");
      setMensaje("");
      const datos = await obtenerDepreciacionPeriodo(empresa.id, periodo);
      setDepreciacion(datos);
      setPestana("depreciacion");
    } catch (problema) {
      setError(problema.message);
    }
  }

  async function contabilizar() {
    if (
      !window.confirm(
        `¿Contabilizar la depreciación de ${periodo}? Se genera un comprobante con la depreciación normal; la acelerada queda registrada aparte.`
      )
    ) {
      return;
    }

    try {
      setError("");
      const datos = await contabilizarDepreciacion(empresa.id, periodo);
      setMensaje(
        `${datos.mensaje}. Comprobante N° ${datos.comprobante.numero} por ${pesos(datos.total)}.`
      );
      setAvisos([datos.aviso]);
      await verDepreciacion();
      await cargar();
    } catch (problema) {
      setError(problema.message);
    }
  }

  async function verLibro() {
    try {
      setError("");
      const datos = await obtenerLibroActivoFijo(empresa.id, periodo);
      setLibro(datos);
      setPestana("libro");
    } catch (problema) {
      setError(problema.message);
    }
  }

  function exportarLibro() {
    if (!libro) return;

    const filas = libro.categorias.flatMap((grupo) =>
      grupo.bienes.map((bien) => ({
        Categoría: grupo.categoria,
        Código: bien.codigo,
        Bien: bien.nombre,
        Estado: bien.estado,
        Adquisición: bien.fecha_adquisicion?.substring(0, 10) || "",
        "Vida útil (meses)": bien.vida_util_meses,
        Valor: bien.valor_adquisicion,
        "Depreciación del mes": bien.depreciacion_mes,
        "Depreciación acumulada": bien.acumulada,
        "Valor libro": bien.valor_libro,
        "Acumulada acelerada (tributaria)": bien.acumulada_acelerada,
        "Valor libro acelerado (tributario)": bien.valor_libro_acelerado,
      }))
    );

    exportarExcel(`Libro_activo_fijo_${periodo}`, filas);
  }

  const cuentasActivo = cuentas.filter((cuenta) => String(cuenta.tipo) === "Activo");
  const cuentasGasto = cuentas.filter((cuenta) =>
    ["Gasto", "Costo", "Pérdida", "Perdida"].includes(String(cuenta.tipo))
  );

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.tarjeta}>
        <h2 style={estilos.titulo}>Activo fijo y depreciación</h2>
        <p style={estilos.subtitulo}>
          La depreciación normal es la que se contabiliza. La acelerada del artículo 31
          N°5 se calcula aparte, solo para la renta líquida imponible. La vida útil de cada
          bien la fija el contador.
        </p>
      </div>

      {mensaje && <div style={estilos.aviso}>{mensaje}</div>}
      {avisos.filter(Boolean).map((aviso) => (
        <div key={aviso} style={estilos.aviso}>
          {aviso}
        </div>
      ))}

      <div style={estilos.barraFiltros}>
        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="activo-periodo">
            Período
          </label>
          <PeriodoMesSelector
            id="activo-periodo"
            style={estilos.input}
            value={periodo}
            onChange={setPeriodo}
          />
        </div>

        <button type="button" className="sc-btn sc-btn--outline" onClick={() => setPestana("bienes")}>
          Bienes
        </button>
        <button type="button" className="sc-btn sc-btn--outline" onClick={verDepreciacion}>
          Depreciación del mes
        </button>
        <button type="button" className="sc-btn sc-btn--outline" onClick={verLibro}>
          Libro a la fecha
        </button>
        <button
          type="button"
          className="sc-btn sc-btn--primary"
          onClick={() => setMostrarFormulario((previo) => !previo)}
        >
          {mostrarFormulario ? "Cancelar" : "+ Nuevo bien"}
        </button>
      </div>

      {mostrarFormulario && (
        <form style={estilos.tarjeta} onSubmit={guardar}>
          <h3 style={estilos.titulo}>Nuevo bien</h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 12,
              marginTop: 12,
            }}
          >
            <Campo id="af-codigo" label="Código" name="codigo" value={formulario.codigo} onChange={cambiar} />
            <Campo id="af-nombre" label="Nombre del bien" name="nombre" value={formulario.nombre} onChange={cambiar} />

            <div style={estilos.campo}>
              <label style={estilos.etiqueta} htmlFor="af-categoria">
                Categoría
              </label>
              <select
                id="af-categoria"
                style={estilos.input}
                name="categoria"
                value={formulario.categoria}
                onChange={cambiar}
              >
                <option value="">Sin categoría</option>
                {vidasUtiles.map((fila) => (
                  <option key={fila.categoria} value={fila.categoria}>
                    {fila.categoria} ({fila.anios} años)
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: "var(--sc-muted)" }}>
                Rellena la vida útil sugerida. REQUIERE VALIDACIÓN TRIBUTARIA.
              </span>
            </div>

            <Campo
              id="af-fecha"
              label="Fecha de adquisición"
              name="fecha_adquisicion"
              type="date"
              value={formulario.fecha_adquisicion}
              onChange={cambiar}
            />
            <Campo
              id="af-inicio"
              label="Inicio de la depreciación"
              name="fecha_inicio_depreciacion"
              type="date"
              value={formulario.fecha_inicio_depreciacion}
              onChange={cambiar}
              ayuda="Si el bien se instaló después de comprarlo."
            />
            <Campo
              id="af-valor"
              label="Valor de adquisición"
              name="valor_adquisicion"
              type="number"
              value={formulario.valor_adquisicion}
              onChange={cambiar}
            />
            <Campo
              id="af-residual"
              label="Valor residual"
              name="valor_residual"
              type="number"
              value={formulario.valor_residual}
              onChange={cambiar}
              ayuda="Suele dejarse en 1 peso."
            />
            <Campo
              id="af-vida"
              label="Vida útil (meses)"
              name="vida_util_meses"
              type="number"
              value={formulario.vida_util_meses}
              onChange={cambiar}
            />

            <SelectorCuenta
              id="af-cuenta-activo"
              label="Cuenta del bien"
              name="cuenta_activo_id"
              value={formulario.cuenta_activo_id}
              onChange={cambiar}
              opciones={cuentasActivo}
            />
            <SelectorCuenta
              id="af-cuenta-acumulada"
              label="Depreciación acumulada"
              name="cuenta_depreciacion_acumulada_id"
              value={formulario.cuenta_depreciacion_acumulada_id}
              onChange={cambiar}
              opciones={cuentasActivo}
            />
            <SelectorCuenta
              id="af-cuenta-gasto"
              label="Gasto por depreciación"
              name="cuenta_gasto_depreciacion_id"
              value={formulario.cuenta_gasto_depreciacion_id}
              onChange={cambiar}
              opciones={cuentasGasto}
            />

            {centros.length > 0 && (
              <div style={estilos.campo}>
                <label style={estilos.etiqueta} htmlFor="af-centro">
                  Centro de costo
                </label>
                <select
                  id="af-centro"
                  style={estilos.input}
                  name="centro_costo_id"
                  value={formulario.centro_costo_id}
                  onChange={cambiar}
                >
                  <option value="">Sin centro</option>
                  {centros.map((centro) => (
                    <option key={centro.id} value={centro.id}>
                      {centro.codigo} - {centro.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <label
            style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 12 }}
          >
            <input
              type="checkbox"
              name="aplica_acelerada"
              checked={formulario.aplica_acelerada}
              onChange={cambiar}
            />
            Aplicar depreciación acelerada (artículo 31 N°5): solo tributaria, no se
            contabiliza
          </label>

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button type="submit" className="sc-btn sc-btn--primary" disabled={guardando}>
              {guardando ? "Guardando…" : "Registrar bien"}
            </button>
          </div>
        </form>
      )}

      {pestana === "bienes" && (
        <EstadoPantalla
          cargando={cargando}
          error={error}
          vacio={activos.length === 0}
          mensajeCargando="Cargando el activo fijo…"
          tituloVacio="Todavía no hay bienes registrados"
          mensajeVacio="Registra el primer bien con su valor y su vida útil, y el sistema calcula la depreciación de cada mes."
          alReintentar={cargar}
        >
          <div style={{ ...estilos.tarjeta, overflowX: "auto" }}>
            <table style={estilos.tabla}>
              <thead>
                <tr>
                  <th style={estilos.th}>Código</th>
                  <th style={estilos.th}>Bien</th>
                  <th style={estilos.th}>Categoría</th>
                  <th style={estilos.th}>Vida útil</th>
                  <th style={estilos.th}>Valor</th>
                  <th style={estilos.th}>Dep. del mes</th>
                  <th style={estilos.th}>Acumulada</th>
                  <th style={estilos.th}>Valor libro</th>
                  <th style={estilos.th}>Estado</th>
                  <th style={estilos.th}></th>
                </tr>
              </thead>
              <tbody>
                {activos.map((activo) => (
                  <tr key={activo.id}>
                    <td style={estilos.td}>{activo.codigo}</td>
                    <td style={estilos.td}>
                      {activo.nombre}
                      {activo.aplica_acelerada ? (
                        <div style={{ fontSize: 11, color: "var(--sc-muted)" }}>
                          Con depreciación acelerada (tributaria)
                        </div>
                      ) : null}
                    </td>
                    <td style={estilos.td}>{activo.categoria || "—"}</td>
                    <td style={estilos.tdNumero}>{activo.vida_util_meses} m</td>
                    <td style={estilos.tdNumero}>{pesos(activo.valor_adquisicion)}</td>
                    <td style={estilos.tdNumero}>{pesos(activo.depreciacion?.depreciacion_mes)}</td>
                    <td style={estilos.tdNumero}>{pesos(activo.depreciacion?.acumulada)}</td>
                    <td style={estilos.tdNumero}>{pesos(activo.depreciacion?.valor_libro)}</td>
                    <td style={estilos.td}>{activo.estado}</td>
                    <td style={estilos.td}>
                      {activo.estado === "vigente" && (
                        <button
                          type="button"
                          className="sc-btn sc-btn--outline"
                          onClick={() => darDeBaja(activo)}
                        >
                          Dar de baja
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {totales && (
                <tfoot>
                  <tr>
                    <th style={estilos.th} colSpan={4}>
                      Totales
                    </th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>{pesos(totales.valor_adquisicion)}</th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>{pesos(totales.depreciacion_mes)}</th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>{pesos(totales.acumulada)}</th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>{pesos(totales.valor_libro)}</th>
                    <th style={estilos.th} colSpan={2}></th>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </EstadoPantalla>
      )}

      {pestana === "depreciacion" && depreciacion && (
        <div style={{ ...estilos.tarjeta, overflowX: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h3 style={estilos.titulo}>Depreciación de {depreciacion.periodo}</h3>
            <button type="button" className="sc-btn sc-btn--primary" onClick={contabilizar}>
              Contabilizar el mes
            </button>
          </div>

          <div style={{ ...estilos.resumenGrilla, marginTop: 12 }}>
            <Indicador titulo="Normal (se contabiliza)" valor={pesos(depreciacion.totales.depreciacion_mes)} />
            <Indicador
              titulo="Acelerada (tributaria)"
              valor={pesos(depreciacion.totales.depreciacion_mes_acelerada)}
            />
            <Indicador
              titulo="Diferencia para la renta líquida"
              valor={pesos(depreciacion.diferencia_acelerada)}
            />
          </div>

          <table style={{ ...estilos.tabla, marginTop: 12 }}>
            <thead>
              <tr>
                <th style={estilos.th}>Código</th>
                <th style={estilos.th}>Bien</th>
                <th style={estilos.th}>Normal</th>
                <th style={estilos.th}>Acelerada</th>
                <th style={estilos.th}>Acumulada</th>
                <th style={estilos.th}>Valor libro</th>
                <th style={estilos.th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {depreciacion.detalle.map((fila) => (
                <tr key={fila.activo_fijo_id}>
                  <td style={estilos.td}>{fila.codigo}</td>
                  <td style={estilos.td}>{fila.nombre}</td>
                  <td style={estilos.tdNumero}>{pesos(fila.depreciacion_mes)}</td>
                  <td style={estilos.tdNumero}>{pesos(fila.depreciacion_mes_acelerada)}</td>
                  <td style={estilos.tdNumero}>{pesos(fila.acumulada)}</td>
                  <td style={estilos.tdNumero}>{pesos(fila.valor_libro)}</td>
                  <td style={estilos.td}>
                    {fila.ya_contabilizada ? "Contabilizada" : fila.ya_registrada ? "Registrada" : "Pendiente"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pestana === "libro" && libro && (
        <div style={{ ...estilos.tarjeta, overflowX: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h3 style={estilos.titulo}>Libro de activo fijo al {libro.periodo}</h3>
            <button type="button" className="sc-btn sc-btn--outline" onClick={exportarLibro}>
              Exportar Excel
            </button>
          </div>

          <div style={estilos.aviso}>{libro.aviso}</div>

          {libro.categorias.map((grupo) => (
            <div key={grupo.categoria} style={{ marginTop: 16 }}>
              <h4 style={{ ...estilos.titulo, fontSize: 13 }}>{grupo.categoria}</h4>
              <table style={estilos.tabla}>
                <thead>
                  <tr>
                    <th style={estilos.th}>Código</th>
                    <th style={estilos.th}>Bien</th>
                    <th style={estilos.th}>Valor</th>
                    <th style={estilos.th}>Acumulada</th>
                    <th style={estilos.th}>Valor libro</th>
                    <th style={estilos.th}>Acum. tributaria</th>
                    <th style={estilos.th}>Libro tributario</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.bienes.map((bien) => (
                    <tr key={bien.id}>
                      <td style={estilos.td}>{bien.codigo}</td>
                      <td style={estilos.td}>{bien.nombre}</td>
                      <td style={estilos.tdNumero}>{pesos(bien.valor_adquisicion)}</td>
                      <td style={estilos.tdNumero}>{pesos(bien.acumulada)}</td>
                      <td style={estilos.tdNumero}>{pesos(bien.valor_libro)}</td>
                      <td style={estilos.tdNumero}>{pesos(bien.acumulada_acelerada)}</td>
                      <td style={estilos.tdNumero}>{pesos(bien.valor_libro_acelerado)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th style={estilos.th} colSpan={2}>
                      Subtotal
                    </th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>{pesos(grupo.valor_adquisicion)}</th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>{pesos(grupo.acumulada)}</th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>{pesos(grupo.valor_libro)}</th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>{pesos(grupo.acumulada_acelerada)}</th>
                    <th style={{ ...estilos.th, textAlign: "right" }}>{pesos(grupo.valor_libro_acelerado)}</th>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}

          <div style={{ ...estilos.resumenGrilla, marginTop: 16 }}>
            <Indicador titulo="Valor de adquisición" valor={pesos(libro.totales.valor_adquisicion)} />
            <Indicador titulo="Depreciación acumulada" valor={pesos(libro.totales.acumulada)} />
            <Indicador titulo="Valor libro" valor={pesos(libro.totales.valor_libro)} />
            <Indicador titulo="Valor libro tributario" valor={pesos(libro.totales.valor_libro_acelerado)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ id, label, name, value, onChange, type = "text", ayuda = "" }) {
  return (
    <div style={estilos.campo}>
      <label style={estilos.etiqueta} htmlFor={id}>
        {label}
      </label>
      <input id={id} style={estilos.input} type={type} name={name} value={value} onChange={onChange} />
      {ayuda ? <span style={{ fontSize: 11, color: "var(--sc-muted)" }}>{ayuda}</span> : null}
    </div>
  );
}

function SelectorCuenta({ id, label, name, value, onChange, opciones }) {
  return (
    <div style={estilos.campo}>
      <label style={estilos.etiqueta} htmlFor={id}>
        {label}
      </label>
      <select id={id} style={estilos.input} name={name} value={value} onChange={onChange}>
        <option value="">Usar la de Configuración Contable</option>
        {opciones.map((cuenta) => (
          <option key={cuenta.id} value={cuenta.id}>
            {cuenta.codigo} - {cuenta.nombre}
          </option>
        ))}
      </select>
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
