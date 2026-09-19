import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../../services/empresaService";
import { listarLiquidaciones } from "../../services/liquidacionesService";
import { obtenerPeriodoTrabajo } from "../../services/periodoTrabajoService";
import PeriodoMesSelector from "../../components/PeriodoMesSelector";
import { obtenerConfiguracionRemuneraciones } from "../../services/configuracionRemuneracionesService";

const CAMPOS_PREVIRED = 105;

const CAMPOS_ALFANUMERICOS = new Set([
  2, 3, 4, 5, 6, 11, 14, 16, 17, 18, 25, 35, 36, 37, 41, 46, 51, 52, 53, 54,
  56, 57, 76, 95, 104, 105,
]);

const CODIGOS_AFP = {
  capital: "33",
  cuprum: "03",
  habitat: "05",
  modelo: "34",
  planvital: "29",
  provida: "08",
  uno: "35",
};

const TASAS_AFP_PREVIRED = {
  capital: 11.54,
  cuprum: 11.54,
  habitat: 11.37,
  modelo: 10.68,
  planvital: 11.26,
  provida: 11.55,
  uno: 10.56,
};

const CODIGOS_SALUD = {
  sinisapre: "00",
  banmedica: "01",
  consalud: "02",
  vidatres: "03",
  colmena: "04",
  cruzblanca: "05",
  fonasa: "07",
  nuevamasvida: "10",
  isalud: "11",
  fundacion: "12",
  cruzdelnorte: "25",
  esencial: "28",
};

const CODIGOS_MUTUAL = {
  sinmutual: "0",
  isl: "0",
  achs: "1",
  asociacionchilenadeseguridad: "1",
  mutualdeseguridadcchc: "2",
  mutualdeseguridad: "2",
  ist: "3",
  institutodeseguridaddeltrabajo: "3",
};

