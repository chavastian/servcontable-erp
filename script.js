const header = document.querySelector("[data-header]");
const checkoutForm = document.querySelector("[data-checkout-form]");
const trialForm = document.querySelector("[data-trial-form]");
const checkoutStatus = document.querySelector("[data-form-status]");
const trialStatus = document.querySelector("[data-trial-status]");
const planCycleInput = document.querySelector("[data-plan-cycle]");
const extraUsersInput = document.querySelector("[data-extra-users]");
const summaryPlan = document.querySelector("[data-summary-plan]");
const summaryBase = document.querySelector("[data-summary-base]");
const summaryUsers = document.querySelector("[data-summary-users]");
const summaryUsersLabel = document.querySelector("[data-summary-users-label]");
const summarySubtotal = document.querySelector("[data-summary-subtotal]");
const summaryTax = document.querySelector("[data-summary-tax]");
const summaryTotal = document.querySelector("[data-summary-total]");

const API_BASE_URL =
  window.ServContableConfig?.apiBaseUrl || "https://api.servcontablepro.cl";
const CONTACT_ENDPOINT = `${API_BASE_URL}/api/contacto`;
const TRIAL_ENDPOINT = `${API_BASE_URL}/api/contacto/prueba-gratis`;
const DEFAULT_PAYMENT_ENDPOINT = `${API_BASE_URL}/api/pagos-flow/preferencia`;
const APP_URL = window.ServContableConfig?.appUrl || "https://app.servcontablepro.cl/";

window.ServContablePagoConfig = window.ServContablePagoConfig || {};
window.ServContablePagoConfig.paymentEndpoint =
  window.ServContablePagoConfig.paymentEndpoint || DEFAULT_PAYMENT_ENDPOINT;

const PRICES = {
  monthlyBase: 16990,
  annualMonthlyBase: 14990,
  extraUserMonthly: 3990,
  annualMonths: 12,
  taxRate: 0.19,
};

function formatCLP(value) {
  return `$${Math.round(Number(value || 0)).toLocaleString("es-CL")}`;
}

function normalizeInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function updateHeader() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 24);
}

function trackAnalyticsEvent(eventName, params = {}) {
  if (typeof window.gtag !== "function") return;
  window.gtag("event", eventName, {
    page_path: `${window.location.pathname}${window.location.hash}`,
    ...params,
  });
}

function setStatus(element, message, type = "") {
  if (!element) return;
  element.textContent = message;
  element.classList.remove("is-error", "is-success");
  if (type) element.classList.add(type);
}

function getQuote() {
  const modalidad = planCycleInput?.value === "anual" ? "anual" : "mensual";
  const extraUsers = normalizeInteger(extraUsersInput?.value || 0);
  const billedMonths = modalidad === "anual" ? PRICES.annualMonths : 1;
  const baseNet =
    modalidad === "anual"
      ? PRICES.annualMonthlyBase * PRICES.annualMonths
      : PRICES.monthlyBase;
  const extraUsersNet = PRICES.extraUserMonthly * extraUsers * billedMonths;
  const subtotalNet = baseNet + extraUsersNet;
  const tax = Math.round(subtotalNet * PRICES.taxRate);
  const total = subtotalNet + tax;

  return {
    modalidad,
    billedMonths,
    extraUsers,
    baseNet,
    extraUsersNet,
    subtotalNet,
    tax,
    total,
  };
}

function updateQuoteSummary() {
  const quote = getQuote();
  const planName =
    quote.modalidad === "anual"
      ? "ServContable PRO anual"
      : "ServContable PRO mensual";
  const usersLabel =
    quote.extraUsers === 1
      ? "1 usuario adicional"
      : `${quote.extraUsers} usuarios adicionales`;

  if (summaryPlan) summaryPlan.textContent = planName;
  if (summaryBase) summaryBase.textContent = formatCLP(quote.baseNet);
  if (summaryUsers) summaryUsers.textContent = formatCLP(quote.extraUsersNet);
  if (summaryUsersLabel) {
    summaryUsersLabel.textContent =
      quote.extraUsers > 0 ? usersLabel : "Usuarios adicionales";
  }
  if (summarySubtotal) summarySubtotal.textContent = formatCLP(quote.subtotalNet);
  if (summaryTax) summaryTax.textContent = formatCLP(quote.tax);
  if (summaryTotal) summaryTotal.textContent = formatCLP(quote.total);
}

function getPaymentEndpoints() {
  const endpoint =
    window.ServContablePagoConfig?.paymentEndpoint || DEFAULT_PAYMENT_ENDPOINT;

  if (!endpoint) {
    throw new Error("El endpoint de pago no está configurado.");
  }

  const fallbackEndpoint = endpoint.replace(/\/checkout$/, "/preferencia");
  return Array.from(new Set([endpoint, fallbackEndpoint]));
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "No se pudo completar la solicitud.");
  }

  return data;
}

