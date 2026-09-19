import { useEffect, useMemo, useRef, useState } from "react";

function normalizar(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function etiquetaCuenta(cuenta) {
  if (!cuenta) return "";
  return `${cuenta.codigo || ""} - ${cuenta.nombre || ""}`.trim();
}

function cuentaTieneHijos(cuenta, cuentas = []) {
  const codigo = String(cuenta?.codigo || "").trim();
  if (!codigo) return false;

  return cuentas.some((item) => {
    const codigoItem = String(item?.codigo || "").trim();
    return (
      item.id !== cuenta.id &&
      item.activo !== false &&
      codigoItem.startsWith(codigo) &&
      codigoItem.length > codigo.length
    );
  });
}

function puntajeCoincidencia(cuenta, busqueda) {
  const codigo = normalizar(cuenta.codigo);
  const nombre = normalizar(cuenta.nombre);

  if (!busqueda) return 5;
  if (codigo === busqueda) return 0;
  if (codigo.startsWith(busqueda)) return 1;
  if (nombre.startsWith(busqueda)) return 2;
  if (nombre.includes(busqueda)) return 3;
  if (codigo.includes(busqueda)) return 4;
  return 5;
}

export default function AccountSelector({
  cuentas = [],
  value = "",
  name = "cuenta_id",
  onChange,
  placeholder = "Buscar por codigo o nombre de cuenta...",
  style,
  disabled = false,
  soloActivas = true,
  soloImputables = true,
  tiposPermitidos = [],
  maxResultados = 30,
}) {
  const [textoBusqueda, setTextoBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(0);
  const blurTimer = useRef(null);

  const cuentaSeleccionada = useMemo(
    () => cuentas.find((cuenta) => String(cuenta.id) === String(value)),
    [cuentas, value]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (cuentaSeleccionada) {
        setTextoBusqueda(etiquetaCuenta(cuentaSeleccionada));
      } else if (!value) {
        setTextoBusqueda("");
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [cuentaSeleccionada, value]);

  const cuentasDisponibles = useMemo(() => {
    const tipos = tiposPermitidos.map(normalizar).filter(Boolean);

    return cuentas.filter((cuenta) => {
      if (soloActivas && cuenta.activo === false) return false;

      if (tipos.length > 0 && !tipos.includes(normalizar(cuenta.tipo))) {
        return false;
      }

      if (soloImputables && cuentaTieneHijos(cuenta, cuentas)) {
        return false;
      }

      return true;
    });
  }, [cuentas, soloActivas, soloImputables, tiposPermitidos]);

  const resultados = useMemo(() => {
    const busqueda = normalizar(textoBusqueda);
    const listaFiltrada = busqueda
      ? cuentasDisponibles.filter((cuenta) => {
          const codigo = normalizar(cuenta.codigo);
          const nombre = normalizar(cuenta.nombre);
          return codigo.includes(busqueda) || nombre.includes(busqueda);
        })
      : cuentasDisponibles;

    return [...listaFiltrada]
      .sort((a, b) => {
        const diferencia = puntajeCoincidencia(a, busqueda) - puntajeCoincidencia(b, busqueda);
        if (diferencia !== 0) return diferencia;
        return String(a.codigo || "").localeCompare(String(b.codigo || ""));
      })
      .slice(0, maxResultados);
  }, [cuentasDisponibles, textoBusqueda, maxResultados]);

  function emitirCambio(nuevoValor) {
    if (!onChange) return;

    onChange({
      target: {
        name,
        value: nuevoValor ? String(nuevoValor) : "",
        type: "select-one",
      },
    });
  }

  function manejarCambio(e) {
    setTextoBusqueda(e.target.value);
    setAbierto(true);
    setIndiceActivo(0);

    if (value) {
      emitirCambio("");
    }
  }

  function seleccionarCuenta(cuenta) {
    setTextoBusqueda(etiquetaCuenta(cuenta));
    emitirCambio(cuenta.id);
    setAbierto(false);
  }

  function manejarBlur() {
    blurTimer.current = window.setTimeout(() => {
      setAbierto(false);
      if (value && cuentaSeleccionada) {
        setTextoBusqueda(etiquetaCuenta(cuentaSeleccionada));
      }
    }, 160);
  }

  function manejarFocus() {
    if (blurTimer.current) {
      window.clearTimeout(blurTimer.current);
    }
    setAbierto(true);
  }

  function manejarTecla(e) {
    if (e.key === "Escape") {
      setAbierto(false);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setIndiceActivo((actual) =>
        resultados.length ? Math.min(actual + 1, resultados.length - 1) : 0
      );
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceActivo((actual) => Math.max(actual - 1, 0));
      return;
    }

    if (e.key === "Enter" && abierto && resultados[indiceActivo]) {
      e.preventDefault();
      seleccionarCuenta(resultados[indiceActivo]);
    }
  }

  return (
    <div style={contenedor}>
      <input
        style={{ ...estiloInput, ...style }}
        value={textoBusqueda}
        onChange={manejarCambio}
        onFocus={manejarFocus}
        onBlur={manejarBlur}
        onKeyDown={manejarTecla}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />

      {abierto && !disabled && (
        <div style={lista}>
          {resultados.map((cuenta, index) => (
            <button
              key={cuenta.id}
              type="button"
              style={index === indiceActivo ? opcionActiva : opcion}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setIndiceActivo(index)}
              onClick={() => seleccionarCuenta(cuenta)}
            >
              <span style={codigo}>{cuenta.codigo}</span>
              <span>{cuenta.nombre}</span>
            </button>
          ))}

          {resultados.length === 0 && (
            <div style={sinResultados}>No hay cuentas coincidentes.</div>
          )}
        </div>
      )}
    </div>
  );
}

const contenedor = {
  position: "relative",
  width: "100%",
};

const estiloInput = {
  width: "100%",
  boxSizing: "border-box",
};

const lista = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  maxHeight: "220px",
  overflowY: "auto",
  background: "white",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "12px",
  boxShadow: "0 16px 32px rgba(15, 23, 42, 0.18)",
  zIndex: 50,
};

const opcion = {
  width: "100%",
  display: "flex",
  gap: "8px",
  alignItems: "center",
  textAlign: "left",
  padding: "9px 11px",
  border: "none",
  borderBottom: "1px solid var(--sc-borde-claro)",
  background: "white",
  cursor: "pointer",
  color: "var(--sc-ink)",
};

const opcionActiva = {
  ...opcion,
  background: "#e0f2fe",
};

const codigo = {
  fontWeight: "bold",
  color: "var(--sc-azul)",
  whiteSpace: "nowrap",
};

const sinResultados = {
  padding: "10px 12px",
  color: "#64748b",
};
