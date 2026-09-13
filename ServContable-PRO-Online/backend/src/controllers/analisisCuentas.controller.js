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

function obtenerRangoDesdePeriodo(periodo) {
  const [anioTxt, mesTxt] = String(periodo || "").split("-");
  const anio = Number(anioTxt);
  const mes = Number(mesTxt);

  if (!anio || !mes) {
    return { fechaDesde: "", fechaHasta: "" };
  }

  const mesNormalizado = String(mes).padStart(2, "0");
  const ultimoDia = String(new Date(anio, mes, 0).getDate()).padStart(2, "0");

  return {
    fechaDesde: `${anio}-${mesNormalizado}-01`,
    fechaHasta: `${anio}-${mesNormalizado}-${ultimoDia}`,
  };
}

function clasificarCuenta(cuenta) {
  const tipo = normalizar(cuenta.tipo);
  const clasificacion = normalizar(cuenta.clasificacion);
  const nombre = normalizar(cuenta.nombre);

  const texto = `${tipo} ${clasificacion} ${nombre}`;

  if (texto.includes("activo")) return "activo";
  if (texto.includes("pasivo")) return "pasivo";
  if (texto.includes("patrimonio")) return "pasivo";

  if (
    texto.includes("gasto") ||
    texto.includes("costo") ||
    texto.includes("perdida") ||
    texto.includes("egreso")
  ) {
    return "perdida";
  }

  if (
    texto.includes("ingreso") ||
    texto.includes("venta") ||
    texto.includes("ganancia") ||
    texto.includes("resultado positivo")
  ) {
    return "ganancia";
  }

  return "sin_clasificar";
}

function calcularColumnasBalance(cuenta, debe, haber) {
  const saldo = debe - haber;
  const clasificacion = clasificarCuenta(cuenta);

  const resultado = {
    activo: 0,
    pasivo: 0,
    perdida: 0,
    ganancia: 0,
    saldo,
    tipo_balance: clasificacion,
  };

  if (clasificacion === "activo") {
    if (saldo >= 0) {
      resultado.activo = saldo;
    } else {
      resultado.pasivo = Math.abs(saldo);
      resultado.tipo_balance = "pasivo";
    }
  }

  if (clasificacion === "pasivo") {
    if (saldo <= 0) {
      resultado.pasivo = Math.abs(saldo);
    } else {
      resultado.activo = saldo;
      resultado.tipo_balance = "activo";
    }
  }

  if (clasificacion === "perdida") {
    if (saldo >= 0) {
      resultado.perdida = saldo;
    } else {
      resultado.ganancia = Math.abs(saldo);
      resultado.tipo_balance = "ganancia";
    }
  }

  if (clasificacion === "ganancia") {
    if (saldo <= 0) {
      resultado.ganancia = Math.abs(saldo);
    } else {
      resultado.perdida = saldo;
      resultado.tipo_balance = "perdida";
    }
  }

  if (clasificacion === "sin_clasificar") {
    if (saldo >= 0) {
      resultado.activo = saldo;
      resultado.tipo_balance = "activo";
    } else {
      resultado.pasivo = Math.abs(saldo);
      resultado.tipo_balance = "pasivo";
    }
  }

  return resultado;
}

