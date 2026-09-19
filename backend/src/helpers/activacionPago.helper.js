/**
 * Activación de una suscripción a partir de un pago.
 *
 * Es el punto donde el dinero se convierte en servicio, así que tiene que ser
 * exactamente idempotente: un pago activa una vez y solo una.
 *
 * Antes no lo era. La comprobación era leer `metadata.suscripcion_activada_en`
 * de una fila traída antes, extender la suscripción y después marcar la
 * metadata, sin transacción ni bloqueo. Flow avisa por dos caminos a la vez, el
 * webhook y el retorno del navegador, así que ambos leían la marca ausente y
 * ambos extendían: el cliente recibía dos meses por un pago.
 *
 * Tampoco quedaba registro en `subscription_payments`, de modo que no había
 * historial de cobros ni con qué emitir un recibo. La tabla estaba vacía.
 *
 * Ahora:
 *
 * 1. Todo ocurre en una transacción.
 * 2. La contratación se bloquea con `FOR UPDATE`, así el segundo aviso espera.
 * 3. Dentro del bloqueo se vuelve a comprobar si ya se activó.
 * 4. El pago se registra, y el índice único por proveedor y transacción es la
 *    última red: si dos procesos llegaran juntos, el segundo choca.
 */

const {
  ESTADOS_PAGO,
  ACCIONES_SUSCRIPCION,
  calcularMontoSuscripcion,
  extenderSuscripcionUsuario,
  obtenerConfiguracionSuscripcion,
  obtenerSuscripcionUsuario,
  registrarHistoriaSuscripcion,
} = require("./suscripcion.helper");
const { construirPagoSuscripcion } = require("./pagosSuscripcion.helper");

/**
 * Registra el cobro en subscription_payments.
 *
 * Devuelve la fila creada, o null si ese pago ya estaba registrado: el índice
 * único `(provider, transaction_id)` lo garantiza.
 */
async function registrarPagoSuscripcion(cliente, datos) {
  const {
    usuarioId,
    subscriptionId,
    monto,
    proveedor,
    transaccionId,
    metodoPago,
    periodo,
    detalle = {},
    payload = {},
  } = datos;

  const pago = construirPagoSuscripcion({
    provider: proveedor,
    providerPayload: payload,
    transactionId: transaccionId,
    paymentMethod: metodoPago,
  });

  const { rows } = await cliente.query(
    `
    INSERT INTO subscription_payments
      (subscription_id, user_id, payment_date, amount, period_label, payment_method,
       status, transaction_id, provider, provider_payload, service_name,
       base_price, included_users, active_users, additional_users,
       additional_user_price, additional_users_amount, subtotal, iva_rate,
       iva_amount, total_amount, created_at)
    VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9::jsonb, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
    ON CONFLICT (provider, transaction_id) WHERE transaction_id IS NOT NULL AND provider IS NOT NULL
    DO NOTHING
    RETURNING *
    `,
    [
      subscriptionId,
      usuarioId,
      Math.round(Number(monto || 0)),
      periodo || null,
      pago.payment_method,
      ESTADOS_PAGO.PAID,
      pago.transaction_id || null,
      pago.provider,
      JSON.stringify(pago.provider_payload),
      detalle.servicio || null,
      detalle.precio_base ?? null,
      detalle.usuarios_incluidos ?? null,
      detalle.usuarios_activos ?? null,
      detalle.usuarios_adicionales ?? null,
      detalle.precio_usuario_adicional ?? null,
      detalle.monto_usuarios_adicionales ?? null,
      detalle.subtotal ?? null,
      detalle.tasa_iva ?? null,
      detalle.iva ?? null,
      detalle.total ?? Math.round(Number(monto || 0)),
    ]
  );

  return rows[0] || null;
}

/**
 * Activa la suscripción por un pago confirmado.
 *
 * Devuelve { activado, motivo, usuario, pago }. `activado: false` con motivo
 * `ya_activado` es el caso normal del segundo aviso de Flow y no es un error.
 */
