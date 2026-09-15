const pool = require("../database/db");
const {
  INDICADORES_PREVISIONALES_BASE,
  obtenerDiagnosticoPdfParser,
  parsearIndicadoresPrevisionalesDesdeBuffer,
} = require("../helpers/indicadoresPrevisionales.helper");

const AFP_PREVIRED_BASE = [
  {
    nombre: "Capital",
    tasa_afp: 11.44,
    tasa_empleador: 0.1,
    tasa_total: 11.54,
    tasa_independiente: 12.98,
    tasa_sis: 1.54,
  },
  {
    nombre: "Cuprum",
    tasa_afp: 11.44,
    tasa_empleador: 0.1,
    tasa_total: 11.54,
    tasa_independiente: 12.98,
    tasa_sis: 1.54,
  },
  {
    nombre: "Habitat",
    tasa_afp: 11.27,
    tasa_empleador: 0.1,
    tasa_total: 11.37,
    tasa_independiente: 12.81,
    tasa_sis: 1.54,
  },
  {
    nombre: "Modelo",
    tasa_afp: 10.58,
    tasa_empleador: 0.1,
    tasa_total: 10.68,
    tasa_independiente: 12.12,
    tasa_sis: 1.54,
  },
  {
    nombre: "PlanVital",
    tasa_afp: 11.16,
    tasa_empleador: 0.1,
    tasa_total: 11.26,
    tasa_independiente: 12.7,
    tasa_sis: 1.54,
  },
  {
    nombre: "Provida",
    tasa_afp: 11.45,
    tasa_empleador: 0.1,
    tasa_total: 11.55,
    tasa_independiente: 12.99,
    tasa_sis: 1.54,
  },
  {
    nombre: "Uno",
    tasa_afp: 10.46,
    tasa_empleador: 0.1,
    tasa_total: 10.56,
    tasa_independiente: 12,
    tasa_sis: 1.54,
  },
];

const TASA_SEGURO_SOCIAL_DEFAULT = 1;
const SALUD_FONASA_LEGAL = 7;
const SALUD_CCAF_PREVIRED_DEFECTO = 3.1;
const SALUD_FONASA_CCAF_PREVIRED_DEFECTO = 3.9;

async function asegurarColumnasConfiguracionRemuneraciones(db) {
  await db.query(`
    ALTER TABLE configuracion_remuneraciones
    ADD COLUMN IF NOT EXISTS mutual_nombre VARCHAR(120) DEFAULT '',
    ADD COLUMN IF NOT EXISTS mutual_codigo_previred VARCHAR(2) DEFAULT '0',
    ADD COLUMN IF NOT EXISTS mutual_sucursal_previred VARCHAR(3) DEFAULT '0',
    ADD COLUMN IF NOT EXISTS cuenta_sis_empleador_id INTEGER,
    ADD COLUMN IF NOT EXISTS cuenta_afc_empleador_id INTEGER,
    ADD COLUMN IF NOT EXISTS cuenta_mutual_empleador_id INTEGER,
    ADD COLUMN IF NOT EXISTS cuenta_otros_descuentos_id INTEGER,
    ADD COLUMN IF NOT EXISTS indicadores_previsionales JSONB DEFAULT '{}'::jsonb
  `);
}

async function asegurarColumnasAfpParametros(db) {
  await db.query(`
    ALTER TABLE afp_parametros
    ADD COLUMN IF NOT EXISTS tasa_seguro_social NUMERIC(12,4) DEFAULT ${TASA_SEGURO_SOCIAL_DEFAULT},
    ADD COLUMN IF NOT EXISTS tasa_empleador NUMERIC(12,4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tasa_total NUMERIC(12,4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tasa_independiente NUMERIC(12,4) DEFAULT 0
  `);

  await db.query(`
    ALTER TABLE afp_parametros
    ALTER COLUMN tasa_seguro_social SET DEFAULT ${TASA_SEGURO_SOCIAL_DEFAULT}
  `);

  await db.query(
    `
    UPDATE afp_parametros
    SET tasa_seguro_social = $1
    WHERE tasa_seguro_social IS NULL
    `,
    [TASA_SEGURO_SOCIAL_DEFAULT]
  );
}

