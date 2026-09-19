/**
 * El único selector de período del sistema.
 *
 * Había dos modelos: este selector, atado al año del ejercicio activo, en la
 * mitad de las pantallas, y un campo de mes libre (`type="month"`) en la otra
 * mitad. Dos comportamientos distintos para la misma cosa, y ninguno explicaba
 * por qué.
 *
 * Ahora es uno con dos modos, porque las dos conductas son legítimas:
 *
 * - Lo normal es quedarse en el año del ejercicio: un libro de mayo de otro año
 *   no tiene sentido dentro del ejercicio abierto.
 * - Algunas pantallas cruzan el año a propósito y necesitan elegirlo: el F29 de
 *   enero declara diciembre del año anterior, el remanente de IVA se arrastra
 *   de un año al siguiente, y el panel del estudio mira varias empresas. Esas
 *   pasan `permitirOtroAnio`.
 */

import { obtenerAnioActivo } from "../services/periodoTrabajoService";

const MESES = [
  { valor: "01", nombre: "Enero" },
  { valor: "02", nombre: "Febrero" },
  { valor: "03", nombre: "Marzo" },
  { valor: "04", nombre: "Abril" },
  { valor: "05", nombre: "Mayo" },
  { valor: "06", nombre: "Junio" },
  { valor: "07", nombre: "Julio" },
  { valor: "08", nombre: "Agosto" },
  { valor: "09", nombre: "Septiembre" },
  { valor: "10", nombre: "Octubre" },
  { valor: "11", nombre: "Noviembre" },
  { valor: "12", nombre: "Diciembre" },
];

function normalizarMes(mes) {
  const numero = Number(mes);
  if (!Number.isInteger(numero) || numero < 1 || numero > 12) return "01";
  return String(numero).padStart(2, "0");
}

function normalizarAnio(anio, respaldo) {
  const numero = Number(anio);

  return Number.isInteger(numero) && numero >= 2000 && numero <= 2100
    ? String(numero)
    : String(respaldo);
}

export default function PeriodoMesSelector({
  value,
  onChange,
  style,
  containerStyle,
  // El `id` lo toma el selector de mes, que es el que la persona usa: así una
  // etiqueta con `htmlFor` queda realmente asociada a un control.
  id,
  // Para las pantallas que cruzan el año a propósito.
  permitirOtroAnio = false,
  // Cuántos años atrás y adelante ofrecer cuando se permite cambiarlo.
  aniosAtras = 3,
  aniosAdelante = 1,
}) {
  const anioEjercicio = String(obtenerAnioActivo());
  const [anioValor, mesValor] = String(value || "").split("-");
  // Con año libre manda el del valor; si no, siempre el del ejercicio.
  const anioActual = permitirOtroAnio
    ? normalizarAnio(anioValor, anioEjercicio)
    : anioEjercicio;
  const mesActual = normalizarMes(mesValor);

  const base = Number(anioEjercicio);
  const anios = [];

  for (let anio = base - aniosAtras; anio <= base + aniosAdelante; anio += 1) {
    anios.push(String(anio));
  }

  // El año que viene en el valor puede caer fuera del rango ofrecido: se
  // agrega para que el selector no lo pierda en silencio.
  if (!anios.includes(anioActual)) {
    anios.push(anioActual);
    anios.sort();
  }

  function cambiarMes(evento) {
    onChange(`${anioActual}-${normalizarMes(evento.target.value)}`);
  }

  function cambiarAnio(evento) {
    onChange(`${normalizarAnio(evento.target.value, anioEjercicio)}-${mesActual}`);
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        ...containerStyle,
      }}
    >
      <select
        style={style}
        value={anioActual}
        onChange={permitirOtroAnio ? cambiarAnio : () => {}}
        disabled={!permitirOtroAnio}
        aria-label={permitirOtroAnio ? "Año" : "Año del ejercicio"}
        title={
          permitirOtroAnio
            ? "Esta pantalla puede consultar otro año"
            : `Año del ejercicio activo (${anioEjercicio})`
        }
      >
        {(permitirOtroAnio ? anios : [anioActual]).map((anio) => (
          <option key={anio} value={anio}>
            {anio}
          </option>
        ))}
      </select>

      <select id={id} style={style} value={mesActual} onChange={cambiarMes} aria-label="Mes">
        {MESES.map((mes) => (
          <option key={mes.valor} value={mes.valor}>
            {mes.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
