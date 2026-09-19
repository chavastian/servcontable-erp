/**
 * Centros de costo (módulo 14 de la revisión del 19-09-2026).
 *
 * Antes era texto libre en las líneas de asiento y en la ficha del trabajador:
 * "Local 1" y "local 1" eran dos centros distintos y no había forma de sacar un
 * resultado por local, que es para lo que se usan.
 *
 * El informe no reparte lo que quedó sin centro: repartir un gasto común entre
 * locales es una decisión del contador, no del sistema. Se muestra aparte.
 */

import { useCallback, useEffect, useState } from "react";
import EstadoPantalla from "../components/EstadoPantalla";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { obtenerEjercicioActivo } from "../services/ejerciciosService";
import {
  listarCentrosCosto,
  crearCentroCosto,
  actualizarCentroCosto,
  cambiarEstadoCentroCosto,
  obtenerInformeCentrosCosto,
} from "../services/centrosCostoService";
import { estilos, pesos } from "../utils/estilosAsistentes";
import { exportarExcel } from "../utils/exportUtils";

function rangoDelEjercicio() {
  const ejercicio = obtenerEjercicioActivo();
  const anio = Number(ejercicio?.anio) || new Date().getFullYear();

  return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
}

export default function CentrosCosto() {
  const empresa = obtenerEmpresaActiva();
  const rango = rangoDelEjercicio();

  const [centros, setCentros] = useState([]);
  const [informe, setInforme] = useState(null);
  const [fechaDesde, setFechaDesde] = useState(rango.desde);
  const [fechaHasta, setFechaHasta] = useState(rango.hasta);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const [formulario, setFormulario] = useState({ codigo: "", nombre: "", descripcion: "" });
  const [editandoId, setEditandoId] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!empresa?.id) {
      setError("Selecciona una empresa para ver los centros de costo.");
      setCargando(false);
      return;
    }

    setCargando(true);
    setError("");

    try {
      const datos = await listarCentrosCosto(empresa.id);
      setCentros(datos.centros || []);
    } catch (problema) {
      setError(problema.message);
      setCentros([]);
    } finally {
      setCargando(false);
    }
  }, [empresa?.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function verInforme() {
    try {
      setError("");
      setMensaje("");
      const datos = await obtenerInformeCentrosCosto({
        empresaId: empresa.id,
        fechaDesde,
        fechaHasta,
      });
      setInforme(datos);
    } catch (problema) {
      setError(problema.message);
    }
  }

  function cambiar(evento) {
    const { name, value } = evento.target;
    setFormulario((previo) => ({ ...previo, [name]: value }));
  }

  async function guardar(evento) {
    evento.preventDefault();

    if (guardando) return;

    setGuardando(true);
    setError("");
    setMensaje("");

    try {
      const cuerpo = { empresa_id: empresa.id, ...formulario };
      const datos = editandoId
        ? await actualizarCentroCosto(editandoId, cuerpo)
        : await crearCentroCosto(cuerpo);

      setMensaje(datos.mensaje);
      setFormulario({ codigo: "", nombre: "", descripcion: "" });
      setEditandoId(null);
      await cargar();
    } catch (problema) {
      setError(problema.message);
    } finally {
      setGuardando(false);
    }
  }

  async function alternarEstado(centro) {
    const nuevo = centro.estado === "vigente" ? "inactivo" : "vigente";

    try {
      setError("");
      const datos = await cambiarEstadoCentroCosto(centro.id, empresa.id, nuevo);
      setMensaje(datos.mensaje);
      await cargar();
    } catch (problema) {
      setError(problema.message);
    }
  }

  function exportarInforme() {
    if (!informe) return;

    exportarExcel(
      `Resultado_por_centro_${fechaDesde}_${fechaHasta}`,
      informe.centros.map((centro) => ({
        Código: centro.codigo,
        Centro: centro.nombre,
        Ingresos: centro.ingresos,
        Costos: centro.costos,
        Gastos: centro.gastos,
        Resultado: centro.resultado,
      }))
    );
  }

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.tarjeta}>
        <h2 style={estilos.titulo}>Centros de costo</h2>
        <p style={estilos.subtitulo}>
          Para separar el resultado por local, obra o proyecto. Se asignan en las líneas
          del asiento y en la ficha del trabajador.
        </p>
      </div>

      {mensaje && <div style={estilos.aviso}>{mensaje}</div>}

      <form style={estilos.tarjeta} onSubmit={guardar}>
        <h3 style={estilos.titulo}>{editandoId ? "Editar centro" : "Nuevo centro"}</h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            marginTop: 12,
          }}
        >
          <div style={estilos.campo}>
            <label style={estilos.etiqueta} htmlFor="centro-codigo">
              Código
            </label>
            <input
              id="centro-codigo"
              style={estilos.input}
              name="codigo"
              value={formulario.codigo}
              onChange={cambiar}
              placeholder="LOCAL1"
            />
          </div>

          <div style={estilos.campo}>
            <label style={estilos.etiqueta} htmlFor="centro-nombre">
              Nombre
            </label>
            <input
              id="centro-nombre"
              style={estilos.input}
              name="nombre"
              value={formulario.nombre}
              onChange={cambiar}
              placeholder="Local Centro"
            />
          </div>

          <div style={estilos.campo}>
            <label style={estilos.etiqueta} htmlFor="centro-descripcion">
              Descripción
            </label>
            <input
              id="centro-descripcion"
              style={estilos.input}
              name="descripcion"
              value={formulario.descripcion}
              onChange={cambiar}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button type="submit" className="sc-btn sc-btn--primary" disabled={guardando}>
            {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Crear centro"}
          </button>
          {editandoId && (
            <button
              type="button"
              className="sc-btn sc-btn--outline"
              onClick={() => {
                setEditandoId(null);
                setFormulario({ codigo: "", nombre: "", descripcion: "" });
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <EstadoPantalla
        cargando={cargando}
        error={error}
        vacio={centros.length === 0}
        mensajeCargando="Cargando centros de costo…"
        tituloVacio="Todavía no hay centros de costo"
        mensajeVacio="Crea uno por local, obra o proyecto y asígnalo en las líneas del asiento."
        alReintentar={cargar}
      >
        <div style={{ ...estilos.tarjeta, overflowX: "auto" }}>
          <table style={estilos.tabla}>
            <thead>
              <tr>
                <th style={estilos.th}>Código</th>
                <th style={estilos.th}>Nombre</th>
                <th style={estilos.th}>Descripción</th>
                <th style={estilos.th}>Movimientos</th>
                <th style={estilos.th}>Trabajadores</th>
                <th style={estilos.th}>Estado</th>
                <th style={estilos.th}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {centros.map((centro) => (
                <tr key={centro.id}>
                  <td style={estilos.td}>{centro.codigo}</td>
                  <td style={estilos.td}>{centro.nombre}</td>
                  <td style={estilos.td}>{centro.descripcion || "—"}</td>
                  <td style={estilos.tdNumero}>{centro.movimientos}</td>
                  <td style={estilos.tdNumero}>{centro.trabajadores}</td>
                  <td style={estilos.td}>{centro.estado === "vigente" ? "Vigente" : "Inactivo"}</td>
                  <td style={estilos.td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="sc-btn sc-btn--outline"
                        onClick={() => {
                          setEditandoId(centro.id);
                          setFormulario({
                            codigo: centro.codigo || "",
                            nombre: centro.nombre || "",
                            descripcion: centro.descripcion || "",
                          });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="sc-btn sc-btn--outline"
                        onClick={() => alternarEstado(centro)}
                      >
                        {centro.estado === "vigente" ? "Inactivar" : "Reactivar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EstadoPantalla>

      <div style={estilos.barraFiltros}>
        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="centro-desde">
            Desde
          </label>
          <input
            id="centro-desde"
            style={estilos.input}
            type="date"
            value={fechaDesde}
            onChange={(evento) => setFechaDesde(evento.target.value)}
          />
        </div>

        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="centro-hasta">
            Hasta
          </label>
          <input
            id="centro-hasta"
            style={estilos.input}
            type="date"
            value={fechaHasta}
            onChange={(evento) => setFechaHasta(evento.target.value)}
          />
        </div>

        <button type="button" className="sc-btn sc-btn--primary" onClick={verInforme}>
          Resultado por centro
        </button>

        {informe && (
          <button type="button" className="sc-btn sc-btn--outline" onClick={exportarInforme}>
            Exportar Excel
          </button>
        )}
      </div>

      {informe && (
        <div style={{ ...estilos.tarjeta, overflowX: "auto" }}>
          <h3 style={estilos.titulo}>
            Resultado por centro · {fechaDesde} a {fechaHasta}
          </h3>

          {informe.hay_sin_centro && (
            <div style={estilos.aviso}>
              Hay movimientos de resultado sin centro asignado. Se muestran en su propia
              fila: repartirlos entre centros es una decisión contable.
            </div>
          )}

          <table style={{ ...estilos.tabla, marginTop: 12 }}>
            <thead>
              <tr>
                <th style={estilos.th}>Centro</th>
                <th style={estilos.th}>Ingresos</th>
                <th style={estilos.th}>Costos</th>
                <th style={estilos.th}>Gastos</th>
                <th style={estilos.th}>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {informe.centros.map((centro) => (
                <tr key={centro.centro_id ?? "sin-centro"}>
                  <td style={estilos.td}>
                    {centro.codigo ? `${centro.codigo} · ` : ""}
                    {centro.nombre}
                  </td>
                  <td style={estilos.tdNumero}>{pesos(centro.ingresos)}</td>
                  <td style={estilos.tdNumero}>{pesos(centro.costos)}</td>
                  <td style={estilos.tdNumero}>{pesos(centro.gastos)}</td>
                  <td
                    style={{
                      ...estilos.tdNumero,
                      fontWeight: "bold",
                      color: centro.resultado < 0 ? "var(--sc-danger)" : "var(--sc-teal)",
                    }}
                  >
                    {pesos(centro.resultado)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th style={estilos.th}>Total</th>
                <th style={{ ...estilos.th, textAlign: "right" }}>{pesos(informe.totales.ingresos)}</th>
                <th style={{ ...estilos.th, textAlign: "right" }}>{pesos(informe.totales.costos)}</th>
                <th style={{ ...estilos.th, textAlign: "right" }}>{pesos(informe.totales.gastos)}</th>
                <th style={{ ...estilos.th, textAlign: "right" }}>{pesos(informe.totales.resultado)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
