const pool = require("../database/db");

function numero(valor) {
  return Number(valor || 0);
}

function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function esCuentaPatrimonio(cuenta) {
  const codigo = String(cuenta.codigo || "").trim();
  const texto = normalizar(
    `${cuenta.tipo || ""} ${cuenta.clasificacion || ""} ${cuenta.nombre || ""}`
  );

  if (codigo.startsWith("23")) return true;
  if (texto.includes("patrimonio")) return true;
  if (texto.includes("capital")) return true;
  if (texto.includes("utilidad acumul")) return true;
  if (texto.includes("resultado acumul")) return true;

  return false;
}

function clasificarTipoCuenta(cuenta) {
  const codigo = String(cuenta.codigo || "").trim();
  const texto = normalizar(
    `${cuenta.tipo || ""} ${cuenta.clasificacion || ""} ${cuenta.nombre || ""}`
  );

  if (
    texto.includes("activo") ||
    texto.includes("pasivo") ||
    texto.includes("patrimonio")
  ) {
    return null;
  }

  if (texto.includes("costo")) return "costo";

  if (
    texto.includes("gasto") ||
    texto.includes("perdida") ||
    texto.includes("egreso") ||
    texto.includes("honorario") ||
    texto.includes("remuneracion") ||
    texto.includes("sueldo")
  ) {
    return "gasto";
  }

  if (
    texto.includes("ingreso") ||
    texto.includes("venta") ||
    texto.includes("ganancia") ||
    texto.includes("utilidad")
  ) {
    return "ingreso";
  }

  if (codigo.startsWith("4")) return "ingreso";
  if (codigo.startsWith("6")) return "costo";
  if (codigo.startsWith("3") || codigo.startsWith("5")) return "gasto";

  return null;
}

function clasificarCategoria(cuenta, tipoCuenta) {
  const codigo = String(cuenta.codigo || "").trim();
  const texto = normalizar(
    `${cuenta.tipo || ""} ${cuenta.clasificacion || ""} ${cuenta.nombre || ""}`
  );

  if (tipoCuenta === "ingreso") {
    if (texto.includes("no operacional")) return "ingresos_no_operacionales";
    if (texto.includes("operacional")) return "ingresos_operacionales";
    return "otros_ingresos_sin_clasificar";
  }

  if (tipoCuenta === "costo") {
    return "costos_operacionales";
  }

  if (tipoCuenta === "gasto") {
    if (
      texto.includes("impuesto a la renta") ||
      texto.includes("art.72") ||
      texto.includes("lir") ||
      codigo.startsWith("53")
    ) {
      return "impuesto_renta";
    }

    if (texto.includes("depreci") || texto.includes("amortiz")) {
      return "depreciacion";
    }

    if (
      codigo.startsWith("3101") ||
      texto.includes("remuneracion") ||
      texto.includes("sueldo") ||
      texto.includes("salario") ||
      texto.includes("gratificacion") ||
      texto.includes("horas extra") ||
      texto.includes("afp empleador") ||
      texto.includes("afc empleador") ||
      texto.includes("seguro cesantia") ||
      texto.includes("seguro invalidez") ||
      texto.includes("seguro accidentes") ||
      texto.includes("mutual") ||
      texto.includes("indemnizacion") ||
      texto.includes("vacacion") ||
      texto.includes("colacion") ||
      texto.includes("movilizacion") ||
      texto.includes("viatico")
    ) {
      return "gastos_administracion_ventas";
    }

    if (
      texto.includes("financier") ||
      texto.includes("interes") ||
      texto.includes("leasing") ||
      texto.includes("multa")
    ) {
      return "gastos_financieros";
    }

    if (texto.includes("no operacional")) {
      return "gastos_no_operacionales";
    }

    if (
      texto.includes("administr") ||
      texto.includes("venta") ||
      texto.includes("comercial")
    ) {
      return "gastos_administracion_ventas";
    }

    return "otros_gastos_sin_clasificar";
  }

  return null;
}

