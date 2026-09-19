/**
 * Exportar a Excel y a PDF lo que la pantalla ya está mostrando.
 *
 * Estaba en siete pantallas y faltaba en otras siete, entre ellas las
 * tributarias, que son las que alguien necesita imprimir o mandar. La utilidad
 * de exportación ya existía; lo que faltaba era el botón.
 *
 * Las librerías de Excel y PDF pesan más que la pantalla entera, así que se
 * cargan recién cuando alguien exporta.
 */

import { useState } from "react";

export default function BotonesExportar({
  nombreArchivo,
  titulo,
  columnas = [],
  filas = [],
  alFallar,
  compacto = false,
}) {
  const [trabajando, setTrabajando] = useState("");
  const vacio = !filas || filas.length === 0;

  async function exportar(formato) {
    if (vacio || trabajando) return;

    setTrabajando(formato);

    try {
      const utilidades = await import("../utils/exportUtils");

      if (formato === "excel") {
        // El Excel se arma con los nombres de columna como encabezado.
        const objetos = filas.map((fila) =>
          columnas.reduce((acumulado, columna, indice) => {
            acumulado[columna] = fila[indice];
            return acumulado;
          }, {})
        );

        utilidades.exportarExcel(nombreArchivo, objetos);
      } else {
        utilidades.exportarPDF(nombreArchivo, titulo || nombreArchivo, columnas, filas);
      }
    } catch (problema) {
      if (alFallar) alFallar(problema.message || "No se pudo exportar");
    } finally {
      setTrabajando("");
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button
        type="button"
        className="sc-btn sc-btn--outline"
        onClick={() => exportar("excel")}
        disabled={vacio || Boolean(trabajando)}
        title={vacio ? "No hay datos para exportar" : "Exportar a Excel"}
      >
        {trabajando === "excel" ? "Generando…" : compacto ? "Excel" : "Exportar Excel"}
      </button>

      <button
        type="button"
        className="sc-btn sc-btn--outline"
        onClick={() => exportar("pdf")}
        disabled={vacio || Boolean(trabajando)}
        title={vacio ? "No hay datos para exportar" : "Exportar a PDF"}
      >
        {trabajando === "pdf" ? "Generando…" : compacto ? "PDF" : "Exportar PDF"}
      </button>
    </div>
  );
}
