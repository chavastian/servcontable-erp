/**
 * Cobranza: avisos de vencimiento y transiciones por fecha.
 *
 * Una suscripción que vence sin que el cliente se entere es un cliente perdido
 * por descuido. Hasta ahora el sistema solo reaccionaba cuando la persona
 * intentaba entrar y recibía un 402: nadie le avisaba antes.
 *
 * Este proceso corre una vez al día dentro del propio servicio, que en el plan
 * Starter está siempre encendido, así que no hace falta un programador externo.
 *
 * Qué hace, en orden:
 *
 * 1. Recalcula el estado de cada suscripción según la fecha y lo persiste, de
 *    modo que el panel de administración muestre la realidad sin esperar a que
 *    el cliente entre.
 * 2. Encola los avisos que corresponden a hoy.
 * 3. Los envía, si hay correo configurado.
 *
 * La deduplicación es por `(usuario, tipo de evento, día)`, con un índice único
 * en la base: aunque el proceso corra dos veces, el aviso sale una sola vez.
 */

const {
  ESTADOS_SUSCRIPCION,
  ACCIONES_SUSCRIPCION,
  calcularEstadoVigente,
  fechaISO,
  normalizarEstadoSuscripcion,
  obtenerConfiguracionSuscripcion,
  registrarHistoriaSuscripcion,
} = require("./suscripcion.helper");
const { enviarCorreoCobranza } = require("./mail.helper");

const EVENTOS = Object.freeze({
  AVISO_VENCIMIENTO: "AVISO_VENCIMIENTO",
  ENTRO_EN_GRACIA: "ENTRO_EN_GRACIA",
  BLOQUEADO: "BLOQUEADO",
  TRIAL_POR_VENCER: "TRIAL_POR_VENCER",
  TRIAL_VENCIDO: "TRIAL_VENCIDO",
});

function diasDeAviso(config) {
  return String(config.expiry_notice_days || "10,5,2,0")
    .split(",")
    .map((valor) => Number(String(valor).trim()))
    .filter((valor) => Number.isInteger(valor) && valor >= 0)
    .sort((a, b) => b - a);
}

/**
 * Deja el aviso en la cola. Si ya existe para ese usuario, evento y día, no
 * hace nada: el índice único lo garantiza, no la lógica.
 */
async function encolarAviso(cliente, aviso) {
  const { rows } = await cliente.query(
    `
    INSERT INTO subscription_notifications
      (subscription_id, user_id, event_type, title, message, channel, status,
       scheduled_at, metadata, created_at)
    VALUES ($1, $2, $3, $4, $5, 'email', 'PENDING', NOW(), $6::jsonb, NOW())
    ON CONFLICT (user_id, event_type, (scheduled_at::date))
      WHERE scheduled_at IS NOT NULL
    DO NOTHING
    RETURNING *
    `,
    [
      aviso.subscriptionId || null,
      aviso.userId,
      aviso.evento,
      aviso.titulo,
      aviso.mensaje,
      JSON.stringify(aviso.metadata || {}),
    ]
  );

  return rows[0] || null;
}

function textoAviso({ evento, nombre, dias, vence, graciaRestante, servicio }) {
  const saludo = `Hola ${nombre || "cliente"}`;

  if (evento === EVENTOS.TRIAL_POR_VENCER) {
    return {
      titulo:
        dias === 0
          ? "Tu prueba gratuita termina hoy"
          : `Tu prueba gratuita termina en ${dias} día${dias === 1 ? "" : "s"}`,
      mensaje:
        `${saludo}. Tu prueba de ${servicio} ${
          dias === 0 ? "termina hoy" : `termina el ${vence}`
        }. ` +
        "Para seguir trabajando con tus datos, contrata el servicio desde la plataforma. " +
        "Si no contratas, tu información queda guardada y puedes retomarla cuando quieras.",
    };
  }

  if (evento === EVENTOS.TRIAL_VENCIDO) {
    return {
      titulo: "Tu prueba gratuita terminó",
      mensaje:
        `${saludo}. Tu prueba de ${servicio} terminó el ${vence}. ` +
        "Tus datos siguen guardados. Contrata el servicio para volver a entrar.",
    };
  }

  if (evento === EVENTOS.ENTRO_EN_GRACIA) {
    return {
      titulo: "Tu suscripción venció, tienes días de gracia",
      mensaje:
        `${saludo}. Tu suscripción de ${servicio} venció el ${vence}. ` +
        `Puedes seguir trabajando ${graciaRestante} día${graciaRestante === 1 ? "" : "s"} más ` +
        "mientras regularizas el pago. Después de ese plazo el acceso queda bloqueado.",
    };
  }

  if (evento === EVENTOS.BLOQUEADO) {
    return {
      titulo: "Acceso bloqueado por falta de pago",
      mensaje:
        `${saludo}. El acceso a ${servicio} quedó bloqueado porque la suscripción ` +
        `venció el ${vence} y se agotaron los días de gracia. ` +
        "Tus datos están intactos: al pagar, el acceso se restablece de inmediato.",
    };
  }

  return {
    titulo:
      dias === 0
        ? "Tu suscripción vence hoy"
        : `Tu suscripción vence en ${dias} día${dias === 1 ? "" : "s"}`,
    mensaje:
      `${saludo}. Tu suscripción de ${servicio} ${
        dias === 0 ? "vence hoy" : `vence el ${vence}`
      }. ` + "Renueva desde la plataforma para no interrumpir tu trabajo.",
  };
}

/**
 * Recorre las suscripciones, actualiza estados y encola los avisos del día.
 */