async function asegurarAfpsBasePrevired(db, empresaId, periodo) {
  await asegurarColumnasAfpParametros(db);

  const existentes = await db.query(
    `
    SELECT COUNT(*)::int AS total
    FROM afp_parametros
    WHERE empresa_id = $1
      AND periodo = $2
    `,
    [empresaId, periodo]
  );

  if (Number(existentes.rows[0]?.total || 0) > 0) {
    return;
  }

  for (const afp of AFP_PREVIRED_BASE) {
    await db.query(
      `
      INSERT INTO afp_parametros
      (
        empresa_id,
        periodo,
        nombre,
        tasa_afp,
        tasa_empleador,
        tasa_total,
        tasa_independiente,
        tasa_sis,
        tasa_seguro_social,
        activo
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
      ON CONFLICT (empresa_id, periodo, nombre)
      DO NOTHING
      `,
      [
        empresaId,
        periodo,
        afp.nombre,
        afp.tasa_afp,
        afp.tasa_empleador,
        afp.tasa_total,
        afp.tasa_independiente,
        afp.tasa_sis,
        TASA_SEGURO_SOCIAL_DEFAULT,
      ]
    );
  }
}

function numeroParametro(valor, valorDefecto = 0) {
  const numero = Number(String(valor ?? valorDefecto).replace(",", "."));
  return Number.isFinite(numero) ? numero : valorDefecto;
}

function booleanoParametro(valor) {
  if (valor === true) return true;
  if (valor === false || valor === null || valor === undefined) return false;

  return ["si", "sí", "true", "1", "s"].includes(
    String(valor).trim().toLowerCase()
  );
}

function redondearPorcentaje(valor) {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? Math.max(0, Number(numero.toFixed(4))) : 0;
}

function normalizarIndicadoresSalud(valor = {}) {
  const indicadores = {
    ...INDICADORES_PREVISIONALES_BASE,
    ...valor,
  };
  const aplicaCcaf = booleanoParametro(indicadores.aplica_ccaf);
  const ccafLeido = numeroParametro(indicadores.distribucion_salud_ccaf);
  const fonasaLeido = numeroParametro(indicadores.distribucion_salud_fonasa);
  const tieneDistribucionCcaf =
    ccafLeido > 0 ||
    (fonasaLeido > 0 && fonasaLeido !== SALUD_FONASA_LEGAL);
  const ccafPrevired = tieneDistribucionCcaf
    ? ccafLeido || SALUD_CCAF_PREVIRED_DEFECTO
    : numeroParametro(indicadores.distribucion_salud_ccaf_previred) ||
      SALUD_CCAF_PREVIRED_DEFECTO;
  const fonasaPrevired = tieneDistribucionCcaf
    ? fonasaLeido || redondearPorcentaje(SALUD_FONASA_LEGAL - ccafPrevired)
    : numeroParametro(indicadores.distribucion_salud_fonasa_previred) ||
      redondearPorcentaje(SALUD_FONASA_LEGAL - ccafPrevired) ||
      SALUD_FONASA_CCAF_PREVIRED_DEFECTO;

  if (!aplicaCcaf) {
    return {
      ...indicadores,
      aplica_ccaf: false,
      distribucion_salud_ccaf: 0,
      distribucion_salud_fonasa: SALUD_FONASA_LEGAL,
      distribucion_salud_ccaf_previred: redondearPorcentaje(ccafPrevired),
      distribucion_salud_fonasa_previred: redondearPorcentaje(fonasaPrevired),
    };
  }

  const usaValoresSinCcaf =
    ccafLeido === 0 && fonasaLeido === SALUD_FONASA_LEGAL;
  const ccaf = usaValoresSinCcaf
    ? ccafPrevired
    : ccafLeido || ccafPrevired;
  const fonasa = usaValoresSinCcaf
    ? fonasaPrevired
    : fonasaLeido ||
      redondearPorcentaje(SALUD_FONASA_LEGAL - ccaf) ||
      fonasaPrevired;

  return {
    ...indicadores,
    aplica_ccaf: true,
    distribucion_salud_ccaf: redondearPorcentaje(ccaf),
    distribucion_salud_fonasa: redondearPorcentaje(fonasa),
    distribucion_salud_ccaf_previred: redondearPorcentaje(ccaf),
    distribucion_salud_fonasa_previred: redondearPorcentaje(fonasa),
  };
}

function indicadoresPrevisionalesJson(valor) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return JSON.stringify(normalizarIndicadoresSalud());
  }

  return JSON.stringify(normalizarIndicadoresSalud(valor));
}

