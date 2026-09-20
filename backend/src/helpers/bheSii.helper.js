/**
 * Boletas de honorarios electrónicas del SII (módulo 11).
 *
 * El problema de importar un archivo del SII cuyo formato exacto no se conoce
 * es el que ya costó una corrección en el registro de compras (hallazgo C-10):
 * si se adivinan los nombres de las columnas y no calzan, la importación entra
 * con montos en cero y nadie se entera hasta que el F29 sale mal.
 *
 * Acá eso no puede pasar. El importador:
 *
 * 1. Lee los encabezados reales del archivo y trata de reconocerlos entre
 *    varios nombres posibles, ignorando tildes, mayúsculas y separadores.
 * 2. Informa qué reconoció y qué no.
 * 3. **Se niega a importar** si falta algo esencial, y devuelve los
 *    encabezados que vio para que la persona los asigne a mano.
 * 4. Acepta ese mapeo manual y lo usa tal cual.
 *
 * REQUIERE VALIDACIÓN: los nombres de columna de aquí son los que usan las
 * exportaciones conocidas del SII, pero el formato cambia. Cuando un archivo
 * real no calce, el mapeo manual lo resuelve sin tocar código.
 */

const { normalizarRut } = require("./rut.helper");
const { tasaRetencionVigente } = require("./retencionHonorarios.helper");
const { aFechaISO } = require("./fecha.helper");

/**
 * Campos que el sistema necesita, con los nombres con que los hemos visto.
 * `obligatorio` decide si la importación puede seguir sin él.
 */
const CAMPOS = [
  {
    campo: "rut_prestador",
    etiqueta: "RUT del prestador",
    obligatorio: true,
    alias: [
      "RUT Emisor",
      "Rut Emisor",
      "RUT del Emisor",
      "RUT Prestador",
      "Rut Prestador",
      "RUT Contribuyente",
      "RUT",
      "Rut",
      // Clave real del informe del SII. El RUT viene SIN digito verificador.
      "rutemisor",
    ],
  },
  {
    campo: "nombre_prestador",
    etiqueta: "Nombre del prestador",
    obligatorio: false,
    alias: [
      "Nombre Emisor",
      "Razon Social Emisor",
      "Razón Social Emisor",
      "Nombre Prestador",
      "Nombre o Razon Social",
      "Nombre",
      "Razon Social",
      "nombre_emisor",
    ],
  },
  {
    campo: "dv_prestador",
    etiqueta: "Dígito verificador del prestador",
    obligatorio: false,
    // El informe del SII parte el RUT en dos columnas. Sin esta, el RUT queda
    // sin dígito verificador y no calza con nada del sistema.
    alias: ["dvemisor", "DV Emisor", "Digito Verificador", "Dígito Verificador", "DV"],
  },
  {
    campo: "folio",
    etiqueta: "Folio o número de la boleta",
    obligatorio: true,
    alias: ["Folio", "Numero Boleta", "Número Boleta", "N Boleta", "Nro Boleta", "Numero", "Número", "nroboleta"],
  },
  {
    campo: "fecha_emision",
    etiqueta: "Fecha de emisión",
    obligatorio: true,
    alias: [
      "Fecha Emision",
      "Fecha Emisión",
      "Fecha de Emision",
      "Fecha Boleta",
      "Fecha Docto",
      "Fecha",
      "fecha_boleta",
      "fechaemision",
    ],
  },
  {
    campo: "bruto",
    etiqueta: "Monto bruto (honorarios)",
    obligatorio: true,
    alias: [
      "Monto Bruto",
      "Total Honorarios",
      "Honorarios",
      "Monto Honorarios",
      "Bruto",
      "Monto Total Bruto",
      "totalhonorarios",
    ],
  },
  {
    campo: "retencion",
    etiqueta: "Retención",
    obligatorio: false,
    alias: ["Retencion", "Retención", "Monto Retencion", "Monto Retención", "Impuesto Retenido"],
  },
  {
    campo: "liquido",
    etiqueta: "Monto líquido",
    obligatorio: false,
    alias: ["Monto Liquido", "Monto Líquido", "Liquido", "Líquido", "Total a Pagar", "Neto Pagado", "honorariosliquidos"],
  },
  {
    campo: "fecha_pago",
    etiqueta: "Fecha de pago",
    obligatorio: false,
    // El informe del SII NO trae fecha de pago: solo emisión y anulación. Se
    // deja por si el archivo viene de otro origen, pero con el del SII esta
    // columna queda vacía y la fecha de pago hay que registrarla después. Importa
    // porque la declaración jurada 1879 va por fecha de pago, no de emisión.
    alias: ["Fecha Pago", "Fecha de Pago"],
  },
  {
    campo: "estado",
    etiqueta: "Estado de la boleta",
    obligatorio: false,
    alias: ["Estado", "Situacion", "Situación", "Estado Boleta", "estado"],
  },
  {
    campo: "retencion_emisor",
    etiqueta: "Retención de cargo del emisor",
    obligatorio: false,
    // El informe del SII trae DOS columnas de retención, no una. Cuál de las
    // dos tiene monto es lo que dice quién retuvo: no hay columna "retenedor".
    alias: ["retencion_emisor", "Retencion Emisor", "Retención Emisor"],
  },
  {
    campo: "retencion_receptor",
    etiqueta: "Retención de cargo del receptor",
    obligatorio: false,
    alias: ["retencion_receptor", "Retencion Receptor", "Retención Receptor"],
  },
  {
    campo: "sociedad_profesional",
    etiqueta: "Sociedad de profesionales",
    obligatorio: false,
    // Una sociedad de profesionales de primera categoría emite sin retención:
    // es el caso legítimo de boleta con retención cero.
    alias: ["es_soc_profesional", "Sociedad Profesional", "Soc Profesional"],
  },
  {
    campo: "fecha_anulacion",
    etiqueta: "Fecha de anulación",
    obligatorio: false,
    alias: ["fechaanulacion", "Fecha Anulacion", "Fecha Anulación"],
  },
  {
    campo: "retenedor",
    etiqueta: "Quién retiene",
    obligatorio: false,
    // Se conserva por si un archivo de otro origen sí trae la columna, pero el
    // informe del SII no la tiene: ahí se deduce de las dos de retención.
    alias: ["Retenedor", "Quien Retiene", "Tipo Retencion", "Tipo Retención"],
  },
];

