export const CONFIG_COMERCIAL = Object.freeze({
  servicio: "SERVCONTABLE PRO",
  precioBaseMensual: 29990,
  ivaRate: 0.19,
  usuariosIncluidos: 1,
  precioUsuarioAdicional: 3990,
  empresas: "Ilimitadas",
});

export function calcularMontoComercial({ usuariosActivos = 1, usuariosAdicionales = null, meses = 1 } = {}) {
  const mesesCobro = Math.max(1, Number(meses || 1));
  const activos = Number.isFinite(Number(usuariosAdicionales))
    ? CONFIG_COMERCIAL.usuariosIncluidos + Math.max(0, Number(usuariosAdicionales || 0))
    : Math.max(0, Number(usuariosActivos || 0));
  const adicionales = Math.max(0, activos - CONFIG_COMERCIAL.usuariosIncluidos);
  const base = CONFIG_COMERCIAL.precioBaseMensual * mesesCobro;
  const usuarios = CONFIG_COMERCIAL.precioUsuarioAdicional * adicionales * mesesCobro;
  const neto = base + usuarios;
  const iva = Math.round(neto * CONFIG_COMERCIAL.ivaRate);

  return {
    mesesCobro,
    usuariosActivos: activos,
    usuariosAdicionales: adicionales,
    base,
    usuarios,
    neto,
    iva,
    total: neto + iva,
  };
}
