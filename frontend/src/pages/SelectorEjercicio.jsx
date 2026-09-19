import { useEffect, useState } from "react";
import {
  listarEjercicios,
  crearEjercicio,
  cerrarEjercicio,
  reabrirEjercicio,
  guardarEjercicioActivo,
} from "../services/ejerciciosService";

export default function SelectorEjercicio({
  usuario,
  empresaActiva,
  moduloActivo,
  alSeleccionarEjercicio,
  volverASeleccionEmpresa,
  volverASeleccionModulo,
  alCerrarSesion,
}) {
  const [ejercicios, setEjercicios] = useState([]);
  const [ejercicioId, setEjercicioId] = useState("");
  const [ejercicioSeleccionado, setEjercicioSeleccionado] = useState(null);

  const [nuevoAnio, setNuevoAnio] = useState(new Date().getFullYear());
  const [observacion, setObservacion] = useState("");

  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const puedeCrearEjercicio = true;

  useEffect(() => {
    if (empresaActiva?.id) {
      cargarEjercicios();
    }
  }, [empresaActiva]);

  async function cargarEjercicios() {
    try {
      setError("");
      setMensaje("");

      const data = await listarEjercicios(empresaActiva.id);
      const lista = Array.isArray(data.ejercicios) ? data.ejercicios : [];

      setEjercicios(lista);

      const abierto = lista.find((item) => item.estado === "abierto");

      if (abierto) {
        setEjercicioId(String(abierto.id));
        setEjercicioSeleccionado(abierto);
      } else if (lista.length > 0) {
        setEjercicioId(String(lista[0].id));
        setEjercicioSeleccionado(lista[0]);
      } else {
        setEjercicioId("");
        setEjercicioSeleccionado(null);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function cambiarEjercicio(e) {
    const id = e.target.value;
    setEjercicioId(id);

    const encontrado = ejercicios.find((item) => String(item.id) === String(id));
    setEjercicioSeleccionado(encontrado || null);
  }

  async function guardarNuevoEjercicio() {
    try {
      setError("");
      setMensaje("");

      if (!nuevoAnio) {
        setError("Debe ingresar un año.");
        return;
      }

      const data = await crearEjercicio({
        empresa_id: empresaActiva.id,
        anio: Number(nuevoAnio),
        observacion,
      });

      setMensaje(data.mensaje || "Año creado correctamente.");
      setMostrarCrear(false);
      setObservacion("");

      await cargarEjercicios();
    } catch (err) {
      setError(err.message);
    }
  }

  async function cerrarAnio() {
    try {
      setError("");
      setMensaje("");

      if (!ejercicioSeleccionado) {
        setError("Debes seleccionar un año.");
        return;
      }

      const confirmar = window.confirm(
        `¿Seguro que deseas cerrar el año ${ejercicioSeleccionado.anio}? Luego no debería modificarse información de ese período.`
      );

      if (!confirmar) return;

      const data = await cerrarEjercicio(ejercicioSeleccionado.id, {
        empresa_id: empresaActiva.id,
        observacion,
      });

      setMensaje(data.mensaje || "Año cerrado correctamente.");
      await cargarEjercicios();
    } catch (err) {
      setError(err.message);
    }
  }

  async function reabrirAnio() {
    try {
      setError("");
      setMensaje("");

      if (!ejercicioSeleccionado) {
        setError("Debes seleccionar un año.");
        return;
      }

      const confirmar = window.confirm(
        `¿Seguro que deseas reabrir el año ${ejercicioSeleccionado.anio}?`
      );

      if (!confirmar) return;

      const data = await reabrirEjercicio(ejercicioSeleccionado.id, {
        empresa_id: empresaActiva.id,
      });

      setMensaje(data.mensaje || "Año reabierto correctamente.");
      await cargarEjercicios();
    } catch (err) {
      setError(err.message);
    }
  }

  function continuar() {
    setError("");

    if (!ejercicioSeleccionado) {
      setError("Debes seleccionar un año de trabajo.");
      return;
    }

    guardarEjercicioActivo(ejercicioSeleccionado);
    alSeleccionarEjercicio(ejercicioSeleccionado);
  }

  function nombreModulo() {
    if (moduloActivo === "contable") return "Módulo Contable";
    if (moduloActivo === "remuneraciones") return "Módulo Remuneraciones";
    if (moduloActivo === "simplificada") return "Módulo Contabilidad Simplificada";
    return "Módulo";
  }

  return (
    <div style={contenedor}>
      <div style={barraSuperior}>
        <strong style={{ color: "#0369a1" }}>
          ServContable PRO · {usuario?.nombre || usuario?.email || "Usuario"}
        </strong>

        <div style={accionesTop}>
          <button type="button" style={botonTop} onClick={volverASeleccionEmpresa}>
            Cambiar empresa
          </button>

          <button type="button" style={botonTop} onClick={volverASeleccionModulo}>
            Cambiar módulo
          </button>

          <button type="button" style={botonSalir} onClick={alCerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      </div>

      <div style={contenido}>
        <div style={card}>
          <div style={icono}>📅</div>

          <h1 style={titulo}>Seleccionar año de trabajo</h1>

          <p style={subtitulo}>
            Empresa activa: <strong>{empresaActiva?.razon_social}</strong>
            <br />
            Estás ingresando a <strong>{nombreModulo()}</strong>.
          </p>

          {mensaje && <p style={mensajeOk}>{mensaje}</p>}
          {error && <p style={mensajeError}>{error}</p>}

          <div style={formulario}>
            <div>
              <label style={label}>Año de trabajo</label>

              <select
                style={input}
                value={ejercicioId}
                onChange={cambiarEjercicio}
              >
                {ejercicios.length === 0 && (
                  <option value="">No hay años creados</option>
                )}

                {ejercicios.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.anio} - {item.estado === "cerrado" ? "Cerrado" : "Abierto"}
                  </option>
                ))}
              </select>
            </div>

            {ejercicioSeleccionado && (
              <div
                style={
                  ejercicioSeleccionado.estado === "cerrado"
                    ? resumenCerrado
                    : resumenAbierto
                }
              >
                <strong>Año {ejercicioSeleccionado.anio}</strong>
                <span>Estado: {ejercicioSeleccionado.estado}</span>
                <span>Inicio: {String(ejercicioSeleccionado.fecha_inicio || "").substring(0, 10)}</span>
                <span>Término: {String(ejercicioSeleccionado.fecha_termino || "").substring(0, 10)}</span>
              </div>
            )}

            <button type="button" style={botonPrimario} onClick={continuar}>
              Continuar con año seleccionado
            </button>

            {puedeCrearEjercicio && (
              <button
                type="button"
                style={botonCrear}
                onClick={() => setMostrarCrear(!mostrarCrear)}
              >
                {mostrarCrear ? "Cancelar creación" : "+ Crear nuevo año"}
              </button>
            )}

            {puedeCrearEjercicio && mostrarCrear && (
              <div style={cardCrear}>
                <h3 style={tituloCrear}>Crear año de trabajo</h3>

                <label style={label}>Año</label>
                <input
                  style={input}
                  type="number"
                  value={nuevoAnio}
                  onChange={(e) => setNuevoAnio(e.target.value)}
                  placeholder="2026"
                />

                <label style={label}>Observación</label>
                <input
                  style={input}
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  placeholder="Ej: Año comercial 2026"
                />

                <button
                  type="button"
                  style={botonGuardar}
                  onClick={guardarNuevoEjercicio}
                >
                  Guardar año
                </button>
              </div>
            )}

            {ejercicioSeleccionado?.estado === "abierto" && (
              <button type="button" style={botonCerrarAnio} onClick={cerrarAnio}>
                Cerrar año seleccionado
              </button>
            )}

            {ejercicioSeleccionado?.estado === "cerrado" && (
              <button type="button" style={botonReabrir} onClick={reabrirAnio}>
                Reabrir año seleccionado
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const contenedor = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at 82% 16%, rgba(34, 211, 238, 0.30), transparent 25%), radial-gradient(circle at 12% 82%, rgba(16, 185, 129, 0.20), transparent 30%), linear-gradient(135deg, #07111f 0%, #075985 54%, #22d3ee 100%)",
  fontFamily: "Arial, sans-serif",
};

const barraSuperior = {
  height: "52px",
  background: "rgba(255,255,255,0.92)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 22px",
  boxShadow: "0 12px 30px rgba(7, 17, 31, 0.16)",
  backdropFilter: "blur(14px)",
};

const accionesTop = {
  display: "flex",
  gap: "10px",
  alignItems: "center",
};

const contenido = {
  minHeight: "calc(100vh - 52px)",
  padding: "22px 18px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const card = {
  width: "100%",
  maxWidth: "540px",
  background: "rgba(255,255,255,0.97)",
  borderRadius: "22px",
  padding: "24px",
  boxShadow: "0 26px 70px rgba(7, 17, 31, 0.24)",
  border: "1px solid rgba(255,255,255,0.55)",
};

const icono = {
  fontSize: "34px",
  textAlign: "center",
  marginBottom: "6px",
};

const titulo = {
  color: "#0369a1",
  textAlign: "center",
  fontSize: "28px",
  margin: "0 0 6px 0",
};

const subtitulo = {
  color: "#155e75",
  textAlign: "center",
  lineHeight: "1.35",
  marginBottom: "15px",
  fontSize: "14px",
};

const formulario = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const label = {
  display: "block",
  marginBottom: "4px",
  color: "#1e293b",
  fontWeight: "bold",
  fontSize: "13px",
};

const input = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: "9px",
  border: "1px solid #a9d8ef",
  fontSize: "14px",
  boxSizing: "border-box",
};

const resumenAbierto = {
  background: "#ecfdf5",
  border: "1px solid #86efac",
  borderRadius: "12px",
  padding: "11px 13px",
  color: "#166534",
  display: "flex",
  flexDirection: "column",
  gap: "3px",
  fontSize: "13px",
};

const resumenCerrado = {
  ...resumenAbierto,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
};

const botonPrimario = {
  background: "linear-gradient(135deg, #0369a1, #06b6d4)",
  color: "white",
  border: "none",
  padding: "11px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonCrear = {
  background: "transparent",
  color: "#0369a1",
  border: "1px solid #0369a1",
  padding: "10px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonGuardar = {
  background: "linear-gradient(135deg, #10b981, #06b6d4)",
  color: "white",
  border: "none",
  padding: "10px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  width: "100%",
  marginTop: "8px",
};

const botonCerrarAnio = {
  background: "linear-gradient(135deg, #ef4444, #f97316)",
  color: "white",
  border: "none",
  padding: "10px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonReabrir = {
  background: "linear-gradient(135deg, #f59e0b, #f97316)",
  color: "white",
  border: "none",
  padding: "10px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonTop = {
  background: "linear-gradient(135deg, #0369a1, #06b6d4)",
  color: "white",
  border: "none",
  padding: "8px 12px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonSalir = {
  background: "linear-gradient(135deg, #ef4444, #f97316)",
  color: "white",
  border: "none",
  padding: "8px 12px",
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
};

const cardCrear = {
  background: "#f8fcff",
  border: "1px solid #a9d8ef",
  borderRadius: "12px",
  padding: "12px",
};

const tituloCrear = {
  color: "#0369a1",
  marginTop: 0,
  marginBottom: "10px",
  fontSize: "18px",
};

const mensajeError = {
  color: "#ef4444",
  fontWeight: "bold",
  textAlign: "center",
};

const mensajeOk = {
  color: "#10b981",
  fontWeight: "bold",
  textAlign: "center",
};
