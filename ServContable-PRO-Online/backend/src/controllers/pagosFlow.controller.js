const pool = require("../database/db");
const crypto = require("crypto");
const {
  asegurarEsquemaSuscripcion,
  extenderSuscripcionUsuario,
} = require("../helpers/suscripcion.helper");

const IVA = 0.19;
const PRECIO_USUARIO_ADICIONAL = 3990;
const MESES_ANUALES = 12;
const PLANES = {
  mensual: {
    periodicidad: "mensual",
    nombre: "ServContable PRO - Plan mensual",
    montoNeto: 16990,
  },
  anual: {
    periodicidad: "anual",
    nombre: "ServContable PRO - Plan anual",
    montoNeto: 14990 * 12,
  },
};

function limpiarTexto(valor) {
  if (valor === undefined || valor === null) return "";
  return String(valor).trim();
}

function validarCorreo(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

function normalizarEnteroPositivo(valor) {
  const numero = Number.parseInt(valor, 10);
  return Number.isFinite(numero) && numero > 0 ? numero : 0;
}

function calcularTotales(periodicidad, usuariosAdicionales = 0, meses = 1) {
  const plan = PLANES[periodicidad] || PLANES.mensual;
  const mesesSolicitados = normalizarEnteroPositivo(meses) || 1;
  const mesesCobrados =
    periodicidad === "anual" ? MESES_ANUALES : Math.min(mesesSolicitados, 12);
  const planBaseNeto =
    periodicidad === "anual" ? plan.montoNeto : plan.montoNeto * mesesCobrados;
  const usuariosAdicionalesNeto =
    PRECIO_USUARIO_ADICIONAL * usuariosAdicionales * mesesCobrados;
  const subtotalNeto = planBaseNeto + usuariosAdicionalesNeto;
  const iva = Math.round(subtotalNeto * IVA);

  return {
    ...plan,
    nombre:
      periodicidad === "mensual" && mesesCobrados > 1
        ? `${plan.nombre} (${mesesCobrados} meses)`
        : plan.nombre,
    usuariosAdicionales,
    mesesCobrados,
    planBaseNeto,
    usuariosAdicionalesNeto,
    montoNeto: subtotalNeto,
    iva,
    total: subtotalNeto + iva,
  };
}

function obtenerBaseFrontend() {
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.FRONTEND_PUBLIC_URL ||
    process.env.FRONTEND_URL ||
    "https://www.servcontablepro.cl"
  ).replace(/\/+$/, "");
}

function obtenerBackendBase() {
  return (
    process.env.BACKEND_PUBLIC_URL ||
    process.env.API_PUBLIC_URL ||
    "https://api.servcontablepro.cl"
  ).replace(/\/+$/, "");
}

function obtenerFlowApiBase() {
  return (
    process.env.FLOW_API_BASE ||
    (String(process.env.FLOW_ENV || "production").toLowerCase() === "sandbox"
      ? "https://sandbox.flow.cl/api"
      : "https://www.flow.cl/api")
  ).replace(/\/+$/, "");
}

function obtenerFlowApiKey() {
  return limpiarTexto(process.env.FLOW_API_KEY);
}

function obtenerFlowSecretKey() {
  return limpiarTexto(process.env.FLOW_SECRET_KEY);
}

function obtenerFlowUrlConfirmacion() {
  return (
    process.env.FLOW_CONFIRMATION_URL ||
    `${obtenerBackendBase()}/api/pagos-flow/webhook`
  ).trim();
}

function obtenerFlowUrlRetorno() {
  return (
    process.env.FLOW_RETURN_URL ||
    `${obtenerBackendBase()}/api/pagos-flow/retorno`
  ).trim();
}

function firmarFlow(params) {
  const secretKey = obtenerFlowSecretKey();

  if (!secretKey) {
    throw new Error("FLOW_SECRET_KEY no esta configurado en el backend.");
  }

  const textoAFirmar = Object.keys(params)
    .filter((key) => key !== "s" && params[key] !== undefined && params[key] !== null)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");

  return crypto.createHmac("sha256", secretKey).update(textoAFirmar).digest("hex");
}