async function procesarCobranza(pool, { enviar = true } = {}) {
  const cliente = await pool.connect();
  const resumen = {
    revisadas: 0,
    transiciones: 0,
    avisos_encolados: 0,
    avisos_enviados: 0,
    avisos_fallidos: 0,
    detalle: [],
  };

  try {
    const config = await obtenerConfiguracionSuscripcion(cliente);
    const avisos = diasDeAviso(config);
    const servicio = config.commercial_service_name || "ServContable PRO";

    const { rows } = await cliente.query(
      `
      SELECT s.*, u.nombre, u.email, u.activo AS usuario_activo
      FROM subscriptions s
      JOIN usuarios u ON u.id = s.user_id
      WHERE COALESCE(s.status, 'ACTIVE') NOT IN ('CANCELLED')
      ORDER BY s.id
      `
    );

    for (const suscripcion of rows) {
      resumen.revisadas += 1;

      const estadoAnterior = normalizarEstadoSuscripcion(suscripcion.status);
      const calculado = calcularEstadoVigente(suscripcion, config);
      const esTrial = estadoAnterior === ESTADOS_SUSCRIPCION.TRIAL;
      const vence = fechaISO(suscripcion.expires_at || suscripcion.trial_ends_at) || "";

      // 1. Persistir la transicion si cambio.
      if (calculado.status !== estadoAnterior) {
        await cliente.query(
          "UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE id = $2",
          [calculado.status, suscripcion.id]
        );

        await registrarHistoriaSuscripcion({
          client: cliente,
          subscriptionId: suscripcion.id,
          userId: suscripcion.user_id,
          adminUserId: null,
          action: ACCIONES_SUSCRIPCION.VENCIMIENTO,
          previousStatus: estadoAnterior,
          newStatus: calculado.status,
          observation: "Transicion automatica por fecha (proceso diario)",
        });

        resumen.transiciones += 1;
      }

      // 2. Decidir el aviso que corresponde hoy.
      const dias = Number(calculado.days_remaining);
      let evento = null;

      if (calculado.status === ESTADOS_SUSCRIPCION.EXPIRED) {
        evento = esTrial ? EVENTOS.TRIAL_VENCIDO : EVENTOS.BLOQUEADO;
      } else if (calculado.status === ESTADOS_SUSCRIPCION.PAST_DUE) {
        evento = EVENTOS.ENTRO_EN_GRACIA;
      } else if (Number.isFinite(dias) && avisos.includes(dias)) {
        evento = esTrial ? EVENTOS.TRIAL_POR_VENCER : EVENTOS.AVISO_VENCIMIENTO;
      }

      if (!evento) {
        continue;
      }

      const { titulo, mensaje } = textoAviso({
        evento,
        nombre: suscripcion.nombre,
        dias,
        vence,
        graciaRestante: Number(calculado.grace_remaining || 0),
        servicio,
      });

      const encolado = await encolarAviso(cliente, {
        subscriptionId: suscripcion.id,
        userId: suscripcion.user_id,
        evento,
        titulo,
        mensaje,
        metadata: {
          dias_restantes: dias,
          gracia_restante: calculado.grace_remaining,
          vence,
          estado: calculado.status,
        },
      });

      if (!encolado) {
        // Ya se habia avisado hoy.
        continue;
      }

      resumen.avisos_encolados += 1;
      resumen.detalle.push({
        usuario: suscripcion.email,
        evento,
        dias_restantes: dias,
      });

      if (!enviar) {
        continue;
      }

      // 3. Enviar. Si el correo falla, el aviso queda en la cola con su motivo
      // y se puede reintentar sin duplicarlo.
      try {
        const resultado = await enviarCorreoCobranza({
          email: suscripcion.email,
          nombre: suscripcion.nombre,
          titulo,
          mensaje,
        });

        if (resultado.enviado) {
          await cliente.query(
            "UPDATE subscription_notifications SET status = 'SENT', sent_at = NOW() WHERE id = $1",
            [encolado.id]
          );
          resumen.avisos_enviados += 1;
        } else {
          await cliente.query(
            `UPDATE subscription_notifications
             SET status = 'SKIPPED',
                 metadata = metadata || $2::jsonb
             WHERE id = $1`,
            [encolado.id, JSON.stringify({ motivo: resultado.motivo })]
          );
        }
      } catch (error) {
        await cliente.query(
          `UPDATE subscription_notifications
           SET status = 'FAILED',
               metadata = metadata || $2::jsonb
           WHERE id = $1`,
          [encolado.id, JSON.stringify({ error: error.message })]
        );
        resumen.avisos_fallidos += 1;
      }
    }

    return resumen;
  } finally {
    cliente.release();
  }
}

/**
 * Programa el proceso para que corra al arrancar y una vez al día.
 *
 * Devuelve una función para detenerlo, que las pruebas usan.
 */
function programarCobranza(pool, { intervaloHoras = 24, alArrancar = true } = {}) {
  const intervalo = Math.max(1, Number(intervaloHoras)) * 60 * 60 * 1000;

  const correr = async () => {
    try {
      const resumen = await procesarCobranza(pool);
      console.log(
        `[cobranza] revisadas ${resumen.revisadas}, transiciones ${resumen.transiciones}, ` +
          `avisos ${resumen.avisos_encolados} (enviados ${resumen.avisos_enviados})`
      );
    } catch (error) {
      console.error("[cobranza] fallo el proceso diario:", error.message);
    }
  };

  if (alArrancar) {
    // Con retraso: que un problema acá no impida levantar el servicio.
    setTimeout(correr, 30 * 1000).unref?.();
  }

  const temporizador = setInterval(correr, intervalo);
  temporizador.unref?.();

  return () => clearInterval(temporizador);
}

module.exports = {
  EVENTOS,
  diasDeAviso,
  encolarAviso,
  textoAviso,
  procesarCobranza,
  programarCobranza,
};
