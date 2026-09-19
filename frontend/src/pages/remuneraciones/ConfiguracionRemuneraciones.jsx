import { useEffect, useState, useId } from "react";
import { obtenerEmpresaActiva } from "../../services/empresaService";
import { listarCuentas } from "../../services/cuentaService";
import { obtenerPeriodoTrabajo } from "../../services/periodoTrabajoService";
import PeriodoMesSelector from "../../components/PeriodoMesSelector";
import IconoSistema from "../../components/IconoSistema";
import {
  hero,
  titulo,
  subtitulo,
  filtrosHero,
  labelHero,
  inputHero,
  botonHero,
  card,
  cardHeader,
  tituloSeccion,
  tituloSeccionSeparado,
  tituloIcono,
  textoMuted,
  notaSalud,
  importBox,
  inputFile,
  botonImportar,
  grid,
  gridAfp,
  labelStyle,
  inputStyle,
  inputSoloLectura,
  ayudaCampo,
  botonGuardar,
  botonCancelar,
  botonIcono,
  badgeInfo,
  tablaBox,
  tabla,
  th,
  thNumero,
  thAccion,
  td,
  tdNumero,
  tdAccion,
  botonEditar,
  botonEliminar,
  ok,
  err,
} from "./ConfiguracionRemuneraciones.estilos";
import {
  obtenerConfiguracionRemuneraciones,
  guardarConfiguracionRemuneraciones,
  guardarAFP,
  eliminarAFP,
  importarIndicadoresPrevisionales,
} from "../../services/configuracionRemuneracionesService";

const MUTUALES_PREVIRED = [
  { codigo: "0", nombre: "Sin Mutual / ISL" },
  { codigo: "1", nombre: "Asociacion Chilena de Seguridad (ACHS)" },
  { codigo: "2", nombre: "Mutual de Seguridad CCHC" },
  { codigo: "3", nombre: "Instituto de Seguridad del Trabajo (IST)" },
];

const SALUD_FONASA_LEGAL = 7;
const SALUD_CCAF_PREVIRED_DEFECTO = 3.1;
const SALUD_FONASA_CCAF_PREVIRED_DEFECTO = 3.9;
const MAX_PDF_INDICADORES_BYTES = 10 * 1024 * 1024;

const AFP_FORM_INICIAL = {
  nombre: "",
  tasa_afp: "",
  tasa_empleador: "",
  tasa_total: "",
  tasa_independiente: "",
  tasa_sis: "",
  tasa_seguro_social: "1.00",
};

const INDICADORES_PREVISIONALES_INICIALES = {
  fuente: "",
  periodo_remuneracion: "",
  periodo_pago: "",

  valor_uf: 0,
  valor_uf_anterior: 0,
  valor_utm: 0,
  valor_uta: 0,

  renta_tope_afp_uf: 0,
  renta_tope_afp_monto: 0,
  renta_tope_ips_uf: 60,
  renta_tope_ips_monto: 0,
  renta_tope_seguro_cesantia_uf: 0,
  renta_tope_seguro_cesantia_monto: 0,

  ingreso_minimo_dependientes: 0,
  ingreso_minimo_casa_particular: 0,
  ingreso_minimo_menores_mayores: 0,
  ingreso_minimo_no_remuneracional: 0,

  tasa_sis: 0,
  tasa_seguro_social_afp_empleador: 0,
  tasa_seguro_social_expectativa_vida: 0,
  tasa_rentabilidad_protegida: 0,
  aplica_ccaf: false,
  distribucion_salud_ccaf: 0,
  distribucion_salud_fonasa: SALUD_FONASA_LEGAL,
  distribucion_salud_ccaf_previred: SALUD_CCAF_PREVIRED_DEFECTO,
  distribucion_salud_fonasa_previred: SALUD_FONASA_CCAF_PREVIRED_DEFECTO,

  afc_plazo_indefinido_empleador: 0,
  afc_plazo_indefinido_trabajador: 0,
  afc_plazo_fijo_empleador: 0,
  afc_plazo_fijo_trabajador: 0,
  afc_plazo_indefinido_11_empleador: 0,
  afc_plazo_indefinido_11_trabajador: 0,
  afc_casa_particular_empleador: 0,
  afc_casa_particular_trabajador: 0,

  trabajo_pesado_empleador: 0,
  trabajo_pesado_trabajador: 0,
  trabajo_menos_pesado_empleador: 0,
  trabajo_menos_pesado_trabajador: 0,

  apv_tope_mensual: 0,
  apv_tope_anual: 0,
  deposito_convenido_tope_anual: 0,

  asignacion_tramo_a_monto: 0,
  asignacion_tramo_a_hasta: 0,
  asignacion_tramo_b_monto: 0,
  asignacion_tramo_b_desde: 0,
  asignacion_tramo_b_hasta: 0,
  asignacion_tramo_c_monto: 0,
  asignacion_tramo_c_desde: 0,
  asignacion_tramo_c_hasta: 0,
  asignacion_tramo_d_monto: 0,
  asignacion_tramo_d_desde: 0,

  ley_16744_tasa_basica: 0.9,
  ley_sanna_tasa: 0.03,
  tope_rebaja_zonas_extremas: 0,
};

const CAMPOS_COMPATIBLES_INDICADORES = {
  valor_uf: "valor_uf",
  renta_tope_afp_uf: "tope_imponible_uf",
  ingreso_minimo_dependientes: "ingreso_minimo",
  tasa_sis: "tasa_sis",
  afc_plazo_indefinido_trabajador: "tasa_afc_trabajador",
  afc_plazo_indefinido_empleador: "tasa_afc_empleador",
  asignacion_tramo_a_monto: "tramo_asignacion_a",
  asignacion_tramo_b_monto: "tramo_asignacion_b",
  asignacion_tramo_c_monto: "tramo_asignacion_c",
};