async function llamarFlow(path, params, metodo = "POST") {
  const bodyParams = {
    ...params,
    s: firmarFlow(params),
  };
  const metodoNormalizado = String(metodo || "POST").toUpperCase();
  const query = new URLSearchParams(bodyParams);
  const url =
    metodoNormalizado === "GET"
      ? `${obtenerFlowApiBase()}${path}?${query.toString()}`
      : `${obtenerFlowApiBase()}${path}`;

  const respuesta = await fetch(url, {
    method: metodoNormalizado,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: metodoNormalizado === "GET" ? undefined : query,
  });

  const texto = await respuesta.text();
  let data = {};

  try {
    data = texto ? JSON.parse(texto) : {};
  } catch (error) {
    data = { raw: texto };
  }

  if (!respuesta.ok) {
    const detalle = data?.message || data?.error || data?.raw || "Flow rechazo la solicitud.";
    const error = new Error(detalle);
    error.flow = data;
    error.status = respuesta.status;
    throw error;
  }

  if (data?.code && Number(data.code) !== 0 && data?.message) {
    const error = new Error(data.message);
    error.flow = data;
    throw error;
  }

  return data;
}

async function asegurarTablaContrataciones() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contrataciones_web (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(180) NOT NULL,
      correo VARCHAR(220) NOT NULL,
      telefono VARCHAR(80),
      rut VARCHAR(40),
      empresa VARCHAR(220),
      periodicidad VARCHAR(30) NOT NULL DEFAULT 'mensual',
      monto_neto INTEGER NOT NULL DEFAULT 0,
      iva INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      estado VARCHAR(60) NOT NULL DEFAULT 'pendiente',
      origen VARCHAR(80) DEFAULT 'web',
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE contrataciones_web
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
  `);

  await pool.query(`
    ALTER TABLE contrataciones_web
    ADD COLUMN IF NOT EXISTS telefono VARCHAR(80),
    ADD COLUMN IF NOT EXISTS rut VARCHAR(40),
    ADD COLUMN IF NOT EXISTS empresa VARCHAR(220),
    ADD COLUMN IF NOT EXISTS periodicidad VARCHAR(30) NOT NULL DEFAULT 'mensual',
    ADD COLUMN IF NOT EXISTS monto_neto INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS iva INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS estado VARCHAR(60) NOT NULL DEFAULT 'pendiente',
    ADD COLUMN IF NOT EXISTS flow_token VARCHAR(220),
    ADD COLUMN IF NOT EXISTS flow_order VARCHAR(120),
    ADD COLUMN IF NOT EXISTS flow_status VARCHAR(80),
    ADD COLUMN IF NOT EXISTS origen VARCHAR(80) DEFAULT 'web',
    ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);
}

function mapearEstadoFlow(status) {
  const estado = String(status || "");
  if (estado === "2") return "activo";
  if (estado === "3" || estado === "4") return "rechazado";
  if (estado === "5") return "anulado";
  return "pendiente";
}

function extraerContratacionIdDesdeCommerceOrder(commerceOrder) {
  const texto = limpiarTexto(commerceOrder);
  const match = texto.match(/(\d+)$/);
  return match ? match[1] : "";
}