async function obtenerConfiguracionRemuneraciones(req, res) {
  try {
    const { empresa_id, periodo } = req.query;

    if (!empresa_id || !periodo) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y periodo",
      });
    }

    await asegurarColumnasConfiguracionRemuneraciones(pool);
    await asegurarColumnasAfpParametros(pool);

    const configResult = await pool.query(
      `
      SELECT *
      FROM configuracion_remuneraciones
      WHERE empresa_id = $1
        AND periodo = $2
      `,
      [empresa_id, periodo]
    );

    await asegurarAfpsBasePrevired(pool, empresa_id, periodo);

    const afpResult = await pool.query(
      `
      SELECT *
      FROM afp_parametros
      WHERE empresa_id = $1
        AND periodo = $2
        AND activo = true
      ORDER BY nombre ASC
      `,
      [empresa_id, periodo]
    );

    return res.json({
      configuracion: configResult.rows[0] || null,
      afps: afpResult.rows,
    });
  } catch (error) {
    console.error("Error al obtener configuración remuneraciones:", error);

    return res.status(500).json({
      error: "Error interno al obtener configuración remuneraciones",
    });
  }
}

async function guardarConfiguracionRemuneraciones(req, res) {
  try {
    const {
      empresa_id,
      periodo,

      tasa_sis,
      tasa_afc_trabajador,
      tasa_afc_empleador,
      tasa_mutual,
      mutual_nombre,
      mutual_codigo_previred,
      mutual_sucursal_previred,

      tope_imponible_uf,
      valor_uf,
      ingreso_minimo,

      tramo_asignacion_a,
      tramo_asignacion_b,
      tramo_asignacion_c,

      cuenta_sueldos_id,
      cuenta_afp_id,
      cuenta_salud_id,
      cuenta_afc_id,
      cuenta_mutual_id,
      cuenta_sueldos_por_pagar_id,
      cuenta_banco_pago_id,
      cuenta_impuesto_unico_id,
      cuenta_sis_empleador_id,
      cuenta_afc_empleador_id,
      cuenta_mutual_empleador_id,
      cuenta_otros_descuentos_id,
      indicadores_previsionales,
    } = req.body;

    if (!empresa_id || !periodo) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y periodo",
      });
    }

    await asegurarColumnasConfiguracionRemuneraciones(pool);

    const resultado = await pool.query(
      `
      INSERT INTO configuracion_remuneraciones
      (
        empresa_id,
        periodo,
        tasa_salud,
        tasa_sis,
        tasa_afc_trabajador,
        tasa_afc_empleador,
        tasa_mutual,
        mutual_nombre,
        mutual_codigo_previred,
        mutual_sucursal_previred,
        tope_imponible_uf,
        valor_uf,
        ingreso_minimo,
        tramo_asignacion_a,
        tramo_asignacion_b,
        tramo_asignacion_c,
        cuenta_sueldos_id,
        cuenta_afp_id,
        cuenta_salud_id,
        cuenta_afc_id,
        cuenta_mutual_id,
        cuenta_sueldos_por_pagar_id,
        cuenta_banco_pago_id,
        cuenta_impuesto_unico_id,
        cuenta_sis_empleador_id,
        cuenta_afc_empleador_id,
        cuenta_mutual_empleador_id,
        cuenta_otros_descuentos_id,
        indicadores_previsionales
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29::jsonb)
      ON CONFLICT (empresa_id, periodo)
      DO UPDATE SET
        tasa_salud = EXCLUDED.tasa_salud,
        tasa_sis = EXCLUDED.tasa_sis,
        tasa_afc_trabajador = EXCLUDED.tasa_afc_trabajador,
        tasa_afc_empleador = EXCLUDED.tasa_afc_empleador,
        tasa_mutual = EXCLUDED.tasa_mutual,
        mutual_nombre = EXCLUDED.mutual_nombre,
        mutual_codigo_previred = EXCLUDED.mutual_codigo_previred,
        mutual_sucursal_previred = EXCLUDED.mutual_sucursal_previred,
        tope_imponible_uf = EXCLUDED.tope_imponible_uf,
        valor_uf = EXCLUDED.valor_uf,
        ingreso_minimo = EXCLUDED.ingreso_minimo,
        tramo_asignacion_a = EXCLUDED.tramo_asignacion_a,
        tramo_asignacion_b = EXCLUDED.tramo_asignacion_b,
        tramo_asignacion_c = EXCLUDED.tramo_asignacion_c,
        cuenta_sueldos_id = EXCLUDED.cuenta_sueldos_id,
        cuenta_afp_id = EXCLUDED.cuenta_afp_id,
        cuenta_salud_id = EXCLUDED.cuenta_salud_id,
        cuenta_afc_id = EXCLUDED.cuenta_afc_id,
        cuenta_mutual_id = EXCLUDED.cuenta_mutual_id,
        cuenta_sueldos_por_pagar_id = EXCLUDED.cuenta_sueldos_por_pagar_id,
        cuenta_banco_pago_id = EXCLUDED.cuenta_banco_pago_id,
        cuenta_impuesto_unico_id = EXCLUDED.cuenta_impuesto_unico_id,
        cuenta_sis_empleador_id = EXCLUDED.cuenta_sis_empleador_id,
        cuenta_afc_empleador_id = EXCLUDED.cuenta_afc_empleador_id,
        cuenta_mutual_empleador_id = EXCLUDED.cuenta_mutual_empleador_id,
        cuenta_otros_descuentos_id = EXCLUDED.cuenta_otros_descuentos_id,
        indicadores_previsionales = EXCLUDED.indicadores_previsionales,
        actualizado_en = NOW()
      RETURNING *
      `,
      [
        empresa_id,
        periodo,
        SALUD_FONASA_LEGAL,
        Number(tasa_sis || 0),
        Number(tasa_afc_trabajador || 0),
        Number(tasa_afc_empleador || 0),
        Number(tasa_mutual || 0),
        mutual_nombre || "",
        mutual_codigo_previred || "0",
        mutual_sucursal_previred || "0",
        Number(tope_imponible_uf || 0),
        Number(valor_uf || 0),
        Number(ingreso_minimo || 0),
        Number(tramo_asignacion_a || 0),
        Number(tramo_asignacion_b || 0),
        Number(tramo_asignacion_c || 0),
        cuenta_sueldos_id || null,
        cuenta_afp_id || null,
        cuenta_salud_id || null,
        cuenta_afc_id || null,
        cuenta_mutual_id || null,
        cuenta_sueldos_por_pagar_id || null,
        cuenta_banco_pago_id || null,
        cuenta_impuesto_unico_id || null,
        cuenta_sis_empleador_id || null,
        cuenta_afc_empleador_id || null,
        cuenta_mutual_empleador_id || null,
        cuenta_otros_descuentos_id || null,
        indicadoresPrevisionalesJson(indicadores_previsionales),
       ]
     );

    return res.json({
      mensaje: "Configuración de remuneraciones guardada correctamente",
      configuracion: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al guardar configuración remuneraciones:", error);

    return res.status(500).json({
      error: error.message || "Error interno al guardar configuración remuneraciones",
    });
  }
}

