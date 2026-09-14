const PROVEEDORES_PAGO_SUSCRIPCION = Object.freeze({
  MANUAL: "manual",
  FLOW: "flow",
  WEBPAY: "webpay",
  MERCADO_PAGO: "mercado_pago",
});

function normalizarProveedorPago(valor = "") {
  const proveedor = String(valor || "").trim().toLowerCase();

  if (Object.values(PROVEEDORES_PAGO_SUSCRIPCION).includes(proveedor)) {
    return proveedor;
  }

  return PROVEEDORES_PAGO_SUSCRIPCION.MANUAL;
}

function construirPagoSuscripcion({
  provider = PROVEEDORES_PAGO_SUSCRIPCION.MANUAL,
  providerPayload = {},
  transactionId = "",
  paymentMethod = "",
} = {}) {
  return {
    provider: normalizarProveedorPago(provider),
    provider_payload: providerPayload || {},
    transaction_id: transactionId || "",
    payment_method: paymentMethod || normalizarProveedorPago(provider),
  };
}

module.exports = {
  PROVEEDORES_PAGO_SUSCRIPCION,
  construirPagoSuscripcion,
  normalizarProveedorPago,
};
