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
  // El centro de costo es un catálogo desde el bloque 6: se acepta por id y
  // también por nombre, que es lo que mandaban las pantallas antiguas.
  centro_costo: texto(100).optional(),
  centro_costo_id: idOpcional,
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

// ---------------------------------------------------------------------------
// Esquemas de la revisión del 19-09-2026: ningún controlador fuera de
// compras, ventas, comprobantes, boletas y sesión validaba por esquema. Los
// esquemas son permisivos con lo que no conocen (`passthrough`) y estrictos
// con lo que rompe una consulta: identificadores, fechas, períodos y montos.
// ---------------------------------------------------------------------------

const fechaOpcional = z.union([fecha, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));
const montoOpcional = monto.optional();
const enteroNoNegativo = z.coerce.number().int("debe ser un numero entero").nonnegative("no puede ser negativo");
const correo = z.union([z.string().trim().email("no es un correo valido"), z.literal(""), z.null()]).optional();

const conEmpresa = z.object({ empresa_id: id }).passthrough();

const honorario = z
  .object({
    empresa_id: id,
    fecha_emision: fecha,
    fecha_pago: fechaOpcional,
    folio: texto(50).optional().nullable(),
    rut_prestador: texto(20).min(1, "es obligatorio"),
    nombre_prestador: texto(200).optional(),
    bruto: montoPositivo,
    tasa_retencion: montoOpcional,
  })
  .passthrough();

const trabajador = z
  .object({
    empresa_id: id,
    rut: texto(20).min(1, "es obligatorio"),
    nombres: texto(120).min(1, "es obligatorio"),
    apellidos: texto(120).optional().nullable(),
    fecha_ingreso: fecha,
    fecha_termino: fechaOpcional,
    fecha_nacimiento: fechaOpcional,
    sueldo_base: montoPositivo.optional(),
    cargas: enteroNoNegativo.optional(),
    plan_salud_uf: montoPositivo.optional(),
    anios_cotizados_previos: enteroNoNegativo.optional(),
    email: correo,
  })
  .passthrough();

const liquidacionGuardar = z
  .object({
    empresa_id: id,
    trabajador_id: id,
    periodo,
    dias_trabajados: z.coerce.number().min(0, "no puede ser negativo").max(31, "no puede superar 31").optional(),
  })
  .passthrough();

const porPeriodo = z.object({ empresa_id: id, periodo }).passthrough();

const finiquito = z
  .object({
    empresa_id: id,
    trabajador_id: id,
    fecha_termino: fecha,
    fecha_aviso: fechaOpcional,
    fecha_pago: fechaOpcional,
    causal: texto(200).min(1, "es obligatoria"),
    indemnizacion_voluntaria: montoPositivo.optional(),
    otros_haberes: montoPositivo.optional(),
    descuentos: montoPositivo.optional(),
    otros_descuentos: montoPositivo.optional(),
  })
  .passthrough();

const finiquitoPagar = z
  .object({ empresa_id: id, fecha_pago: fechaOpcional, cuenta_banco_id: idOpcional })
  .passthrough();

const ejercicioCrear = z
  .object({
    empresa_id: id,
    anio: z.coerce.number().int().min(2000, "año fuera de rango").max(2100, "año fuera de rango"),
    observacion: texto(500).optional().nullable(),
  })
  .passthrough();

const ejercicioReabrir = z
  .object({ empresa_id: id, motivo: texto(500).min(5, "indica el motivo (mínimo 5 caracteres)") })
  .passthrough();

const pagoCobro = z
  .object({
    empresa_id: id,
    fecha,
    monto: montoPositivo.optional(),
    documento_id: idOpcional,
    cuenta_banco_id: idOpcional,
    cuenta_contraparte_id: idOpcional,
  })
  .passthrough();

const haberDescuento = z
  .object({
    empresa_id: id,
    trabajador_id: id,
    periodo,
    nombre: texto(150).min(1, "es obligatorio"),
    tipo: texto(30).min(1, "es obligatorio"),
    monto: montoPositivo,
  })
  .passthrough();

