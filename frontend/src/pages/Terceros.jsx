/**
 * Proveedores y clientes (módulo 12 de la revisión del 19-09-2026).
 *
 * Hasta ahora el proveedor solo existía como texto repetido en cada factura.
 * Acá se le guarda la condición de pago —de la que sale el vencimiento de los
 * documentos nuevos—, la cuenta en que se imputa habitualmente, el giro y con
 * quién hablar.
 *
 * El RUT no se edita: los documentos ya emitidos lo llevan escrito. Si estaba
 * mal, se crea el correcto y se inactiva el otro.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import EstadoPantalla from "../components/EstadoPantalla";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { listarCuentas } from "../services/cuentaService";
import {
  listarTerceros,
  obtenerTercero,
  crearTercero,
  actualizarTercero,
  cambiarEstadoTercero,
} from "../services/terceroService";
import { estilos, pesos, fechaCorta } from "../utils/estilosAsistentes";

const FORMULARIO_VACIO = {
  rut: "",
  razon_social: "",
  nombre_fantasia: "",
  giro: "",
  direccion: "",
  comuna: "",
  ciudad: "",
  email: "",
  telefono: "",
  contacto: "",
  es_proveedor: true,
  es_cliente: false,
  condicion_pago_dias: "",
  cuenta_gasto_id: "",
  cuenta_ingreso_id: "",
  observacion: "",
};

export default function Terceros() {
  const empresa = obtenerEmpresaActiva();

  const [tipo, setTipo] = useState("");
  const [buscar, setBuscar] = useState("");
  const [terceros, setTerceros] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ficha, setFicha] = useState(null);

  // Si se escribe rápido en el buscador, la respuesta lenta de una consulta
  // anterior no debe pisar a la última.
  const ultimaConsulta = useRef(0);

  const cargar = useCallback(
    async (filtroTipo, texto) => {
      if (!empresa?.id) {
        setError("Selecciona una empresa para ver proveedores y clientes.");
        setCargando(false);
        return;
      }

      const marca = ultimaConsulta.current + 1;
      ultimaConsulta.current = marca;

      setCargando(true);
      setError("");

      try {
        const datos = await listarTerceros({
          empresaId: empresa.id,
          tipo: filtroTipo,
          buscar: texto,
        });

        if (marca !== ultimaConsulta.current) return;

        setTerceros(datos.terceros || []);
      } catch (problema) {
        if (marca !== ultimaConsulta.current) return;

        setError(problema.message);
        setTerceros([]);
      } finally {
        if (marca === ultimaConsulta.current) setCargando(false);
      }
    },
    [empresa?.id]
  );

  useEffect(() => {
    const temporizador = setTimeout(() => cargar(tipo, buscar), buscar ? 300 : 0);

    return () => clearTimeout(temporizador);
  }, [cargar, tipo, buscar]);

  useEffect(() => {
    if (!empresa?.id) return;

    listarCuentas(empresa.id)
      .then((datos) => setCuentas(datos.cuentas || []))
      .catch(() => setCuentas([]));
  }, [empresa?.id]);

  function cambiar(evento) {
    const { name, value, type, checked } = evento.target;

    setFormulario((previo) => ({
      ...previo,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function abrirNuevo() {
    setEditandoId(null);
    setFormulario(FORMULARIO_VACIO);
    setMostrarFormulario(true);
    setMensaje("");
  }

  function abrirEdicion(tercero) {
    setEditandoId(tercero.id);
    setFormulario({
      rut: tercero.rut || "",
      razon_social: tercero.razon_social || "",
      nombre_fantasia: tercero.nombre_fantasia || "",
      giro: tercero.giro || "",
      direccion: tercero.direccion || "",
      comuna: tercero.comuna || "",
      ciudad: tercero.ciudad || "",
      email: tercero.email || "",
      telefono: tercero.telefono || "",
      contacto: tercero.contacto || "",
      es_proveedor: Boolean(tercero.es_proveedor),
      es_cliente: Boolean(tercero.es_cliente),
      condicion_pago_dias:
        tercero.condicion_pago_dias === null || tercero.condicion_pago_dias === undefined
          ? ""
          : String(tercero.condicion_pago_dias),
      cuenta_gasto_id: tercero.cuenta_gasto_id || "",
      cuenta_ingreso_id: tercero.cuenta_ingreso_id || "",
      observacion: tercero.observacion || "",
    });
    setMostrarFormulario(true);
    setMensaje("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function guardar(evento) {
    evento.preventDefault();

    if (guardando) return;

    setGuardando(true);
    setError("");
    setMensaje("");

    try {
      const cuerpo = {
        empresa_id: empresa.id,
        ...formulario,
        cuenta_gasto_id: formulario.cuenta_gasto_id || null,
        cuenta_ingreso_id: formulario.cuenta_ingreso_id || null,
      };

      const datos = editandoId
        ? await actualizarTercero(editandoId, cuerpo)
        : await crearTercero(cuerpo);

      setMensaje(datos.mensaje);
      setMostrarFormulario(false);
      setEditandoId(null);
      setFormulario(FORMULARIO_VACIO);
      await cargar(tipo, buscar);
    } catch (problema) {
      setError(problema.message);
    } finally {
      setGuardando(false);
    }
  }

  async function alternarEstado(tercero) {
    const nuevo = tercero.estado === "vigente" ? "inactivo" : "vigente";

    if (
      nuevo === "inactivo" &&
      !window.confirm(
        `¿Inactivar a ${tercero.razon_social}? Sus documentos no se tocan; solo deja de ofrecerse al registrar.`
      )
    ) {
      return;
    }

    try {
      setError("");
      const datos = await cambiarEstadoTercero(tercero.id, empresa.id, nuevo);
      setMensaje(datos.mensaje);
      await cargar(tipo, buscar);
    } catch (problema) {
      setError(problema.message);
    }
  }

  async function verFicha(tercero) {
    try {
      setError("");
      const datos = await obtenerTercero(tercero.id, empresa.id);
      setFicha(datos);
    } catch (problema) {
      setError(problema.message);
    }
  }

  const cuentasGasto = cuentas.filter((cuenta) =>
    ["Gasto", "Costo", "Pérdida", "Perdida", "Activo"].includes(String(cuenta.tipo))
  );
  const cuentasIngreso = cuentas.filter((cuenta) =>
    ["Ingreso", "Ganancia"].includes(String(cuenta.tipo))
  );

  return (
    <div style={estilos.contenedor}>
      <div style={estilos.tarjeta}>
        <h2 style={estilos.titulo}>Proveedores y clientes</h2>
        <p style={estilos.subtitulo}>
          La condición de pago fija el vencimiento de los documentos nuevos, y la cuenta
          habitual se usa al registrar e importar. Un mismo RUT puede ser las dos cosas.
        </p>
      </div>

      {mensaje && <div style={estilos.aviso}>{mensaje}</div>}

      <div style={estilos.barraFiltros}>
        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="terceros-buscar">
            Buscar por nombre o RUT
          </label>
          <input
            id="terceros-buscar"
            style={{ ...estilos.input, minWidth: 240 }}
            value={buscar}
            onChange={(evento) => setBuscar(evento.target.value)}
            placeholder="Ferretería, 76111222..."
          />
        </div>

        <div style={estilos.campo}>
          <label style={estilos.etiqueta} htmlFor="terceros-tipo">
            Tipo
          </label>
          <select
            id="terceros-tipo"
            style={estilos.input}
            value={tipo}
            onChange={(evento) => setTipo(evento.target.value)}
          >
            <option value="">Todos</option>
            <option value="proveedor">Proveedores</option>
            <option value="cliente">Clientes</option>
          </select>
        </div>

        <button type="button" className="sc-btn" onClick={abrirNuevo}>
          + Nuevo
        </button>
      </div>

      {mostrarFormulario && (
        <form style={estilos.tarjeta} onSubmit={guardar}>
          <h3 style={estilos.titulo}>
            {editandoId ? "Editar proveedor o cliente" : "Nuevo proveedor o cliente"}
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
              marginTop: 12,
            }}
          >
            <Campo
              id="tercero-rut"
              label="RUT"
              name="rut"
              value={formulario.rut}
              onChange={cambiar}
              disabled={Boolean(editandoId)}
              ayuda={editandoId ? "El RUT no se cambia: los documentos lo llevan escrito." : ""}
            />
            <Campo
              id="tercero-razon"
              label="Razón social"
              name="razon_social"
              value={formulario.razon_social}
              onChange={cambiar}
            />
            <Campo
              id="tercero-fantasia"
              label="Nombre de fantasía"
              name="nombre_fantasia"
              value={formulario.nombre_fantasia}
              onChange={cambiar}
            />
            <Campo id="tercero-giro" label="Giro" name="giro" value={formulario.giro} onChange={cambiar} />
            <Campo
              id="tercero-direccion"
              label="Dirección"
              name="direccion"
              value={formulario.direccion}
              onChange={cambiar}
            />
            <Campo id="tercero-comuna" label="Comuna" name="comuna" value={formulario.comuna} onChange={cambiar} />
            <Campo id="tercero-ciudad" label="Ciudad" name="ciudad" value={formulario.ciudad} onChange={cambiar} />
            <Campo
              id="tercero-contacto"
              label="Contacto"
              name="contacto"
              value={formulario.contacto}
              onChange={cambiar}
            />
            <Campo
              id="tercero-email"
              label="Correo"
              name="email"
              type="email"
              value={formulario.email}
              onChange={cambiar}
            />
            <Campo
              id="tercero-telefono"
              label="Teléfono"
              name="telefono"
              value={formulario.telefono}
              onChange={cambiar}
            />
            <Campo
              id="tercero-condicion"
              label="Condición de pago (días)"
              name="condicion_pago_dias"
              type="number"
              value={formulario.condicion_pago_dias}
              onChange={cambiar}
              ayuda="En blanco: no se sabe. 0: contado."
            />

            <div style={estilos.campo}>
              <label style={estilos.etiqueta} htmlFor="tercero-cuenta-gasto">
                Cuenta habitual de gasto
              </label>
              <select
                id="tercero-cuenta-gasto"
                style={estilos.input}
                name="cuenta_gasto_id"
                value={formulario.cuenta_gasto_id}
                onChange={cambiar}
              >
                <option value="">Sin cuenta definida</option>
                {cuentasGasto.map((cuenta) => (
                  <option key={cuenta.id} value={cuenta.id}>
                    {cuenta.codigo} - {cuenta.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div style={estilos.campo}>
              <label style={estilos.etiqueta} htmlFor="tercero-cuenta-ingreso">
                Cuenta habitual de ingreso
              </label>
              <select
                id="tercero-cuenta-ingreso"
                style={estilos.input}
                name="cuenta_ingreso_id"
                value={formulario.cuenta_ingreso_id}
                onChange={cambiar}
              >
                <option value="">Sin cuenta definida</option>
                {cuentasIngreso.map((cuenta) => (
                  <option key={cuenta.id} value={cuenta.id}>
                    {cuenta.codigo} - {cuenta.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input
                type="checkbox"
                name="es_proveedor"
                checked={formulario.es_proveedor}
                onChange={cambiar}
              />
              Es proveedor
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" name="es_cliente" checked={formulario.es_cliente} onChange={cambiar} />
              Es cliente
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button type="submit" className="sc-btn" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              className="sc-btn sc-btn--outline"
              onClick={() => {
                setMostrarFormulario(false);
                setEditandoId(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <EstadoPantalla
        cargando={cargando}
        error={error}
        vacio={terceros.length === 0}
        mensajeCargando="Buscando proveedores y clientes…"
        tituloVacio="Todavía no hay proveedores ni clientes"
        mensajeVacio="Se dan de alta solos al registrar o importar documentos, y también puedes crearlos aquí."
        alReintentar={() => cargar(tipo, buscar)}
      >
        <div style={{ ...estilos.tarjeta, overflowX: "auto" }}>
          <table style={estilos.tabla}>
            <thead>
              <tr>
                <th style={estilos.th}>RUT</th>
                <th style={estilos.th}>Razón social</th>
                <th style={estilos.th}>Tipo</th>
                <th style={estilos.th}>Condición de pago</th>
                <th style={estilos.th}>Cuenta habitual</th>
                <th style={estilos.th}>Estado</th>
                <th style={estilos.th}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {terceros.map((tercero) => (
                <tr key={tercero.id}>
                  <td style={estilos.td}>{tercero.rut}</td>
                  <td style={estilos.td}>
                    {tercero.razon_social}
                    {tercero.nombre_fantasia ? (
                      <div style={{ fontSize: 11.5, color: "var(--sc-muted)" }}>
                        {tercero.nombre_fantasia}
                      </div>
                    ) : null}
                  </td>
                  <td style={estilos.td}>
                    {[tercero.es_proveedor ? "Proveedor" : "", tercero.es_cliente ? "Cliente" : ""]
                      .filter(Boolean)
                      .join(" y ")}
                  </td>
                  <td style={estilos.td}>
                    {tercero.condicion_pago_dias === null || tercero.condicion_pago_dias === undefined
                      ? "No definida"
                      : Number(tercero.condicion_pago_dias) === 0
                      ? "Contado"
                      : `${tercero.condicion_pago_dias} días`}
                  </td>
                  <td style={estilos.td}>
                    {tercero.cuenta_gasto_codigo
                      ? `${tercero.cuenta_gasto_codigo} ${tercero.cuenta_gasto_nombre}`
                      : tercero.cuenta_ingreso_codigo
                      ? `${tercero.cuenta_ingreso_codigo} ${tercero.cuenta_ingreso_nombre}`
                      : "—"}
                  </td>
                  <td style={estilos.td}>{tercero.estado === "vigente" ? "Vigente" : "Inactivo"}</td>
                  <td style={estilos.td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button type="button" className="sc-btn sc-btn--outline" onClick={() => verFicha(tercero)}>
                        Ver
                      </button>
                      <button type="button" className="sc-btn sc-btn--outline" onClick={() => abrirEdicion(tercero)}>
                        Editar
                      </button>
                      <button type="button" className="sc-btn sc-btn--outline" onClick={() => alternarEstado(tercero)}>
                        {tercero.estado === "vigente" ? "Inactivar" : "Reactivar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EstadoPantalla>

      {ficha && (
        <div style={estilos.tarjeta}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={estilos.titulo}>
                {ficha.tercero.razon_social} · {ficha.tercero.rut}
              </h3>
              <p style={estilos.subtitulo}>
                {[ficha.tercero.giro, ficha.tercero.comuna, ficha.tercero.email, ficha.tercero.telefono]
                  .filter(Boolean)
                  .join(" · ") || "Sin datos de contacto"}
              </p>
            </div>
            <button type="button" className="sc-btn sc-btn--outline" onClick={() => setFicha(null)}>
              Cerrar
            </button>
          </div>

          <div style={{ ...estilos.resumenGrilla, marginTop: 12 }}>
            <Indicador
              titulo="Compras"
              valor={pesos(ficha.resumen.compras.total)}
              texto={`${ficha.resumen.compras.documentos} documento(s) · última ${
                fechaCorta(ficha.resumen.compras.ultima) || "—"
              }`}
            />
            <Indicador
              titulo="Ventas"
              valor={pesos(ficha.resumen.ventas.total)}
              texto={`${ficha.resumen.ventas.documentos} documento(s) · última ${
                fechaCorta(ficha.resumen.ventas.ultima) || "—"
              }`}
            />
            <Indicador
              titulo="Honorarios"
              valor={pesos(ficha.resumen.honorarios.total)}
              texto={`${ficha.resumen.honorarios.documentos} boleta(s)`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ id, label, name, value, onChange, type = "text", disabled = false, ayuda = "" }) {
  return (
    <div style={estilos.campo}>
      <label style={estilos.etiqueta} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        style={estilos.input}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      {ayuda ? <span style={{ fontSize: 11, color: "var(--sc-muted)" }}>{ayuda}</span> : null}
    </div>
  );
}

function Indicador({ titulo, valor, texto }) {
  return (
    <div style={estilos.indicador}>
      <span style={estilos.indicadorTexto}>{titulo}</span>
      <strong style={estilos.indicadorValor}>{valor}</strong>
      <span style={estilos.indicadorTexto}>{texto}</span>
    </div>
  );
}