async function registrarPagoFlow({
  nombre,
  correo,
  telefono = "",
  rut = "",
  empresa = "",
  periodicidad = "mensual",
  usuariosAdicionales = 0,
  meses = 1,
  origen = "web_flow",
  mensaje = "",
  metadataExtra = {},
}) {
  await asegurarTablaContrataciones();

  const apiKey = obtenerFlowApiKey();

  if (!apiKey || !obtenerFlowSecretKey()) {
    const error = new Error("FLOW_API_KEY y FLOW_SECRET_KEY deben estar configurados en el backend.");
    error.status = 500;
    throw error;
  }

  const totales = calcularTotales(periodicidad, usuariosAdicionales, meses);

  const contratacionResult = await pool.query(
    `
    INSERT INTO contrataciones_web
    (nombre, correo, telefono, rut, empresa, periodicidad, monto_neto, iva, total, estado, origen, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pendiente_pago', $10, $11)
    RETURNING *;
    `,
    [
      nombre,
      correo,
      telefono,
      rut,
      empresa,
      periodicidad,
      totales.montoNeto,
      totales.iva,
      totales.total,
      origen,
      JSON.stringify({
        pasarela: "flow",
        acepta_terminos: true,
        plan: "PRO multiempresa 1 usuario",
        usuarios_adicionales: usuariosAdicionales,
        meses_cobrados: totales.mesesCobrados,
        plan_base_neto: totales.planBaseNeto,
        usuarios_adicionales_neto: totales.usuariosAdicionalesNeto,
        subtotal_neto: totales.montoNeto,
        mensaje: limpiarTexto(mensaje),
        ...metadataExtra,
      }),
    ]
  );

  const contratacion = contratacionResult.rows[0];
  const commerceOrder = `SC-${contratacion.id}`;
  const paramsFlow = {
    apiKey,
    commerceOrder,
    subject: totales.nombre,
    currency: "CLP",
    amount: String(totales.total),
    email: correo,
    urlConfirmation: obtenerFlowUrlConfirmacion(),
    urlReturn: obtenerFlowUrlRetorno(),
  };

  const dataFlow = await llamarFlow("/payment/create", paramsFlow);
  const checkoutUrl =
    dataFlow.url && dataFlow.token
      ? `${dataFlow.url}?token=${encodeURIComponent(dataFlow.token)}`
      : "";

  if (!checkoutUrl) {
    await pool.query(
      `
      UPDATE contrataciones_web
      SET estado = 'error_flow', metadata = metadata || $1::jsonb, actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $2;
      `,
      [JSON.stringify({ flow_error: dataFlow }), contratacion.id]
    );

    const error = new Error("Flow no devolvio un link de pago.");
    error.status = 502;
    error.flow = dataFlow;
    throw error;
  }

  await pool.query(
    `
    UPDATE contrataciones_web
    SET flow_token = $1,
        flow_order = $2,
        flow_status = 'created',
        metadata = metadata || $3::jsonb,
        actualizado_en = CURRENT_TIMESTAMP
    WHERE id = $4;
    `,
    [
      dataFlow.token || null,
      dataFlow.flowOrder ? String(dataFlow.flowOrder) : null,
      JSON.stringify({ flow_create: dataFlow, commerce_order: commerceOrder }),
      contratacion.id,
    ]
  );

  return {
    contratacion,
    commerceOrder,
    dataFlow,
    checkoutUrl,
    totales,
    usuariosAdicionales,
  };
}

async function crearPagoContratacion(req, res) {
  try {
    await asegurarTablaContrataciones();

    const nombre = limpiarTexto(req.body.nombre);
    const correo = limpiarTexto(req.body.correo || req.body.email).toLowerCase();
    const telefono = limpiarTexto(req.body.telefono);
    const rut = limpiarTexto(req.body.rut);
    const empresa = limpiarTexto(req.body.empresa);
    const periodicidad = limpiarTexto(req.body.periodicidad || "mensual").toLowerCase();
    const usuariosAdicionales = normalizarEnteroPositivo(
      req.body.usuarios_adicionales || req.body.usuariosAdicionales
    );
    const aceptaTerminos = Boolean(req.body.acepta_terminos || req.body.aceptaTerminos);

    if (!nombre || !correo) {
      return res.status(400).json({
        ok: false,
        error: "Nombre y correo son obligatorios para contratar.",
      });
    }

    if (!validarCorreo(correo)) {
      return res.status(400).json({ ok: false, error: "El correo ingresado no es valido." });
    }

    if (!PLANES[periodicidad]) {
      return res.status(400).json({ ok: false, error: "Periodicidad no valida." });
    }

    if (!aceptaTerminos) {
      return res.status(400).json({
        ok: false,
        error: "Debes aceptar las condiciones de contratacion antes de pagar.",
      });
    }

    const meses = normalizarEnteroPositivo(
      req.body.meses || req.body.meses_cobrados || req.body.mesesCobro
    ) || 1;
    const pago = await registrarPagoFlow({
      nombre,
      correo,
      telefono,
      rut,
      empresa,
      periodicidad,
      usuariosAdicionales,
      meses,
      origen: "web_flow",
      mensaje: req.body.mensaje,
    });
    const { contratacion, commerceOrder, dataFlow, checkoutUrl, totales } = pago;

    return res.status(201).json({
      ok: true,
      pasarela: "flow",
      mensaje: "Link de pago Flow creado correctamente.",
      contratacion_id: contratacion.id,
      commerce_order: commerceOrder,
      flow_order: dataFlow.flowOrder || null,
      token: dataFlow.token || null,
      checkout_url: checkoutUrl,
      url: checkoutUrl,
      total: totales.total,
      monto_neto: totales.montoNeto,
      iva: totales.iva,
      usuarios_adicionales: usuariosAdicionales,
      usuarios_adicionales_neto: totales.usuariosAdicionalesNeto,
      plan_base_neto: totales.planBaseNeto,
      meses_cobrados: totales.mesesCobrados,
    });
  } catch (error) {
    console.error("Error al crear pago Flow:", error.flow || error);

    return res.status(error.status || 500).json({
      ok: false,
      error: error.message || "No se pudo iniciar la contratacion con Flow.",
      detalle: error.flow || null,
    });
  }
}

