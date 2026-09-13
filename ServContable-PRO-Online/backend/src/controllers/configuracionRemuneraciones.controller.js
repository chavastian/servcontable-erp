const pool = require("../database/db");

const AFP_PREVIRED_BASE = [
  { nombre: "Capital", tasa_afp: 11.54, tasa_sis: 1.62 },
  { nombre: "Cuprum", tasa_afp: 11.54, tasa_sis: 1.62 },
  { nombre: "Habitat", tasa_afp: 11.37, tasa_sis: 1.62 },
  { nombre: "Modelo", tasa_afp: 10.68, tasa_sis: 1.62 },
  { nombre: "PlanVital", tasa_afp: 11.26, tasa_sis: 1.62 },
  { nombre: "ProVida", tasa_afp: 11.55, tasa_sis: 1.62 },
  { nombre: "UNO", tasa_afp: 10.56, tasa_sis: 1.62 },
];

const TASA_SEGURO_SOCIAL_DEFAULT = 1;

async function asegurarColumnasConfiguracionRemuneraciones(db) {
  await db.query(`
    ALTER TABLE configuracion_remuneraciones
    ADD COLUMN IF NOT EXISTS mutual_nombre VARCHAR(120) DEFAULT '',
    ADD COLUMN IF NOT EXISTS mutual_codigo_previred VARCHAR(2) DEFAULT '0',
    ADD COLUMN IF NOT EXISTS mutual_sucursal_previred VARCHAR(3) DEFAULT '0',
    ADD COLUMN IF NOT EXISTS cuenta_sis_empleador_id INTEGER,
    ADD COLUMN IF NOT EXISTS cuenta_afc_empleador_id INTEGER,
    ADD COLUMN IF NOT EXISTS cuenta_mutual_empleador_id INTEGER,
    ADD COLUMN IF NOT EXISTS cuenta_otros_descuentos_id INTEGER
  `);
}

