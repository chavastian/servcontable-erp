const pool = require("../database/db");

const PLAN_CUENTAS_BASE_TEXTO = `
1101001|CAJA|ACTIVO|Efectivo y equivalentes al efectivo
1101002|FONDO FIJO|ACTIVO|Efectivo y equivalentes al efectivo
1101003|BANCO BCI|ACTIVO|Efectivo y equivalentes al efectivo
1101004|BANCO DE CHILE|ACTIVO|Efectivo y equivalentes al efectivo
1101005|BANCO DEL DESARROLLO|ACTIVO|Efectivo y equivalentes al efectivo
1101006|BANCO ESTADO|ACTIVO|Efectivo y equivalentes al efectivo
1101007|BANCO SANTANDER|ACTIVO|Efectivo y equivalentes al efectivo
1101008|BANCO SCOTIABANK|ACTIVO|Efectivo y equivalentes al efectivo
1101009|BANCO RIPLEY|ACTIVO|Efectivo y equivalentes al efectivo
1101010|BANCO SECURITY|ACTIVO|Efectivo y equivalentes al efectivo
1101011|BANCO BICE|ACTIVO|Efectivo y equivalentes al efectivo
1101012|BANCO INTERNACIONAL|ACTIVO|Efectivo y equivalentes al efectivo
1101013|BANCO FALABELLA|ACTIVO|Efectivo y equivalentes al efectivo
1101014|BANCO ITAU CHILE|ACTIVO|Efectivo y equivalentes al efectivo
1101015|CUENTA PARTICULAR|ACTIVO|Otros activos no financieros corrientes
1101016|CTA CTE SOCIO 1|ACTIVO|Otros activos no financieros corrientes
1101017|CTA CTE SOCIO 2|ACTIVO|Otros activos no financieros corrientes
1101018|FONDOS POR RENDIR|ACTIVO|Efectivo y equivalentes al efectivo
1101019|DEPOSITOS A PLAZO|ACTIVO|Efectivo y equivalentes al efectivo
1101020|DOCUMENTO DEVUELTO|ACTIVO|Efectivo y equivalentes al efectivo
1101021|FONDOS MUTUOS|ACTIVO|Efectivo y equivalentes al efectivo
1103001|CLIENTES|ACTIVO|Deudores comerciales y otras cuentas por cobrar corrientes
1103002|CLIENTES EXTRANJEROS|ACTIVO|Deudores comerciales y otras cuentas por cobrar corrientes
1103003|ASIGNACION FAMILIAR|ACTIVO|Otros activos no financieros corrientes
1103004|SALDO A FAVOR INP|ACTIVO|Otros activos no financieros corrientes
1201001|MERCADERIAS|ACTIVO|Inventarios corrientes
1201002|MERCADERIAS EN TRANSITO|ACTIVO|Inventarios corrientes
1201003|MATERIALES|ACTIVO|Inventarios corrientes
1201004|IMPORTACIONES EN TRANSITO|ACTIVO|Inventarios corrientes
1201005|MATERIAS PRIMAS|ACTIVO|Inventarios corrientes
1201006|PRODUCTOS EN PROCESO|ACTIVO|Inventarios corrientes
1201007|PRODUCTOS TERMINADOS|ACTIVO|Inventarios corrientes
1300901|IVA CREDITO FISCAL|ACTIVO|Deudores comerciales y otras cuentas por cobrar corrientes
1300902|IMPESTOS POR RECUPERAR|ACTIVO|Activos por impuestos corrientes
1300903|IVA ANTICIPADO HARINA|ACTIVO|Deudores comerciales y otras cuentas por cobrar corrientes
1300904|IVA ANTICIPADO CARNE|ACTIVO|Deudores comerciales y otras cuentas por cobrar corrientes
1301001|DEUDORES VARIOS|ACTIVO|Deudores comerciales y otras cuentas por cobrar corrientes
1301002|ANTICIPOS AL PERSONAL|ACTIVO|Deudores comerciales y otras cuentas por cobrar corrientes
1301003|ANTICIPO PROVEDORES|ACTIVO|Deudores comerciales y otras cuentas por cobrar corrientes
1301004|GASTOS ANTICIPADOS|ACTIVO|Deudores comerciales y otras cuentas por cobrar corrientes
1301006|CREDITO ART. 33 BIS|ACTIVO|Activos por impuestos corrientes
1301007|PAGOS PROVISIONALES MENSUALES|ACTIVO|Activos por impuestos corrientes
1301009|ARRIENDOS PAGADOS POR ANTICIPADO|ACTIVO|Deudores comerciales y otras cuentas por cobrar corrientes
1301010|DOCUMENTOS POR COBRAR|ACTIVO|Deudores comerciales y otras cuentas por cobrar corrientes
1301012|ANTICIPO HONORARIOS|ACTIVO|Deudores comerciales y otras cuentas por cobrar corrientes
1301013|PRESTAMOS A TRABAJADORES|ACTIVO|Deudores comerciales y otras cuentas por cobrar corrientes
1401001|MUEBLES Y UTILES|ACTIVO|Propiedades, planta y equipo
1401002|EQUIPOS COMPUTACIONALES|ACTIVO|Propiedades, planta y equipo
1401003|EQUIPOS Y HTAS.|ACTIVO|Propiedades, planta y equipo
1401004|VEHICULOS|ACTIVO|Propiedades, planta y equipo
1401005|INSTALACIONES|ACTIVO|Propiedades, planta y equipo
1401006|MAQUINARIAS|ACTIVO|Propiedades, planta y equipo
1401007|EQUIPOS DE AUDIO Y VIDEO|ACTIVO|Propiedades, planta y equipo
1401008|BIENES RAICES|ACTIVO|Propiedades, planta y equipo
1401009|ACTIVOS EN LEASING|ACTIVO|Propiedades, planta y equipo
1501001|DEP. ACUMULADA MUEBLES Y UTILES|PASIVO|Propiedades, planta y equipo
1501002|DEP. ACUMULADA EQUIPOS COMPUTACIONALES|PASIVO|Propiedades, planta y equipo
1501003|DEP. ACUMULADA EQUIPOS Y HTAS.|PASIVO|Propiedades, planta y equipo
1501004|DEP. ACUMULADA VEHICULOS|PASIVO|Propiedades, planta y equipo
1501005|DEP. ACUMULADA INSTALACIONES|PASIVO|Propiedades, planta y equipo
1501006|DEP. ACUMULADA MAQUINARIAS, EQUIPOS Y HTAS.|PASIVO|Propiedades, planta y equipo
1501007|DEP. ACUMULADA EQUIPOS DE AUDIO Y VIDEO|PASIVO|Propiedades, planta y equipo
1501008|DEP. ACUMULADA ACTIVOS EN LEASING|PASIVO|Propiedades, planta y equipo
1501009|DEP. ACUMULADA|PASIVO|Propiedades, planta y equipo
1601001|INVERSIONES EN OTRAS SOCIEDADES|ACTIVO|Inversiones contabilizadas con el metodo de la participacion
1601002|MENOR VALOR INVERSION|ACTIVO|Inversiones contabilizadas con el metodo de la participacion
1601003|MAYOR VALOR INVERSION|ACTIVO|Inversiones contabilizadas con el metodo de la participacion
1601004|DEUDORES A LARGO PLAZO|ACTIVO|Cuentas por cobrar no corrientes
1601005|INTANGIBLES|ACTIVO|Activos intangibles distintos de la plusvalía
1601006|AMORT. ACUMULADA INTANGIBLES|ACTIVO|Activos intangibles distintos de la plusvalía
1601007|ARRIENDOS EN GARANTIA|ACTIVO|Otros activos no financieros no corrientes
1601008|ACTIVO POR IMPUESTOS DIFERIDOS|ACTIVO|Activos por impuestos diferidos
2101001|OBLIGACIONES CON BANCO|PASIVO|Otros pasivos financieros corrientes
2101002|LINEA DE CREDITO BANCO|PASIVO|Otros pasivos financieros corrientes
2101003|OBLIGACIONES LEASING|PASIVO|Otros pasivos financieros corrientes
2101004|INTERES DIFERIDO LEASING|PASIVO|Otros pasivos financieros corrientes
2101005|PROVEEDORES NACIONALES|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101006|ACREEDORES VARIOS|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101007|ANTICIPO DE CLIENTES|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101008|REMUNERACIONES POR PAGAR|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101009|HONORARIOS POR PAGAR|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101010|AFP POR PAGAR|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101011|SALUD POR PAGAR|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101012|IPS POR PAGAR (EX-INP)|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101013|MUTUAL DE SEGURIDAD POR PAGAR|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101014|SEGURO DE CESANTIA TRABAJADOR|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101015|APORTE PATRONAL ACCIDENTES DEL TRABAJO|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101016|APORTE PATRONAL SEGURO DE CESANTIA|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101017|SIS POR PAGAR|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101019|IMPUESTO UNICO A LOS TRABAJADORES|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101020|RETENCION DE 2° CATEGORIA|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101021|RETENCION 3% PRESTAMO|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101022|PROVISION PPM|PASIVO|Otras provisiones corrientes
2101023|IVA POSTERGADO|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101024|INDEMNIZACIONES POR PAGAR|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101025|PROVISION VACACIONES|PASIVO|Provisiones corrientes por beneficios a los empleados
2101026|PROVISION IMPUESTO  A LA RENTA|PASIVO|Otras provisiones corrientes
2101027|LEYES SOCIALES POR PAGAR|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101028|LINEA DE CREDITO|PASIVO|Otros pasivos financieros corrientes
2101029|LINEA DE CREDITO BANCO DE CHILE|PASIVO|Otros pasivos financieros corrientes
2101030|LINEA DE CREDITO BANCO SANTANDER|PASIVO|Otros pasivos financieros corrientes
2101031|IVA DEBITO FISCAL|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101032|CUENTAS POR PAGAR|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101033|IMPUESTO A LA RENTA POR PAGAR|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101034|PROVISION INTERESES LINEA DE CREDITO|PASIVO|Otras provisiones corrientes
2101035|DESCUENTO TRABAJADOR|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2101036|IVA RETENIDO TOTAL|PASIVO|Cuentas por pagar comerciales y otras cuentas por pagar
2201001|CREDITO VEHICULO|PASIVO|Cuentas por pagar no corrientes
2201002|PRESTAMO CTA CTE SOCIO 1|PASIVO|Cuentas por pagar no corrientes
2201003|PRESTAMO CTA CTE SOCIO 2|PASIVO|Cuentas por pagar no corrientes
2201005|PRESTAMO POR PAGAR A SOCIO|PASIVO|Cuentas por pagar no corrientes
2201007|DOCUMENTOS POR PAGAR|PASIVO|Cuentas por pagar no corrientes
2201008|CUENTAS POR PAGAR NO CORRIENTES|PASIVO|Cuentas por pagar no corrientes
2201009|OBLIGACIONES BANCO NO CORRIENTE|PASIVO|Otros pasivos financieros no corrientes
2201010|OBLIGACIONES BANCO DE CHILE NO CORRIENTE|PASIVO|Otros pasivos financieros no corrientes
2201011|OBLIGACIONES LEASING NO CORRIENTE|PASIVO|Otros pasivos financieros no corrientes
2201012|INTERES DIFERIDO LEASING NO CORRIENTE|PASIVO|Otros pasivos financieros no corrientes
2201013|ACREEDORES VARIOS NO CORRIENTES|PASIVO|Cuentas por pagar no corrientes
2201014|PASIVO POR IMPUESTOS DIFERIDOS|PASIVO|Pasivo por impuestos diferidos
2201015|OTROS PASIVOS A LARGO PLAZO|PASIVO|Otros pasivos no financieros no corrientes
2301001|CAPITAL|PATRIMONIO|Capital emitido
2301002|REVALORIZACION CAPITAL PROPIO|PATRIMONIO|Otras reservas
2301003|UTILIDADES ACUMULADAS|PATRIMONIO|Ganancias (pérdidas) acumuladas
2301004|UTILIDADES POR DISTRIBUIR|PATRIMONIO|Ganancias (pérdidas) acumuladas
2301005|RESULTADO DEL EJERCICIO|PATRIMONIO|Ganancias (pérdidas) acumuladas
2301006|APORTES DE CAPITAL|PATRIMONIO|Capital emitido
2301007|RETIROS SOCIO 1|PATRIMONIO|Ganancias (pérdidas) acumuladas
2301008|RETIROS SOCIO 2|PATRIMONIO|Ganancias (pérdidas) acumuladas
2301010|PERDIDAS Y GANANCIAS|PATRIMONIO|Ganancias (pérdidas) acumuladas
2301011|OTRAS RESERVAS|PATRIMONIO|Otras reservas
2301012|PERDIDAS ACUMULADAS|PATRIMONIO|Ganancias (pérdidas) acumuladas
3101001|COSTO DE VENTAS|PERDIDA|Costo de ventas
3101002|SERVICIOS EXTERNOS|PERDIDA|Costo de ventas
3101003|COMBUSTIBLE Y LUBRICANTES|PERDIDA|Costo de ventas
3101004|REPARACION DE PRODUCTOS|PERDIDA|Costo de ventas
3101005|MATERIALES DE REEMPLAZO|PERDIDA|Costo de ventas
3101006|REMUNERACIONES|PERDIDA|Gastos de administración
3101007|HORAS EXTRAORDINARIAS|PERDIDA|Gastos de administración
3101008|GRATIFICACIONES|PERDIDA|Gastos de administración
3101009|COLACION|PERDIDA|Gastos de administración
3101010|MOVILIZACION|PERDIDA|Gastos de administración
3101011|SEGURO ACCIDENTES DEL TRABAJO|PERDIDA|Gastos de administración
3101012|SEGURO DE CESANTIA EMPLEADOR|PERDIDA|Gastos de administración
3101013|SEGURO INVALIDEZ Y SOBREVIVENCIA|PERDIDA|Gastos de administración
3101014|AGUINALDOS|PERDIDA|Gastos de administración
3101015|DESCUENTO SOBRE VENTAS|PERDIDA|Gastos de administración
3101016|HONORARIOS|PERDIDA|Gastos de administración
3101017|COMISIONES POR VENTAS|PERDIDA|Gastos de administración
3101018|INDEMNIZACIONES|PERDIDA|Gastos de administración
3101019|VACACIONES PROPORCIONALES|PERDIDA|Gastos de administración
3101020|ARRIENDOS|PERDIDA|Otros gastos, por función
3101021|ENERGIA ELECTRICA|PERDIDA|Otros gastos, por función
3101022|AGUA POTABLE|PERDIDA|Otros gastos, por función
3101023|GASTO SOFTWARE FACTURACION|PERDIDA|Costo de ventas
3101024|GASTOS COMERCIO EXTERIOR|PERDIDA|Costo de ventas
3101025|GASTOS HOSPEDAJE|PERDIDA|Otros gastos, por función
3101026|OTROS GASTOS DE ARRIENDO|PERDIDA|Otros gastos, por función
3101027|SUELDO EMPRESARIAL|PERDIDA|Gastos de administración
3201000|GASTOS INSUMOS DE OFICINA|PERDIDA|Otros gastos, por función
3201001|GAS LICUADO|PERDIDA|Otros gastos, por función
3201002|ARTICULOS DE OFICINA|PERDIDA|Otros gastos, por función
3201003|GASTOS ORG. Y PUESTA EN MARCHA|PERDIDA|Otros gastos, por función
3201004|ARTICULOS DE ASEO|PERDIDA|Otros gastos, por función
3201005|GASTOS COMPUTACIONALES|PERDIDA|Otros gastos, por función
3201006|GASTOS LEGALES Y NOTARIALES|PERDIDA|Gastos de administración
3201007|SERVICIOS DE CORREO|PERDIDA|Otros gastos, por función
3201008|GASTOS TELEFONO E INTERNET|PERDIDA|Otros gastos, por función
3201009|GASTOS DE VIAJES Y REPRESENTACIONES|PERDIDA|Otros gastos, por función
3201010|ASESORIAS TECNICAS|PERDIDA|Otros gastos, por función
3201011|ASESORIAS EN CONTABILIDAD|PERDIDA|Gastos de administración
3201012|ASESORIAS JURIDICAS|PERDIDA|Gastos de administración
3201013|GASTOS PUBLICIDAD|PERDIDA|Otros gastos, por función
3201014|GASTOS PAGINA WEB|PERDIDA|Otros gastos, por función
3201015|GASTOS IMPRESIONES|PERDIDA|Otros gastos, por función
3201016|GASTOS ALARMA Y SEGURIDAD|PERDIDA|Otros gastos, por función
3201017|GASTOS GENERALES|PERDIDA|Gastos generales
3201018|MANTENCION Y REPARACION DE VEHICULO|PERDIDA|Otros gastos, por función
3201019|SERVICIOS INFORMATICOS|PERDIDA|Costo de ventas
3201020|GASTOS DE EMBALAJE|PERDIDA|Costo de ventas
3201021|PATENTE COMERCIAL|PERDIDA|Gastos de administración
3201022|OTROS GASTOS DE VENTA|PERDIDA|Gastos de administración
3201023|OTROS GASTOS DE ADMINISTRACION|PERDIDA|Gastos de administración
3201024|INTERESES PRESTAMO BANCARIO|PERDIDA|Costos financieros
3201025|INTERESES PRESTAMO BANCO DE CHILE|PERDIDA|Costos financieros
3201026|GASTOS FINANCIEROS|PERDIDA|Costos financieros
3201027|GASTOS BANCARIOS|PERDIDA|Costos financieros
3201028|GASTOS FOTOCOPIA|PERDIDA|Otros gastos, por función
3201029|GASTOS COMUNES|PERDIDA|Otros gastos, por función
3201030|FINIQUITOS|PERDIDA|Gastos de administración
3301001|GASTOS SEGUROS|PERDIDA|Costos financieros
3301002|COMISION TRANSBANK|PERDIDA|Costos financieros
3301003|IMPUESTO TIMBRE Y ESTAMPILLAS|PERDIDA|Otros gastos, por función
3301004|PERDIDA IVA CREDITO FISCAL|PERDIDA|Otros gastos, por función
3301005|DEPRECIACION MUEBLES Y UTILES|PERDIDA|Costo de ventas
3301006|DEPRECIACION EQUIPOS COMPUTACIONALES|PERDIDA|Costo de ventas
3301007|DEPRECIACION EQUIPOS Y HTAS.|PERDIDA|Costo de ventas
3301008|DEPRECIACION VEHICULOS|PERDIDA|Costo de ventas
3301009|DEPRECIACION INSTALACIONES|PERDIDA|Costo de ventas
3301010|DEPRECIACION MAQUINARIAS|PERDIDA|Costo de ventas
3301011|DEPRECIACION ACTIVOS EN LEASING|PERDIDA|Costo de ventas
3301012|AMORTIZACION INTANGIBLES|PERDIDA|Costo de ventas
3301013|IMPUESTO A LA RENTA|PERDIDA|Gasto por impuestos a las ganancias
3301014|INTERESES Y MULTAS|PERDIDA|Otros gastos, por función
3301015|OTROS GASTOS RECHAZADOS|PERDIDA|Otros gastos, por función
3301016|PERDIDA POR VENTA ACTIVO FIJO|PERDIDA|Otros gastos, por función
3301017|INTERESES POR LEASING|PERDIDA|Otros gastos, por función
3301018|SEGUROS|PERDIDA|Otros gastos, por función
3301019|FLETES Y GASTOS DE DESPACHO|PERDIDA|Costos de distribución
3301020|GASTOS INSUMOS DE EMBALAJE|PERDIDA|Costos de distribución
3301021|PEAJES Y TAG|PERDIDA|Costo de ventas
3301022|CORRECCION MONETARIA|PERDIDA|Falta Clasificacion
3301023|LEYES SOCIALES|PERDIDA|Gastos de administración
3301024|OTROS IMPUESTOS|PERDIDA|Costo de ventas
3301025|IVA NO RECUPERABLE|PERDIDA|Otros gastos, por función
3301026|ASESORIA EMPRESARIAL Y FINANCIERA|PERDIDA|Gastos de administración
3301027|REAJUSTE ART. 72|PERDIDA|Gasto por impuestos a las ganancias
4101001|VENTAS FACTURACION ELECTRONICA|GANANCIA|Ingresos de actividades ordinarias
4101002|VENTAS BOLETA ELECTRONICA|GANANCIA|Ingresos de actividades ordinarias
4101003|DESCUENTOS PERCIBIDOS|GANANCIA|Otros ingresos
4101004|INTERESES SOBRE VENTAS|GANANCIA|Ingresos de actividades ordinarias
4101005|OTROS INTERESE GANADOS|GANANCIA|Ingresos financieros
4101006|INGRESOS FINANCIEROS|GANANCIA|Ingresos financieros
4101007|REAJUSTES GANADOS|GANANCIA|Ingresos financieros
4101008|REAJUSTE IVA CREDITO FISCAL|GANANCIA|Otros ingresos
4101009|INGRESOS CORFO|GANANCIA|Otros ingresos
4101010|REAJUSTE PPM|GANANCIA|Otros ingresos
`;