function normalizarClave(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Empareja los encabezados del archivo con los campos que necesitamos.
 *
 * `mapeoManual` gana siempre: si la persona dijo que "Mto Hon" es el bruto, es
 * el bruto.
 */
function detectarColumnas(encabezados = [], mapeoManual = {}) {
  const porClave = new Map();

  for (const encabezado of encabezados) {
    const clave = normalizarClave(encabezado);

    if (clave && !porClave.has(clave)) porClave.set(clave, encabezado);
  }

  const mapeo = {};
  const reconocidos = [];
  const faltantes = [];

  for (const definicion of CAMPOS) {
    const manual = mapeoManual[definicion.campo];

    if (manual && encabezados.includes(manual)) {
      mapeo[definicion.campo] = manual;
      reconocidos.push({ ...definicion, columna: manual, origen: "manual" });
      continue;
    }

    const encontrado = definicion.alias
      .map((alias) => porClave.get(normalizarClave(alias)))
      .find(Boolean);

    if (encontrado) {
      mapeo[definicion.campo] = encontrado;
      reconocidos.push({ ...definicion, columna: encontrado, origen: "automatico" });
    } else {
      faltantes.push(definicion);
    }
  }

  return {
    mapeo,
    reconocidos: reconocidos.map(({ campo, etiqueta, columna, origen }) => ({
      campo,
      etiqueta,
      columna,
      origen,
    })),
    faltantes: faltantes.map(({ campo, etiqueta, obligatorio, alias }) => ({
      campo,
      etiqueta,
      obligatorio,
      nombres_esperados: alias,
    })),
    // Sin estos no se puede importar nada sin inventar.
    faltan_obligatorios: faltantes.filter((f) => f.obligatorio).map((f) => f.campo),
  };
}

function numeroChileno(valor) {
  const texto = String(valor === null || valor === undefined ? "" : valor).trim();

  if (!texto) return 0;

  // El SII exporta 1.234.567 y también 1234567,89: el punto es miles y la
  // coma decimal.
  const limpio = texto.replace(/\$/g, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const numero = Number(limpio);

  return Number.isFinite(numero) ? numero : 0;
}

function fechaChilena(valor) {
  const texto = String(valor || "").trim();

  if (!texto) return null;

  // dd-mm-aaaa y dd/mm/aaaa van PRIMERO, y el orden no es un detalle: si se
  // deja que la conversión genérica lo intente antes, JavaScript lee
  // "05-03-2039" como el 3 de mayo, porque asume mes primero. Una boleta de
  // marzo terminaba declarada en mayo, en el F29 y en la jurada 1879.
  const m = texto.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);

  if (m) {
    const [, dia, mes, anio] = m;
    const diaNumero = Number(dia);
    const mesNumero = Number(mes);

    if (mesNumero < 1 || mesNumero > 12 || diaNumero < 1 || diaNumero > 31) return null;

    return `${anio}-${String(mesNumero).padStart(2, "0")}-${String(diaNumero).padStart(2, "0")}`;
  }

  return aFechaISO(texto);
}

/**
 * ¿La retención es de cargo del emisor? En ese caso el pagador no retiene y la
 * boleta no genera retención que declarar.
 */
function retieneElEmisor(valor) {
  const texto = normalizarClave(valor);

  if (!texto) return false;

  // Los archivos traen tanto un código como un texto.
  return (
    texto.includes("emisor") ||
    texto.includes("contribuyente") ||
    texto.includes("prestador") ||
    texto === "2"
  );
}

/**
 * Si la boleta está anulada.
 *
 * Ojo con esto, porque es la diferencia entre descontar una boleta y no
 * descontarla: **el informe del SII no dice "anulada", dice `S` o `N`.** `S` es
 * anulada y `N` es vigente. Leyendo solo texto, una boleta anulada entraba como
 * vigente y se contabilizaba un honorario que no existe.
 *
 * `fechaAnulacion` es la segunda señal: si el archivo trae fecha de anulación,
 * la boleta está anulada aunque la columna de estado no se haya reconocido.
 */
function estaAnulada(valor, fechaAnulacion) {
  if (fechaAnulacion) return true;

  const texto = normalizarClave(valor);

  if (!texto) return false;

  // La forma del SII: S = anulada, N = vigente.
  if (texto === "s" || texto === "si") return true;
  if (texto === "n" || texto === "no") return false;

  return texto.includes("anulad") || texto.includes("nula");
}

/** Si el valor de una columna de sí/no está en verdadero. */
function esAfirmativo(valor) {
  const texto = normalizarClave(valor);

  return texto === "s" || texto === "si" || texto === "1" || texto === "true";
}

/**
 * Convierte una fila del archivo en una boleta, o la rechaza con un motivo.
 */
function leerFila(fila, mapeo, indice) {
  const valor = (campo) => (mapeo[campo] ? fila[mapeo[campo]] : undefined);
  const nombreFila = `Fila ${indice + 1}`;

  // El informe del SII parte el RUT en dos columnas: el número por un lado y el
  // dígito verificador por otro. Si vienen separadas, se juntan; si el archivo
  // ya trae el RUT completo, se usa tal cual.
  const rutCrudo = String(valor("rut_prestador") || "").trim();
  const dv = String(valor("dv_prestador") || "").trim();
  const rut = normalizarRut(dv && !rutCrudo.includes("-") ? `${rutCrudo}-${dv}` : rutCrudo);

  if (!rut.valido) {
    return { error: `${nombreFila}: ${rut.error || "RUT del prestador no válido"}` };
  }

  const folio = String(valor("folio") || "").trim();

  if (!folio) {
    return { error: `${nombreFila}: sin folio` };
  }

  const fechaEmision = fechaChilena(valor("fecha_emision"));

  if (!fechaEmision) {
    return { error: `${nombreFila}: fecha de emisión no válida` };
  }

  const bruto = Math.round(numeroChileno(valor("bruto")));

  if (bruto <= 0) {
    // Esto es exactamente lo que no puede pasar en silencio.
    return {
      error: `${nombreFila}: el monto bruto quedó en cero. Revisa a qué columna corresponde el bruto.`,
    };
  }

  const fechaAnulacion = fechaChilena(valor("fecha_anulacion"));
  const anulada = estaAnulada(valor("estado"), fechaAnulacion);
  const sociedadProfesional = esAfirmativo(valor("sociedad_profesional"));

  // En el informe del SII no hay una columna que diga quién retuvo: hay dos
  // columnas de retención, y quien retuvo es el dueño de la que trae monto.
  const retencionEmisor = mapeo.retencion_emisor
    ? Math.round(numeroChileno(valor("retencion_emisor")))
    : null;
  const retencionReceptor = mapeo.retencion_receptor
    ? Math.round(numeroChileno(valor("retencion_receptor")))
    : null;

  const emisorRetiene =
    retencionEmisor !== null || retencionReceptor !== null
      ? retencionEmisor > 0 && !(retencionReceptor > 0)
      : retieneElEmisor(valor("retenedor"));

  // La retención única, para archivos que no separan las dos columnas.
  const retencionArchivo =
    retencionEmisor !== null || retencionReceptor !== null
      ? Math.max(retencionEmisor || 0, retencionReceptor || 0)
      : mapeo.retencion
      ? Math.round(numeroChileno(valor("retencion")))
      : null;

  const tasa = tasaRetencionVigente(fechaEmision);

  // La retención del archivo manda; si no viene, se calcula con la tasa
  // vigente a la fecha de emisión, salvo que retenga el emisor.
  const retencion = sociedadProfesional
    ? 0
    : emisorRetiene
    ? 0
    : retencionArchivo !== null
    ? retencionArchivo
    : Math.round(bruto * (tasa / 100));

  const liquidoArchivo = mapeo.liquido ? Math.round(numeroChileno(valor("liquido"))) : null;
  const liquido = liquidoArchivo !== null && liquidoArchivo > 0 ? liquidoArchivo : bruto - retencion;

  const avisos = [];

  if (retencionArchivo !== null && !emisorRetiene) {
    const esperada = Math.round(bruto * (tasa / 100));

    if (Math.abs(retencionArchivo - esperada) > 1) {
      avisos.push(
        `${nombreFila}: la retención del archivo (${retencionArchivo}) no coincide con el ${tasa}% vigente a la fecha (${esperada}). Se usó la del archivo.`
      );
    }
  }

  if (sociedadProfesional) {
    avisos.push(
      `${nombreFila}: viene marcada como sociedad de profesionales, que emite sin retención. REQUIERE VALIDACIÓN TRIBUTARIA.`
    );
  }

  if (emisorRetiene) {
    avisos.push(
      `${nombreFila}: la retención es de cargo del emisor, así que la empresa no retiene. REQUIERE VALIDACIÓN TRIBUTARIA.`
    );
  }

  if (Math.abs(bruto - retencion - liquido) > 1) {
    avisos.push(`${nombreFila}: bruto menos retención no da el líquido del archivo.`);
  }

  return {
    boleta: {
      rut_prestador: rut.rut,
      nombre_prestador: String(valor("nombre_prestador") || "").trim() || rut.rut,
      folio,
      fecha_emision: fechaEmision,
      fecha_pago: fechaChilena(valor("fecha_pago")),
      bruto,
      tasa_retencion: emisorRetiene ? 0 : tasa,
      retencion,
      liquido,
      anulada,
      emisor_retiene: emisorRetiene,
      sociedad_profesional: sociedadProfesional,
    },
    avisos,
  };
}

module.exports = {
  CAMPOS,
  detectarColumnas,
  leerFila,
  numeroChileno,
  fechaChilena,
  retieneElEmisor,
  estaAnulada,
  normalizarClave,
};