async function obtenerAnalisisCuentas(req, res) {
  try {
    const { empresa_id, fecha_desde, fecha_hasta, periodo, cuenta_id } = req.query;

    if (!empresa_id || (!periodo && (!fecha_desde || !fecha_hasta))) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y fecha_desde/fecha_hasta",
      });
    }

    const rangoPeriodo = obtenerRangoDesdePeriodo(periodo);
    const fechaDesde = fecha_desde || rangoPeriodo.fechaDesde;
    const fechaHasta = fecha_hasta || rangoPeriodo.fechaHasta;

    if (!fechaDesde || !fechaHasta) {
      return res.status(400).json({
        error: "Rango de fechas invalido",
      });
    }

    let query = `
      SELECT
        pc.id AS cuenta_id,
        pc.codigo,
        pc.nombre,
        pc.tipo,
        pc.clasificacion,
        pc.naturaleza,
        COALESCE(SUM(cd.debe), 0) AS total_debe,
        COALESCE(SUM(cd.haber), 0) AS total_haber
      FROM plan_cuentas pc
      LEFT JOIN comprobante_detalle cd
        ON cd.cuenta_id = pc.id
      LEFT JOIN comprobantes c
        ON c.id = cd.comprobante_id
        AND c.empresa_id = pc.empresa_id
        AND c.fecha >= $2
        AND c.fecha <= $3
        AND c.estado = 'vigente'
      WHERE pc.empresa_id = $1
    `;

    const valores = [empresa_id, fechaDesde, fechaHasta];
    let posicion = 4;

    if (cuenta_id && cuenta_id !== "undefined" && cuenta_id !== "null") {
      query += ` AND pc.id = $${posicion}`;
      valores.push(cuenta_id);
      posicion++;
    }

    query += `
      GROUP BY
        pc.id,
        pc.codigo,
        pc.nombre,
        pc.tipo,
        pc.clasificacion,
        pc.naturaleza
      HAVING
        COALESCE(SUM(cd.debe), 0) <> 0
        OR COALESCE(SUM(cd.haber), 0) <> 0
      ORDER BY pc.codigo ASC
    `;

    const resultado = await pool.query(query, valores);

    const cuentas = resultado.rows.map((item) => {
      const debe = numero(item.total_debe);
      const haber = numero(item.total_haber);
      const columnas = calcularColumnasBalance(item, debe, haber);

      return {
        cuenta_id: item.cuenta_id,
        codigo: item.codigo,
        nombre: item.nombre,
        tipo: item.tipo,
        clasificacion: item.clasificacion,
        naturaleza: item.naturaleza,
        total_debe: debe,
        total_haber: haber,
        saldo: columnas.saldo,
        activo: columnas.activo,
        pasivo: columnas.pasivo,
        perdida: columnas.perdida,
        ganancia: columnas.ganancia,
        tipo_balance: columnas.tipo_balance,
      };
    });

    const totales = cuentas.reduce(
      (acc, item) => {
        acc.total_debe += numero(item.total_debe);
        acc.total_haber += numero(item.total_haber);
        acc.saldo += numero(item.saldo);
        acc.activo += numero(item.activo);
        acc.pasivo += numero(item.pasivo);
        acc.perdida += numero(item.perdida);
        acc.ganancia += numero(item.ganancia);
        return acc;
      },
      {
        total_debe: 0,
        total_haber: 0,
        saldo: 0,
        activo: 0,
        pasivo: 0,
        perdida: 0,
        ganancia: 0,
      }
    );

    return res.json({
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      cuentas,
      totales,
    });
  } catch (error) {
    console.error("Error al obtener analisis de cuentas:", error);

    return res.status(500).json({
      error: error.message || "Error interno al obtener analisis de cuentas",
    });
  }
}

async function obtenerMovimientosCuentaAnalisis(req, res) {
  try {
    const { empresa_id, fecha_desde, fecha_hasta, periodo, cuenta_id } = req.query;

    if (!empresa_id || !cuenta_id || (!periodo && (!fecha_desde || !fecha_hasta))) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, cuenta_id y fecha_desde/fecha_hasta",
      });
    }

    const rangoPeriodo = obtenerRangoDesdePeriodo(periodo);
    const fechaDesde = fecha_desde || rangoPeriodo.fechaDesde;
    const fechaHasta = fecha_hasta || rangoPeriodo.fechaHasta;

    if (!fechaDesde || !fechaHasta) {
      return res.status(400).json({
        error: "Rango de fechas invalido",
      });
    }

    const cuentaResult = await pool.query(
      `
      SELECT
        id,
        codigo,
        nombre,
        tipo,
        clasificacion,
        naturaleza
      FROM plan_cuentas
      WHERE id = $1
        AND empresa_id = $2
      LIMIT 1
      `,
      [cuenta_id, empresa_id]
    );

    if (cuentaResult.rows.length === 0) {
      return res.status(404).json({
        error: "Cuenta contable no encontrada",
      });
    }

    const cuenta = cuentaResult.rows[0];

    const movimientosResult = await pool.query(
      `
      SELECT
        cd.id AS detalle_id,
        cd.comprobante_id,
        c.fecha,
        c.periodo,
        c.tipo,
        c.numero,
        c.glosa AS glosa_comprobante,
        cd.glosa AS glosa_detalle,
        cd.debe,
        cd.haber
      FROM comprobante_detalle cd
      INNER JOIN comprobantes c
        ON c.id = cd.comprobante_id
      WHERE c.empresa_id = $1
        AND c.fecha >= $2
        AND c.fecha <= $3
        AND cd.cuenta_id = $4
        AND c.estado = 'vigente'
      ORDER BY c.fecha ASC, c.numero ASC, cd.id ASC
      `,
      [empresa_id, fechaDesde, fechaHasta, cuenta_id]
    );

    let saldoAcumulado = 0;

    const movimientos = movimientosResult.rows.map((item) => {
      const debe = numero(item.debe);
      const haber = numero(item.haber);

      saldoAcumulado += debe - haber;

      return {
        ...item,
        debe,
        haber,
        saldo_acumulado: saldoAcumulado,
      };
    });

    const totales = movimientos.reduce(
      (acc, item) => {
        acc.total_debe += numero(item.debe);
        acc.total_haber += numero(item.haber);
        return acc;
      },
      {
        total_debe: 0,
        total_haber: 0,
      }
    );

    totales.saldo = totales.total_debe - totales.total_haber;

    return res.json({
      cuenta,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      movimientos,
      totales,
    });
  } catch (error) {
    console.error("Error al obtener movimientos de cuenta:", error);

    return res.status(500).json({
      error: error.message || "Error interno al obtener movimientos de cuenta",
    });
  }
}

module.exports = {
  obtenerAnalisisCuentas,
  obtenerMovimientosCuentaAnalisis,
};