async function activarPorPago(pool, datos) {
  const {
    contratacionId,
    usuarioId,
    meses = 1,
    periodicidad = "mensual",
    usuariosAdicionales = 0,
    proveedor = "flow",
    transaccionId,
    monto,
    payload = {},
  } = datos;

  if (!contratacionId || !usuarioId) {
    return { activado: false, motivo: "faltan_datos" };
  }

  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    // El bloqueo es lo que hace idempotente todo lo demás: el segundo aviso de
    // Flow se detiene aquí hasta que el primero termina, y al seguir ya ve la
    // marca de activación.
    const contratacion = await cliente.query(
      "SELECT * FROM contrataciones_web WHERE id = $1 FOR UPDATE",
      [contratacionId]
    );

    if (contratacion.rows.length === 0) {
      await cliente.query("ROLLBACK");
      return { activado: false, motivo: "contratacion_no_encontrada" };
    }

    const fila = contratacion.rows[0];
    const metadata = fila.metadata || {};

    if (metadata.suscripcion_activada_en) {
      await cliente.query("ROLLBACK");
      return {
        activado: false,
        motivo: "ya_activado",
        activadoEn: metadata.suscripcion_activada_en,
      };
    }

    const usuario = await extenderSuscripcionUsuario(
      cliente,
      usuarioId,
      meses,
      periodicidad,
      usuariosAdicionales,
      String(transaccionId || contratacionId)
    );

    // Reactivar deja la cuenta utilizable: si estaba desactivada por impago,
    // pagar tiene que devolver el acceso.
    await cliente.query("UPDATE usuarios SET activo = true WHERE id = $1", [usuarioId]);

    const suscripcion = await obtenerSuscripcionUsuario(cliente, usuarioId);
    const config = await obtenerConfiguracionSuscripcion(cliente);
    const resumen = calcularMontoSuscripcion({
      usuariosActivos: 1 + Number(usuariosAdicionales || 0),
      meses: periodicidad === "anual" ? 12 : Number(meses || 1),
      config,
    });

    const pago = await registrarPagoSuscripcion(cliente, {
      usuarioId,
      subscriptionId: suscripcion?.id || null,
      monto: monto ?? fila.total ?? resumen.total,
      proveedor,
      transaccionId,
      metodoPago: proveedor,
      periodo: new Date().toISOString().slice(0, 7),
      detalle: {
        servicio: resumen.service_name,
        precio_base: resumen.precio_base_mensual,
        usuarios_incluidos: resumen.usuarios_incluidos,
        usuarios_activos: 1 + Number(usuariosAdicionales || 0),
        usuarios_adicionales: resumen.usuarios_adicionales,
        precio_usuario_adicional: resumen.precio_usuario_adicional,
        monto_usuarios_adicionales: resumen.usuarios_adicionales_total,
        subtotal: resumen.subtotal,
        tasa_iva: resumen.iva_rate ?? null,
        iva: resumen.iva,
        total: resumen.total,
      },
      payload,
    });

    await registrarHistoriaSuscripcion({
      client: cliente,
      subscriptionId: suscripcion?.id || null,
      userId: usuarioId,
      adminUserId: null,
      action: ACCIONES_SUSCRIPCION.RENOVACION,
      previousStatus: null,
      newStatus: suscripcion?.status || "ACTIVE",
      newValues: { transaccion: transaccionId || null, proveedor },
      observation: `Pago confirmado por ${proveedor}, transaccion ${transaccionId || "sin id"}`,
    });

    await cliente.query(
      `
      UPDATE contrataciones_web
      SET metadata = metadata || $1::jsonb,
          actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [
        JSON.stringify({
          suscripcion_activada_en: new Date().toISOString(),
          suscripcion_usuario_id: usuarioId,
          pago_registrado_id: pago?.id || null,
        }),
        contratacionId,
      ]
    );

    await cliente.query("COMMIT");

    return { activado: true, usuario, pago, suscripcion };
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

module.exports = {
  activarPorPago,
  registrarPagoSuscripcion,
};