function numeroConfig(valor) {
  const n = Number(String(valor || 0).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function booleanoConfig(valor) {
  if (valor === true) return true;
  if (valor === false || valor === null || valor === undefined) return false;

  const texto = String(valor).trim().toLowerCase();
  return ["si", "sí", "true", "1", "s"].includes(texto);
}

function validarArchivoIndicadores(archivo) {
  if (!archivo) {
    return "Debes seleccionar el PDF de indicadores Previred.";
  }

  const nombre = String(archivo.name || "").toLowerCase();
  const esPdf =
    nombre.endsWith(".pdf") &&
    (!archivo.type || archivo.type === "application/pdf");

  if (!esPdf) {
    return "El archivo seleccionado no es un PDF valido.";
  }

  if (!archivo.size || archivo.size <= 0) {
    return "El archivo PDF esta vacio.";
  }

  if (archivo.size > MAX_PDF_INDICADORES_BYTES) {
    return "El archivo PDF supera el tamano maximo permitido.";
  }

  return "";
}

function redondearPorcentaje(valor) {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? Math.max(0, Number(numero.toFixed(4))) : 0;
}

function normalizarIndicadoresSalud(datos = {}) {
  const indicadores = {
    ...INDICADORES_PREVISIONALES_INICIALES,
    ...datos,
  };
  const aplicaCcaf = booleanoConfig(indicadores.aplica_ccaf);
  const ccafLeido = numeroConfig(indicadores.distribucion_salud_ccaf);
  const fonasaLeido = numeroConfig(indicadores.distribucion_salud_fonasa);
  const tieneDistribucionCcaf =
    ccafLeido > 0 || (fonasaLeido > 0 && fonasaLeido !== SALUD_FONASA_LEGAL);
  const ccafPrevired = tieneDistribucionCcaf
    ? ccafLeido || SALUD_CCAF_PREVIRED_DEFECTO
    : numeroConfig(indicadores.distribucion_salud_ccaf_previred) ||
      SALUD_CCAF_PREVIRED_DEFECTO;
  const fonasaPrevired = tieneDistribucionCcaf
    ? fonasaLeido || redondearPorcentaje(SALUD_FONASA_LEGAL - ccafPrevired)
    : numeroConfig(indicadores.distribucion_salud_fonasa_previred) ||
      redondearPorcentaje(SALUD_FONASA_LEGAL - ccafPrevired) ||
      SALUD_FONASA_CCAF_PREVIRED_DEFECTO;

  if (!aplicaCcaf) {
    return {
      ...indicadores,
      aplica_ccaf: false,
      distribucion_salud_ccaf: 0,
      distribucion_salud_fonasa: SALUD_FONASA_LEGAL,
      distribucion_salud_ccaf_previred: redondearPorcentaje(ccafPrevired),
      distribucion_salud_fonasa_previred: redondearPorcentaje(fonasaPrevired),
    };
  }

  const usaValoresSinCcaf =
    ccafLeido === 0 && fonasaLeido === SALUD_FONASA_LEGAL;
  const ccaf = usaValoresSinCcaf
    ? ccafPrevired
    : ccafLeido || ccafPrevired;
  const fonasa = usaValoresSinCcaf
    ? fonasaPrevired
    : fonasaLeido ||
      redondearPorcentaje(SALUD_FONASA_LEGAL - ccaf) ||
      fonasaPrevired;

  return {
    ...indicadores,
    aplica_ccaf: true,
    distribucion_salud_ccaf: redondearPorcentaje(ccaf),
    distribucion_salud_fonasa: redondearPorcentaje(fonasa),
    distribucion_salud_ccaf_previred: redondearPorcentaje(ccaf),
    distribucion_salud_fonasa_previred: redondearPorcentaje(fonasa),
  };
}

function mutualConfigDesdeDatos(datos = {}) {
  const codigoActual = String(datos.mutual_codigo_previred ?? "").trim();
  const tasaMutual = numeroConfig(datos.tasa_mutual);
  const codigo =
    codigoActual && (codigoActual !== "0" || tasaMutual === 0)
      ? codigoActual
      : tasaMutual > 0
        ? "1"
        : "0";
  const opcion =
    MUTUALES_PREVIRED.find((item) => item.codigo === codigo) ||
    MUTUALES_PREVIRED[0];

  return {
    mutual_nombre: datos.mutual_nombre || opcion.nombre,
    mutual_codigo_previred: opcion.codigo,
    mutual_sucursal_previred: datos.mutual_sucursal_previred || "0",
  };
}

function indicadoresDesdeDatos(datos = {}) {
  const indicadores = {
    ...INDICADORES_PREVISIONALES_INICIALES,
    ...(datos.indicadores_previsionales || {}),
  };

  return normalizarIndicadoresSalud({
    ...indicadores,
    valor_uf: indicadores.valor_uf || datos.valor_uf || 0,
    renta_tope_afp_uf:
      indicadores.renta_tope_afp_uf || datos.tope_imponible_uf || 0,
    ingreso_minimo_dependientes:
      indicadores.ingreso_minimo_dependientes || datos.ingreso_minimo || 0,
    tasa_sis: indicadores.tasa_sis || datos.tasa_sis || 0,
    afc_plazo_indefinido_trabajador:
      indicadores.afc_plazo_indefinido_trabajador ||
      datos.tasa_afc_trabajador ||
      0,
    afc_plazo_indefinido_empleador:
      indicadores.afc_plazo_indefinido_empleador ||
      datos.tasa_afc_empleador ||
      0,
    asignacion_tramo_a_monto:
      indicadores.asignacion_tramo_a_monto ||
      datos.tramo_asignacion_a ||
      0,
    asignacion_tramo_b_monto:
      indicadores.asignacion_tramo_b_monto ||
      datos.tramo_asignacion_b ||
      0,
    asignacion_tramo_c_monto:
      indicadores.asignacion_tramo_c_monto ||
      datos.tramo_asignacion_c ||
      0,
  });
}

function configDesdeDatos(datos = {}) {
  const indicadores = indicadoresDesdeDatos(datos);
  const mutual = mutualConfigDesdeDatos(datos);

  return {
    tasa_salud: SALUD_FONASA_LEGAL,
    tasa_sis: datos.tasa_sis || indicadores.tasa_sis || 0,
    tasa_afc_trabajador:
      datos.tasa_afc_trabajador ||
      indicadores.afc_plazo_indefinido_trabajador ||
      0,
    tasa_afc_empleador:
      datos.tasa_afc_empleador ||
      indicadores.afc_plazo_indefinido_empleador ||
      0,
    tasa_mutual: datos.tasa_mutual || 0,
    ...mutual,

    tope_imponible_uf:
      datos.tope_imponible_uf || indicadores.renta_tope_afp_uf || 0,
    valor_uf: datos.valor_uf || indicadores.valor_uf || 0,
    ingreso_minimo:
      datos.ingreso_minimo || indicadores.ingreso_minimo_dependientes || 0,

    tramo_asignacion_a:
      datos.tramo_asignacion_a || indicadores.asignacion_tramo_a_monto || 0,
    tramo_asignacion_b:
      datos.tramo_asignacion_b || indicadores.asignacion_tramo_b_monto || 0,
    tramo_asignacion_c:
      datos.tramo_asignacion_c || indicadores.asignacion_tramo_c_monto || 0,

    cuenta_sueldos_id: datos.cuenta_sueldos_id || "",
    cuenta_afp_id: datos.cuenta_afp_id || "",
    cuenta_salud_id: datos.cuenta_salud_id || "",
    cuenta_afc_id: datos.cuenta_afc_id || "",
    cuenta_mutual_id: datos.cuenta_mutual_id || "",
    cuenta_sueldos_por_pagar_id: datos.cuenta_sueldos_por_pagar_id || "",
    cuenta_banco_pago_id: datos.cuenta_banco_pago_id || "",
    cuenta_impuesto_unico_id: datos.cuenta_impuesto_unico_id || "",
    cuenta_sis_empleador_id: datos.cuenta_sis_empleador_id || "",
    cuenta_afc_empleador_id: datos.cuenta_afc_empleador_id || "",
    cuenta_mutual_empleador_id: datos.cuenta_mutual_empleador_id || "",
    cuenta_otros_descuentos_id: datos.cuenta_otros_descuentos_id || "",

    indicadores_previsionales: indicadores,
  };
}

function claveAfp(nombre = "") {
  return String(nombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function mezclarAfpsImportadas(actuales = [], importadas = []) {
  const porNombre = new Map(actuales.map((item) => [claveAfp(item.nombre), item]));

  return importadas.map((item) => {
    const existente = porNombre.get(claveAfp(item.nombre));

    return {
      ...(existente || {}),
      ...item,
      id: existente?.id || item.id,
    };
  });
}

export default function ConfiguracionRemuneraciones({ seccion = "completa" }) {
  const empresaActiva = obtenerEmpresaActiva();
  const mostrarPrevisional = seccion !== "contable";
  const mostrarContable = seccion !== "previsional";

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());

  const [cuentas, setCuentas] = useState([]);
  const [afps, setAfps] = useState([]);

  const [config, setConfig] = useState(configDesdeDatos());

  const [afpForm, setAfpForm] = useState(AFP_FORM_INICIAL);
  const [afpEditandoId, setAfpEditandoId] = useState(null);
  const [guardandoAfp, setGuardandoAfp] = useState(false);
  const [afpEliminandoId, setAfpEliminandoId] = useState(null);
  const [archivoIndicadores, setArchivoIndicadores] = useState(null);
  const [importandoIndicadores, setImportandoIndicadores] = useState(false);

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (empresaActiva) {
      cargarDatos(periodo);
    }
  }, []);

  async function cargarDatos(periodoConsulta = periodo) {
    try {
      setMensaje("");
      setError("");

      if (mostrarContable) {
        const cuentasData = await listarCuentas(empresaActiva.id);
        setCuentas(cuentasData.cuentas || []);
      }

      const data = await obtenerConfiguracionRemuneraciones(
        empresaActiva.id,
        periodoConsulta
      );

      setAfps(data.afps || []);

      if (data.configuracion) {
        setConfig(configDesdeDatos(data.configuracion));
      } else {
        limpiarConfig();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function limpiarConfig() {
    setConfig(configDesdeDatos());
  }

  function cambiarPeriodo(nuevoPeriodo) {
    setPeriodo(nuevoPeriodo);
    cancelarEdicionAfp();
  }

  function cambiarConfig(e) {
    const { name, value } = e.target;

    if (name === "mutual_codigo_previred") {
      const opcion =
        MUTUALES_PREVIRED.find((item) => item.codigo === value) ||
        MUTUALES_PREVIRED[0];

      setConfig((prev) => ({
        ...prev,
        mutual_codigo_previred: opcion.codigo,
        mutual_nombre: opcion.nombre,
      }));
      return;
    }

    setConfig((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function cambiarIndicador(e) {
    const { name, value } = e.target;
    const campoCompatible = CAMPOS_COMPATIBLES_INDICADORES[name];

    setConfig((prev) => {
      const indicadoresActuales = {
        ...INDICADORES_PREVISIONALES_INICIALES,
        ...(prev.indicadores_previsionales || {}),
      };

      const indicadoresActualizados = {
        ...indicadoresActuales,
        [name]: value,
      };

      if (name === "aplica_ccaf") {
        indicadoresActualizados.aplica_ccaf = booleanoConfig(value);
      }

      if (
        booleanoConfig(indicadoresActualizados.aplica_ccaf) &&
        name === "distribucion_salud_ccaf"
      ) {
        indicadoresActualizados.distribucion_salud_fonasa =
          redondearPorcentaje(SALUD_FONASA_LEGAL - numeroConfig(value));
      }

      if (
        booleanoConfig(indicadoresActualizados.aplica_ccaf) &&
        name === "distribucion_salud_fonasa"
      ) {
        indicadoresActualizados.distribucion_salud_ccaf =
          redondearPorcentaje(SALUD_FONASA_LEGAL - numeroConfig(value));
      }

      const indicadoresNormalizados =
        normalizarIndicadoresSalud(indicadoresActualizados);

      return {
        ...prev,
        tasa_salud: SALUD_FONASA_LEGAL,
        ...(campoCompatible ? { [campoCompatible]: value } : {}),
        indicadores_previsionales: indicadoresNormalizados,
      };
    });
  }

  function cambiarAfp(e) {
    const { name, value } = e.target;

    setAfpForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function limpiarAfpForm() {
    setAfpForm(AFP_FORM_INICIAL);
    setAfpEditandoId(null);
  }

  function cancelarEdicionAfp() {
    limpiarAfpForm();
  }

  function editarAfpClick(item) {
    setMensaje("");
    setError("");
    setAfpEditandoId(item.id);
    setAfpForm({
      nombre: item.nombre || "",
      tasa_afp: item.tasa_afp ?? "",
      tasa_empleador: item.tasa_empleador ?? "",
      tasa_total: item.tasa_total ?? item.tasa_afp ?? "",
      tasa_independiente: item.tasa_independiente ?? "",
      tasa_sis: item.tasa_sis ?? "",
      tasa_seguro_social: item.tasa_seguro_social ?? "1.00",
    });
  }

  function fusionarConfiguracionImportada(configuracionImportada = {}) {
    setConfig((prev) => {
      const indicadoresActuales = {
        ...INDICADORES_PREVISIONALES_INICIALES,
        ...(prev.indicadores_previsionales || {}),
      };
      const aplicaCcafActual = booleanoConfig(indicadoresActuales.aplica_ccaf);
      const datos = configDesdeDatos({
        ...prev,
        ...configuracionImportada,
        tasa_salud: SALUD_FONASA_LEGAL,
        indicadores_previsionales: {
          ...INDICADORES_PREVISIONALES_INICIALES,
          ...indicadoresActuales,
          ...(configuracionImportada.indicadores_previsionales || {}),
          aplica_ccaf: aplicaCcafActual,
        },
      });

      return datos;
    });
  }

  // Evita el doble envío: un segundo clic antes de que responda el servidor
  // creaba el registro dos veces.
  const [guardando, setGuardando] = useState(false);

  async function guardarConfig(e) {
    e.preventDefault();

    if (guardando) return;

    try {
      setGuardando(true);
      setMensaje("");
      setError("");
      const indicadores = normalizarIndicadoresSalud({
        ...INDICADORES_PREVISIONALES_INICIALES,
        ...(config.indicadores_previsionales || {}),
      });

      const data = await guardarConfiguracionRemuneraciones({
        empresa_id: empresaActiva.id,
        periodo,

        tasa_salud: SALUD_FONASA_LEGAL,
        tasa_sis: Number(indicadores.tasa_sis || config.tasa_sis || 0),
        tasa_afc_trabajador: Number(
          indicadores.afc_plazo_indefinido_trabajador ||
            config.tasa_afc_trabajador ||
            0
        ),
        tasa_afc_empleador: Number(
          indicadores.afc_plazo_indefinido_empleador ||
            config.tasa_afc_empleador ||
            0
        ),
        tasa_mutual: Number(config.tasa_mutual || 0),
        mutual_nombre: config.mutual_nombre || "",
        mutual_codigo_previred: config.mutual_codigo_previred || "0",
        mutual_sucursal_previred: config.mutual_sucursal_previred || "0",

        tope_imponible_uf: Number(
          indicadores.renta_tope_afp_uf || config.tope_imponible_uf || 0
        ),
        valor_uf: Number(indicadores.valor_uf || config.valor_uf || 0),
        ingreso_minimo: Number(
          indicadores.ingreso_minimo_dependientes ||
            config.ingreso_minimo ||
            0
        ),

        tramo_asignacion_a: Number(
          indicadores.asignacion_tramo_a_monto ||
            config.tramo_asignacion_a ||
            0
        ),
        tramo_asignacion_b: Number(
          indicadores.asignacion_tramo_b_monto ||
            config.tramo_asignacion_b ||
            0
        ),
        tramo_asignacion_c: Number(
          indicadores.asignacion_tramo_c_monto ||
            config.tramo_asignacion_c ||
            0
        ),

        cuenta_sueldos_id: config.cuenta_sueldos_id || null,
        cuenta_afp_id: config.cuenta_afp_id || null,
        cuenta_salud_id: config.cuenta_salud_id || null,
        cuenta_afc_id: config.cuenta_afc_id || null,
        cuenta_mutual_id: config.cuenta_mutual_id || null,
        cuenta_sueldos_por_pagar_id:
          config.cuenta_sueldos_por_pagar_id || null,
        cuenta_banco_pago_id: config.cuenta_banco_pago_id || null,
        cuenta_impuesto_unico_id: config.cuenta_impuesto_unico_id || null,
        cuenta_sis_empleador_id: config.cuenta_sis_empleador_id || null,
        cuenta_afc_empleador_id: config.cuenta_afc_empleador_id || null,
        cuenta_mutual_empleador_id: config.cuenta_mutual_empleador_id || null,
        cuenta_otros_descuentos_id: config.cuenta_otros_descuentos_id || null,
        indicadores_previsionales: indicadores,
      });

      if (mostrarPrevisional) {
        for (const afp of afps) {
          await guardarAFP({
            id: afp.id,
            empresa_id: empresaActiva.id,
            periodo,
            nombre: afp.nombre,
            tasa_afp: Number(afp.tasa_afp || 0),
            tasa_empleador: Number(afp.tasa_empleador || 0),
            tasa_total: Number(afp.tasa_total || afp.tasa_afp || 0),
            tasa_independiente: Number(afp.tasa_independiente || 0),
            tasa_sis: Number(afp.tasa_sis || indicadores.tasa_sis || 0),
            tasa_seguro_social: Number(afp.tasa_seguro_social || 0),
          });
        }
      }

      setMensaje(data.mensaje);
      await cargarDatos(periodo);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function importarIndicadoresClick() {
    try {
      setMensaje("");
      setError("");

      const errorArchivo = validarArchivoIndicadores(archivoIndicadores);

      if (errorArchivo) {
        setError(errorArchivo);
        return;
      }

      setImportandoIndicadores(true);

      const data = await importarIndicadoresPrevisionales(
        empresaActiva.id,
        periodo,
        archivoIndicadores
      );

      fusionarConfiguracionImportada(data.configuracion);
      setAfps((actuales) => mezclarAfpsImportadas(actuales, data.afps || []));

      const advertencia = data.advertencias?.length
        ? ` ${data.advertencias.join(" ")}`
        : "";

      setMensaje(`${data.mensaje}${advertencia}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setImportandoIndicadores(false);
    }
  }

  async function guardarAfpSubmit(e) {
    e.preventDefault();

    if (guardandoAfp) return;

    try {
      setGuardandoAfp(true);
      setMensaje("");
      setError("");

      if (!afpForm.nombre) {
        setError("Debes indicar el nombre de la AFP.");
        return;
      }

      const data = await guardarAFP({
        id: afpEditandoId,
        empresa_id: empresaActiva.id,
        periodo,
        nombre: afpForm.nombre,
        tasa_afp: Number(afpForm.tasa_afp || 0),
        tasa_empleador: Number(afpForm.tasa_empleador || 0),
        tasa_total: Number(afpForm.tasa_total || afpForm.tasa_afp || 0),
        tasa_independiente: Number(afpForm.tasa_independiente || 0),
        tasa_sis: Number(afpForm.tasa_sis || 0),
        tasa_seguro_social: Number(
          String(afpForm.tasa_seguro_social || "1,00").replace(",", ".")
        ),
      });

      setMensaje(data.mensaje);
      limpiarAfpForm();

      await cargarDatos(periodo);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoAfp(false);
    }
  }

  async function eliminarAfpClick(item) {
    if (!item.id) {
      setAfps((actuales) =>
        actuales.filter((afp) => claveAfp(afp.nombre) !== claveAfp(item.nombre))
      );
      return;
    }

    const id = item.id;
    const confirmar = window.confirm("Deseas eliminar esta AFP del período?");

    if (!confirmar) return;

    try {
      setAfpEliminandoId(id);
      setMensaje("");
      setError("");

      const data = await eliminarAFP(id, empresaActiva.id);

      setMensaje(data.mensaje);
      if (afpEditandoId === id) {
        limpiarAfpForm();
      }
      await cargarDatos(periodo);
    } catch (err) {
      setError(err.message);
    } finally {
      setAfpEliminandoId(null);
    }
  }

  function cambiarArchivoIndicadores(e) {
    const archivo = e.target.files?.[0] || null;
    const errorArchivo = validarArchivoIndicadores(archivo);

    setArchivoIndicadores(errorArchivo ? null : archivo);
    setMensaje("");
    setError(errorArchivo);

    if (errorArchivo) {
      e.target.value = "";
    }
  }

  function opcionesCuentas() {
    const lista = [...cuentas].sort((a, b) =>
      String(a.codigo || "").localeCompare(String(b.codigo || ""), "es-CL")
    );

    return lista.map((cuenta) => (
      <option key={cuenta.id} value={cuenta.id}>
        {cuenta.codigo} - {cuenta.nombre}
      </option>
    ));
  }

  const indicadores = normalizarIndicadoresSalud({
    ...INDICADORES_PREVISIONALES_INICIALES,
    ...(config.indicadores_previsionales || {}),
  });
  const empresaTieneCcaf = booleanoConfig(indicadores.aplica_ccaf);

  return (
    <div>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <div style={hero}>
        <div>
          <h1 style={titulo}>
            {mostrarPrevisional && !mostrarContable
              ? "Configuracion Previsional"
              : mostrarContable && !mostrarPrevisional
                ? "Configuracion Contable Remuneraciones"
                : "Configuracion Remuneraciones"}
          </h1>
          <p style={subtitulo}>
            {mostrarPrevisional && !mostrarContable
              ? "Indicadores Previred, topes, AFP, AFC, salud, APV y asignacion familiar."
              : mostrarContable && !mostrarPrevisional
                ? "Cuentas contables usadas para centralizar, pagar y controlar remuneraciones."
                : "Parametros previsionales, AFP del periodo y cuentas contables."}
          </p>
        </div>

        <div style={filtrosHero}>
          <div>
            <label style={labelHero}>Período</label>
            <PeriodoMesSelector
              style={inputHero}
              value={periodo}
              onChange={cambiarPeriodo}
              containerStyle={{ width: "100%", minWidth: 220 }}
            />
          </div>

          <button
            type="button"
            style={botonHero}
            onClick={() => cargarDatos(periodo)}
          >
            Buscar
          </button>
        </div>
      </div>

      {mostrarPrevisional && (
        <div style={card}>
          <div style={cardHeader}>
            <div>
              <TituloIcono icono={<IconoSistema tipo="documento" />}>
                Importar indicadores Previred
              </TituloIcono>
              <p style={textoMuted}>
                Selecciona el PDF mensual de Previred. El sistema lee el
                archivo y rellena los campos previsionales del período.
              </p>
            </div>

            {indicadores.fuente && (
              <div style={badgeInfo}>
                {indicadores.fuente}
                {indicadores.periodo_remuneracion
                  ? ` ${indicadores.periodo_remuneracion}`
                  : ""}
              </div>
            )}
          </div>

          <div style={importBox}>
            <input
              style={inputFile}
              type="file"
              accept=".pdf,application/pdf"
              onChange={cambiarArchivoIndicadores}
            />

            <button
              type="button"
              style={botonImportar}
              onClick={importarIndicadoresClick}
              disabled={importandoIndicadores}
            >
              {importandoIndicadores ? "Procesando PDF..." : "Importar indicadores"}
            </button>
          </div>
        </div>
      )}

      <form style={card} onSubmit={guardarConfig}>
        {mostrarPrevisional && (
          <>
            <TituloIcono icono={<IconoSistema tipo="configuracion" />}>
              Indicadores previsionales
            </TituloIcono>

            <div style={grid}>
              <Campo
                label="Valor UF mes"
                name="valor_uf"
                value={indicadores.valor_uf}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Valor UF mes anterior"
                name="valor_uf_anterior"
                value={indicadores.valor_uf_anterior}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Valor UTM"
                name="valor_utm"
                value={indicadores.valor_utm}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Valor UTA"
                name="valor_uta"
                value={indicadores.valor_uta}
                onChange={cambiarIndicador}
              />
            </div>

            <TituloIcono icono={<IconoSistema tipo="balance" />} separado>
              Rentas topes imponibles
            </TituloIcono>

            <div style={grid}>
              <Campo
                label="Afiliados AFP UF"
                name="renta_tope_afp_uf"
                value={indicadores.renta_tope_afp_uf}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Afiliados AFP $"
                name="renta_tope_afp_monto"
                value={indicadores.renta_tope_afp_monto}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Afiliados IPS UF"
                name="renta_tope_ips_uf"
                value={indicadores.renta_tope_ips_uf}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Afiliados IPS $"
                name="renta_tope_ips_monto"
                value={indicadores.renta_tope_ips_monto}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Seguro cesantia UF"
                name="renta_tope_seguro_cesantia_uf"
                value={indicadores.renta_tope_seguro_cesantia_uf}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Seguro cesantia $"
                name="renta_tope_seguro_cesantia_monto"
                value={indicadores.renta_tope_seguro_cesantia_monto}
                onChange={cambiarIndicador}
              />
            </div>

            <TituloIcono icono={<IconoSistema tipo="trabajador" />} separado>
              Rentas mínimas imponibles
            </TituloIcono>

            <div style={grid}>
              <Campo
                label="Dependientes e independientes"
                name="ingreso_minimo_dependientes"
                value={indicadores.ingreso_minimo_dependientes}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Casa particular"
                name="ingreso_minimo_casa_particular"
                value={indicadores.ingreso_minimo_casa_particular}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Menores 18 / mayores 65"
                name="ingreso_minimo_menores_mayores"
                value={indicadores.ingreso_minimo_menores_mayores}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Fines no remuneracionales"
                name="ingreso_minimo_no_remuneracional"
                value={indicadores.ingreso_minimo_no_remuneracional}
                onChange={cambiarIndicador}
              />
            </div>

            <TituloIcono icono={<IconoSistema tipo="banco" />} separado>
              Seguridad social y salud
            </TituloIcono>

            <div style={grid}>
              <div style={notaSalud}>
                Salud legal: se cotiza el 7% a FONASA. La distribucion
                CCAF/FONASA se usa solo cuando la empresa esta afiliada a CCAF;
                si no tiene CCAF, el sistema deja CCAF en 0% y FONASA en 7%.
              </div>

              <Campo
                label="SIS %"
                name="tasa_sis"
                value={indicadores.tasa_sis}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Tasa AFP empleador %"
                name="tasa_seguro_social_afp_empleador"
                value={indicadores.tasa_seguro_social_afp_empleador}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Expectativa de vida %"
                name="tasa_seguro_social_expectativa_vida"
                value={indicadores.tasa_seguro_social_expectativa_vida}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Rentabilidad protegida %"
                name="tasa_rentabilidad_protegida"
                value={indicadores.tasa_rentabilidad_protegida}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Cotización salud FONASA %"
                name="tasa_salud_legal"
                value={SALUD_FONASA_LEGAL}
                onChange={() => {}}
                readOnly
                hint="Este porcentaje queda fijo como regla legal del sistema."
              />

              <CampoSelect
                label="Empresa afiliada a CCAF"
                name="aplica_ccaf"
                value={empresaTieneCcaf ? "si" : "no"}
                onChange={cambiarIndicador}
                opciones={
                  <>
                    <option value="no">No, cotiza 7% completo a FONASA</option>
                    <option value="si">Si, usar distribucion CCAF/FONASA</option>
                  </>
                }
              />

              <Campo
                label="Distribucion salud CCAF %"
                name="distribucion_salud_ccaf"
                value={indicadores.distribucion_salud_ccaf}
                onChange={cambiarIndicador}
                disabled={!empresaTieneCcaf}
                hint={
                  empresaTieneCcaf
                    ? "Se descuenta desde el 7% legal cuando la empresa tiene CCAF."
                    : "Sin CCAF queda en 0%."
                }
              />

              <Campo
                label="Distribucion salud FONASA %"
                name="distribucion_salud_fonasa"
                value={indicadores.distribucion_salud_fonasa}
                onChange={cambiarIndicador}
                disabled={!empresaTieneCcaf}
                hint={
                  empresaTieneCcaf
                    ? "Debe completar el total legal junto con CCAF."
                    : "Sin CCAF se calcula como 7% completo."
                }
              />

              <CampoSelect
                label="Mutual"
                name="mutual_codigo_previred"
                value={config.mutual_codigo_previred}
                onChange={cambiarConfig}
                opciones={MUTUALES_PREVIRED.map((item) => (
                  <option key={item.codigo} value={item.codigo}>
                    {item.nombre}
                  </option>
                ))}
              />

              <Campo
                label="Mutual %"
                name="tasa_mutual"
                value={config.tasa_mutual}
                onChange={cambiarConfig}
              />

              <Campo
                label="Sucursal mutual Previred"
                name="mutual_sucursal_previred"
                value={config.mutual_sucursal_previred}
                onChange={cambiarConfig}
              />
            </div>

            <TituloIcono icono={<IconoSistema tipo="dinero" />} separado>
              Seguro cesantia (AFC)
            </TituloIcono>

            <div style={grid}>
              <Campo
                label="Plazo indefinido empleador %"
                name="afc_plazo_indefinido_empleador"
                value={indicadores.afc_plazo_indefinido_empleador}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Plazo indefinido trabajador %"
                name="afc_plazo_indefinido_trabajador"
                value={indicadores.afc_plazo_indefinido_trabajador}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Plazo fijo empleador %"
                name="afc_plazo_fijo_empleador"
                value={indicadores.afc_plazo_fijo_empleador}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Plazo fijo trabajador %"
                name="afc_plazo_fijo_trabajador"
                value={indicadores.afc_plazo_fijo_trabajador}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Indefinido 11 años empleador %"
                name="afc_plazo_indefinido_11_empleador"
                value={indicadores.afc_plazo_indefinido_11_empleador}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Indefinido 11 años trabajador %"
                name="afc_plazo_indefinido_11_trabajador"
                value={indicadores.afc_plazo_indefinido_11_trabajador}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Casa particular empleador %"
                name="afc_casa_particular_empleador"
                value={indicadores.afc_casa_particular_empleador}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Casa particular trabajador %"
                name="afc_casa_particular_trabajador"
                value={indicadores.afc_casa_particular_trabajador}
                onChange={cambiarIndicador}
              />
            </div>

            <TituloIcono icono={<IconoSistema tipo="herramienta" />} separado>
              Cotización para trabajos pesados
            </TituloIcono>

            <div style={grid}>
              <Campo
                label="Trabajo pesado empleador %"
                name="trabajo_pesado_empleador"
                value={indicadores.trabajo_pesado_empleador}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Trabajo pesado trabajador %"
                name="trabajo_pesado_trabajador"
                value={indicadores.trabajo_pesado_trabajador}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Trabajo menos pesado empleador %"
                name="trabajo_menos_pesado_empleador"
                value={indicadores.trabajo_menos_pesado_empleador}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Trabajo menos pesado trabajador %"
                name="trabajo_menos_pesado_trabajador"
                value={indicadores.trabajo_menos_pesado_trabajador}
                onChange={cambiarIndicador}
              />
            </div>

            <TituloIcono icono={<IconoSistema tipo="guardar" />} separado>
              APV y depósito convenido
            </TituloIcono>

            <div style={grid}>
              <Campo
                label="APV tope mensual"
                name="apv_tope_mensual"
                value={indicadores.apv_tope_mensual}
                onChange={cambiarIndicador}
              />

              <Campo
                label="APV tope anual"
                name="apv_tope_anual"
                value={indicadores.apv_tope_anual}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Depósito convenido tope anual"
                name="deposito_convenido_tope_anual"
                value={indicadores.deposito_convenido_tope_anual}
                onChange={cambiarIndicador}
              />
            </div>

            <TituloIcono icono={<IconoSistema tipo="familia" />} separado>
              Asignacion familiar
            </TituloIcono>

            <div style={grid}>
              <Campo
                label="Tramo A monto"
                name="asignacion_tramo_a_monto"
                value={indicadores.asignacion_tramo_a_monto}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Tramo A hasta"
                name="asignacion_tramo_a_hasta"
                value={indicadores.asignacion_tramo_a_hasta}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Tramo B monto"
                name="asignacion_tramo_b_monto"
                value={indicadores.asignacion_tramo_b_monto}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Tramo B desde"
                name="asignacion_tramo_b_desde"
                value={indicadores.asignacion_tramo_b_desde}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Tramo B hasta"
                name="asignacion_tramo_b_hasta"
                value={indicadores.asignacion_tramo_b_hasta}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Tramo C monto"
                name="asignacion_tramo_c_monto"
                value={indicadores.asignacion_tramo_c_monto}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Tramo C desde"
                name="asignacion_tramo_c_desde"
                value={indicadores.asignacion_tramo_c_desde}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Tramo C hasta"
                name="asignacion_tramo_c_hasta"
                value={indicadores.asignacion_tramo_c_hasta}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Tramo D monto"
                name="asignacion_tramo_d_monto"
                value={indicadores.asignacion_tramo_d_monto}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Tramo D desde"
                name="asignacion_tramo_d_desde"
                value={indicadores.asignacion_tramo_d_desde}
                onChange={cambiarIndicador}
              />
            </div>

            <TituloIcono icono={<IconoSistema tipo="alerta" />} separado>
              Otros datos
            </TituloIcono>

            <div style={grid}>
              <Campo
                label="Ley 16.744 tasa basica %"
                name="ley_16744_tasa_basica"
                value={indicadores.ley_16744_tasa_basica}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Ley 21.010 SANNA %"
                name="ley_sanna_tasa"
                value={indicadores.ley_sanna_tasa}
                onChange={cambiarIndicador}
              />

              <Campo
                label="Tope rebaja zonas extremas"
                name="tope_rebaja_zonas_extremas"
                value={indicadores.tope_rebaja_zonas_extremas}
                onChange={cambiarIndicador}
              />
            </div>
          </>
        )}

        {mostrarContable && (
          <>
            <TituloIcono
              icono={<IconoSistema tipo="comprobante" />}
              separado={mostrarPrevisional}
            >
              Cuentas contables remuneraciones
            </TituloIcono>

        <div style={grid}>
          <CampoCuenta
            label="Cuenta gasto sueldos"
            name="cuenta_sueldos_id"
            value={config.cuenta_sueldos_id}
            onChange={cambiarConfig}
            opciones={opcionesCuentas("Gasto")}
          />

          <CampoCuenta
            label="Cuenta AFP por pagar"
            name="cuenta_afp_id"
            value={config.cuenta_afp_id}
            onChange={cambiarConfig}
            opciones={opcionesCuentas("Pasivo")}
          />

          <CampoCuenta
            label="Cuenta salud por pagar"
            name="cuenta_salud_id"
            value={config.cuenta_salud_id}
            onChange={cambiarConfig}
            opciones={opcionesCuentas("Pasivo")}
          />

          <CampoCuenta
            label="Cuenta AFC por pagar"
            name="cuenta_afc_id"
            value={config.cuenta_afc_id}
            onChange={cambiarConfig}
            opciones={opcionesCuentas("Pasivo")}
          />

          <CampoCuenta
            label="Cuenta mutual por pagar"
            name="cuenta_mutual_id"
            value={config.cuenta_mutual_id}
            onChange={cambiarConfig}
            opciones={opcionesCuentas("Pasivo")}
          />

          <CampoCuenta
            label="Cuenta impuesto único por pagar"
            name="cuenta_impuesto_unico_id"
            value={config.cuenta_impuesto_unico_id}
            onChange={cambiarConfig}
            opciones={opcionesCuentas("Pasivo")}
          />

          <CampoCuenta
            label="Cuenta gasto SIS empleador"
            name="cuenta_sis_empleador_id"
            value={config.cuenta_sis_empleador_id}
            onChange={cambiarConfig}
            opciones={opcionesCuentas("Gasto")}
          />

          <CampoCuenta
            label="Cuenta gasto AFC empleador"
            name="cuenta_afc_empleador_id"
            value={config.cuenta_afc_empleador_id}
            onChange={cambiarConfig}
            opciones={opcionesCuentas("Gasto")}
          />

          <CampoCuenta
            label="Cuenta gasto mutual empleador"
            name="cuenta_mutual_empleador_id"
            value={config.cuenta_mutual_empleador_id}
            onChange={cambiarConfig}
            opciones={opcionesCuentas("Gasto")}
          />

          <CampoCuenta
            label="Cuenta sueldos por pagar"
            name="cuenta_sueldos_por_pagar_id"
            value={config.cuenta_sueldos_por_pagar_id}
            onChange={cambiarConfig}
            opciones={opcionesCuentas("Pasivo")}
          />

          <CampoCuenta
            label="Cuenta otros descuentos por pagar"
            name="cuenta_otros_descuentos_id"
            value={config.cuenta_otros_descuentos_id}
            onChange={cambiarConfig}
            opciones={opcionesCuentas("Pasivo")}
          />

          <CampoCuenta
            label="Cuenta banco pago remuneraciones"
            name="cuenta_banco_pago_id"
            value={config.cuenta_banco_pago_id}
            onChange={cambiarConfig}
            opciones={opcionesCuentas("Activo")}
          />
        </div>
          </>
        )}

        <button style={botonGuardar} type="submit" disabled={guardando}>
          <span style={botonIcono}>
            <IconoSistema tipo="guardar" size={18} />
          </span>
          {guardando
            ? "Guardando..."
            : mostrarPrevisional && !mostrarContable
            ? "Guardar configuracion previsional"
            : mostrarContable && !mostrarPrevisional
              ? "Guardar configuracion contable"
              : "Guardar configuracion remuneraciones"}
        </button>
      </form>

      {mostrarPrevisional && (
      <form style={card} onSubmit={guardarAfpSubmit}>
        <div style={cardHeader}>
          <div>
            <TituloIcono icono={<IconoSistema tipo="banco" />}>
              AFP del período
            </TituloIcono>
            <p style={textoMuted}>
              Registra, edita o elimina las AFP vigentes para el período.
            </p>
          </div>

          <div style={badgeInfo}>{afps.length} AFP</div>
        </div>

        <div style={gridAfp}>
          <Campo
            label="Nombre AFP"
            name="nombre"
            value={afpForm.nombre}
            onChange={cambiarAfp}
            type="text"
          />

          <Campo
            label="Trabajador dependiente %"
            name="tasa_afp"
            value={afpForm.tasa_afp}
            onChange={cambiarAfp}
          />

          <Campo
            label="Empleador %"
            name="tasa_empleador"
            value={afpForm.tasa_empleador}
            onChange={cambiarAfp}
          />

          <Campo
            label="Total a pagar %"
            name="tasa_total"
            value={afpForm.tasa_total}
            onChange={cambiarAfp}
          />

          <Campo
            label="Independiente %"
            name="tasa_independiente"
            value={afpForm.tasa_independiente}
            onChange={cambiarAfp}
          />

          <Campo
            label="Tasa SIS %"
            name="tasa_sis"
            value={afpForm.tasa_sis}
            onChange={cambiarAfp}
          />

          <Campo
            label="Seguro social %"
            name="tasa_seguro_social"
            value={afpForm.tasa_seguro_social}
            onChange={cambiarAfp}
          />
        </div>

        <button style={botonGuardar} type="submit" disabled={guardandoAfp}>
          <span style={botonIcono}>
            <IconoSistema tipo="agregar" size={18} />
          </span>
          {guardandoAfp
            ? "Guardando AFP..."
            : afpEditandoId
              ? "Guardar cambios AFP"
              : "Agregar AFP"}
        </button>

        {afpEditandoId && (
          <button
            type="button"
            style={botonCancelar}
            onClick={cancelarEdicionAfp}
            disabled={guardandoAfp}
          >
            Cancelar edicion
          </button>
        )}

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>AFP</th>
                <th style={thNumero}>Trabajador</th>
                <th style={thNumero}>Empleador</th>
                <th style={thNumero}>Total</th>
                <th style={thNumero}>Independiente</th>
                <th style={thNumero}>Tasa SIS</th>
                <th style={thNumero}>Seguro social</th>
                <th style={thAccion}>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {afps.map((item) => (
                <tr key={item.id || item.nombre}>
                  <td style={td}>{item.nombre}</td>
                  <td style={tdNumero}>
                    {Number(item.tasa_afp || 0).toLocaleString("es-CL")}%
                  </td>
                  <td style={tdNumero}>
                    {Number(item.tasa_empleador || 0).toLocaleString("es-CL")}%
                  </td>
                  <td style={tdNumero}>
                    {Number(item.tasa_total || item.tasa_afp || 0).toLocaleString("es-CL")}%
                  </td>
                  <td style={tdNumero}>
                    {Number(item.tasa_independiente || 0).toLocaleString("es-CL")}%
                  </td>
                  <td style={tdNumero}>
                    {Number(item.tasa_sis || 0).toLocaleString("es-CL")}%
                  </td>
                  <td style={tdNumero}>
                    {Number(item.tasa_seguro_social ?? 1).toLocaleString(
                      "es-CL",
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}
                    %
                  </td>
                  <td style={tdAccion}>
                    <button
                      type="button"
                      style={botonEditar}
                      onClick={() => editarAfpClick(item)}
                      title="Editar AFP"
                      aria-label="Editar AFP"
                      disabled={guardandoAfp || afpEliminandoId === item.id}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      style={botonEliminar}
                      onClick={() => eliminarAfpClick(item)}
                      title="Eliminar AFP"
                      aria-label="Eliminar AFP"
                      disabled={guardandoAfp || afpEliminandoId === item.id}
                    >
                      {afpEliminandoId === item.id ? "..." : "\u2715"}
                    </button>
                  </td>
                </tr>
              ))}

              {afps.length === 0 && (
                <tr>
                  <td style={td} colSpan="8">
                    No hay AFP configuradas para este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </form>
      )}
    </div>
  );
}

function TituloIcono({ icono, children, separado = false }) {
  return (
    <h2 style={separado ? tituloSeccionSeparado : tituloSeccion}>
      <span style={tituloIcono}>{icono}</span>
      {children}
    </h2>
  );
}

function Campo({
  etiqueta,
  label,
  name,
  value,
  onChange,
  type = "number",
  readOnly = false,
  disabled = false,
  hint = "",
}) {
  const textoLabel = etiqueta || label;

  // El id lo genera React: asi la etiqueta queda asociada al campo

  // sin riesgo de repetir un id en la pagina.

  const idCampo = useId();


  return (
    <div>
      <label htmlFor={idCampo} style={labelStyle}>{textoLabel}</label>
      <input
        id={idCampo}
        style={disabled || readOnly ? inputSoloLectura : inputStyle}
        type={type}
        step={type === "number" ? "0.0001" : undefined}
        name={name}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        disabled={disabled}
      />
      {hint && <small style={ayudaCampo}>{hint}</small>}
    </div>
  );
}

function CampoCuenta({ etiqueta, label, name, value, onChange, opciones }) {
  const textoLabel = etiqueta || label;

  // El id lo genera React: asi la etiqueta queda asociada al campo

  // sin riesgo de repetir un id en la pagina.

  const idCampo = useId();


  return (
    <div>
      <label htmlFor={idCampo} style={labelStyle}>{textoLabel}</label>
      <select id={idCampo} style={inputStyle} name={name} value={value} onChange={onChange}>
        <option value="">Seleccionar cuenta</option>
        {opciones}
      </select>
    </div>
  );
}

function CampoSelect({
  etiqueta,
  label,
  name,
  value,
  onChange,
  opciones,
  disabled = false,
  hint = "",
}) {
  const textoLabel = etiqueta || label;

  // El id lo genera React: asi la etiqueta queda asociada al campo

  // sin riesgo de repetir un id en la pagina.

  const idCampo = useId();


  return (
    <div>
      <label htmlFor={idCampo} style={labelStyle}>{textoLabel}</label>
      <select
        id={idCampo}
        style={disabled ? inputSoloLectura : inputStyle}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
      >
        {opciones}
      </select>
      {hint && <small style={ayudaCampo}>{hint}</small>}
    </div>
  );
}
