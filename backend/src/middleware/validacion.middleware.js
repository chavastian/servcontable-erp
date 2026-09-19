/**
 * Validación de la entrada con esquemas.
 *
 * Antes cada controlador comprobaba a mano lo que se le ocurría, con lo que un
 * monto podía llegar como texto, una fecha en cualquier formato y un
 * identificador como `NaN`. Lo que no se validaba terminaba en PostgreSQL, y su
 * mensaje de error volvía al cliente.
 *
 * Los esquemas viven junto a las rutas que los usan. Este middleware solo los
 * aplica y devuelve un 400 con la lista de problemas, en español y por campo.
 */

const { z } = require("zod");

/**
 * Traduce los errores de zod a algo que un contador entienda.
 */
function formatearErrores(error) {
  return error.issues.map((problema) => {
    const campo = problema.path.join(".") || "cuerpo";
    return { campo, problema: problema.message };
  });
}

/**
 * Valida y reemplaza la parte indicada de la petición por el valor convertido.
 *
 * Reemplazar importa: así el controlador recibe números donde espera números y
 * fechas normalizadas, sin volver a convertir.
 */
function validar(esquema, parte = "body") {
  return (req, res, next) => {
    const resultado = esquema.safeParse(req[parte]);

    if (!resultado.success) {
      const errores = formatearErrores(resultado.error);

      return res.status(400).json({
        error: errores[0]
          ? `${errores[0].campo}: ${errores[0].problema}`
          : "Datos invalidos",
        errores,
      });
    }

    // req.query es de solo lectura en Express 5: se copian las claves.
    if (parte === "query") {
      Object.keys(req.query).forEach((clave) => delete req.query[clave]);
      Object.assign(req.query, resultado.data);
    } else {
      req[parte] = resultado.data;
    }

    return next();
  };
}

// ---------------------------------------------------------------------------
// Piezas reutilizables
// ---------------------------------------------------------------------------

// Los identificadores llegan como texto desde la query y como número desde el
// cuerpo JSON. Se acepta cualquiera de los dos y se entrega un entero.
const id = z.coerce
  .number({ message: "debe ser un numero" })
  .int("debe ser un numero entero")
  .positive("debe ser mayor que cero");

const idOpcional = id.optional().nullable();

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "debe tener el formato AAAA-MM-DD")
  .refine((valor) => !Number.isNaN(Date.parse(valor)), "no es una fecha real");

const periodo = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "debe tener el formato AAAA-MM");

// Los montos en pesos chilenos no llevan decimales, pero el sistema arrastra
// columnas con dos, así que se aceptan y se redondea en el cálculo.
const monto = z.coerce
  .number({ message: "debe ser un monto" })
  .finite("debe ser un monto valido")
  .min(-1e13, "monto fuera de rango")
  .max(1e13, "monto fuera de rango");

const montoPositivo = monto.nonnegative("no puede ser negativo");

const texto = (maximo = 255) => z.string().trim().max(maximo, `no puede superar ${maximo} caracteres`);

const booleano = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0", "si", "no"])])
  .transform((valor) => {
    if (typeof valor === "boolean") return valor;
    return ["true", "1", "si"].includes(String(valor).toLowerCase());
  });

// ---------------------------------------------------------------------------
// Esquemas
// ---------------------------------------------------------------------------

const consultaPorEmpresa = z
  .object({
    empresa_id: id,
    periodo: periodo.optional(),
    fecha_desde: fecha.optional(),
    fecha_hasta: fecha.optional(),
  })
  .passthrough()
  .refine(
    (datos) =>
      !datos.fecha_desde ||
      !datos.fecha_hasta ||
      datos.fecha_desde <= datos.fecha_hasta,
    { message: "fecha_desde no puede ser posterior a fecha_hasta", path: ["fecha_desde"] }
  );

const lineaComprobante = z.object({
  cuenta_id: id,
  glosa: texto(500).optional(),
  debe: montoPositivo.default(0),
  haber: montoPositivo.default(0),
  folio: texto(100).optional(),
  centro_costo: texto(100).optional(),
  rut_auxiliar: texto(30).optional().nullable(),
});

const comprobante = z
  .object({
    empresa_id: id,
    fecha,
    tipo: texto(50).min(1, "es obligatorio"),
    periodo: periodo.optional(),
    numero: idOpcional,
    glosa: texto(500).optional(),
    detalles: z
      .array(lineaComprobante)
      .min(2, "un asiento necesita al menos dos lineas"),
  })
  .superRefine((datos, contexto) => {
    const debe = datos.detalles.reduce((suma, linea) => suma + linea.debe, 0);
    const haber = datos.detalles.reduce((suma, linea) => suma + linea.haber, 0);

    // Se comparan redondeados al peso: la partida doble tiene que cuadrar.
    if (Math.round(debe) !== Math.round(haber)) {
      contexto.addIssue({
        code: "custom",
        path: ["detalles"],
        message: `el asiento no cuadra: debe ${Math.round(debe)} contra haber ${Math.round(haber)}`,
      });
    }

    if (Math.round(debe) === 0) {
      contexto.addIssue({
        code: "custom",
        path: ["detalles"],
        message: "el asiento no puede ser por cero",
      });
    }

    datos.detalles.forEach((linea, indice) => {
      if (linea.debe > 0 && linea.haber > 0) {
        contexto.addIssue({
          code: "custom",
          path: ["detalles", indice],
          message: "una linea no puede tener debe y haber a la vez",
        });
      }

      if (linea.debe === 0 && linea.haber === 0) {
        contexto.addIssue({
          code: "custom",
          path: ["detalles", indice],
          message: "una linea necesita monto en debe o en haber",
        });
      }
    });
  });

const login = z.object({
  email: z.string().trim().toLowerCase().email("no es un correo valido"),
  password: z.string().min(1, "es obligatoria"),
});

const registro = z.object({
  nombre: texto(150).min(2, "es obligatorio"),
  email: z.string().trim().toLowerCase().email("no es un correo valido"),
  password: z.string().min(1, "es obligatoria"),
});

const importacion = z
  .object({
    empresa_id: id,
    periodo: periodo.optional(),
    generar_comprobante: booleano.optional(),
  })
  .passthrough();

module.exports = {
  validar,
  esquemas: {
    consultaPorEmpresa,
    comprobante,
    login,
    registro,
    importacion,
  },
  piezas: { id, idOpcional, fecha, periodo, monto, montoPositivo, texto, booleano },
};