async function crearRenovacionSuscripcionFlow(req, res) {
  try {
    await asegurarTablaContrataciones();
    await asegurarEsquemaSuscripcion(pool);

    const usuarioId = req.usuario?.id;

    if (!usuarioId) {
      return res.status(401).json({ ok: false, error: "Usuario no autenticado." });
    }

    const usuarioResult = await pool.query(
      "SELECT id, nombre, email FROM usuarios WHERE id = $1 LIMIT 1;",
      [usuarioId]
    );
    const usuario = usuarioResult.rows[0];

    if (!usuario) {
      return res.status(404).json({ ok: false, error: "Usuario no encontrado." });
    }

    const periodicidad = limpiarTexto(req.body.plan || req.body.periodicidad || "mensual")
      .toLowerCase();
    const usuariosAdicionales = normalizarEnteroPositivo(
      req.body.usuarios_adicionales || req.body.usuariosAdicionales
    );
    const meses = normalizarEnteroPositivo(
      req.body.meses || req.body.meses_cobrados || req.body.mesesCobro
    ) || 1;

    if (!PLANES[periodicidad]) {
      return res.status(400).json({ ok: false, error: "Periodicidad no valida." });
    }

    const pago = await registrarPagoFlow({
      nombre: limpiarTexto(req.body.nombre) || usuario.nombre || usuario.email,
      correo: limpiarTexto(req.body.correo || req.body.email || usuario.email).toLowerCase(),
      telefono: limpiarTexto(req.body.telefono),
      rut: limpiarTexto(req.body.rut),
      empresa: limpiarTexto(req.body.empresa),
      periodicidad,
      usuariosAdicionales,
      meses,
      origen: "renovacion_flow",
      mensaje:
        limpiarTexto(req.body.mensaje) ||
        `Renovacion de suscripcion ${periodicidad}`,
      metadataExtra: {
        tipo: "renovacion_suscripcion",
        usuario_id: usuario.id,
      },
    });
    const { contratacion, commerceOrder, dataFlow, checkoutUrl, totales } = pago;

    return res.status(201).json({
      ok: true,
      pasarela: "flow",
      mensaje: "Link de renovacion Flow creado correctamente.",
      contratacion_id: contratacion.id,
      commerce_order: commerceOrder,
      flow_order: dataFlow.flowOrder || null,
      token: dataFlow.token || null,
      checkout_url: checkoutUrl,
      url: checkoutUrl,
      total: totales.total,
      monto_neto: totales.montoNeto,
      iva: totales.iva,
      usuarios_adicionales: usuariosAdicionales,
      usuarios_adicionales_neto: totales.usuariosAdicionalesNeto,
      plan_base_neto: totales.planBaseNeto,
      meses_cobrados: totales.mesesCobrados,
    });
  } catch (error) {
    console.error("Error al crear renovacion Flow:", error.flow || error);

    return res.status(error.status || 500).json({
      ok: false,
      error: error.message || "No se pudo iniciar la renovacion con Flow.",
      detalle: error.flow || null,
    });
  }
}

async function consultarEstadoFlow(token) {
  const apiKey = obtenerFlowApiKey();
  if (!token) throw new Error("Token Flow no recibido.");
  if (!apiKey || !obtenerFlowSecretKey()) {
    throw new Error("FLOW_API_KEY y FLOW_SECRET_KEY deben estar configurados en el backend.");
  }

  return llamarFlow("/payment/getStatus", { apiKey, token }, "GET");
}

