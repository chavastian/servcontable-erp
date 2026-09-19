/**
 * Renta anual: determinación de la RLI, registros del artículo 14 y propuesta
 * de F22 (módulo 9).
 *
 * El F22 que sale de acá es una **propuesta con los códigos principales**, no
 * un formulario listo para presentar. Un F22 tiene cientos de códigos y los
 * cambia el SII cada año tributario por resolución; lo que el sistema puede
 * hacer honestamente es llenar los que se derivan de su propia contabilidad y
 * decir claramente que el resto lo pone el contador.
 */

const pool = require("../database/db");
const { proponerRli, construirRegistros, REGIMENES } = require("../helpers/rentaAnual.helper");
const { registrarAuditoria } = require("../helpers/auditoria.helper");

const AVISO_F22 =
  "Propuesta con los códigos principales. El F22 tiene cientos de códigos y el SII los cambia cada año tributario por resolución: esto NO es un formulario listo para presentar. REQUIERE VALIDACIÓN TRIBUTARIA.";

function responderError(res, error, mensaje) {
  return res.status(error.statusCode || 500).json({
    // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
    // columnas y restricciones. Los errores de validacion propios
    // si conservan su mensaje y su codigo.
    error: error.statusCode ? error.message : mensaje,
  });
}

function error(mensaje, statusCode) {
  return Object.assign(new Error(mensaje), { statusCode });
}

function leerAnio(valor) {
  const anio = Math.trunc(Number(valor));

  return Number.isInteger(anio) && anio >= 2000 && anio <= 2100 ? anio : null;
}

function lineasManualesDe(registro) {
  if (!registro) return [];

  const lineas = Array.isArray(registro.lineas) ? registro.lineas : [];

  return lineas.filter((linea) => linea.origen === "manual");
}

async function obtenerRenta(req, res) {
  try {
    const { empresa_id } = req.query;
    const anio = leerAnio(req.query.anio);

    if (!empresa_id || !anio) {
      return res.status(400).json({ error: "Debe indicar empresa_id y anio" });
    }

    const guardada = await pool.query(
      `SELECT * FROM rentas_anuales
       WHERE empresa_id = $1 AND anio = $2 AND estado <> 'anulada'
       LIMIT 1`,
      [empresa_id, anio]
    );

    const registro = guardada.rows[0] || null;
    // Las líneas manuales que ya se habían guardado se vuelven a aplicar: lo
    // que el sistema calcula se recalcula, lo que una persona escribió se
    // conserva.
    const propuesta = await proponerRli(pool, empresa_id, anio, lineasManualesDe(registro));

    const registros = construirRegistros({
      rli: propuesta.renta_liquida_imponible,
      depreciacion: propuesta.depreciacion,
      correccion: propuesta.correccion_monetaria,
      saldosIniciales: registro?.registros?.saldos_iniciales || {},
      regimen: propuesta.regimen?.codigo,
    });

    return res.json({
      ...propuesta,
      registros,
      renta_guardada: registro,
      regimenes_disponibles: Object.entries(REGIMENES).map(([codigo, definicion]) => ({
        codigo,
        ...definicion,
      })),
    });
  } catch (err) {
    console.error("Error al obtener la renta anual:", err);

    return responderError(res, err, "Error interno al determinar la renta anual");
  }
}

/**
 * Guarda el borrador: las líneas que la persona agregó y los saldos iniciales
 * de los registros. Lo que el sistema calcula no se guarda como dato fijo, se
 * recalcula cada vez.
 */