async function handleTrialSubmit(event) {
  event.preventDefault();

  const formData = new FormData(trialForm);
  const submitButton = trialForm.querySelector("button[type='submit']");
  const correo = String(formData.get("correo") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmarPassword = String(formData.get("confirmar_password") || "");

  if (!correo || !password || !confirmarPassword) {
    setStatus(trialStatus, "Completa correo, contraseña y confirmación para comenzar.", "is-error");
    return;
  }

  if (password !== confirmarPassword) {
    setStatus(trialStatus, "Las contraseñas no coinciden.", "is-error");
    return;
  }

  if (password.length < 8) {
    setStatus(trialStatus, "La contraseña debe tener al menos 8 caracteres.", "is-error");
    return;
  }

  setStatus(trialStatus, "Creando tu cuenta de prueba...");
  submitButton.disabled = true;

  try {
    const data = await postJson(TRIAL_ENDPOINT, {
      correo,
      password,
      confirmar_password: confirmarPassword,
    });

    trackAnalyticsEvent("prueba_gratis_creada", { correo });
    trialForm.reset();
    setStatus(
      trialStatus,
      "Cuenta creada. Te estamos llevando a ServContable PRO...",
      "is-success"
    );

    if (data.token && data.usuario) {
      const payload = window.btoa(unescape(encodeURIComponent(JSON.stringify({
        token: data.token,
        usuario: data.usuario,
      }))));
      window.location.href = `${APP_URL.replace(/\/+$/, "/")}#trialSession=${payload}`;
    }
  } catch (error) {
    setStatus(
      trialStatus,
      error.message || "No pudimos crear tu cuenta en este momento. Intenta nuevamente.",
      "is-error"
    );
  } finally {
    submitButton.disabled = false;
  }
}

async function handleCheckoutSubmit(event) {
  event.preventDefault();

  const formData = new FormData(checkoutForm);
  const submitButton = checkoutForm.querySelector("button[type='submit']");
  const aceptaTerminos = formData.get("acepta_terminos") === "on";
  const quote = getQuote();
  const payload = {
    nombre: String(formData.get("nombre") || "").trim(),
    correo: String(formData.get("correo") || "").trim(),
    empresa: String(formData.get("empresa") || "").trim(),
    rut: String(formData.get("rut") || "").trim(),
    telefono: String(formData.get("telefono") || "").trim(),
    mensaje: "Contratación web desde landing ServContable PRO.",
    plan: quote.modalidad,
    periodicidad: quote.modalidad,
    meses: quote.billedMonths,
    usuarios_adicionales: quote.extraUsers,
    total: quote.total,
    iva: quote.tax,
    subtotal_neto: quote.subtotalNet,
    acepta_terminos: aceptaTerminos,
    origen: "landing_servcontablepro_flow",
  };

  if (!payload.nombre || !payload.correo || !payload.empresa || !payload.rut || !payload.telefono) {
    setStatus(checkoutStatus, "Completa todos los datos de contratación para continuar.", "is-error");
    return;
  }

  if (!aceptaTerminos) {
    setStatus(checkoutStatus, "Debes aceptar las condiciones antes de pagar.", "is-error");
    return;
  }

  setStatus(checkoutStatus, "Creando pago seguro en Flow...");
  submitButton.disabled = true;

  trackAnalyticsEvent("pago_flow_intento", {
    plan: payload.plan,
    total: payload.total,
    usuarios_adicionales: payload.usuarios_adicionales,
  });

  try {
    let responseData = {};

    for (const endpoint of getPaymentEndpoints()) {
      try {
        responseData = await postJson(endpoint, payload);
        break;
      } catch (error) {
        if (!endpoint.endsWith("/checkout")) throw error;
      }
    }

    const paymentUrl =
      responseData.checkout_url ||
      responseData.url ||
      responseData.url_pago ||
      responseData.payment_url ||
      responseData.init_point ||
      responseData.sandbox_init_point;

    if (!paymentUrl) {
      throw new Error("El backend no devolvió el link de pago de Flow.");
    }

    trackAnalyticsEvent("pago_flow_redireccion", {
      plan: payload.plan,
      total: payload.total,
    });

    setStatus(checkoutStatus, "Redirigiendo a Flow...", "is-success");
    window.location.href = paymentUrl;
  } catch (error) {
    setStatus(
      checkoutStatus,
      error.message || "No se pudo iniciar el pago. Intenta nuevamente.",
      "is-error"
    );
  } finally {
    submitButton.disabled = false;
  }
}

function getQueryParam(name) {
  return new URL(window.location.href).searchParams.get(name);
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value || "-";
}

function setEmailLink(email) {
  const link = document.querySelector("[data-result-email-link]");
  if (!link || !email) return;
  link.textContent = email;
  link.href = `mailto:${email}`;
}

async function hydratePaymentResult() {
  const resultPage = document.querySelector("[data-payment-result]");
  if (!resultPage) return;

  const id = getQueryParam("contratacion");
  if (!id) return;

  setText("[data-result-id]", `#${id}`);

  try {
    const response = await fetch(`${API_BASE_URL}/api/pagos-flow/contratacion/${encodeURIComponent(id)}`);
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.contratacion) return;

    const contratacion = data.contratacion;
    setText("[data-result-email]", contratacion.correo);
    setEmailLink(contratacion.correo);
    setText(
      "[data-result-plan]",
      contratacion.periodicidad === "anual"
        ? "ServContable PRO anual"
        : "ServContable PRO mensual"
    );
    setText("[data-result-amount]", formatCLP(contratacion.total));
    setText("[data-result-status]", contratacion.estado);
  } catch {
    setText("[data-result-status]", "No disponible");
  }
}

window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();
updateQuoteSummary();
hydratePaymentResult();

if (planCycleInput) {
  planCycleInput.addEventListener("change", updateQuoteSummary);
}

if (extraUsersInput) {
  extraUsersInput.addEventListener("input", updateQuoteSummary);
}

if (trialForm) {
  trialForm.addEventListener("submit", handleTrialSubmit);
}

if (checkoutForm) {
  checkoutForm.addEventListener("submit", handleCheckoutSubmit);
}

document.querySelectorAll("[data-track]").forEach((element) => {
  element.addEventListener("click", () => {
    trackAnalyticsEvent(`click_${element.dataset.track}`);
  });
});
