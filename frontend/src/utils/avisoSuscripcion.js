/**
 * Qué decirle al usuario según el estado de su suscripción.
 *
 * Vive aparte del componente para poder probarse sin React, y porque el aviso
 * es una decisión de negocio: solo se habla cuando hay algo que decir. Con la
 * suscripción vigente y holgada devuelve null, para no convertirse en ruido que
 * se ignora.
 */

const DIAS_PARA_AVISAR = 10;

function formatearFecha(valor) {
  if (!valor) return "";

  const fecha = new Date(`${String(valor).slice(0, 10)}T12:00:00`);

  if (Number.isNaN(fecha.getTime())) return "";

  return fecha.toLocaleDateString("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function plural(cantidad, singular, plural_) {
  return cantidad === 1 ? singular : plural_;
}

/**
 * Convierte a número solo lo que de verdad es un número.
 *
 * `Number(null)` devuelve 0, de modo que un dato ausente se leía como "faltan
 * cero días" y el aviso anunciaba que la suscripción vencía hoy cuando en
 * realidad no se sabía nada. Alarmar a un cliente por un dato que no llegó es
 * peor que no avisar.
 */
function numeroONulo(valor) {
  if (valor === null || valor === undefined || valor === "") return null;

  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function contenidoDelAviso(suscripcion) {
  if (!suscripcion) return null;

  const estado = String(suscripcion.estado || suscripcion.status || "").toUpperCase();
  const dias = numeroONulo(suscripcion.dias_restantes);
  const gracia = numeroONulo(suscripcion.grace_remaining);
  const vence = formatearFecha(suscripcion.vence || suscripcion.trial_vence);

  if (estado === "PAST_DUE") {
    return {
      tono: "urgente",
      titulo: "Tu suscripción venció",
      texto: gracia !== null && gracia > 0
        ? `Puedes seguir trabajando ${gracia} ${plural(gracia, "día", "días")} más mientras regularizas el pago.`
        : "Regulariza el pago para no interrumpir tu trabajo.",
      accion: "Renovar ahora",
    };
  }

  if (estado === "TRIAL") {
    if (dias === null) return null;

    if (dias <= 0) {
      return {
        tono: "urgente",
        titulo: "Tu prueba gratuita termina hoy",
        texto: "Contrata el servicio para seguir trabajando con tus datos.",
        accion: "Contratar",
      };
    }

    if (dias > DIAS_PARA_AVISAR) return null;

    return {
      tono: dias <= 3 ? "urgente" : "aviso",
      titulo: `Tu prueba gratuita termina en ${dias} ${plural(dias, "día", "días")}`,
      texto: vence
        ? `Termina el ${vence}. Tus datos quedan guardados de todas formas.`
        : "Tus datos quedan guardados de todas formas.",
      accion: "Contratar",
    };
  }

  if (dias === null || dias > DIAS_PARA_AVISAR || dias < 0) {
    return null;
  }

  if (dias === 0) {
    return {
      tono: "urgente",
      titulo: "Tu suscripción vence hoy",
      texto: "Renueva para no interrumpir tu trabajo.",
      accion: "Renovar",
    };
  }

  return {
    tono: dias <= 3 ? "urgente" : "aviso",
    titulo: `Tu suscripción vence en ${dias} ${plural(dias, "día", "días")}`,
    texto: vence ? `Vence el ${vence}.` : "",
    accion: "Renovar",
  };
}

export { contenidoDelAviso, formatearFecha, numeroONulo };
