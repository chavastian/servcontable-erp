const pool = require("../database/db");

function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
  const saldo = Number(debe || 0) - Number(haber || 0);
  const clasificacion = clasificarCuenta(cuenta);

  const resultado = {
    activo: 0,
    pasivo: 0,
    perdidas: 0,
    ganancias: 0,
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
      resultado.perdidas = saldo;
    } else {
      resultado.ganancias = Math.abs(saldo);
      resultado.tipo_balance = "ganancia";
    }
  }

  if (clasificacion === "ganancia") {
    if (saldo <= 0) {
      resultado.ganancias = Math.abs(saldo);
    } else {
      resultado.perdidas = saldo;
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

async function obtenerBalance8Columnas(req, res) {
  try {
    const { empresa_id, fecha_desde, fecha_hasta, solo_movimientos } = req.query;

    if (!empresa_id || !fecha_desde || !fecha_hasta) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, fecha_desde y fecha_hasta",
      });
    }

    const resultado = await pool.query(
      `
      SELECT
        pc.id,
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
       AND c.fecha BETWEEN $2 AND $3
       AND c.estado = 'vigente'

      WHERE pc.empresa_id = $1

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

    let filas = resultado.rows.map((cuenta) => {
      const debitos = Number(cuenta.debitos || 0);
      const creditos = Number(cuenta.creditos || 0);
      const columnas = calcularColumnasBalance(cuenta, debitos, creditos);

      let saldoDeudor = 0;
      let saldoAcreedor = 0;

      if (debitos > creditos) {
        saldoDeudor = debitos - creditos;
      }

      if (creditos > debitos) {
        saldoAcreedor = creditos - debitos;
      }

      return {
        cuenta_id: cuenta.id,
        codigo: cuenta.codigo,
        nombre: cuenta.nombre,
        tipo: cuenta.tipo,
        clasificacion: cuenta.clasificacion,
        naturaleza: cuenta.naturaleza,
        tipo_balance: columnas.tipo_balance,
        debitos,
        creditos,
        saldo_deudor: saldoDeudor,
        saldo_acreedor: saldoAcreedor,
        activo: Number(columnas.activo || 0),
        pasivo: Number(columnas.pasivo || 0),
        perdidas: Number(columnas.perdidas || 0),
        ganancias: Number(columnas.ganancias || 0),
      };
    });

    if (solo_movimientos === "true") {
      filas = filas.filter((fila) => {
        return (
          Number(fila.debitos || 0) !== 0 ||
          Number(fila.creditos || 0) !== 0 ||
          Number(fila.saldo_deudor || 0) !== 0 ||
          Number(fila.saldo_acreedor || 0) !== 0 ||
          Number(fila.activo || 0) !== 0 ||
          Number(fila.pasivo || 0) !== 0 ||
          Number(fila.perdidas || 0) !== 0 ||
          Number(fila.ganancias || 0) !== 0
        );
      });
    }

    const totales = filas.reduce(
      (acc, fila) => {
        acc.debitos += Number(fila.debitos || 0);
        acc.creditos += Number(fila.creditos || 0);
        acc.saldo_deudor += Number(fila.saldo_deudor || 0);
        acc.saldo_acreedor += Number(fila.saldo_acreedor || 0);
        acc.activo += Number(fila.activo || 0);
        acc.pasivo += Number(fila.pasivo || 0);
        acc.perdidas += Number(fila.perdidas || 0);
        acc.ganancias += Number(fila.ganancias || 0);
        return acc;
      },
      {
        debitos: 0,
        creditos: 0,
        saldo_deudor: 0,
        saldo_acreedor: 0,
        activo: 0,
        pasivo: 0,
        perdidas: 0,
        ganancias: 0,
      }
    );

    const resultadoEjercicio = totales.ganancias - totales.perdidas;

    let totalActivoFinal = totales.activo;
    let totalPasivoFinal = totales.pasivo;

    if (resultadoEjercicio > 0) {
      totalPasivoFinal += resultadoEjercicio;
    }

    if (resultadoEjercicio < 0) {
      totalActivoFinal += Math.abs(resultadoEjercicio);
    }

    return res.json({
      total: filas.length,
      filas,
      totales,
      resultado_ejercicio: resultadoEjercicio,
      total_activo_final: totalActivoFinal,
      total_pasivo_final: totalPasivoFinal,
      cuadratura: totalActivoFinal - totalPasivoFinal,
      filtros: {
        fecha_desde,
        fecha_hasta,
        solo_movimientos: solo_movimientos === "true",
      },
    });
  } catch (error) {
    console.error("Error al obtener balance 8 columnas:", error);

    return res.status(500).json({
      error: "Error interno al obtener balance 8 columnas",
    });
  }
}

module.exports = {
  obtenerBalance8Columnas,
};
