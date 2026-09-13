const pool = require("../database/db");

async function crearTrabajador(req, res) {
  try {
    const {
      empresa_id,
      rut,
      nombres,
      apellidos,
      fecha_nacimiento,
      nacionalidad,
      cargo,
      centro_costo,
      fecha_ingreso,
      fecha_termino,
      tipo_contrato,
      jornada,
      sueldo_base,
      afp,
      salud,
      tramo_asignacion,
      cargas,
      banco,
      tipo_cuenta,
      numero_cuenta,
      email,
      telefono,

      sexo,
      codigo_afp_previred,
      codigo_salud_previred,
      codigo_mutual_previred,
      regimen_previsional,
      tipo_trabajador_previred,
      tipo_contrato_previred,
      seguro_cesantia,
      movimiento_personal,
      fecha_movimiento_desde,
      fecha_movimiento_hasta,
    } = req.body;

    if (!empresa_id || !rut || !nombres || !fecha_ingreso) {
      return res.status(400).json({
        error: "Empresa, RUT, nombres y fecha de ingreso son obligatorios",
      });
    }

    const resultado = await pool.query(
      `
      INSERT INTO trabajadores
      (
        empresa_id,
        rut,
        nombres,
        apellidos,
        fecha_nacimiento,
        nacionalidad,
        cargo,
        centro_costo,
        fecha_ingreso,
        fecha_termino,
        tipo_contrato,
        jornada,
        sueldo_base,
        afp,
        salud,
        tramo_asignacion,
        cargas,
        banco,
        tipo_cuenta,
        numero_cuenta,
        email,
        telefono,

        sexo,
        codigo_afp_previred,
        codigo_salud_previred,
        codigo_mutual_previred,
        regimen_previsional,
        tipo_trabajador_previred,
        tipo_contrato_previred,
        seguro_cesantia,
        movimiento_personal,
        fecha_movimiento_desde,
        fecha_movimiento_hasta,

        estado
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
        $31,$32,$33,'activo'
      )
      RETURNING *
      `,
      [
        empresa_id,
        rut,
        nombres,
        apellidos || "",
        fecha_nacimiento || null,
        nacionalidad || "",
        cargo || "",
        centro_costo || "",
        fecha_ingreso,
        fecha_termino || null,
        tipo_contrato || "Indefinido",
        jornada || "",
        Number(sueldo_base || 0),
        afp || "",
        salud || "",
        tramo_asignacion || "",
        Number(cargas || 0),
        banco || "",
        tipo_cuenta || "",
        numero_cuenta || "",
        email || "",
        telefono || "",

        sexo || "",
        codigo_afp_previred || "",
        codigo_salud_previred || "",
        codigo_mutual_previred || "",
        regimen_previsional || "AFP",
        tipo_trabajador_previred || "0",
        tipo_contrato_previred || "1",
        seguro_cesantia || "SI",
        movimiento_personal || "0",
        fecha_movimiento_desde || null,
        fecha_movimiento_hasta || null,
      ]
    );

    return res.status(201).json({
      mensaje: "Trabajador creado correctamente",
      trabajador: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al crear trabajador:", error);

    if (error.code === "23505") {
      return res.status(400).json({
        error: "Ya existe un trabajador con ese RUT para esta empresa",
      });
    }

    return res.status(500).json({
      error: error.message || "Error interno al crear trabajador",
    });
  }
}

async function listarTrabajadores(req, res) {
  try {
    const { empresa_id, estado } = req.query;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    let query = `
      SELECT *
      FROM trabajadores
      WHERE empresa_id = $1
        AND estado <> 'eliminado'
    `;

    const valores = [empresa_id];

    if (estado) {
      query += ` AND estado = $2`;
      valores.push(estado);
    }

    query += ` ORDER BY apellidos ASC, nombres ASC`;

    const resultado = await pool.query(query, valores);

    return res.json({
      total: resultado.rows.length,
      trabajadores: resultado.rows,
    });
  } catch (error) {
    console.error("Error al listar trabajadores:", error);

    return res.status(500).json({
      error: "Error interno al listar trabajadores",
    });
  }
}

async function actualizarTrabajador(req, res) {
  try {
    const { id } = req.params;

    const {
      empresa_id,
      rut,
      nombres,
      apellidos,
      fecha_nacimiento,
      nacionalidad,
      cargo,
      centro_costo,
      fecha_ingreso,
      fecha_termino,
      tipo_contrato,
      jornada,
      sueldo_base,
      afp,
      salud,
      tramo_asignacion,
      cargas,
      banco,
      tipo_cuenta,
      numero_cuenta,
      email,
      telefono,
      estado,

      sexo,
      codigo_afp_previred,
      codigo_salud_previred,
      codigo_mutual_previred,
      regimen_previsional,
      tipo_trabajador_previred,
      tipo_contrato_previred,
      seguro_cesantia,
      movimiento_personal,
      fecha_movimiento_desde,
      fecha_movimiento_hasta,
    } = req.body;

    if (!empresa_id || !rut || !nombres || !fecha_ingreso) {
      return res.status(400).json({
        error: "Empresa, RUT, nombres y fecha de ingreso son obligatorios",
      });
    }

    const resultado = await pool.query(
      `
      UPDATE trabajadores
      SET
        rut = $1,
        nombres = $2,
        apellidos = $3,
        fecha_nacimiento = $4,
        nacionalidad = $5,
        cargo = $6,
        centro_costo = $7,
        fecha_ingreso = $8,
        fecha_termino = $9,
        tipo_contrato = $10,
        jornada = $11,
        sueldo_base = $12,
        afp = $13,
        salud = $14,
        tramo_asignacion = $15,
        cargas = $16,
        banco = $17,
        tipo_cuenta = $18,
        numero_cuenta = $19,
        email = $20,
        telefono = $21,
        estado = $22,

        sexo = $23,
        codigo_afp_previred = $24,
        codigo_salud_previred = $25,
        codigo_mutual_previred = $26,
        regimen_previsional = $27,
        tipo_trabajador_previred = $28,
        tipo_contrato_previred = $29,
        seguro_cesantia = $30,
        movimiento_personal = $31,
        fecha_movimiento_desde = $32,
        fecha_movimiento_hasta = $33

      WHERE id = $34
        AND empresa_id = $35
      RETURNING *
      `,
      [
        rut,
        nombres,
        apellidos || "",
        fecha_nacimiento || null,
        nacionalidad || "",
        cargo || "",
        centro_costo || "",
        fecha_ingreso,
        fecha_termino || null,
        tipo_contrato || "Indefinido",
        jornada || "",
        Number(sueldo_base || 0),
        afp || "",
        salud || "",
        tramo_asignacion || "",
        Number(cargas || 0),
        banco || "",
        tipo_cuenta || "",
        numero_cuenta || "",
        email || "",
        telefono || "",
        estado || "activo",

        sexo || "",
        codigo_afp_previred || "",
        codigo_salud_previred || "",
        codigo_mutual_previred || "",
        regimen_previsional || "AFP",
        tipo_trabajador_previred || "0",
        tipo_contrato_previred || "1",
        seguro_cesantia || "SI",
        movimiento_personal || "0",
        fecha_movimiento_desde || null,
        fecha_movimiento_hasta || null,

        id,
        empresa_id,
      ]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        error: "Trabajador no encontrado",
      });
    }

    return res.json({
      mensaje: "Trabajador actualizado correctamente",
      trabajador: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al actualizar trabajador:", error);

    return res.status(500).json({
      error: error.message || "Error interno al actualizar trabajador",
    });
  }
}

async function eliminarTrabajador(req, res) {
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
      UPDATE trabajadores
      SET estado = 'eliminado'
      WHERE id = $1
        AND empresa_id = $2
      RETURNING *
      `,
      [id, empresa_id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        error: "Trabajador no encontrado",
      });
    }

    return res.json({
      mensaje: "Trabajador eliminado correctamente",
      trabajador: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al eliminar trabajador:", error);

    return res.status(500).json({
      error: "Error interno al eliminar trabajador",
    });
  }
}

module.exports = {
  crearTrabajador,
  listarTrabajadores,
  actualizarTrabajador,
  eliminarTrabajador,
};