async function guardarRenta(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id, lineas, saldos_iniciales, criterio } = req.body;
    const anio = leerAnio(req.body.anio);

    if (!empresa_id || !anio) {
      return res.status(400).json({ error: "Debe indicar empresa_id y anio" });
    }

    const manuales = (Array.isArray(lineas) ? lineas : [])
      .filter((linea) => Number(linea.monto))
      .map((linea) => ({
        concepto: String(linea.concepto || "").slice(0, 300),
        tipo: linea.tipo === "deduccion" ? "deduccion" : "agregado",
        monto: Math.abs(Math.round(Number(linea.monto))),
        origen: "manual",
        referencia: String(linea.referencia || "").slice(0, 200),
      }));

    await client.query("BEGIN");

    const cerrada = await client.query(
      `SELECT id, estado FROM rentas_anuales
       WHERE empresa_id = $1 AND anio = $2 AND estado <> 'anulada' LIMIT 1`,
      [empresa_id, anio]
    );

    if (cerrada.rows[0]?.estado === "cerrada") {
      throw error(
        `La renta de ${anio} está cerrada. Reábrela antes de modificarla.`,
        409
      );
    }

    const propuesta = await proponerRli(client, empresa_id, anio, manuales);

    const registros = {
      saldos_iniciales: {
        RAI: Math.round(Number(saldos_iniciales?.RAI || 0)),
        DDAN: Math.round(Number(saldos_iniciales?.DDAN || 0)),
        REX: Math.round(Number(saldos_iniciales?.REX || 0)),
        SAC: Math.round(Number(saldos_iniciales?.SAC || 0)),
      },
    };

    const valores = [
      empresa_id,
      anio,
      propuesta.regimen?.codigo || null,
      propuesta.balance.resultado,
      propuesta.total_agregados,
      propuesta.total_deducciones,
      propuesta.renta_liquida_imponible,
      JSON.stringify(propuesta.lineas),
      JSON.stringify(registros),
      String(criterio || "").slice(0, 2000),
    ];

    const guardada = cerrada.rows[0]
      ? await client.query(
          `UPDATE rentas_anuales SET
             regimen = $3, resultado_balance = $4, total_agregados = $5,
             total_deducciones = $6, renta_liquida_imponible = $7,
             lineas = $8::jsonb, registros = $9::jsonb, criterio = $10,
             actualizado_en = NOW()
           WHERE empresa_id = $1 AND anio = $2 AND estado <> 'anulada'
           RETURNING *`,
          valores
        )
      : await client.query(
          `INSERT INTO rentas_anuales
             (empresa_id, anio, regimen, resultado_balance, total_agregados,
              total_deducciones, renta_liquida_imponible, lineas, registros, criterio)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)
           RETURNING *`,
          valores
        );

    await client.query("COMMIT");

    return res.json({
      mensaje: `Renta de ${anio} guardada como borrador`,
      renta: guardada.rows[0],
      renta_liquida_imponible: propuesta.renta_liquida_imponible,
      avisos: propuesta.avisos,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error al guardar la renta anual:", err);

    return responderError(res, err, "Error interno al guardar la renta anual");
  } finally {
    client.release();
  }
}

/**
 * Cierra la renta del año: exige régimen definido y criterio escrito.
 */
async function cerrarRenta(req, res) {
  try {
    const { empresa_id, criterio } = req.body;
    const anio = leerAnio(req.body.anio);

    if (!empresa_id || !anio) {
      return res.status(400).json({ error: "Debe indicar empresa_id y anio" });
    }

    const criterioLimpio = String(criterio || "").trim();

    if (criterioLimpio.length < 10) {
      return res.status(400).json({
        error:
          "Describe el criterio con que determinaste la renta (mínimo 10 caracteres). Queda guardado con la declaración.",
      });
    }

    const propuesta = await proponerRli(pool, empresa_id, anio);

    if (!propuesta.regimen) {
      return res.status(400).json({
        error:
          "La empresa no tiene régimen tributario definido. Indícalo antes de cerrar la renta: la determinación depende de él.",
      });
    }

    const resultado = await pool.query(
      `UPDATE rentas_anuales
       SET estado = 'cerrada', criterio = $3, actualizado_en = NOW()
       WHERE empresa_id = $1 AND anio = $2 AND estado = 'borrador'
       RETURNING *`,
      [empresa_id, anio, criterioLimpio]
    );

    if (resultado.rows.length === 0) {
      return res.status(400).json({
        error: "No hay una renta en borrador para este año. Guárdala antes de cerrarla.",
      });
    }

    await registrarAuditoria({
      req,
      empresaId: Number(empresa_id),
      modulo: "Renta anual",
      accion: "Cerrar renta anual",
      detalle: `Año ${anio}, RLI ${resultado.rows[0].renta_liquida_imponible}`,
      tablaAfectada: "rentas_anuales",
      registroId: Number(resultado.rows[0].id),
    });

    return res.json({
      mensaje: `Renta de ${anio} cerrada`,
      renta: resultado.rows[0],
      avisos: propuesta.avisos,
    });
  } catch (err) {
    console.error("Error al cerrar la renta anual:", err);

    return responderError(res, err, "Error interno al cerrar la renta anual");
  }
}

async function reabrirRenta(req, res) {
  try {
    const { empresa_id, motivo } = req.body;
    const anio = leerAnio(req.body.anio);

    if (!empresa_id || !anio) {
      return res.status(400).json({ error: "Debe indicar empresa_id y anio" });
    }

    if (String(motivo || "").trim().length < 5) {
      return res.status(400).json({ error: "Indica el motivo de la reapertura (mínimo 5 caracteres)." });
    }

    const resultado = await pool.query(
      `UPDATE rentas_anuales
       SET estado = 'borrador',
           criterio = CONCAT(criterio, E'\\nReapertura: ', $3::text),
           actualizado_en = NOW()
       WHERE empresa_id = $1 AND anio = $2 AND estado = 'cerrada'
       RETURNING *`,
      [empresa_id, anio, String(motivo).trim()]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: "No hay una renta cerrada de ese año." });
    }

    return res.json({ mensaje: `Renta de ${anio} reabierta`, renta: resultado.rows[0] });
  } catch (err) {
    console.error("Error al reabrir la renta anual:", err);

    return responderError(res, err, "Error interno al reabrir la renta anual");
  }
}