async function activarSuscripcionSiCorresponde(contratacion, estadoFlow) {
  if (!contratacion || mapearEstadoFlow(estadoFlow.status) !== "activo") {
    return null;
  }

  const metadata = contratacion.metadata || {};
  const usuarioId = metadata.usuario_id || metadata.renovacion?.usuario_id || null;

  if (!usuarioId || metadata.suscripcion_activada_en) {
    return null;
  }

  await asegurarEsquemaSuscripcion(pool);

  const meses = normalizarEnteroPositivo(metadata.meses_cobrados) || 1;
  const usuariosAdicionales = normalizarEnteroPositivo(metadata.usuarios_adicionales);
  const externalReference = String(
    estadoFlow.flowOrder ||
      estadoFlow.commerceOrder ||
      contratacion.flow_order ||
      contratacion.id
  );

  const usuarioActualizado = await extenderSuscripcionUsuario(
    pool,
    usuarioId,
    meses,
    contratacion.periodicidad,
    usuariosAdicionales,
    externalReference
  );

  await pool.query(
    `
    UPDATE contrataciones_web
    SET metadata = metadata || $1::jsonb,
        actualizado_en = CURRENT_TIMESTAMP
    WHERE id = $2;
    `,
    [
      JSON.stringify({
        suscripcion_activada_en: new Date().toISOString(),
        suscripcion_usuario_id: usuarioId,
      }),
      contratacion.id,
    ]
  );

  return usuarioActualizado;
}

async function actualizarContratacionConEstadoFlow(token, estadoFlow) {
  const contratacionIdDesdeOrden = extraerContratacionIdDesdeCommerceOrder(
    estadoFlow.commerceOrder
  );

  let contratacionId = contratacionIdDesdeOrden;

  if (!contratacionId) {
    const lookup = await pool.query(
      `SELECT id FROM contrataciones_web WHERE flow_token = $1 ORDER BY id DESC LIMIT 1;`,
      [token]
    );
    contratacionId = lookup.rows[0]?.id || "";
  }

  if (!contratacionId) {
    return { contratacion: null, estado: mapearEstadoFlow(estadoFlow.status) };
  }

  const estadoInterno = mapearEstadoFlow(estadoFlow.status);
  const resultado = await pool.query(
    `
    UPDATE contrataciones_web
    SET estado = $1,
        flow_token = COALESCE(flow_token, $2),
        flow_order = COALESCE($3, flow_order),
        flow_status = $4,
        metadata = metadata || $5::jsonb,
        actualizado_en = CURRENT_TIMESTAMP
    WHERE id = $6
    RETURNING *;
    `,
    [
      estadoInterno,
      token,
      estadoFlow.flowOrder ? String(estadoFlow.flowOrder) : null,
      estadoFlow.status ? String(estadoFlow.status) : null,
      JSON.stringify({ pago_flow: estadoFlow }),
      contratacionId,
    ]
  );

  const contratacion = resultado.rows[0] || null;
  await activarSuscripcionSiCorresponde(contratacion, estadoFlow);

  return { contratacion, estado: estadoInterno };
}

