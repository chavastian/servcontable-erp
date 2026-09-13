const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const pool = require("../database/db");
const { enviarCorreoSolicitudContacto } = require("../helpers/mail.helper");
const {
  asegurarEsquemaDemo,
  diasDemo,
  normalizarEmailDemo,
  formatoFechaDemo,
} = require("../helpers/demo.helper");

async function asegurarTablaContacto() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS solicitudes_contacto (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      correo VARCHAR(200) NOT NULL,
      empresa VARCHAR(200),
      interes VARCHAR(150),
      mensaje TEXT,
      estado VARCHAR(50) DEFAULT 'pendiente',
      origen VARCHAR(100) DEFAULT 'web',
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE solicitudes_contacto
    ADD COLUMN IF NOT EXISTS leido BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS nota_interna TEXT,
    ADD COLUMN IF NOT EXISTS demo_usuario_id INTEGER,
    ADD COLUMN IF NOT EXISTS demo_inicio DATE,
    ADD COLUMN IF NOT EXISTS demo_vence DATE,
    ADD COLUMN IF NOT EXISTS demo_activado_en TIMESTAMP;
  `);
}

function limpiarTexto(valor) {
  if (valor === undefined || valor === null) return "";
  return String(valor).trim();
}

function validarCorreo(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

async function crearSolicitudContacto(req, res) {
  try {
    await asegurarTablaContacto();

    const nombre = limpiarTexto(req.body.nombre);
    const correo = limpiarTexto(req.body.correo || req.body.email).toLowerCase();
    const empresa = limpiarTexto(req.body.empresa);
    const interes = limpiarTexto(
      req.body.interes || req.body.interes_principal || req.body.interesPrincipal
    );
    const mensaje = limpiarTexto(req.body.mensaje);
    const origen = limpiarTexto(req.body.origen || "web");

    if (!nombre || !correo) {
      return res.status(400).json({
        ok: false,
        error: "Nombre y correo son obligatorios.",
      });
    }

    if (!validarCorreo(correo)) {
      return res.status(400).json({
        ok: false,
        error: "El correo ingresado no es valido.",
      });
    }

    const resultado = await pool.query(
      `
      INSERT INTO solicitudes_contacto
      (nombre, correo, empresa, interes, mensaje, origen)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, nombre, correo, empresa, interes, mensaje, estado, origen, creado_en;
      `,
      [nombre, correo, empresa, interes, mensaje, origen]
    );

    const solicitud = resultado.rows[0];

    try {
      await enviarCorreoSolicitudContacto(solicitud);
    } catch (errorCorreo) {
      console.error("Solicitud guardada, pero no se pudo enviar correo:", errorCorreo);
    }

    return res.status(201).json({
      ok: true,
      mensaje: "Solicitud enviada correctamente.",
      solicitud,
    });
  } catch (error) {
    console.error("Error al crear solicitud de contacto:", error);

    return res.status(500).json({
      ok: false,
      error: "No se pudo registrar la solicitud de contacto.",
    });
  }
}

async function listarSolicitudesContacto(req, res) {
  try {
    await asegurarTablaContacto();

    const limite = Math.min(Number(req.query.limite || 300), 500);

    const resultado = await pool.query(
      `
      SELECT
        id,
        nombre,
        correo,
        empresa,
        interes,
        mensaje,
        estado,
        leido,
        nota_interna,
        origen,
        creado_en,
        actualizado_en,
        demo_usuario_id,
        demo_inicio,
        demo_vence,
        demo_activado_en
      FROM solicitudes_contacto
      ORDER BY creado_en DESC
      LIMIT $1;
      `,
      [limite]
    );

    return res.json({
      ok: true,
      solicitudes: resultado.rows,
    });
  } catch (error) {
    console.error("Error al listar solicitudes de contacto:", error);

    return res.status(500).json({
      ok: false,
      error: "No se pudieron obtener las solicitudes.",
    });
  }
}

async function actualizarSolicitudContacto(req, res) {
  try {
    await asegurarTablaContacto();

    const estado = limpiarTexto(req.body.estado || "contactado");
    const notaInterna = limpiarTexto(req.body.nota_interna || req.body.notaInterna);

    const resultado = await pool.query(
      `
      UPDATE solicitudes_contacto
      SET
        estado = $1,
        leido = true,
        nota_interna = COALESCE(NULLIF($2, ''), nota_interna),
        actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *;
      `,
      [estado, notaInterna, req.params.id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: "Solicitud no encontrada.",
      });
    }

    return res.json({
      ok: true,
      mensaje: "Solicitud actualizada correctamente.",
      solicitud: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al actualizar solicitud de contacto:", error);

    return res.status(500).json({
      ok: false,
      error: "No se pudo actualizar la solicitud.",
    });
  }
}

async function activarDemoSolicitud(req, res) {
  await asegurarTablaContacto();

  const client = await pool.connect();
  let transaccionIniciada = false;

  try {
    const solicitudId = Number(req.params.id);
    const dias = Math.min(Math.max(Number(req.body?.dias || diasDemo()), 1), 90);

    if (!solicitudId) {
      return res.status(400).json({ ok: false, error: "Solicitud invalida." });
    }

    await client.query("BEGIN");
    transaccionIniciada = true;
    await asegurarEsquemaDemo(client);

    const solicitudResult = await client.query(
      "SELECT * FROM solicitudes_contacto WHERE id = $1 FOR UPDATE",
      [solicitudId]
    );

    if (solicitudResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transaccionIniciada = false;
      return res.status(404).json({ ok: false, error: "Solicitud no encontrada." });
    }

    const solicitud = solicitudResult.rows[0];
    const email = normalizarEmailDemo(solicitud.correo);

    if (!email) {
      await client.query("ROLLBACK");
      transaccionIniciada = false;
      return res.status(400).json({ ok: false, error: "La solicitud no tiene correo valido." });
    }

    const passwordTemporal = crypto.randomBytes(24).toString("hex");
    const passwordHash = await bcrypt.hash(passwordTemporal, 10);
    const nombre = limpiarTexto(solicitud.nombre) || "Usuario Demo";

    const existente = await client.query(
      "SELECT id FROM usuarios WHERE email = $1 LIMIT 1",
      [email]
    );

    const usuarioResult =
      existente.rows.length > 0
        ? await client.query(
            `UPDATE usuarios
             SET nombre = $1,
                 password_hash = $2,
                 rol = 'admin_cliente',
                 activo = true,
                 demo_activo = true,
                 demo_inicio = CURRENT_DATE,
                 demo_vence = (CURRENT_DATE + ($3::int * INTERVAL '1 day'))::date,
                 demo_empresa_limite = 1,
                 demo_solicitud_id = $4,
                 suscripcion_estado = 'demo',
                 suscripcion_plan = 'demo',
                 suscripcion_inicio = CURRENT_DATE,
                 suscripcion_vence = (CURRENT_DATE + ($3::int * INTERVAL '1 day'))::date,
                 suscripcion_usuarios_adicionales = 0,
                 suscripcion_actualizada_en = NOW()
             WHERE id = $5
             RETURNING *`,
            [nombre, passwordHash, dias, solicitudId, existente.rows[0].id]
          )
        : await client.query(
            `INSERT INTO usuarios
             (nombre, email, password_hash, rol, activo,
              demo_activo, demo_inicio, demo_vence, demo_empresa_limite, demo_solicitud_id,
              suscripcion_estado, suscripcion_plan, suscripcion_inicio, suscripcion_vence,
              suscripcion_usuarios_adicionales, suscripcion_actualizada_en)
             VALUES
             ($1, $2, $3, 'admin_cliente', true,
              true, CURRENT_DATE, (CURRENT_DATE + ($4::int * INTERVAL '1 day'))::date, 1, $5,
              'demo', 'demo', CURRENT_DATE, (CURRENT_DATE + ($4::int * INTERVAL '1 day'))::date,
              0, NOW())
             RETURNING *`,
            [nombre, email, passwordHash, dias, solicitudId]
          );

    const usuario = usuarioResult.rows[0];

    const solicitudActualizada = await client.query(
      `UPDATE solicitudes_contacto
       SET estado = 'demo_activado',
           leido = true,
           demo_usuario_id = $1,
           demo_inicio = CURRENT_DATE,
           demo_vence = (CURRENT_DATE + ($2::int * INTERVAL '1 day'))::date,
           demo_activado_en = NOW(),
           actualizado_en = NOW()
       WHERE id = $3
       RETURNING *`,
      [usuario.id, dias, solicitudId]
    );

    await client.query("COMMIT");
    transaccionIniciada = false;

    return res.json({
      ok: true,
      mensaje: `Demo activada por ${dias} dias para ${email}.`,
      demo: {
        email,
        usuario_id: usuario.id,
        empresa_id: null,
        inicio: formatoFechaDemo(usuario.demo_inicio),
        vence: formatoFechaDemo(usuario.demo_vence),
        dias,
        empresa_limite: Number(usuario.demo_empresa_limite || 1),
        password_temporal: passwordTemporal,
      },
      solicitud: solicitudActualizada.rows[0],
    });
  } catch (error) {
    if (transaccionIniciada) {
      await client.query("ROLLBACK");
    }

    console.error("Error al activar demo desde solicitud:", error);

    return res.status(500).json({
      ok: false,
      error: "No se pudo activar la demo.",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  crearSolicitudContacto,
  listarSolicitudesContacto,
  actualizarSolicitudContacto,
  activarDemoSolicitud,
};