function totalCategoria(categorias, clave) {
  return (categorias[clave] || []).reduce(
    (acumulado, item) => acumulado + numero(item.monto),
    0
  );
}

function montoIngreso(cuenta) {
  const debitos = numero(cuenta.debitos);
  const creditos = numero(cuenta.creditos);
  return Math.abs(creditos - debitos);
}

function montoEgreso(cuenta) {
  const debitos = numero(cuenta.debitos);
  const creditos = numero(cuenta.creditos);
  return Math.abs(debitos - creditos);
}

function esTrue(valor) {
  const texto = String(valor || "")
    .trim()
    .toLowerCase();
  return texto === "1" || texto === "true" || texto === "si" || texto === "sí";
}

async function obtenerEstadoResultados(req, res) {
  try {
    const { empresa_id, fecha_desde, fecha_hasta, incluir_sin_movimiento } =
      req.query;

    if (!empresa_id || !fecha_desde || !fecha_hasta) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, fecha_desde y fecha_hasta",
      });
    }

    const incluirSinMovimiento = esTrue(incluir_sin_movimiento);

    const resultado = await pool.query(
      `
      SELECT
        pc.id AS cuenta_id,
        pc.codigo,
        pc.nombre,
        pc.tipo,
        pc.clasificacion,
        pc.naturaleza,

        COALESCE(SUM(
          CASE
            WHEN c.id IS NOT NULL THEN cd.debe
            ELSE 0
          END
        ), 0) AS debitos,

        COALESCE(SUM(
          CASE
            WHEN c.id IS NOT NULL THEN cd.haber
            ELSE 0
          END
        ), 0) AS creditos

      FROM plan_cuentas pc

      LEFT JOIN comprobante_detalle cd
        ON cd.cuenta_id = pc.id

      LEFT JOIN comprobantes c
        ON c.id = cd.comprobante_id
       AND c.empresa_id = pc.empresa_id
       AND c.estado = 'vigente'
       AND c.fecha BETWEEN $2 AND $3

      WHERE pc.empresa_id = $1
        AND pc.activo = true

      GROUP BY
        pc.id,
        pc.codigo,
        pc.nombre,
        pc.tipo,
        pc.clasificacion,
        pc.naturaleza

      ORDER BY pc.codigo ASC
      `,
      [empresa_id, fecha_desde, fecha_hasta]
    );

    const categorias = {
      ingresos_operacionales: [],
      otros_ingresos_sin_clasificar: [],
      costos_operacionales: [],
      gastos_administracion_ventas: [],
      depreciacion: [],
      gastos_financieros: [],
      ingresos_no_operacionales: [],
      gastos_no_operacionales: [],
      impuesto_renta: [],
      otros_gastos_sin_clasificar: [],
    };

    for (const cuenta of resultado.rows) {
      if (esCuentaPatrimonio(cuenta)) continue;

      const tipoCuenta = clasificarTipoCuenta(cuenta);
      if (!tipoCuenta) continue;

      const categoria = clasificarCategoria(cuenta, tipoCuenta);
      if (!categoria) continue;

      const debitos = numero(cuenta.debitos);
      const creditos = numero(cuenta.creditos);
      const tieneMovimiento = debitos !== 0 || creditos !== 0;

      if (!incluirSinMovimiento && !tieneMovimiento) {
        continue;
      }

      const monto = categoria.startsWith("ingresos_")
        ? montoIngreso(cuenta)
        : montoEgreso(cuenta);

      categorias[categoria].push({
        cuenta_id: cuenta.cuenta_id,
        codigo: cuenta.codigo,
        nombre: cuenta.nombre,
        tipo: cuenta.tipo,
        clasificacion: cuenta.clasificacion,
        naturaleza: cuenta.naturaleza,
        debitos,
        creditos,
        monto,
        tiene_movimiento: tieneMovimiento,
      });
    }

    const totalIngresosOperacionales = totalCategoria(
      categorias,
      "ingresos_operacionales"
    );
    const totalOtrosIngresos = totalCategoria(
      categorias,
      "otros_ingresos_sin_clasificar"
    );
    const totalIngresosNoOperacionales = totalCategoria(
      categorias,
      "ingresos_no_operacionales"
    );

    const totalCostosOperacionales = totalCategoria(
      categorias,
      "costos_operacionales"
    );

    const totalGastosAdminVentas = totalCategoria(
      categorias,
      "gastos_administracion_ventas"
    );
    const totalDepreciacion = totalCategoria(categorias, "depreciacion");
    const totalGastosFinancieros = totalCategoria(
      categorias,
      "gastos_financieros"
    );
    const totalGastosNoOperacionales = totalCategoria(
      categorias,
      "gastos_no_operacionales"
    );
    const totalImpuestoRenta = totalCategoria(categorias, "impuesto_renta");
    const totalOtrosGastos = totalCategoria(
      categorias,
      "otros_gastos_sin_clasificar"
    );

    const margenBruto =
      totalIngresosOperacionales + totalOtrosIngresos - totalCostosOperacionales;

    const gastosOperacionales = totalGastosAdminVentas + totalDepreciacion;

    const resultadoOperacional =
      margenBruto - gastosOperacionales;

    const gastosNoOperacionales = totalGastosFinancieros + totalGastosNoOperacionales;

    const resultadoAntesImpuestos =
      resultadoOperacional +
      totalIngresosNoOperacionales -
      gastosNoOperacionales;

    const resultadoEjercicio =
      resultadoAntesImpuestos - totalImpuestoRenta - totalOtrosGastos;

    const totalIngresos =
      totalIngresosOperacionales +
      totalOtrosIngresos +
      totalIngresosNoOperacionales;
    const totalCostos = totalCostosOperacionales;
    const totalGastos =
      gastosOperacionales +
      gastosNoOperacionales +
      totalOtrosGastos;

    const ingresos = [
      ...categorias.ingresos_operacionales,
      ...categorias.otros_ingresos_sin_clasificar,
      ...categorias.ingresos_no_operacionales,
    ];

    const costos = [...categorias.costos_operacionales];

    const gastos = [
      ...categorias.gastos_administracion_ventas,
      ...categorias.depreciacion,
      ...categorias.gastos_financieros,
      ...categorias.gastos_no_operacionales,
      ...categorias.impuesto_renta,
      ...categorias.otros_gastos_sin_clasificar,
    ];

    return res.json({
      categorias,
      resumen_estructura: {
        ingresos_operacionales: totalIngresosOperacionales,
        otros_ingresos_sin_clasificar: totalOtrosIngresos,
        costos_operacionales: totalCostosOperacionales,
        margen_bruto: margenBruto,
        gastos_administracion_ventas: totalGastosAdminVentas,
        depreciacion: totalDepreciacion,
        gastos_financieros: totalGastosFinancieros,
        resultado_operacional: resultadoOperacional,
        ingresos_no_operacionales: totalIngresosNoOperacionales,
        gastos_no_operacionales: totalGastosNoOperacionales,
        resultado_antes_impuestos: resultadoAntesImpuestos,
        impuesto_renta: totalImpuestoRenta,
        otros_gastos_sin_clasificar: totalOtrosGastos,
        resultado_ejercicio: resultadoEjercicio,
      },
      ingresos,
      costos,
      gastos,
      totales: {
        ingresos: totalIngresos,
        costos: totalCostos,
        gastos: totalGastos,
        impuestos: totalImpuestoRenta,
        total_ingresos: totalIngresos,
        total_costos: totalCostos,
        margen_bruto: margenBruto,
        total_gastos: totalGastos,
        total_impuestos: totalImpuestoRenta,
        resultado_ejercicio: resultadoEjercicio,
      },
      resultado_ejercicio: resultadoEjercicio,
      filtros: {
        fecha_desde,
        fecha_hasta,
        incluir_sin_movimiento: incluirSinMovimiento,
      },
    });
  } catch (error) {
    console.error("Error al obtener estado de resultados:", error);

    return res.status(500).json({
      error: "Error interno al obtener estado de resultados",
    });
  }
}

module.exports = {
  obtenerEstadoResultados,
};
