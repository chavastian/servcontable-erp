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

module.exports = {
  enviarCorreoSolicitudContacto,
};