function limpiarTexto(valor) {
  return String(valor || "").trim();
}

function normalizarTexto(valor) {
  return limpiarTexto(valor)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function obtenerTipo(tipoExcel) {
  const t = normalizarTexto(tipoExcel);

  if (t.includes("ACTIVO")) return "Activo";
  if (t.includes("PASIVO")) return "Pasivo";
  if (t.includes("PATRIMONIO")) return "Patrimonio";
  if (t.includes("GANANCIA")) return "Ganancia";
  if (t.includes("INGRESO")) return "Ingreso";
  if (t.includes("PERDIDA")) return "Pérdida";
  if (t.includes("GASTO")) return "Gasto";
  if (t.includes("COSTO")) return "Costo";

  return limpiarTexto(tipoExcel) || "Activo";
}

function obtenerNaturaleza(tipo) {
  const t = normalizarTexto(tipo);

  if (t.includes("PASIVO")) return "Acreedora";
  if (t.includes("PATRIMONIO")) return "Acreedora";
  if (t.includes("GANANCIA")) return "Acreedora";
  if (t.includes("INGRESO")) return "Acreedora";

  return "Deudora";
}

function obtenerNivel(codigo) {
  const c = limpiarTexto(codigo);

  if (c.length <= 1) return 1;
  if (c.length <= 2) return 2;
  if (c.length <= 4) return 3;
  if (c.length <= 7) return 4;

  return 5;
}

function obtenerPlanCuentasBase() {
  return PLAN_CUENTAS_BASE_TEXTO.trim()
    .split("\n")
    .map((linea) => linea.trim())
    .filter(Boolean)
    .map((linea) => {
      const [codigo, nombre, tipoExcel, clasificacion] = linea.split("|");
      const tipo = obtenerTipo(tipoExcel);

      return {
        codigo: limpiarTexto(codigo),
        nombre: limpiarTexto(nombre),
        tipo,
        clasificacion: limpiarTexto(clasificacion),
        naturaleza: obtenerNaturaleza(tipo),
        nivel: obtenerNivel(codigo),
      };
    })
    .filter((cuenta) => cuenta.codigo && cuenta.nombre && cuenta.tipo);
}

async function cargarPlanBase(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id, reemplazar } = req.body;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    const cuentasBase = obtenerPlanCuentasBase();

    if (cuentasBase.length === 0) {
      return res.status(400).json({
        error: "No hay cuentas base configuradas en el código.",
      });
    }

    await client.query("BEGIN");

    if (reemplazar === true) {
      await client.query(
        `
        DELETE FROM plan_cuentas
        WHERE empresa_id = $1
        `,
        [empresa_id]
      );
    }

    let insertadas = 0;
    let omitidas = 0;

    for (const cuenta of cuentasBase) {
      const existe = await client.query(
        `
        SELECT id
        FROM plan_cuentas
        WHERE empresa_id = $1
          AND codigo = $2
        LIMIT 1
        `,
        [empresa_id, cuenta.codigo]
      );

      if (existe.rows.length > 0) {
        omitidas++;
        continue;
      }

      await client.query(
        `
        INSERT INTO plan_cuentas
        (
          empresa_id,
          codigo,
          nombre,
          tipo,
          clasificacion,
          naturaleza,
          nivel
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        `,
        [
          empresa_id,
          cuenta.codigo,
          cuenta.nombre,
          cuenta.tipo,
          cuenta.clasificacion,
          cuenta.naturaleza,
          cuenta.nivel,
        ]
      );

      insertadas++;
    }

    await client.query("COMMIT");

    return res.json({
      mensaje: "Plan de cuentas base cargado correctamente.",
      total_base: cuentasBase.length,
      insertadas,
      omitidas,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error al cargar plan de cuentas base:", error);

    return res.status(500).json({
      error: error.message || "Error interno al cargar plan base",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  cargarPlanBase,
};
