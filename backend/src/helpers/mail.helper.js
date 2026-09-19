let nodemailer = null;

try {
  nodemailer = require("nodemailer");
} catch {
  nodemailer = null;
}

function correoHabilitado() {
  return Boolean(
    nodemailer &&
      process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
}

function crearTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function escaparHtml(valor = "") {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function enviarCorreoSolicitudContacto(solicitud) {
  if (!correoHabilitado()) {
    return { enviado: false, motivo: "SMTP no configurado" };
  }

  const destino = process.env.CONTACT_TO || "contacto@servcontablepro.cl";
  const from = process.env.MAIL_FROM || `"ServContable PRO" <${process.env.SMTP_USER}>`;
  const asunto = `Nueva solicitud web - ${solicitud.nombre}`;

  const texto = `
Nueva solicitud desde servcontablepro.cl

Nombre: ${solicitud.nombre}
Correo: ${solicitud.correo}
Empresa: ${solicitud.empresa || "-"}
Interes: ${solicitud.interes || "-"}
Mensaje:
${solicitud.mensaje || "-"}
`;

  const html = `
    <h2>Nueva solicitud desde servcontablepro.cl</h2>
    <p><strong>Nombre:</strong> ${escaparHtml(solicitud.nombre)}</p>
    <p><strong>Correo:</strong> ${escaparHtml(solicitud.correo)}</p>
    <p><strong>Empresa:</strong> ${escaparHtml(solicitud.empresa || "-")}</p>
    <p><strong>Interes:</strong> ${escaparHtml(solicitud.interes || "-")}</p>
    <p><strong>Mensaje:</strong></p>
    <p>${escaparHtml(solicitud.mensaje || "-").replace(/\n/g, "<br>")}</p>
  `;

  const transporter = crearTransporter();

  await transporter.sendMail({
    from,
    to: destino,
    subject: asunto,
    text: texto,
    html,
    replyTo: solicitud.correo,
  });

  return { enviado: true };
}

async function enviarCorreoRecuperacionPassword({
  nombre = "Usuario ServContable",
  email,
  resetUrl,
  minutosVigencia = 30,
  modo = "recuperacion",
} = {}) {
  if (!correoHabilitado()) {
    return { enviado: false, motivo: "SMTP no configurado" };
  }

  if (!email || !resetUrl) {
    return { enviado: false, motivo: "Correo o enlace no disponible" };
  }

  const from = process.env.MAIL_FROM || `"ServContable PRO" <${process.env.SMTP_USER}>`;
  const nombreSeguro = escaparHtml(nombre);
  const resetUrlSeguro = escaparHtml(resetUrl);
  const minutos = Number(minutosVigencia || 30);
  const esInvitacion = modo === "invitacion";
  const asunto = esInvitacion
    ? "Activa tu acceso a ServContable PRO"
    : "Recuperacion de contrasena ServContable PRO";

  const textoIntro = esInvitacion
    ? "Se creo una cuenta para ti en ServContable PRO. Define tu contrasena para ingresar."
    : "Recibimos una solicitud para recuperar tu contrasena de ServContable PRO.";

  const texto = `${textoIntro}

Usuario: ${nombre}
Correo: ${email}

Ingresa al siguiente enlace para definir tu contrasena:
${resetUrl}

Este enlace vence en ${minutos} minutos.

Si no solicitaste este acceso, puedes ignorar este correo.`;

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <h2 style="margin: 0 0 12px;">ServContable PRO</h2>
      <p>${escaparHtml(textoIntro)}</p>
      <p><strong>Usuario:</strong> ${nombreSeguro}</p>
      <p><strong>Correo:</strong> ${escaparHtml(email)}</p>
      <p>
        <a href="${resetUrlSeguro}" style="display: inline-block; padding: 12px 18px; background: #0369a1; color: #ffffff; text-decoration: none; border-radius: 8px;">
          Definir contrasena
        </a>
      </p>
      <p>Este enlace vence en <strong>${minutos}</strong> minutos.</p>
      <p style="font-size: 13px; color: #475569;">
        Si no solicitaste este acceso, puedes ignorar este correo.
      </p>
    </div>
  `;

  const transporter = crearTransporter();

  await transporter.sendMail({
    from,
    to: email,
    subject: asunto,
    text: texto,
    html,
  });

  return { enviado: true };
}

/**
 * Aviso de cobranza: vencimiento proximo, gracia, bloqueo o fin de prueba.
 *
 * El titulo y el mensaje se escapan antes de ir al HTML. El correo de contacto
 * del sistema inyectaba el mensaje del visitante sin escapar, y aca el texto
 * viene armado por el propio sistema, pero incluye el nombre del cliente, que
 * es dato de entrada.
 */
async function enviarCorreoCobranza({ email, nombre, titulo, mensaje } = {}) {
  if (!correoHabilitado()) {
    return { enviado: false, motivo: "SMTP no configurado" };
  }

  if (!email) {
    return { enviado: false, motivo: "Sin correo de destino" };
  }

  const from = process.env.MAIL_FROM || `"ServContable PRO" <${process.env.SMTP_USER}>`;
  const enlace = (
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    "https://app.servcontablepro.cl"
  ).replace(/\/+$/, "");

  const texto = `${mensaje}

Ingresa a ${enlace}

ServContable PRO`;

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.55;">
      <h2 style="margin: 0 0 12px; color: #0f4c81;">${escaparHtml(titulo)}</h2>
      <p>${escaparHtml(mensaje)}</p>
      <p>
        <a href="${escaparHtml(enlace)}" style="display: inline-block; padding: 12px 18px; background: #0f4c81; color: #ffffff; text-decoration: none; border-radius: 8px;">
          Ir a ServContable PRO
        </a>
      </p>
      <p style="font-size: 12.5px; color: #5b6b7d;">
        Recibes este correo porque tienes una cuenta en ServContable PRO.
      </p>
    </div>
  `;

  const transporter = crearTransporter();

  await transporter.sendMail({
    from,
    to: email,
    subject: titulo,
    text: texto,
    html,
  });

  return { enviado: true };
}

/**
 * Recibo de pago.
 */
async function enviarCorreoReciboPago({ email, nombre, monto, periodo, servicio, vence } = {}) {
  if (!correoHabilitado()) {
    return { enviado: false, motivo: "SMTP no configurado" };
  }

  if (!email) {
    return { enviado: false, motivo: "Sin correo de destino" };
  }

  const from = process.env.MAIL_FROM || `"ServContable PRO" <${process.env.SMTP_USER}>`;
  const montoTexto = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Number(monto || 0));

  const titulo = "Pago recibido";
  const cuerpo =
    `Hola ${nombre || "cliente"}. Recibimos tu pago de ${montoTexto} por ${servicio || "ServContable PRO"}` +
    `${periodo ? ` (periodo ${periodo})` : ""}. ` +
    `${vence ? `Tu suscripcion queda vigente hasta el ${vence}.` : "Tu suscripcion quedo vigente."}`;

  const transporter = crearTransporter();

  await transporter.sendMail({
    from,
    to: email,
    subject: titulo,
    text: cuerpo,
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.55;">
        <h2 style="margin: 0 0 12px; color: #10b981;">${escaparHtml(titulo)}</h2>
        <p>${escaparHtml(cuerpo)}</p>
      </div>
    `,
  });

  return { enviado: true };
}

module.exports = {
  correoHabilitado,
  enviarCorreoSolicitudContacto,
  enviarCorreoRecuperacionPassword,
  enviarCorreoCobranza,
  enviarCorreoReciboPago,
};