async function asegurarColumnasAfpParametros(db) {
  await db.query(`
    ALTER TABLE afp_parametros
    ADD COLUMN IF NOT EXISTS tasa_seguro_social NUMERIC(12,4) DEFAULT ${TASA_SEGURO_SOCIAL_DEFAULT}
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

  for (const afp of AFP_PREVIRED_BASE) {
    await db.query(
      `
      INSERT INTO afp_parametros
      (
        empresa_id,
        periodo,
        nombre,
        tasa_afp,
        tasa_sis,
        tasa_seguro_social,
        activo
      )
      VALUES ($1,$2,$3,$4,$5,$6,true)
      ON CONFLICT (empresa_id, periodo, nombre)
      DO UPDATE SET
        activo = true,
        tasa_afp = EXCLUDED.tasa_afp,
        tasa_sis = EXCLUDED.tasa_sis,
        tasa_seguro_social = EXCLUDED.tasa_seguro_social,
        actualizado_en = NOW()
      `,
      [
        empresaId,
        periodo,
        afp.nombre,
        afp.tasa_afp,
        afp.tasa_sis,
        TASA_SEGURO_SOCIAL_DEFAULT,
      ]
    );
  }
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
        cuenta_otros_descuentos_id
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
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
        actualizado_en = NOW()
      RETURNING *
      `,
      [
        empresa_id,
        periodo,
        Number(tasa_salud || 0),
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
      empresa_id,
      periodo,
      nombre,
      tasa_afp,
      tasa_sis,
      tasa_seguro_social,
    } = req.body;

    if (!empresa_id || !periodo || !nombre) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, periodo y nombre AFP",
      });
    }

    await asegurarColumnasAfpParametros(pool);

    const resultado = await pool.query(
      `
      INSERT INTO afp_parametros
      (
        empresa_id,
        periodo,
        nombre,
        tasa_afp,
        tasa_sis,
        tasa_seguro_social,
        activo
      )
      VALUES ($1,$2,$3,$4,$5,$6,true)
      ON CONFLICT (empresa_id, periodo, nombre)
      DO UPDATE SET
        tasa_afp = EXCLUDED.tasa_afp,
        tasa_sis = EXCLUDED.tasa_sis,
        tasa_seguro_social = EXCLUDED.tasa_seguro_social,
        activo = true
      RETURNING *
      `,
      [
        empresa_id,
        periodo,
        nombre,
        Number(tasa_afp || 0),
        Number(tasa_sis || 0),
        Number(tasa_seguro_social ?? TASA_SEGURO_SOCIAL_DEFAULT),
      ]
    );

    return res.json({
      mensaje: "AFP guardada correctamente",
      afp: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al guardar AFP:", error);

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

async function copiarConfiguracionPeriodo(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id, periodo_origen, periodo_destino } = req.body;

    if (!empresa_id || !periodo_origen || !periodo_destino) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, periodo_origen y periodo_destino",
      });
    }

    if (periodo_origen === periodo_destino) {
      return res.status(400).json({
        error: "El período origen y destino no pueden ser iguales",
      });
    }

    await asegurarColumnasConfiguracionRemuneraciones(client);
    await asegurarColumnasAfpParametros(client);

    await client.query("BEGIN");

    const origenResult = await client.query(
      `
      SELECT *
      FROM configuracion_remuneraciones
      WHERE empresa_id = $1
        AND periodo = $2
      LIMIT 1
      `,
      [empresa_id, periodo_origen]
    );

    if (origenResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "No existe configuración para el período origen",
      });
    }

    const origen = origenResult.rows[0];

    const configResult = await client.query(
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
        cuenta_otros_descuentos_id
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28
      )
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
        actualizado_en = NOW()
      RETURNING *
      `,
      [
        empresa_id,
        periodo_destino,
        Number(origen.tasa_salud || 0),
        Number(origen.tasa_sis || 0),
        Number(origen.tasa_afc_trabajador || 0),
        Number(origen.tasa_afc_empleador || 0),
        Number(origen.tasa_mutual || 0),
        origen.mutual_nombre || "",
        origen.mutual_codigo_previred || "0",
        origen.mutual_sucursal_previred || "0",
        Number(origen.tope_imponible_uf || 0),
        Number(origen.valor_uf || 0),
        Number(origen.ingreso_minimo || 0),
        Number(origen.tramo_asignacion_a || 0),
        Number(origen.tramo_asignacion_b || 0),
        Number(origen.tramo_asignacion_c || 0),
        origen.cuenta_sueldos_id || null,
        origen.cuenta_afp_id || null,
        origen.cuenta_salud_id || null,
        origen.cuenta_afc_id || null,
        origen.cuenta_mutual_id || null,
        origen.cuenta_sueldos_por_pagar_id || null,
        origen.cuenta_banco_pago_id || null,
        origen.cuenta_impuesto_unico_id || null,
        origen.cuenta_sis_empleador_id || null,
        origen.cuenta_afc_empleador_id || null,
        origen.cuenta_mutual_empleador_id || null,
        origen.cuenta_otros_descuentos_id || null,
      ]
    );

    const afpOrigen = await client.query(
      `
      SELECT *
      FROM afp_parametros
      WHERE empresa_id = $1
        AND periodo = $2
        AND activo = true
      `,
      [empresa_id, periodo_origen]
    );

    let afpsCopiadas = 0;

    for (const afp of afpOrigen.rows) {
      await client.query(
        `
        INSERT INTO afp_parametros
        (
          empresa_id,
          periodo,
          nombre,
          tasa_afp,
          tasa_sis,
          tasa_seguro_social,
          activo
        )
        VALUES ($1,$2,$3,$4,$5,$6,true)
        ON CONFLICT (empresa_id, periodo, nombre)
        DO UPDATE SET
          tasa_afp = EXCLUDED.tasa_afp,
          tasa_sis = EXCLUDED.tasa_sis,
          tasa_seguro_social = EXCLUDED.tasa_seguro_social,
          activo = true,
          actualizado_en = NOW()
        `,
        [
          empresa_id,
          periodo_destino,
          afp.nombre,
          Number(afp.tasa_afp || 0),
          Number(afp.tasa_sis || 0),
          Number(afp.tasa_seguro_social ?? TASA_SEGURO_SOCIAL_DEFAULT),
        ]
      );

      afpsCopiadas++;
    }

    await asegurarAfpsBasePrevired(client, empresa_id, periodo_destino);

    await client.query("COMMIT");

    return res.json({
      mensaje: "Configuración de remuneraciones copiada correctamente",
      configuracion: configResult.rows[0],
      afps_copiadas: afpsCopiadas,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error al copiar configuración remuneraciones:", error);

    return res.status(500).json({
      error:
        error.message ||
        "Error interno al copiar configuración de remuneraciones",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  obtenerConfiguracionRemuneraciones,
  guardarConfiguracionRemuneraciones,
  guardarAFP,
  eliminarAFP,
  copiarConfiguracionPeriodo,
};
