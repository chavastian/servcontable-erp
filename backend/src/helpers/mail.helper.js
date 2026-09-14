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
    <p><strong>Nombre:</strong> ${solicitud.nombre}</p>
    <p><strong>Correo:</strong> ${solicitud.correo}</p>
    <p><strong>Empresa:</strong> ${solicitud.empresa || "-"}</p>
    <p><strong>Interes:</strong> ${solicitud.interes || "-"}</p>
    <p><strong>Mensaje:</strong></p>
    <p>${(solicitud.mensaje || "-").replace(/\n/g, "<br>")}</p>
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

module.exports = {
  enviarCorreoSolicitudContacto,
  enviarCorreoRecuperacionPassword,
};
