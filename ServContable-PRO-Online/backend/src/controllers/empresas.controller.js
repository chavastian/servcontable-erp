const pool = require("../database/db");
const {
  esAdminSistema,
  obtenerEmpresasPermitidas,
  asignarUsuarioEmpresa,
  usuarioPuedeAdministrarEmpresa,
} = require("../helpers/auth.helper");
const { registrarAuditoria } = require("../helpers/auditoria.helper");

async function asegurarColumnasEmpresas(client) {
  await client.query(`
    ALTER TABLE empresas
      ADD COLUMN IF NOT EXISTS telefono VARCHAR(80),
      ADD COLUMN IF NOT EXISTS correo VARCHAR(180),
      ADD COLUMN IF NOT EXISTS descripcion_actividad TEXT,
      ADD COLUMN IF NOT EXISTS rut_representante VARCHAR(30),
      ADD COLUMN IF NOT EXISTS representante_legal VARCHAR(180),
      ADD COLUMN IF NOT EXISTS correo_representante VARCHAR(180),
      ADD COLUMN IF NOT EXISTS telefono_representante VARCHAR(80)
  `);
}

async function crearEmpresa(req, res) {
  const client = await pool.connect();
  let transaccionIniciada = false;

  try {
    const {
      rut,
      razon_social,
      giro,
      direccion,
      comuna,
      ciudad,
      regimen_tributario,
      telefono,
      correo,
      descripcion_actividad,
      rut_representante,
      representante_legal,
      correo_representante,
      telefono_representante,
    } = req.body;

    if (!rut || !razon_social) {
      return res.status(400).json({
        error: "RUT y razon social son obligatorios",
      });
    }

    await asegurarColumnasEmpresas(client);
    await client.query("BEGIN");
    transaccionIniciada = true;

    const nuevaEmpresa = await client.query(
      `INSERT INTO empresas
       (
         rut,
         razon_social,
         giro,
         direccion,
         comuna,
         ciudad,
         regimen_tributario,
         telefono,
         correo,
         descripcion_actividad,
         rut_representante,
         representante_legal,
         correo_representante,
         telefono_representante
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        rut,
        razon_social,
        giro || "",
        direccion || "",
        comuna || "",
        ciudad || "",
        regimen_tributario || "",
        telefono || "",
        correo || "",
        descripcion_actividad || "",
        rut_representante || "",
        representante_legal || "",
        correo_representante || "",
        telefono_representante || "",
      ]
    );

    const empresaCreada = nuevaEmpresa.rows[0];

    if (!esAdminSistema(req.usuario?.rol)) {
      await asignarUsuarioEmpresa(client, req.usuario.id, empresaCreada.id, "admin");
    }

    await client.query("COMMIT");
    transaccionIniciada = false;

    return res.status(201).json({
      mensaje: "Empresa creada correctamente",
      empresa: empresaCreada,
    });
  } catch (error) {
    if (transaccionIniciada) {
      await client.query("ROLLBACK");
    }

    console.error("Error al crear empresa:", error);

    return res.status(500).json({
      error: "Error interno al crear empresa",
    });
  } finally {
    client.release();
  }
}

async function listarEmpresas(req, res) {
  try {
    await asegurarColumnasEmpresas(pool);
    const empresas = await obtenerEmpresasPermitidas(pool, req.usuario);

    return res.json({
      total: empresas.length,
      empresas,
    });
  } catch (error) {
    console.error("Error al listar empresas:", error);

    return res.status(500).json({
      error: "Error interno al listar empresas",
    });
  }
}

async function actualizarEmpresa(req, res) {
  const client = await pool.connect();
  let transaccionIniciada = false;

  try {
    const empresaId = Number(req.params.id);

    if (!empresaId) {
      return res.status(400).json({
        error: "Empresa invalida",
      });
    }

    const puedeAdministrar = await usuarioPuedeAdministrarEmpresa(
      client,
      req.usuario,
      empresaId
    );

    if (!puedeAdministrar) {
      return res.status(403).json({
        error: "No tienes permisos para editar esta empresa",
      });
    }

    const {
      rut,
      razon_social,
      giro,
      direccion,
      comuna,
      ciudad,
      regimen_tributario,
      telefono,
      correo,
      descripcion_actividad,
      rut_representante,
      representante_legal,
      correo_representante,
      telefono_representante,
    } = req.body;

    if (!rut || !razon_social) {
      return res.status(400).json({
        error: "RUT y razon social son obligatorios",
      });
    }

    await asegurarColumnasEmpresas(client);
    await client.query("BEGIN");
    transaccionIniciada = true;

    const empresaActualizada = await client.query(
      `UPDATE empresas
       SET rut = $1,
           razon_social = $2,
           giro = $3,
           direccion = $4,
           comuna = $5,
           ciudad = $6,
           regimen_tributario = $7,
           telefono = $8,
           correo = $9,
           descripcion_actividad = $10,
           rut_representante = $11,
           representante_legal = $12,
           correo_representante = $13,
           telefono_representante = $14
       WHERE id = $15
         AND activa = true
       RETURNING *`,
      [
        rut,
        razon_social,
        giro || "",
        direccion || "",
        comuna || "",
        ciudad || "",
        regimen_tributario || "",
        telefono || "",
        correo || "",
        descripcion_actividad || "",
        rut_representante || "",
        representante_legal || "",
        correo_representante || "",
        telefono_representante || "",
        empresaId,
      ]
    );

    if (empresaActualizada.rows.length === 0) {
      await client.query("ROLLBACK");
      transaccionIniciada = false;

      return res.status(404).json({
        error: "Empresa no encontrada",
      });
    }

    await registrarAuditoria({
      client,
      req,
      empresaId,
      modulo: "Empresas",
      accion: "Editar empresa",
      detalle: `${rut} - ${razon_social}`,
      tablaAfectada: "empresas",
      registroId: empresaId,
      datos: empresaActualizada.rows[0],
    });

    await client.query("COMMIT");
    transaccionIniciada = false;

    return res.json({
      mensaje: "Empresa actualizada correctamente",
      empresa: empresaActualizada.rows[0],
    });
  } catch (error) {
    if (transaccionIniciada) {
      await client.query("ROLLBACK");
    }

    console.error("Error al actualizar empresa:", error);

    if (error.code === "23505") {
      return res.status(400).json({
        error: "Ya existe una empresa con esos datos",
      });
    }

    return res.status(500).json({
      error: "Error interno al actualizar empresa",
    });
  } finally {
    client.release();
  }
}

async function eliminarEmpresa(req, res) {
  const client = await pool.connect();
  let transaccionIniciada = false;

  try {
    const empresaId = Number(req.params.id);

    if (!empresaId) {
      return res.status(400).json({
        error: "Empresa invalida",
      });
    }

    const puedeAdministrar = await usuarioPuedeAdministrarEmpresa(
      client,
      req.usuario,
      empresaId
    );

    if (!puedeAdministrar) {
      return res.status(403).json({
        error: "No tienes permisos para eliminar esta empresa",
      });
    }

    await client.query("BEGIN");
    transaccionIniciada = true;

    const empresaEliminada = await client.query(
      `UPDATE empresas
       SET activa = false
       WHERE id = $1
         AND activa = true
       RETURNING *`,
      [empresaId]
    );

    if (empresaEliminada.rows.length === 0) {
      await client.query("ROLLBACK");
      transaccionIniciada = false;

      return res.status(404).json({
        error: "Empresa no encontrada",
      });
    }

    await client.query(
      `UPDATE usuarios_empresas
       SET activo = false,
           actualizado_en = NOW()
       WHERE empresa_id = $1`,
      [empresaId]
    );

    await registrarAuditoria({
      client,
      req,
      empresaId,
      modulo: "Empresas",
      accion: "Eliminar empresa",
      detalle: `${empresaEliminada.rows[0].rut} - ${empresaEliminada.rows[0].razon_social}`,
      tablaAfectada: "empresas",
      registroId: empresaId,
      datos: { activa: false },
    });

    await client.query("COMMIT");
    transaccionIniciada = false;

    return res.json({
      mensaje: "Empresa eliminada correctamente",
      empresa: empresaEliminada.rows[0],
    });
  } catch (error) {
    if (transaccionIniciada) {
      await client.query("ROLLBACK");
    }

    console.error("Error al eliminar empresa:", error);

    return res.status(500).json({
      error: "Error interno al eliminar empresa",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  crearEmpresa,
  listarEmpresas,
  actualizarEmpresa,
  eliminarEmpresa,
};