async function guardarAFP(req, res) {
  try {
    const {
      id,
      empresa_id,
      periodo,
      nombre,
      tasa_afp,
      tasa_empleador,
      tasa_total,
      tasa_independiente,
      tasa_sis,
      tasa_seguro_social,
    } = req.body;

    const nombreNormalizado = String(nombre || "").trim();

    if (!empresa_id || !periodo || !nombreNormalizado) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, periodo y nombre AFP",
      });
    }

    await asegurarColumnasAfpParametros(pool);

    const valores = {
      tasaAfp: numeroParametro(tasa_afp),
      tasaEmpleador: numeroParametro(tasa_empleador),
      tasaTotal: numeroParametro(tasa_total),
      tasaIndependiente: numeroParametro(tasa_independiente),
      tasaSis: numeroParametro(tasa_sis),
      tasaSeguroSocial: numeroParametro(
        tasa_seguro_social,
        TASA_SEGURO_SOCIAL_DEFAULT
      ),
    };

    let resultado;

    if (id) {
      resultado = await pool.query(
        `
        UPDATE afp_parametros
        SET
          nombre = $4,
          tasa_afp = $5,
          tasa_sis = $6,
          tasa_seguro_social = $7,
          tasa_empleador = $8,
          tasa_total = $9,
          tasa_independiente = $10,
          activo = true,
          actualizado_en = NOW()
        WHERE id = $1
          AND empresa_id = $2
          AND periodo = $3
        RETURNING *
        `,
        [
          id,
          empresa_id,
          periodo,
          nombreNormalizado,
          valores.tasaAfp,
          valores.tasaSis,
          valores.tasaSeguroSocial,
          valores.tasaEmpleador,
          valores.tasaTotal,
          valores.tasaIndependiente,
        ]
      );

      if (resultado.rows.length === 0) {
        return res.status(404).json({
          error: "AFP no encontrada",
        });
      }
    } else {
      resultado = await pool.query(
        `
        INSERT INTO afp_parametros
        (
          empresa_id,
          periodo,
          nombre,
          tasa_afp,
          tasa_empleador,
          tasa_total,
          tasa_independiente,
          tasa_sis,
          tasa_seguro_social,
          activo
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
        ON CONFLICT (empresa_id, periodo, nombre)
        DO UPDATE SET
          tasa_afp = EXCLUDED.tasa_afp,
          tasa_empleador = EXCLUDED.tasa_empleador,
          tasa_total = EXCLUDED.tasa_total,
          tasa_independiente = EXCLUDED.tasa_independiente,
          tasa_sis = EXCLUDED.tasa_sis,
          tasa_seguro_social = EXCLUDED.tasa_seguro_social,
          activo = true,
          actualizado_en = NOW()
        RETURNING *
        `,
        [
          empresa_id,
          periodo,
          nombreNormalizado,
          valores.tasaAfp,
          valores.tasaEmpleador,
          valores.tasaTotal,
          valores.tasaIndependiente,
          valores.tasaSis,
          valores.tasaSeguroSocial,
        ]
      );
    }

    return res.json({
      mensaje: id
        ? "AFP actualizada correctamente"
        : "AFP guardada correctamente",
      afp: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al guardar AFP:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        error: "Ya existe una AFP con ese nombre para el período",
      });
    }

    return res.status(500).json({
      error: error.message || "Error interno al guardar AFP",
    });
  }
}

