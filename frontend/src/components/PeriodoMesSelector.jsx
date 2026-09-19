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

export default function PeriodoMesSelector({
  value,
  onChange,
  style,
  containerStyle,
  // El `id` lo toma el selector de mes, que es el que la persona usa: así una
  // etiqueta con `htmlFor` queda realmente asociada a un control.
  id,
}) {
  const anioActivo = String(obtenerAnioActivo());
  const mesActual = normalizarMes(String(value || "").split("-")[1]);

  function cambiarMes(evento) {
    const mes = normalizarMes(evento.target.value);
    onChange(`${anioActivo}-${mes}`);
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
        value={anioActivo}
        onChange={() => {}}
        aria-label="Año del ejercicio"
      >
        <option value={anioActivo}>{anioActivo}</option>
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