function limpiarTexto(texto) {
  return String(texto === null || texto === undefined ? "" : texto)
    .replace(/;/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .trim();
}

function limpiarClave(texto) {
  return limpiarTexto(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function numero(valor) {
  const n = Math.round(Number(valor || 0));
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

function formato(valor) {
  return `$${Number(valor || 0).toLocaleString("es-CL")}`;
}

function normalizarRut(rutCompleto) {
  const limpio = limpiarTexto(rutCompleto).replace(/\./g, "").replace(/\s/g, "");
  const partes = limpio.toUpperCase().split("-");

  if (partes.length === 2) {
    return { rut: partes[0], dv: partes[1] };
  }

  return {
    rut: limpio.slice(0, -1),
    dv: limpio.slice(-1).toUpperCase(),
  };
}

function separarApellidos(apellidos) {
  const partes = limpiarTexto(apellidos).split(" ").filter(Boolean);
  return {
    paterno: partes[0] || "",
    materno: partes.slice(1).join(" ") || "",
  };
}

function periodoPrevired(periodoTexto) {
  const [anio, mes] = String(periodoTexto || "").split("-");
  const mesNumero = Number(mes || 0);
  return `${mesNumero || ""}${anio || ""}`;
}

function rutArchivoPrevired(rutEmpresa) {
  return limpiarTexto(rutEmpresa)
    .replace(/\./g, "")
    .replace(/[^0-9Kk-]/g, "")
    .toUpperCase();
}

function codigoSexo(valor) {
  const sexo = limpiarClave(valor);
  if (sexo === "m" || sexo === "masculino") return "M";
  if (sexo === "f" || sexo === "femenino") return "F";
  return "";
}

function codigoNacionalidad(valor) {
  const texto = limpiarClave(valor);
  return texto.includes("extranj") ? "1" : "0";
}

function codigoAfpDesdeNombre(nombreAfp) {
  const texto = limpiarClave(nombreAfp);
  if (!texto) return "";

  if (texto.includes("planvital")) return "29";
  if (texto.includes("provida")) return "08";
  if (texto.includes("habitat")) return "05";
  if (texto.includes("cuprum")) return "03";
  if (texto.includes("capital")) return "33";
  if (texto.includes("modelo")) return "34";
  if (texto.includes("uno")) return "35";

  return CODIGOS_AFP[texto] || "";
}

function codigoSaludDesdeNombre(nombreSalud) {
  const texto = limpiarClave(nombreSalud);
  if (!texto) return "";

  if (texto.includes("fonasa")) return "07";
  if (texto.includes("banmedica")) return "01";
  if (texto.includes("consalud")) return "02";
  if (texto.includes("vidatres")) return "03";
  if (texto.includes("colmena")) return "04";
  if (texto.includes("cruzblanca")) return "05";
  if (texto.includes("nuevamasvida")) return "10";
  if (texto.includes("isalud")) return "11";
  if (texto.includes("fundacion")) return "12";
  if (texto.includes("cruzdelnorte")) return "25";
  if (texto.includes("esencial")) return "28";

  return CODIGOS_SALUD[texto] || "";
}

function codigoMutualDesdeNombre(nombreMutual) {
  const texto = limpiarClave(nombreMutual);
  if (!texto) return "0";

  if (texto.includes("achs")) return "1";
  if (
    texto.includes("mutualdeseguridad") ||
    texto.includes("cchc")
  )
    return "2";
  if (
    texto === "ist" ||
    texto.includes("institutodeseguridaddeltrabajo")
  )
    return "3";
  if (texto.includes("isl") || texto.includes("sinmutual")) return "0";

  return CODIGOS_MUTUAL[texto] || "0";
}

function normalizarCodigoNumerico(valor, fallback = "0") {
  const texto = limpiarTexto(valor);
  if (!texto) return fallback;

  const digitos = texto.replace(/\D/g, "");
  if (!digitos) return fallback;

  return String(Number(digitos));
}

function codigoJornadaDesdeNombre(nombreJornada) {
  const texto = limpiarClave(nombreJornada);
  if (
    texto.includes("parcial") ||
    texto.includes("parttime") ||
    texto.includes("mediajornada")
  ) {
    return "2";
  }

  return "1";
}

function tasaAfpPreviredDesdeNombre(nombreAfp) {
  const texto = limpiarClave(nombreAfp);
  if (!texto) return 0;

  if (texto.includes("planvital")) return TASAS_AFP_PREVIRED.planvital;
  if (texto.includes("provida")) return TASAS_AFP_PREVIRED.provida;
  if (texto.includes("habitat")) return TASAS_AFP_PREVIRED.habitat;
  if (texto.includes("cuprum")) return TASAS_AFP_PREVIRED.cuprum;
  if (texto.includes("capital")) return TASAS_AFP_PREVIRED.capital;
  if (texto.includes("modelo")) return TASAS_AFP_PREVIRED.modelo;
  if (texto.includes("uno")) return TASAS_AFP_PREVIRED.uno;

  return TASAS_AFP_PREVIRED[texto] || 0;
}

function cotizacionAfpPrevired(item, baseImponible) {
  const tasa = tasaAfpPreviredDesdeNombre(item.afp);
  if (tasa > 0 && baseImponible > 0) {
    return numero(Math.round(Number(baseImponible || 0) * (tasa / 100)));
  }

  return numero(item.descuento_afp);
}

function codigoTramoAsignacion(valor) {
  const tramo = limpiarTexto(valor).toUpperCase();
  if (["A", "B", "C", "D"].includes(tramo)) return tramo;
  return "D";
}

function periodoEsDesdeAgosto2025(periodoTexto) {
  const [anioStr, mesStr] = String(periodoTexto || "").split("-");
  const anio = Number(anioStr);
  const mes = Number(mesStr);
  if (!Number.isFinite(anio) || !Number.isFinite(mes)) return false;
  if (anio > 2025) return true;
  if (anio < 2025) return false;
  return mes >= 8;
}

function prepararItemPrevired(item, periodoTexto = "", configuracion = null) {
  const rut = normalizarRut(item.rut);
  const apellidos = separarApellidos(item.apellidos);

  const sexo = codigoSexo(item.sexo);
  const nacionalidad = codigoNacionalidad(item.nacionalidad);

  const diasTrabajados = numero(item.dias_trabajados || 30);
  const baseImponible = numero(
    item.base_afecta_descuentos ||
      item.total_haberes_imponibles ||
      item.base_imponible
  );
  const descuentoAfp = cotizacionAfpPrevired(item, baseImponible);
  const descuentoSalud = numero(item.descuento_salud);
  const descuentoAfc = numero(item.descuento_afc);
  const aporteAfcEmpleador = numero(item.aporte_afc_empleador);
  const aporteSisEmpleador = numero(item.aporte_sis_empleador);
  const aporteMutualEmpleador = numero(item.aporte_mutual_empleador);
  const tasaMutualConfigurada = Number(
    String(configuracion?.tasa_mutual || 0).replace(",", ".")
  );

  const codigoAfp = normalizarCodigoNumerico(
    item.codigo_afp_previred || codigoAfpDesdeNombre(item.afp),
    ""
  );
  const codigoSalud = normalizarCodigoNumerico(
    item.codigo_salud_previred || codigoSaludDesdeNombre(item.salud),
    ""
  );
  const mutualConfiguradaRaw = limpiarTexto(configuracion?.mutual_codigo_previred);
  const mutualConfigurada =
    mutualConfiguradaRaw === "0" && tasaMutualConfigurada > 0
      ? ""
      : mutualConfiguradaRaw;
  const codigoMutualConfig = mutualConfigurada
    ? normalizarCodigoNumerico(mutualConfigurada, "0")
    : "";
  const codigoMutualItem = normalizarCodigoNumerico(
    item.codigo_mutual_previred || codigoMutualDesdeNombre(item.mutual),
    ""
  );
  let codigoMutual = codigoMutualConfig || codigoMutualItem;

  if ((!codigoMutual || codigoMutual === "0") && aporteMutualEmpleador > 0 && !mutualConfigurada) {
    codigoMutual = "1";
  }

  if (!codigoMutual) codigoMutual = "0";

  const sucursalMutual = normalizarCodigoNumerico(
    configuracion?.mutual_sucursal_previred,
    "0"
  );
  const codigoCcaf = normalizarCodigoNumerico(item.codigo_ccaf_previred, "0");

  const tipoTrabajador = limpiarTexto(item.tipo_trabajador_previred || "0") || "0";
  const regimenPrevired = limpiarTexto(item.regimen_previsional || "").toUpperCase();
  const regimen = regimenPrevired === "AFP" || regimenPrevired === "IPS"
    ? regimenPrevired
    : codigoAfp && codigoAfp !== "0"
      ? "AFP"
      : "SIP";
  const esFonasa = codigoSalud === "7";
  const esIsapre = codigoSalud !== "0" && !esFonasa;

  const totalCargas = Math.max(0, Math.min(99, numero(item.cargas)));
  const aplicaSeguroSocialReforma = periodoEsDesdeAgosto2025(periodoTexto);
  const cotizacionEsperanzaVida =
    aplicaSeguroSocialReforma && tipoTrabajador === "0" && regimen === "AFP"
      ? Math.round(baseImponible * 0.009)
      : 0;

  const usaSeguroCesantia = descuentoAfc > 0 || aporteAfcEmpleador > 0;

  const errores = [];
  if (!rut.rut || !rut.dv) errores.push("RUT");
  if (!item.nombres) errores.push("Nombres");
  if (!item.apellidos) errores.push("Apellidos");
  if (!sexo) errores.push("Sexo");
  if (!codigoAfp) errores.push("AFP no mapeada");
  if (!codigoSalud) errores.push("Salud no mapeada");
  if (baseImponible <= 0) errores.push("Base imponible");

  return {
    errores,
    rut,
    apellidos,
    sexo,
    nacionalidad,
    codigoAfp,
    codigoSalud,
    codigoMutual,
    sucursalMutual,
    codigoCcaf,
    diasTrabajados,
    baseImponible,
    descuentoAfp,
    descuentoSalud,
    descuentoAfc,
    aporteAfcEmpleador,
    aporteSisEmpleador,
    aporteMutualEmpleador,
    tipoTrabajador,
    regimen,
    esFonasa,
    esIsapre,
    totalCargas,
    cotizacionEsperanzaVida,
    usaSeguroCesantia,
  };
}

function setCampo(campos, numeroCampo, valor) {
  const indice = numeroCampo - 1;
  const limpio = limpiarTexto(valor);
  campos[indice] = limpio;
}

function crearFilaPrevired(item, periodo, configuracion = null) {
  const datos = prepararItemPrevired(item, periodo, configuracion);
  const codPeriodo = periodoPrevired(periodo);

  const campos = Array.from({ length: CAMPOS_PREVIRED }, (_, i) =>
    CAMPOS_ALFANUMERICOS.has(i + 1) ? "" : "0"
  );

  setCampo(campos, 1, datos.rut.rut);
  setCampo(campos, 2, datos.rut.dv);
  setCampo(campos, 3, datos.apellidos.paterno);
  setCampo(campos, 4, datos.apellidos.materno);
  setCampo(campos, 5, item.nombres);
  setCampo(campos, 6, datos.sexo);
  setCampo(campos, 7, datos.nacionalidad);
  setCampo(campos, 8, "1");
  setCampo(campos, 9, codPeriodo);
  setCampo(campos, 10, codPeriodo);
  setCampo(campos, 11, datos.regimen);
  setCampo(campos, 12, datos.tipoTrabajador);
  setCampo(campos, 13, datos.diasTrabajados);
  setCampo(campos, 14, "0");
  setCampo(campos, 15, "0");
  setCampo(campos, 18, codigoTramoAsignacion(item.tramo_asignacion));
  setCampo(campos, 19, Number.isFinite(datos.totalCargas) ? datos.totalCargas : 0);
  setCampo(campos, 25, "N");

  setCampo(campos, 26, datos.codigoAfp || "0");
  setCampo(campos, 27, datos.baseImponible);
  setCampo(campos, 28, datos.descuentoAfp);
  setCampo(campos, 29, datos.aporteSisEmpleador);
  setCampo(campos, 30, "0");
  setCampo(campos, 40, "0");
  setCampo(campos, 41, "0");
  setCampo(campos, 42, "0");
  setCampo(campos, 45, "0");
  setCampo(campos, 47, "0");

  if (datos.esFonasa) {
    setCampo(campos, 62, "0");
    setCampo(campos, 64, datos.baseImponible);
    setCampo(campos, 70, datos.descuentoSalud);
  }

  setCampo(campos, 75, datos.codigoSalud || "0");
  setCampo(campos, 78, "");
  if (datos.esIsapre) {
    setCampo(campos, 77, datos.baseImponible);
    setCampo(campos, 78, "1");
    setCampo(campos, 79, datos.descuentoSalud);
    setCampo(campos, 80, datos.descuentoSalud);
  }

  setCampo(campos, 83, datos.codigoCcaf);
  if (datos.codigoCcaf !== "0") {
    setCampo(campos, 84, datos.baseImponible);
  }
  setCampo(campos, 86, "");
  setCampo(campos, 87, "");
  setCampo(campos, 88, "");
  setCampo(campos, 89, "");

  setCampo(campos, 93, codigoJornadaDesdeNombre(item.jornada));
  setCampo(campos, 94, datos.cotizacionEsperanzaVida);
  setCampo(campos, 95, "0");

  const tieneMutual =
    datos.codigoMutual !== "0" && datos.aporteMutualEmpleador > 0;

  setCampo(campos, 96, tieneMutual ? datos.codigoMutual : "0");
  setCampo(campos, 97, tieneMutual ? datos.baseImponible : "0");
  setCampo(campos, 98, tieneMutual ? datos.aporteMutualEmpleador : "0");
  setCampo(campos, 99, tieneMutual ? datos.sucursalMutual : "0");

  if (datos.usaSeguroCesantia) {
    setCampo(campos, 100, datos.baseImponible);
    setCampo(campos, 102, datos.aporteAfcEmpleador);
  }

  setCampo(campos, 101, datos.usaSeguroCesantia ? numero(datos.descuentoAfc) : 0);
  setCampo(campos, 104, "0");
  setCampo(campos, 105, item.centro_costo || "0");

  return campos.join(";");
}

function nombreTrabajador(item) {
  return `${item.nombres || ""} ${item.apellidos || ""}`.trim();
}

function validacionesLiquidacion(liquidaciones, periodo, configuracion = null) {
  const errores = [];

  for (const item of liquidaciones) {
    const datos = prepararItemPrevired(item, periodo, configuracion);
    if (datos.errores.length > 0) {
      errores.push(
        `${item.rut || "Sin RUT"} - ${nombreTrabajador(item)}: ${datos.errores.join(", ")}`
      );
    }
  }

  return errores;
}

export default function PreviredRemuneraciones() {
  const empresaActiva = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [configuracion, setConfiguracion] = useState(null);
  const [totales, setTotales] = useState({
    total_haberes: 0,
    total_descuentos: 0,
    liquido_pagar: 0,
    costo_empresa: 0,
  });

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (empresaActiva) {
      cargarDatos();
    }
  }, []);

  async function cargarDatos() {
    try {
      setMensaje("");
      setError("");

      const [data, configData] = await Promise.all([
        listarLiquidaciones(empresaActiva.id, periodo),
        obtenerConfiguracionRemuneraciones(empresaActiva.id, periodo),
      ]);

      setLiquidaciones(data.liquidaciones || []);
      setConfiguracion(configData.configuracion || null);
      setTotales(
        data.totales || {
          total_haberes: 0,
          total_descuentos: 0,
          liquido_pagar: 0,
          costo_empresa: 0,
        }
      );

      setMensaje("Datos Previred cargados correctamente.");
    } catch (err) {
      setError(err.message);
    }
  }

  function exportarCSVPrevired() {
    setError("");
    setMensaje("");

    if (liquidaciones.length === 0) {
      setError("No hay liquidaciones para exportar.");
      return;
    }

    const errores = validacionesLiquidacion(liquidaciones, periodo, configuracion);
    if (errores.length > 0) {
      setError(
        `Hay datos faltantes antes de exportar: ${errores.slice(0, 5).join(" | ")}${
          errores.length > 5 ? "..." : ""
        }`
      );
      return;
    }

    const lineas = liquidaciones.map((item) =>
      crearFilaPrevired(item, periodo, configuracion)
    );
    const contenido = lineas.join("\r\n");

    const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Previred_${rutArchivoPrevired(empresaActiva?.rut || "")}_${periodoPrevired(periodo)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setMensaje(
      "CSV Previred generado con formato largo variable (105 campos). Validar en Previred antes del envio oficial."
    );
  }

  return (
    <div>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <div style={card}>
        <h2 style={tituloSeccion}>Exportación CSV Previred</h2>

        <div style={alerta}>
          Se exporta en formato largo variable por separador ";" con 105 campos por linea, segun v95.
        </div>

        <div style={filtros}>
          <div>
            <label style={label}>Período</label>
            <PeriodoMesSelector
              style={input}
              value={periodo}
              onChange={setPeriodo}
            />
          </div>

          <button type="button" style={botonBuscar} onClick={cargarDatos}>
            Buscar
          </button>

          <button type="button" style={botonCsv} onClick={exportarCSVPrevired}>
            Exportar CSV Previred
          </button>
        </div>
      </div>

      <div style={gridResumen}>
        <div style={cardResumen}>
          <strong>Trabajadores</strong>
          <span>{liquidaciones.length}</span>
        </div>

        <div style={cardResumen}>
          <strong>Total haberes</strong>
          <span>{formato(totales.total_haberes)}</span>
        </div>

        <div style={cardResumen}>
          <strong>Total descuentos</strong>
          <span>{formato(totales.total_descuentos)}</span>
        </div>

        <div style={cardResumenVerde}>
          <strong>Líquido a pagar</strong>
          <span>{formato(totales.liquido_pagar)}</span>
        </div>
      </div>

      <div style={card}>
        <h2 style={tituloSeccion}>Validación previa</h2>

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>RUT</th>
                <th style={th}>Trabajador</th>
                <th style={th}>AFP</th>
                <th style={th}>Cod AFP</th>
                <th style={th}>Salud</th>
                <th style={th}>Cod Salud</th>
                <th style={thNumero}>Base imponible</th>
                <th style={th}>Estado</th>
              </tr>
            </thead>

            <tbody>
              {liquidaciones.map((item) => {
                const datos = prepararItemPrevired(item, periodo, configuracion);
                return (
                  <tr key={item.id}>
                    <td style={td}>{item.rut}</td>
                    <td style={td}>{nombreTrabajador(item)}</td>
                    <td style={td}>{item.afp || "-"}</td>
                    <td style={td}>{datos.codigoAfp || "-"}</td>
                    <td style={td}>{item.salud || "-"}</td>
                    <td style={td}>{datos.codigoSalud || "-"}</td>
                    <td style={tdNumero}>{formato(datos.baseImponible)}</td>
                    <td style={td}>
                      {datos.errores.length === 0 ? (
                        <span style={badgeOk}>OK</span>
                      ) : (
                        <span style={badgeError}>
                          Falta: {datos.errores.join(", ")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {liquidaciones.length === 0 && (
                <tr>
                  <td style={td} colSpan="8">
                    No hay liquidaciones emitidas para este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const card = {
  background: "white",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "20px",
};

const tituloSeccion = {
  color: "var(--sc-azul)",
  marginTop: 0,
};

const alerta = {
  background: "var(--sc-naranja-fondo)",
  border: "1px solid #fed7aa",
  color: "var(--sc-naranja-texto)",
  padding: "12px",
  borderRadius: "12px",
  marginBottom: "16px",
  fontWeight: "bold",
};

const filtros = {
  display: "flex",
  alignItems: "end",
  gap: "12px",
  flexWrap: "wrap",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-text)",
  marginBottom: "5px",
};

const input = {
  width: "170px",
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "10px",
  height: "40px",
  boxSizing: "border-box",
};

const botonBase = {
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const botonBuscar = {
  ...botonBase,
  background: "var(--sc-azul)",
};

const botonCsv = {
  ...botonBase,
  background: "#7c3aed",
};

const gridResumen = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "14px",
  marginBottom: "20px",
};

const cardResumen = {
  background: "white",
  borderRadius: "16px",
  padding: "16px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  color: "var(--sc-text)",
};

const cardResumenVerde = {
  ...cardResumen,
  border: "1px solid #22c55e",
};

const tablaBox = {
  overflowX: "auto",
};

const tabla = {
  width: "100%",
  borderCollapse: "collapse",
};

const th = {
  textAlign: "left",
  padding: "10px",
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  color: "var(--sc-azul)",
  whiteSpace: "nowrap",
};

const thNumero = {
  ...th,
  textAlign: "right",
};

const td = {
  padding: "9px",
  borderBottom: "1px solid var(--sc-borde-claro)",
  color: "var(--sc-text)",
};

const tdNumero = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const badgeOk = {
  background: "#dcfce7",
  color: "#166534",
  padding: "5px 8px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "12px",
};

const badgeError = {
  background: "#fee2e2",
  color: "#991b1b",
  padding: "5px 8px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "12px",
};

const ok = {
  color: "var(--sc-teal)",
  fontWeight: "bold",
};

const err = {
  color: "var(--sc-danger)",
  fontWeight: "bold",
};
