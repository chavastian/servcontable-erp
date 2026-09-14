function limpiarRut(valor = "") {
  return String(valor || "")
    .trim()
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/-/g, "")
    .replace(/\s/g, "");
}

function calcularDvRut(cuerpo) {
  let suma = 0;
  let multiplicador = 2;

  for (let i = cuerpo.length - 1; i >= 0; i -= 1) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

function formatearRut(cuerpo, dv) {
  const invertido = String(cuerpo).split("").reverse();
  const grupos = [];

  for (let i = 0; i < invertido.length; i += 3) {
    grupos.push(invertido.slice(i, i + 3).reverse().join(""));
  }

  return `${grupos.reverse().join(".")}-${String(dv).toUpperCase()}`;
}

function normalizarRut(valor = "") {
  const limpio = limpiarRut(valor);

  if (!limpio || limpio.length < 2 || limpio.length > 10) {
    return { valido: false, rut: "", cuerpo: "", dv: "", error: "RUT invalido." };
  }

  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);

  if (!/^\d+$/.test(cuerpo) || !/^[0-9K]$/.test(dv) || cuerpo.length < 7 || cuerpo.length > 8) {
    return { valido: false, rut: "", cuerpo: "", dv: "", error: "Formato de RUT invalido." };
  }

  const dvEsperado = calcularDvRut(cuerpo);
  if (dvEsperado !== dv) {
    return { valido: false, rut: "", cuerpo, dv, error: "El digito verificador del RUT no es valido." };
  }

  return {
    valido: true,
    rut: formatearRut(cuerpo, dv),
    rut_normalizado: `${cuerpo}-${dv}`,
    cuerpo,
    dv,
    error: "",
  };
}

function pareceRut(valor = "") {
  const limpio = limpiarRut(valor);
  return /^[0-9]{7,8}[0-9K]$/.test(limpio);
}

module.exports = {
  limpiarRut,
  normalizarRut,
  pareceRut,
};