async function eliminarAFP(req, res) {
  try {
    const { id } = req.params;
    const { empresa_id } = req.body;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    const resultado = await pool.query(
      `
      UPDATE afp_parametros
      SET activo = false
      WHERE id = $1
        AND empresa_id = $2
      RETURNING *
      `,
      [id, empresa_id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        error: "AFP no encontrada",
      });
    }

    return res.json({
      mensaje: "AFP eliminada correctamente",
      afp: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al eliminar AFP:", error);

    return res.status(500).json({
      error: "Error interno al eliminar AFP",
    });
  }
}

async function importarIndicadoresPrevisionales(req, res) {
  try {
    const { empresa_id, periodo } = {
      ...req.query,
      ...req.body,
    };

    if (!empresa_id || !periodo) {
      return res.status(400).json({
        error: "Debe indicar empresa_id y periodo",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "Debe adjuntar el archivo de indicadores previsionales",
      });
    }

    if (process.env.NODE_ENV !== "production") {
      console.info("Importando PDF indicadores Previred", {
        archivo: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        pdfParser: obtenerDiagnosticoPdfParser(),
      });
    }

    const resultado = await parsearIndicadoresPrevisionalesDesdeBuffer(req.file);
    const advertencias = [];

    if (
      resultado.indicadores.periodo_remuneracion &&
      resultado.indicadores.periodo_remuneracion !== periodo
    ) {
      advertencias.push(
        `El archivo corresponde a remuneraciones ${resultado.indicadores.periodo_remuneracion}, pero la pantalla está en ${periodo}.`
      );
    }

    return res.json({
      mensaje:
        "Indicadores previsionales importados al formulario. Revisa los datos y presiona Guardar para dejarlos registrados.",
      indicadores: resultado.indicadores,
      configuracion: resultado.configuracion,
      afps: resultado.afps,
      advertencias,
    });
  } catch (error) {
    console.error("Error al importar indicadores previsionales:", {
      mensaje: error.message,
      nombre: error.name,
      archivo: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size,
      pdfParser: obtenerDiagnosticoPdfParser(),
    });

    const statusCode = error.expose ? error.statusCode || 400 : 500;
    const mensajeSeguro = error.expose
      ? error.message
      : "No fue posible leer el PDF de Previred. Verifica que corresponda al archivo de Indicadores Previsionales del periodo seleccionado.";

    return res.status(statusCode).json({
      error: mensajeSeguro,
    });
  }
}

module.exports = {
  obtenerConfiguracionRemuneraciones,
  guardarConfiguracionRemuneraciones,
  guardarAFP,
  eliminarAFP,
  importarIndicadoresPrevisionales,
};
