/**
 * Los factores de actualización que publica el SII, que son los que de verdad
 * aplican al artículo 41.
 *
 * El bloque 11 los calculaba a partir del IPC mensual, acumulando variaciones.
 * Eso da un número muy parecido pero no idéntico: el SII redondea a un decimal
 * sobre los índices, no sobre las variaciones, así que en los meses intermedios
 * la diferencia llega a una décima. En una corrección monetaria esa décima es
 * dinero, y ante el SII la cifra correcta es la que el SII publicó, no la que
 * uno dedujo.
 *
 * Así que ahora se guardan los factores publicados y se dejan de derivar. La
 * fuente queda en cada fila, con su URL, para que cualquiera pueda comprobarlos
 * sin creerle al sistema.
 *
 * Dos reglas del propio SII que quedan grabadas acá:
 *
 * - Diciembre no se corrige: su factor es 1,000. Lo que nace en diciembre no
 *   alcanza a sufrir inflación dentro del ejercicio.
 * - «Cuando el porcentaje de reajuste da como resultado un valor negativo,
 *   dicho valor no debe considerarse, igualándose éste a un valor cero (0)».
 *   Por eso `porcentaje` nunca es negativo en esta tabla.
 *
 * `mes = 0` no es un mes: es el factor del **capital propio inicial** del año,
 * que el SII publica aparte y que no coincide con el de enero. En 2024 el
 * capital propio va 4,2 % y enero 4,7 %.
 *
 * Verificado el 19-09-2026 contra las tablas del SII, leídas directamente:
 *   https://www.sii.cl/valores_y_fechas/correccion_monetaria/correccion2024.htm
 *   https://www.sii.cl/valores_y_fechas/correccion_monetaria/correccion2025.htm
 *
 * El año comercial 2026 **no está cargado a propósito**: el ejercicio no ha
 * cerrado y el SII publica sus factores alrededor de enero del año siguiente.
 * Sin ellos, el sistema se niega a calcular en vez de inventarlos.
 */

exports.shorthands = undefined;

// [mes, porcentaje]. El mes 0 es el capital propio inicial del año.
const FACTORES_2024 = [
  [0, 4.2],
  [1, 4.7],
  [2, 4.0],
  [3, 3.4],
  [4, 3.0],
  [5, 2.5],
  [6, 2.2],
  [7, 2.3],
  [8, 1.6],
  [9, 1.3],
  [10, 1.2],
  [11, 0.3],
  [12, 0.0],
];

const FACTORES_2025 = [
  [0, 3.4],
  [1, 3.6],
  [2, 2.6],
  [3, 2.2],
  [4, 1.6],
  [5, 1.4],
  [6, 1.2],
  [7, 1.7],
  [8, 0.8],
  [9, 0.7],
  [10, 0.3],
  [11, 0.3],
  [12, 0.0],
];

const FUENTES = {
  2024: {
    fuente: "Tabla de corrección monetaria 2024 del SII (Circular N° 9 de 2025)",
    url: "https://www.sii.cl/valores_y_fechas/correccion_monetaria/correccion2024.htm",
  },
  2025: {
    fuente: "Tabla de corrección monetaria 2025 del SII (Circular N° 5 de 2026)",
    url: "https://www.sii.cl/valores_y_fechas/correccion_monetaria/correccion2025.htm",
  },
};

async function existeTabla(pgm, tabla) {
  const { rows } = await pgm.db.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tabla]
  );

  return rows.length > 0;
}

exports.up = async (pgm) => {
  if (!(await existeTabla(pgm, "factores_correccion_monetaria"))) {
    await pgm.db.query(`
      CREATE TABLE factores_correccion_monetaria (
        id SERIAL PRIMARY KEY,
        anio INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
        -- 1 a 12 son los meses; 0 es el capital propio inicial del año.
        mes SMALLINT NOT NULL CHECK (mes BETWEEN 0 AND 12),
        -- Nunca negativo: el SII iguala a cero los reajustes negativos.
        porcentaje NUMERIC(6,2) NOT NULL CHECK (porcentaje >= 0),
        factor NUMERIC(10,6) NOT NULL CHECK (factor >= 1),
        fuente TEXT NOT NULL,
        url TEXT,
        creado_en TIMESTAMP DEFAULT now(),
        CONSTRAINT uq_factores_correccion_anio_mes UNIQUE (anio, mes)
      )
    `);
  }

  for (const [anio, filas] of [
    [2024, FACTORES_2024],
    [2025, FACTORES_2025],
  ]) {
    const { fuente, url } = FUENTES[anio];

    for (const [mes, porcentaje] of filas) {
      // El porcentaje negativo se iguala a cero, por regla del propio SII.
      const efectivo = porcentaje < 0 ? 0 : porcentaje;

      await pgm.db.query(
        `INSERT INTO factores_correccion_monetaria (anio, mes, porcentaje, factor, fuente, url)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (anio, mes) DO NOTHING`,
        [anio, mes, efectivo, 1 + efectivo / 100, fuente, url]
      );
    }
  }
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS factores_correccion_monetaria`);
};