async function obtenerContratacion(req, res) {
  try {
    await asegurarTablaContrataciones();

    const resultado = await pool.query(
      `
      SELECT id, nombre, correo, empresa, periodicidad, monto_neto, iva, total,
             estado, flow_order, flow_status, creado_en, actualizado_en
      FROM contrataciones_web
      WHERE id = $1;
      `,
      [req.params.id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Contratacion no encontrada." });
    }

    return res.json({ ok: true, contratacion: resultado.rows[0] });
  } catch (error) {
    console.error("Error al obtener contratacion:", error);

    return res.status(500).json({ ok: false, error: "No se pudo obtener la contratacion." });
  }
}

function obtenerResumenPagoFlow(metadata = {}) {
  const pago = metadata?.pago_flow || metadata?.flow_create || null;

  if (!pago) return null;

  return {
    flow_order: pago.flowOrder || null,
    commerce_order: pago.commerceOrder || metadata?.commerce_order || null,
    estado: pago.status || null,
    descripcion_estado: pago.statusDescription || pago.status_description || null,
    monto: pago.amount || null,
    moneda: pago.currency || "CLP",
    fecha_pago: pago.paymentData?.date || pago.paymentData?.media || null,
    medio_pago: pago.paymentData?.media || pago.media || null,
    pagador: {
      correo: pago.payer || pago.email || null,
      nombre: pago.optional?.nombre || null,
      rut: pago.optional?.rut || null,
    },
    raw: pago,
  };
}

async function listarContratacionesWeb(req, res) {
  try {
    await asegurarTablaContrataciones();

    const resultado = await pool.query(`
      SELECT
        id,
        nombre,
        correo,
        telefono,
        rut,
        empresa,
        periodicidad,
        monto_neto,
        iva,
        total,
        estado,
        flow_token,
        flow_order,
        flow_status,
        origen,
        metadata,
        creado_en,
        actualizado_en
      FROM contrataciones_web
      ORDER BY creado_en DESC
      LIMIT 300;
    `);

    const solicitudes = resultado.rows.map((item) => {
      const metadata = item.metadata || {};

      return {
        ...item,
        gestion: metadata.gestion || null,
        pago_flow: obtenerResumenPagoFlow(metadata),
      };
    });

    return res.json({ ok: true, solicitudes });
  } catch (error) {
    console.error("Error al listar contrataciones web:", error);

    return res.status(500).json({
      ok: false,
      error: "No se pudieron obtener las solicitudes web.",
    });
  }
}

async function actualizarGestionContratacion(req, res) {
  try {
    await asegurarTablaContrataciones();

    const estadoGestion = limpiarTexto(req.body?.estado_gestion || "contactado");

    const metadataGestion = {
      gestion: {
        estado: estadoGestion,
        usuario_id: req.usuario?.id || null,
        usuario: req.usuario?.email || req.usuario?.nombre || null,
        actualizado_en: new Date().toISOString(),
      },
    };

    const resultado = await pool.query(
      `
      UPDATE contrataciones_web
      SET metadata = metadata || $1::jsonb,
          actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, metadata;
      `,
      [JSON.stringify(metadataGestion), req.params.id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Solicitud web no encontrada." });
    }

    return res.json({
      ok: true,
      mensaje: "Solicitud web actualizada correctamente.",
      gestion: resultado.rows[0].metadata?.gestion || null,
    });
  } catch (error) {
    console.error("Error al actualizar solicitud web:", error);

    return res.status(500).json({ ok: false, error: "No se pudo actualizar la solicitud web." });
  }
}

async function recibirWebhookFlow(req, res) {
  try {
    await asegurarTablaContrataciones();

    const token = limpiarTexto(req.body?.token || req.query?.token);

    if (!token) {
      return res.status(200).json({ ok: true, recibido: true, advertencia: "Token no recibido" });
    }

    const estadoFlow = await consultarEstadoFlow(token);
    await actualizarContratacionConEstadoFlow(token, estadoFlow);

    return res.status(200).json({ ok: true, recibido: true });
  } catch (error) {
    console.error("Error webhook Flow:", error.flow || error);
    return res.status(200).json({ ok: true, recibido: true });
  }
}

async function procesarRetornoFlow(req, res) {
  const frontendBase = obtenerBaseFrontend();

  try {
    await asegurarTablaContrataciones();

    const token = limpiarTexto(req.body?.token || req.query?.token);

    if (!token) {
      return res.redirect(`${frontendBase}/pago-error.html?error=sin_token`);
    }

    const estadoFlow = await consultarEstadoFlow(token);
    const { contratacion, estado } = await actualizarContratacionConEstadoFlow(
      token,
      estadoFlow
    );
    const idQuery = contratacion?.id ? `?contratacion=${contratacion.id}` : "";

    if (estado === "activo") {
      return res.redirect(`${frontendBase}/pago-exitoso.html${idQuery}`);
    }

    if (estado === "pendiente") {
      return res.redirect(`${frontendBase}/pago-pendiente.html${idQuery}`);
    }

    return res.redirect(`${frontendBase}/pago-error.html${idQuery}`);
  } catch (error) {
    console.error("Error retorno Flow:", error.flow || error);
    return res.redirect(`${frontendBase}/pago-error.html?error=flow`);
  }
}

module.exports = {
  crearPagoContratacion,
  crearRenovacionSuscripcionFlow,
  obtenerContratacion,
  listarContratacionesWeb,
  actualizarGestionContratacion,
  recibirWebhookFlow,
  procesarRetornoFlow,
};