/**
 * Propuesta de F22 con los códigos principales.
 */
async function propuestaF22(req, res) {
  try {
    const { empresa_id } = req.query;
    const anio = leerAnio(req.query.anio);

    if (!empresa_id || !anio) {
      return res.status(400).json({ error: "Debe indicar empresa_id y anio" });
    }

    const guardada = await pool.query(
      `SELECT * FROM rentas_anuales WHERE empresa_id = $1 AND anio = $2 AND estado <> 'anulada' LIMIT 1`,
      [empresa_id, anio]
    );

    const propuesta = await proponerRli(
      pool,
      empresa_id,
      anio,
      lineasManualesDe(guardada.rows[0] || null)
    );

    // Los códigos de uso más frecuente en la primera categoría. Cada uno dice
    // de dónde sale, para que se pueda revisar contra el balance.
    const codigos = [
      {
        codigo: "628",
        concepto: "Ingresos del giro percibidos o devengados",
        valor: propuesta.balance.ingresos,
        origen: "cuentas de ingreso del año",
      },
      {
        codigo: "630",
        concepto: "Costos y gastos del giro",
        valor: propuesta.balance.costos + propuesta.balance.gastos,
        origen: "cuentas de costo y gasto del año",
      },
      {
        codigo: "636",
        concepto: "Resultado según balance",
        valor: propuesta.balance.resultado,
        origen: "ingresos menos costos y gastos",
      },
      {
        codigo: "agregados",
        concepto: "Total de agregados a la renta líquida",
        valor: propuesta.total_agregados,
        origen: "partidas marcadas como agregado",
      },
      {
        codigo: "deducciones",
        concepto: "Total de deducciones a la renta líquida",
        valor: propuesta.total_deducciones,
        origen: "partidas marcadas como deducción",
      },
      {
        codigo: "643",
        concepto: "Renta líquida imponible (o pérdida tributaria)",
        valor: propuesta.renta_liquida_imponible,
        origen: "resultado más agregados menos deducciones",
      },
      {
        codigo: "18",
        concepto: "Impuesto de primera categoría",
        valor: propuesta.impuesto_primera_categoria,
        origen: propuesta.regimen
          ? `${propuesta.regimen.tasa_primera_categoria}% sobre la renta líquida imponible`
          : "sin régimen definido no se calcula",
      },
    ];

    return res.json({
      anio_comercial: anio,
      anio_tributario: anio + 1,
      regimen: propuesta.regimen,
      codigos,
      renta_liquida_imponible: propuesta.renta_liquida_imponible,
      estado_renta: guardada.rows[0]?.estado || "sin guardar",
      avisos: [AVISO_F22, ...propuesta.avisos],
    });
  } catch (err) {
    console.error("Error al armar la propuesta de F22:", err);

    return responderError(res, err, "Error interno al armar la propuesta de F22");
  }
}

/**
 * Define el régimen tributario de la empresa, del que depende todo lo demás.
 */
async function guardarRegimen(req, res) {
  try {
    const { empresa_id, regimen } = req.body;

    if (!Object.keys(REGIMENES).includes(String(regimen))) {
      return res.status(400).json({
        error: `El régimen debe ser uno de: ${Object.keys(REGIMENES).join(", ")}`,
      });
    }

    const resultado = await pool.query(
      `UPDATE empresas SET regimen_lir = $2 WHERE id = $1 RETURNING id, razon_social, regimen_lir`,
      [empresa_id, regimen]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: "Empresa no encontrada" });
    }

    return res.json({
      mensaje: `Régimen definido: ${REGIMENES[regimen].nombre}`,
      empresa: resultado.rows[0],
      aviso: "REQUIERE VALIDACIÓN TRIBUTARIA: el régimen lo determina la situación de la empresa ante el SII.",
    });
  } catch (err) {
    console.error("Error al guardar el régimen:", err);

    return responderError(res, err, "Error interno al guardar el régimen");
  }
}

module.exports = {
  obtenerRenta,
  guardarRenta,
  cerrarRenta,
  reabrirRenta,
  propuestaF22,
  guardarRegimen,
};