const vacacionAusencia = z
  .object({
    empresa_id: id,
    trabajador_id: id,
    periodo,
    tipo: texto(50).min(1, "es obligatorio"),
    fecha_inicio: fecha,
    fecha_termino: fecha,
    dias: montoPositivo.optional(),
    horas: montoPositivo.optional(),
    monto_descuento: montoPositivo.optional(),
  })
  .passthrough()
  .refine((d) => d.fecha_inicio <= d.fecha_termino, {
    message: "no puede ser posterior a fecha_termino",
    path: ["fecha_inicio"],
  });

const configuracionRemuneraciones = z
  .object({
    empresa_id: id,
    periodo,
    valor_uf: montoPositivo.optional(),
    ingreso_minimo: montoPositivo.optional(),
    tope_imponible_uf: montoPositivo.optional(),
  })
  .passthrough();

const afp = z
  .object({ empresa_id: id, periodo, nombre: texto(100).min(1, "es obligatorio"), tasa_afp: montoPositivo })
  .passthrough();

const cuentaPlan = z
  .object({
    empresa_id: id,
    codigo: texto(30).min(1, "es obligatorio"),
    nombre: texto(200).min(1, "es obligatorio"),
    tipo: texto(30).min(1, "es obligatorio"),
  })
  .passthrough();

const empresa = z
  .object({
    rut: texto(20).min(1, "es obligatorio"),
    razon_social: texto(200).min(1, "es obligatoria"),
    correo,
    correo_representante: correo,
  })
  .passthrough();

const remanente = z.object({ empresa_id: id, periodo, remanente_anterior: montoOpcional }).passthrough();

const f29Presentada = z
  .object({
    empresa_id: id,
    periodo,
    folio_sii: texto(50).optional().nullable(),
    fecha_presentacion: fecha,
    total_pagado: montoOpcional,
  })
  .passthrough();

const tercero = z
  .object({
    empresa_id: id,
    rut: texto(20).min(1, "es obligatorio"),
    razon_social: texto(200).min(1, "es obligatoria"),
    email: correo,
    // Vacío es "no se sabe"; 0 es contado. El controlador distingue los dos.
    condicion_pago_dias: z
      .union([z.coerce.number().int().min(0, "no puede ser negativo").max(365, "no puede superar 365"), z.literal(""), z.null()])
      .optional(),
    cuenta_gasto_id: idOpcional,
    cuenta_ingreso_id: idOpcional,
  })
  .passthrough();

// Al editar, el RUT no viaja: no se cambia una vez que hay documentos.
const terceroActualizar = z
  .object({
    empresa_id: id,
    razon_social: texto(200).min(1, "es obligatoria"),
    email: correo,
    condicion_pago_dias: z
      .union([z.coerce.number().int().min(0, "no puede ser negativo").max(365, "no puede superar 365"), z.literal(""), z.null()])
      .optional(),
    cuenta_gasto_id: idOpcional,
    cuenta_ingreso_id: idOpcional,
  })
  .passthrough();

const terceroEstado = z
  .object({
    empresa_id: id,
    estado: z.enum(["vigente", "inactivo"], { message: "debe ser vigente o inactivo" }),
  })
  .passthrough();

const centroCosto = z
  .object({
    empresa_id: id,
    codigo: texto(30).min(1, "es obligatorio"),
    nombre: texto(150).min(1, "es obligatorio"),
  })
  .passthrough();

const conciliacionEstado = z
  .object({
    empresa_id: id,
    estado: z.enum(["pendiente", "conciliado"], { message: "debe ser pendiente o conciliado" }),
    comprobante_id: idOpcional,
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
    conEmpresa,
    honorario,
    trabajador,
    liquidacionGuardar,
    porPeriodo,
    finiquito,
    finiquitoPagar,
    ejercicioCrear,
    ejercicioReabrir,
    pagoCobro,
    haberDescuento,
    vacacionAusencia,
    configuracionRemuneraciones,
    afp,
    cuentaPlan,
    empresa,
    remanente,
    f29Presentada,
    conciliacionEstado,
    tercero,
    terceroActualizar,
    terceroEstado,
    centroCosto,
  },
  piezas: { id, idOpcional, fecha, periodo, monto, montoPositivo, texto, booleano },
};
