import { useEffect, useRef, useState } from "react";
import { obtenerEmpresaActiva } from "../../services/empresaService";
import { listarTrabajadores } from "../../services/trabajadoresService";
import { obtenerPeriodoTrabajo } from "../../services/periodoTrabajoService";
import PeriodoMesSelector from "../../components/PeriodoMesSelector";
import {
  listarFiniquitos,
  crearFiniquito,
  eliminarFiniquito,
  obtenerFiniquito,
  contabilizarFiniquito,
  pagarFiniquito,
  calcularFiniquito,
} from "../../services/finiquitosService";
import { listarLiquidaciones } from "../../services/liquidacionesService";
import { exportarFiniquitoPDF } from "../../utils/finiquitoPdf";

const listaAvisos = {
  margin: "10px 0 0",
  padding: "10px 14px 10px 30px",
  background: "var(--sc-naranja-fondo)",
  border: "1px solid #fdba74",
  borderRadius: 10,
  color: "var(--sc-naranja-texto)",
  fontSize: 13,
  display: "grid",
  gap: 4,
};

const CAUSALES = [
  "Art. 159 Nro.1 - Mutuo acuerdo de las partes",
  "Art. 159 Nro.2 - Renuncia del trabajador",
  "Art. 159 Nro.3 - Muerte del trabajador",
  "Art. 159 Nro.4 - Vencimiento del plazo convenido",
  "Art. 159 Nro.5 - Conclusion del trabajo o servicio que dio origen al contrato",
  "Art. 159 Nro.6 - Caso fortuito o fuerza mayor",
  "Art. 160 Nro.1 - Conductas indebidas graves",
  "Art. 160 Nro.2 - Negociaciones prohibidas dentro del giro del negocio",
  "Art. 160 Nro.3 - Inasistencia injustificada",
  "Art. 160 Nro.4 - Abandono del trabajo",
  "Art. 160 Nro.5 - Actos, omisiones o imprudencias temerarias",
  "Art. 160 Nro.6 - Daño material intencional",
  "Art. 160 Nro.7 - Incumplimiento grave de las obligaciones del contrato",
  "Art. 161 inciso 1 - Necesidades de la empresa",
  "Art. 161 inciso 2 - Desahucio escrito del empleador",
  "Otro",
];

const FERIADOS_CHILE = new Set([
  "01-01",
  "05-01",
  "05-21",
  "06-20",
  "06-29",
  "07-16",
  "08-15",
  "09-18",
  "09-19",
  "10-12",
  "10-31",
  "11-01",
  "12-08",
  "12-25",
]);

export default function FiniquitosRemuneraciones() {
  const empresaActiva = obtenerEmpresaActiva();

  const [periodo, setPeriodo] = useState(obtenerPeriodoTrabajo());
  const [trabajadores, setTrabajadores] = useState([]);
  const [finiquitos, setFiniquitos] = useState([]);

  const [totales, setTotales] = useState({
    total_haberes: 0,
    total_finiquito: 0,
    descuentos: 0,
    vacaciones_proporcionales: 0,
    dias_vacaciones_devengadas: 0,
    dias_vacaciones_usadas: 0,
    dias_vacaciones_pendientes: 0,
    dias_vacaciones_a_pagar: 0,
    monto_vacaciones_pendientes: 0,
    indemnizaciones: 0,
  });

  const estadoInicial = {
    trabajador_id: "",
    fecha_aviso: "",
    fecha_termino: "",
    fecha_pago: "",
    causal: "Art. 159 Nro.2 - Renuncia del trabajador",
    hubo_aviso_30_dias: false,
    incluir_liquidacion_pendiente: false,

    dias_trabajados_mes: 0,
    sueldo_base: 0,
    sueldo_pendiente: 0,

    vacaciones_pendientes: 0,
    valor_dia_vacaciones: 0,
    base_vacaciones: 0,
    vacaciones_proporcionales: 0,
    dias_vacaciones_devengadas: 0,
    dias_vacaciones_usadas: 0,
    dias_vacaciones_pendientes: 0,
    dias_vacaciones_a_pagar: 0,
    monto_vacaciones_pendientes: 0,

    sueldo_indemnizable: 0,
    base_indemnizacion: 0,
    anios_servicio: 0,
    meses_servicio: 0,
    dias_servicio: 0,
    indemnizacion_aviso_previo: 0,
    indemnizacion_anios_servicio: 0,
    indemnizacion_voluntaria: 0,

    otros_haberes: 0,
    descuentos: 0,
    seguro_cesantia_descuento: 0,
    otros_descuentos: 0,

    observacion: "",
    observacion_sueldo_pendiente: "",
    observacion_vacaciones: "",
    observacion_aviso_previo: "",
    observacion_anios_servicio: "",
    observacion_indemnizacion_voluntaria: "",
    observacion_otros_haberes: "",
    observacion_descuentos: "",

    revisado: false,
    pagado: false,

    impuesto_unico_finiquito: 0,
    tope_90_uf_aplicado: false,
  };

  const [form, setForm] = useState(estadoInicial);
  // Lo que el servidor avisa sobre el cálculo (tope de 90 UF, AFC estimado,
  // impuesto sobre la voluntaria). La regla legal vive en el servidor; la
  // pantalla solo estima mientras llega la respuesta.
  const [avisosServidor, setAvisosServidor] = useState([]);
  const [calculandoServidor, setCalculandoServidor] = useState(false);
  const solicitudCalculo = useRef(0);
  const [liquidacionPendiente, setLiquidacionPendiente] = useState(null);

  const [modal, setModal] = useState({
    abierto: false,
    concepto: "",
    titulo: "",
  });

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (empresaActiva) {
      cargarDatos();
    }
  }, [periodo]);

  useEffect(() => {
    if (empresaActiva && form.trabajador_id) {
      cargarLiquidacionPendiente(form.trabajador_id);
    }
  }, [periodo, form.trabajador_id, form.fecha_termino]);

  useEffect(() => {
    if (!empresaActiva || !form.trabajador_id || !form.fecha_termino || !form.causal) return;

    const numeroSolicitud = solicitudCalculo.current + 1;
    solicitudCalculo.current = numeroSolicitud;

    const temporizador = setTimeout(async () => {
      try {
        setCalculandoServidor(true);

        const data = await calcularFiniquito({
          empresa_id: empresaActiva.id,
          trabajador_id: form.trabajador_id,
          fecha_termino: form.fecha_termino,
          fecha_aviso: form.fecha_aviso || null,
          causal: form.causal,
          hubo_aviso_30_dias: form.hubo_aviso_30_dias,
          incluir_liquidacion_pendiente: form.incluir_liquidacion_pendiente,
          dias_trabajados_mes: form.dias_trabajados_mes,
          indemnizacion_voluntaria: form.indemnizacion_voluntaria,
          otros_haberes: form.otros_haberes,
          descuentos: form.descuentos,
          otros_descuentos: form.otros_descuentos,
          seguro_cesantia_descuento: form.seguro_cesantia_manual ? form.seguro_cesantia_descuento : undefined,
        });

        // Una respuesta vieja no pisa una nueva.
        if (solicitudCalculo.current !== numeroSolicitud) return;

        const c = data.calculo || {};

        setForm((prev) => ({
          ...prev,
          sueldo_base: c.sueldo_base,
          sueldo_pendiente: c.sueldo_pendiente,
          dias_trabajados_mes: c.dias_trabajados_mes,
          vacaciones_pendientes: c.vacaciones_pendientes,
          valor_dia_vacaciones: c.valor_dia_vacaciones,
          base_vacaciones: c.base_vacaciones,
          vacaciones_proporcionales: c.vacaciones_proporcionales,
          dias_vacaciones_devengadas: c.dias_vacaciones_devengadas,
          dias_vacaciones_usadas: c.dias_vacaciones_usadas,
          dias_vacaciones_pendientes: c.dias_vacaciones_pendientes,
          dias_vacaciones_a_pagar: c.dias_vacaciones_a_pagar,
          monto_vacaciones_pendientes: c.monto_vacaciones_pendientes,
          sueldo_indemnizable: c.sueldo_indemnizable,
          base_indemnizacion: c.base_indemnizacion,
          anios_servicio: c.anios_servicio,
          meses_servicio: c.meses_servicio,
          dias_servicio: c.dias_servicio,
          indemnizacion_aviso_previo: c.indemnizacion_aviso_previo,
          indemnizacion_anios_servicio: c.indemnizacion_anios_servicio,
          seguro_cesantia_descuento: c.seguro_cesantia_descuento,
          impuesto_unico_finiquito: c.impuesto_unico_finiquito,
          tope_90_uf_aplicado: Boolean(c.tope_90_uf_aplicado),
          observacion_sueldo_pendiente: c.observacion_sueldo_pendiente || "",
          observacion_vacaciones: c.observacion_vacaciones || "",
          observacion_aviso_previo: c.observacion_aviso_previo || "",
          observacion_anios_servicio: c.observacion_anios_servicio || "",
          observacion_indemnizacion_voluntaria: c.observacion_indemnizacion_voluntaria || prev.observacion_indemnizacion_voluntaria,
          observacion_descuentos: c.observacion_descuentos || prev.observacion_descuentos,
        }));
        setAvisosServidor(Array.isArray(data.avisos) ? data.avisos : []);
        setError("");
      } catch (err) {
        if (solicitudCalculo.current === numeroSolicitud) {
          setError(err.message);
        }
      } finally {
        if (solicitudCalculo.current === numeroSolicitud) {
          setCalculandoServidor(false);
        }
      }
    }, 350);

    return () => clearTimeout(temporizador);
  }, [
    form.trabajador_id,
    form.fecha_termino,
    form.fecha_aviso,
    form.causal,
    form.hubo_aviso_30_dias,
    form.incluir_liquidacion_pendiente,
    form.dias_trabajados_mes,
    form.indemnizacion_voluntaria,
    form.otros_haberes,
    form.descuentos,
    form.otros_descuentos,
    form.seguro_cesantia_descuento,
    form.seguro_cesantia_manual,
  ]);

  useEffect(() => {
    setForm((prev) => {
      const actualizado = { ...prev };
      aplicarCalculosAutomaticos(actualizado, "liquidacion_pendiente");
      return actualizado;
    });
  }, [liquidacionPendiente]);

  async function cargarDatos() {
    try {
      setMensaje("");
      setError("");

      const trabajadoresData = await listarTrabajadores(
        empresaActiva.id,
        "activo"
      );

      setTrabajadores(trabajadoresData.trabajadores || []);

      const finiquitosData = await listarFiniquitos(empresaActiva.id, periodo);

      setFiniquitos(finiquitosData.finiquitos || []);
      setTotales(finiquitosData.totales || {
        total_haberes: 0,
        total_finiquito: 0,
        descuentos: 0,
        vacaciones_proporcionales: 0,
        indemnizaciones: 0,
      });
    } catch (err) {
      setError(err.message);
    }
  }

  function periodoLiquidacionReferencia(formulario = form) {
    return formulario.fecha_termino
      ? String(formulario.fecha_termino).substring(0, 7)
      : periodo;
  }

  async function cargarLiquidacionPendiente(trabajadorId) {
    if (!trabajadorId) {
      setLiquidacionPendiente(null);
      return;
    }

    try {
      setLiquidacionPendiente(null);
      const periodoReferencia = periodoLiquidacionReferencia();
      const data = await listarLiquidaciones(empresaActiva.id, periodoReferencia);
      const encontrada = (data.liquidaciones || []).find(
        (item) => String(item.trabajador_id) === String(trabajadorId)
      );

      setLiquidacionPendiente(encontrada || null);
    } catch {
      setLiquidacionPendiente(null);
    }
  }

  function numero(valor) {
    return Number(valor || 0);
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  function redondear2(valor) {
    return Math.round(Number(valor || 0) * 100) / 100;
  }

  function obtenerBaseIndemnizacion(actualizado, trabajador, name) {
    const sueldoBase = numero(actualizado.sueldo_base || trabajador?.sueldo_base);
    const baseActual = numero(
      actualizado.base_indemnizacion || actualizado.sueldo_indemnizable
    );
    const baseLiquidacion = numero(liquidacionPendiente?.total_haberes);
    const edicionManual = ["base_indemnizacion", "sueldo_indemnizable"].includes(
      name
    );

    if (edicionManual) {
      return numero(actualizado.base_indemnizacion || actualizado.sueldo_indemnizable || sueldoBase);
    }

    if (baseLiquidacion > 0 && (name === "liquidacion_pendiente" || baseActual <= sueldoBase)) {
      return Math.round(baseLiquidacion);
    }

    return baseActual || Math.round(baseLiquidacion) || sueldoBase;
  }

  function parseFechaLocal(fechaTexto) {
    if (!fechaTexto) return null;
    const [anio, mes, dia] = String(fechaTexto).substring(0, 10).split("-").map(Number);
    if (!anio || !mes || !dia) return null;
    return new Date(anio, mes - 1, dia, 12, 0, 0);
  }

  function sumarDias(fecha, dias) {
    const copia = new Date(fecha.getTime());
    copia.setDate(copia.getDate() + dias);
    return copia;
  }

  function esFeriadoChile(fecha) {
    const clave = `${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(
      fecha.getDate()
    ).padStart(2, "0")}`;
    return FERIADOS_CHILE.has(clave);
  }

  function esDiaHabilVacaciones(fecha) {
    const diaSemana = fecha.getDay();
    return diaSemana >= 1 && diaSemana <= 5 && !esFeriadoChile(fecha);
  }

  function diasCorridosDesdeHabiles(fechaTermino, diasHabiles) {
    const termino = parseFechaLocal(fechaTermino);
    const pendientes = Number(diasHabiles || 0);
    if (!termino || pendientes <= 0) return 0;

    const completos = Math.floor(pendientes);
    const fraccion = redondear2(pendientes - completos);
    let cursor = sumarDias(termino, 1);
    let habilesContados = 0;
    let corridos = 0;

    while (habilesContados < completos && corridos < 500) {
      corridos += 1;
      if (esDiaHabilVacaciones(cursor)) {
        habilesContados += 1;
      }
      cursor = sumarDias(cursor, 1);
    }

    return redondear2(corridos + fraccion);
  }

  function calcularTiempoServicio(fechaIngreso, fechaTermino) {
    const inicio = parseFechaLocal(fechaIngreso);
    const termino = parseFechaLocal(fechaTermino);

    if (!inicio || !termino || termino < inicio) {
      return { anios: 0, meses: 0, dias: 0, aniosReconocidos: 0 };
    }

    let mesesTotales =
      (termino.getFullYear() - inicio.getFullYear()) * 12 +
      (termino.getMonth() - inicio.getMonth());

    if (termino.getDate() < inicio.getDate()) {
      mesesTotales -= 1;
    }

    const fechaMesCompleto = new Date(
      inicio.getFullYear(),
      inicio.getMonth() + mesesTotales,
      inicio.getDate(),
      12,
      0,
      0
    );
    const dias =
      Math.max(
        0,
        Math.floor((termino.getTime() - fechaMesCompleto.getTime()) / 86400000)
      ) || 0;
    const anios = Math.floor(mesesTotales / 12);
    const meses = mesesTotales % 12;
    const fraccionMayorASeis = meses > 6 || (meses === 6 && dias > 0);
    const aniosReconocidos =
      mesesTotales >= 12 ? Math.min(11, anios + (fraccionMayorASeis ? 1 : 0)) : 0;

    return { anios, meses, dias, aniosReconocidos };
  }

  function causalNormalizada(causal) {
    return String(causal || "").toLowerCase();
  }

  function esCausalArticulo161(causal) {
    const texto = causalNormalizada(causal);
    return texto.includes("art. 161") || texto.includes("necesidades de la empresa");
  }

  function esCausalArticulo160(causal) {
    return causalNormalizada(causal).includes("art. 160");
  }

  function esCausalArticulo159Nro5(causal) {
    const texto = causalNormalizada(causal);
    return texto.includes("art. 159") && texto.includes("nro.5");
  }

  function esContratoObraFaena(trabajador) {
    const tipoContrato = causalNormalizada(trabajador?.tipo_contrato);
    return tipoContrato.includes("obra") || tipoContrato.includes("faena");
  }

  function calcularMesesIndemnizablesObraFaena(tiempo) {
    const mesesCompletos = numero(tiempo.anios) * 12 + numero(tiempo.meses);

    if (mesesCompletos < 1) return 0;

    return mesesCompletos + (numero(tiempo.dias) > 15 ? 1 : 0);
  }

  function obtenerReglaFiniquito(causal, trabajador) {
    const es161 = esCausalArticulo161(causal);
    const es160 = esCausalArticulo160(causal);
    const es159Nro5 = esCausalArticulo159Nro5(causal);
    const contratoObraFaena = esContratoObraFaena(trabajador);

    if (es161) {
      return {
        articulo: "Art. 161",
        pagaFeriado: true,
        pagaAvisoPrevio: true,
        pagaIndemnizacionAnios: true,
        pagaIndemnizacionObraFaena: false,
        mensaje:
          "Art. 161: calcula feriado, aviso previo si no hubo aviso de 30 días e indemnizacion por años de servicio si corresponde.",
      };
    }

    if (es159Nro5) {
      return {
        articulo: "Art. 159 Nro.5",
        pagaFeriado: true,
        pagaAvisoPrevio: false,
        pagaIndemnizacionAnios: false,
        pagaIndemnizacionObraFaena: contratoObraFaena,
        mensaje: contratoObraFaena
          ? "Art. 159 Nro.5: calcula feriado e indemnizacion de obra/faena de 2,5 dias por mes trabajado y fraccion superior a 15 dias."
          : "Art. 159 Nro.5: calcula feriado. La indemnizacion de 2,5 dias por mes aplica si el contrato del trabajador es Obra o faena.",
      };
    }

    if (es160) {
      return {
        articulo: "Art. 160",
        pagaFeriado: true,
        pagaAvisoPrevio: false,
        pagaIndemnizacionAnios: false,
        pagaIndemnizacionObraFaena: false,
        mensaje:
          "Art. 160: calcula remuneraciones pendientes y feriado. No calcula aviso previo ni indemnizacion legal.",
      };
    }

    return {
      articulo: "Art. 159",
      pagaFeriado: true,
      pagaAvisoPrevio: false,
      pagaIndemnizacionAnios: false,
      pagaIndemnizacionObraFaena: false,
      mensaje:
        "Art. 159: calcula remuneraciones pendientes y feriado. No calcula aviso previo ni indemnizacion por años de servicio.",
    };
  }

  function trabajadorActual(formulario = form) {
    return trabajadores.find(
      (item) => String(item.id) === String(formulario.trabajador_id)
    );
  }

  function seleccionarTrabajador(e) {
    const trabajadorId = e.target.value;
    const trabajador = trabajadores.find(
      (item) => String(item.id) === String(trabajadorId)
    );

    setLiquidacionPendiente(null);

    setForm((prev) => {
      const actualizado = {
        ...prev,
        trabajador_id: trabajadorId,
        sueldo_base: trabajador?.sueldo_base || 0,
        sueldo_indemnizable: trabajador?.sueldo_base || 0,
        base_indemnizacion: trabajador?.sueldo_base || 0,
        base_vacaciones: trabajador?.sueldo_base || 0,
        valor_dia_vacaciones: redondear2(numero(trabajador?.sueldo_base) / 30),
      };

      aplicarCalculosAutomaticos(actualizado, "trabajador");

      return actualizado;
    });
  }

  function cambiarForm(e) {
    const { name, value, type, checked } = e.target;

    setForm((prev) => {
      const actualizado = {
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      };

      if (name === "seguro_cesantia_descuento") {
        actualizado.seguro_cesantia_manual = true;
      }

      aplicarCalculosAutomaticos(actualizado, name, value);

      return actualizado;
    });
  }

  function aplicarCalculosAutomaticos(actualizado, name) {
    const trabajador = trabajadorActual(actualizado);
    const sueldoBase = numero(actualizado.sueldo_base || trabajador?.sueldo_base);
    const baseVacaciones = numero(actualizado.base_vacaciones || sueldoBase);
    const regla = obtenerReglaFiniquito(actualizado.causal, trabajador);
    const baseIndemnizacion = obtenerBaseIndemnizacion(
      actualizado,
      trabajador,
      name
    );

    actualizado.sueldo_base = sueldoBase;
    actualizado.base_vacaciones = baseVacaciones;
    actualizado.valor_dia_vacaciones = redondear2(baseVacaciones / 30);

    if (actualizado.incluir_liquidacion_pendiente && liquidacionPendiente) {
      actualizado.sueldo_pendiente = Math.round(
        numero(liquidacionPendiente.liquido_pagar)
      );
      actualizado.dias_trabajados_mes = numero(
        liquidacionPendiente.dias_trabajados || 30
      );
      actualizado.observacion_sueldo_pendiente = `Liquidacion pendiente ${liquidacionPendiente.periodo}: ${formato(liquidacionPendiente.liquido_pagar)}`;
    } else if (
      [
        "sueldo_base",
        "dias_trabajados_mes",
        "trabajador",
        "liquidacion_pendiente",
        "incluir_liquidacion_pendiente",
      ].includes(name)
    ) {
      actualizado.sueldo_pendiente = Math.round(
        (sueldoBase / 30) * numero(actualizado.dias_trabajados_mes)
      );

      if (
        String(actualizado.observacion_sueldo_pendiente || "").startsWith(
          "Liquidacion pendiente"
        )
      ) {
        actualizado.observacion_sueldo_pendiente = "";
      }
    }

    const diasHabiles = Math.max(0, numero(actualizado.dias_vacaciones_pendientes));
    const diasCorridos =
      name === "vacaciones_pendientes"
        ? numero(actualizado.vacaciones_pendientes)
        : diasCorridosDesdeHabiles(actualizado.fecha_termino, diasHabiles);

    actualizado.vacaciones_pendientes = redondear2(diasCorridos);
    actualizado.dias_vacaciones_a_pagar = redondear2(diasCorridos);
    actualizado.vacaciones_proporcionales = Math.round(
      diasCorridos * (baseVacaciones / 30)
    );
    actualizado.monto_vacaciones_pendientes =
      actualizado.vacaciones_proporcionales;

    if (diasHabiles > 0 && diasCorridos > 0) {
      actualizado.observacion_vacaciones = `${regla.articulo}: ${diasHabiles.toLocaleString(
        "es-CL"
      )} días habiles proyectados a ${diasCorridos.toLocaleString(
        "es-CL"
      )} dias corridos desde el dia siguiente al termino. Considera fines de semana y feriados.`;
    }

    const tiempo = calcularTiempoServicio(
      trabajador?.fecha_ingreso,
      actualizado.fecha_termino
    );
    const baseFinal = numero(
      actualizado.base_indemnizacion || actualizado.sueldo_indemnizable || baseIndemnizacion
    );

    actualizado.sueldo_indemnizable = baseFinal;
    actualizado.base_indemnizacion = baseFinal;
    actualizado.indemnizacion_aviso_previo = 0;
    actualizado.indemnizacion_anios_servicio = 0;
    actualizado.anios_servicio = 0;
    actualizado.meses_servicio = tiempo.meses;
    actualizado.dias_servicio = tiempo.dias;

    if (regla.pagaIndemnizacionAnios) {
      actualizado.anios_servicio = tiempo.aniosReconocidos;
      actualizado.indemnizacion_anios_servicio = Math.round(
        baseFinal * tiempo.aniosReconocidos
      );
      actualizado.indemnizacion_aviso_previo = actualizado.hubo_aviso_30_dias
        ? 0
        : Math.round(baseFinal);
      actualizado.observacion_aviso_previo = actualizado.hubo_aviso_30_dias
        ? "No se calcula aviso previo porque se marco aviso escrito con 30 días."
        : `${regla.articulo}: sin aviso de 30 días, se calcula una remuneracion mensual indemnizable de ${formato(baseFinal)}.`;
      actualizado.observacion_anios_servicio = `${regla.articulo}: ${tiempo.aniosReconocidos} años reconocidos. Base indemnizatoria ${formato(baseFinal)}. Fraccion superior a 6 meses suma un año, con tope de 11 años.`;
    } else if (regla.pagaIndemnizacionObraFaena) {
      const mesesIndemnizables = calcularMesesIndemnizablesObraFaena(tiempo);
      const diasIndemnizacion = mesesIndemnizables * 2.5;
      actualizado.anios_servicio = mesesIndemnizables;
      actualizado.indemnizacion_anios_servicio = Math.round(
        diasIndemnizacion * (baseFinal / 30)
      );
      actualizado.observacion_aviso_previo =
        "No aplica aviso previo para Art. 159 Nro.5.";
      actualizado.observacion_anios_servicio = `${regla.articulo}: ${mesesIndemnizables} meses indemnizables x 2,5 días. Base ${formato(baseFinal)}.`;
    } else {
      actualizado.observacion_aviso_previo =
        "No aplica aviso previo para esta causal.";
      actualizado.observacion_anios_servicio =
        regla.pagaFeriado
          ? "No corresponde indemnizacion legal por esta causal, salvo pacto o monto voluntario."
          : "";
    }
  }

  function totalHaberesVista() {
    return (
      numero(form.sueldo_pendiente) +
      numero(form.vacaciones_proporcionales) +
      numero(form.indemnizacion_aviso_previo) +
      numero(form.indemnizacion_anios_servicio) +
      numero(form.indemnizacion_voluntaria) +
      numero(form.otros_haberes)
    );
  }

  function totalDescuentosVista() {
    return (
      numero(form.descuentos) +
      numero(form.seguro_cesantia_descuento) +
      numero(form.otros_descuentos) +
      numero(form.impuesto_unico_finiquito)
    );
  }

  function totalFiniquitoVista() {
    return totalHaberesVista() - totalDescuentosVista();
  }

  function abrirModal(concepto, titulo) {
    setModal({
      abierto: true,
      concepto,
      titulo,
    });
  }

  function cerrarModal() {
    setModal({
      abierto: false,
      concepto: "",
      titulo: "",
    });
  }

  // Evita el doble envío: un segundo clic antes de que responda el servidor
  // creaba el registro dos veces.
  const [guardando, setGuardando] = useState(false);

  async function guardarFiniquito(e) {
    e.preventDefault();

    if (guardando) return;

    try {
      setGuardando(true);
      setMensaje("");
      setError("");

      if (!form.trabajador_id) {
        setError("Debes seleccionar un trabajador.");
        return;
      }

      if (!form.fecha_termino) {
        setError("Debes indicar fecha de termino.");
        return;
      }

      // El servidor recalcula todo a partir de los supuestos; los montos del
      // formulario son solo la vista previa.
      const data = await crearFiniquito({
        empresa_id: empresaActiva.id,
        trabajador_id: form.trabajador_id,
        fecha_termino: form.fecha_termino,
        fecha_aviso: form.fecha_aviso || null,
        fecha_pago: form.fecha_pago || null,
        causal: form.causal,
        hubo_aviso_30_dias: form.hubo_aviso_30_dias,
        incluir_liquidacion_pendiente: form.incluir_liquidacion_pendiente,
        dias_trabajados_mes: form.dias_trabajados_mes,
        indemnizacion_voluntaria: form.indemnizacion_voluntaria,
        otros_haberes: form.otros_haberes,
        descuentos: form.descuentos,
        otros_descuentos: form.otros_descuentos,
        seguro_cesantia_descuento: form.seguro_cesantia_manual ? form.seguro_cesantia_descuento : undefined,
        observacion: form.observacion,
        observacion_otros_haberes: form.observacion_otros_haberes,
        revisado: form.revisado,
        pagado: form.pagado,
      });

      setMensaje(
        Array.isArray(data.avisos) && data.avisos.length > 0
          ? `${data.mensaje}. ${data.avisos.join(" ")}`
          : data.mensaje
      );
      setAvisosServidor([]);
      setForm(estadoInicial);
      setLiquidacionPendiente(null);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarFiniquitoClick(id) {
    const confirmar = window.confirm("Deseas eliminar este finiquito?");

    if (!confirmar) return;

    try {
      setMensaje("");
      setError("");

      const data = await eliminarFiniquito(id, empresaActiva.id);
      setMensaje(data.mensaje);

      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function exportarPDFClick(id) {
    try {
        setMensaje("");
        setError("");

        const data = await obtenerFiniquito(id, empresaActiva.id);

        exportarFiniquitoPDF(data.finiquito, empresaActiva);
    } catch (err) {
        setError(err.message);
    }
  }

  async function contabilizarFiniquitoClick(id) {
    const confirmar = window.confirm(
        "Deseas contabilizar este finiquito? Se generara un comprobante contable automatico."
    );

    if (!confirmar) return;

    try {
      setMensaje("");
      setError("");

      const data = await contabilizarFiniquito(id, empresaActiva.id);

      setMensaje(
        `${data.mensaje}. Comprobante Nro. ${data.comprobante?.numero || ""}`
      );

      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function pagarFiniquitoClick(item) {
    if (!item.contabilizado) {
      setError(
        "Primero debes contabilizar el finiquito antes de registrar el pago."
      );
      return;
    }

    const confirmar = window.confirm(
      "Deseas registrar el pago de este finiquito? Se generara un comprobante de egreso."
    );

    if (!confirmar) return;

    try {
      setMensaje("");
      setError("");

      const data = await pagarFiniquito(item.id, {
        empresa_id: empresaActiva.id,
        fecha_pago: item.fecha_pago || item.fecha_termino,
      });

      setMensaje(
        `${data.mensaje}. Comprobante de egreso Nro. ${
            data.comprobante?.numero || ""
        }`
      );

      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  const trabajadorSeleccionado = trabajadorActual();
  const reglaFiniquito = obtenerReglaFiniquito(form.causal, trabajadorSeleccionado);
  const tituloIndemnizacionServicio = reglaFiniquito.pagaIndemnizacionObraFaena
    ? "Indemnizacion obra/faena"
    : "Indemnizacion años servicio";
  const detalleIndemnizacionServicio = reglaFiniquito.pagaIndemnizacionObraFaena
    ? `${form.anios_servicio || 0} meses indemnizables`
    : `${form.anios_servicio || 0} años reconocidos`;
  const montoLiquidacionPendiente = numero(liquidacionPendiente?.liquido_pagar);

  return (
    <div>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <div style={hero}>
        <div>
          <h1 style={titulo}>Finiquitar contrato</h1>
          <p style={subtitulo}>
            Cálculo avanzado de finiquito con conceptos editables.
          </p>
        </div>

        <div style={filtrosHero}>
          <div>
            <label style={labelHero}>Período</label>
            <PeriodoMesSelector
              style={inputHero}
              value={periodo}
              onChange={setPeriodo}
              containerStyle={{ width: "100%", minWidth: 220 }}
            />
          </div>

          <button type="button" style={botonHero} onClick={cargarDatos}>
            Buscar
          </button>
        </div>
      </div>

      <div style={gridResumen}>
        <ResumenCard icono={<IconoResumen tipo="finiquitos" />} titulo="Finiquitos" valor={finiquitos.length} />
        <ResumenCard icono={<IconoResumen tipo="pago" />} titulo="Total a pagar" valor={formato(totales.total_finiquito)} />
        <ResumenCard icono={<IconoResumen tipo="vacaciones" />} titulo="Vacaciones" valor={formato(totales.vacaciones_proporcionales)} />
        <ResumenCard icono={<IconoResumen tipo="indemnizaciones" />} titulo="Indemnizaciones" valor={formato(totales.indemnizaciones)} />
      </div>

      <form style={card} onSubmit={guardarFiniquito}>
        <h2 style={tituloSeccion}>Datos principales</h2>

        <div style={grid}>
          <div>
            <label style={label}>Trabajador</label>
            <select
              style={input}
              name="trabajador_id"
              value={form.trabajador_id}
              onChange={seleccionarTrabajador}
            >
              <option value="">Seleccionar trabajador</option>
              {trabajadores.map((trabajador) => (
                <option key={trabajador.id} value={trabajador.id}>
                  {trabajador.rut} - {trabajador.nombres} {trabajador.apellidos}
                </option>
              ))}
            </select>
          </div>

          <Campo label="Fecha aviso" name="fecha_aviso" type="date" value={form.fecha_aviso} onChange={cambiarForm} />
          <Campo label="Fecha termino" name="fecha_termino" type="date" value={form.fecha_termino} onChange={cambiarForm} />
          <Campo label="Fecha pago" name="fecha_pago" type="date" value={form.fecha_pago} onChange={cambiarForm} />
        </div>

        <div style={{ marginTop: "14px" }}>
          <label style={label}>Causal legal</label>
          <select style={input} name="causal" value={form.causal} onChange={cambiarForm}>
            {CAUSALES.map((causal) => (
              <option key={causal} value={causal}>
                {causal}
              </option>
            ))}
          </select>
        </div>

        <div style={opcionesCalculo}>
          {reglaFiniquito.pagaAvisoPrevio && (
            <label style={checkBox}>
              <input
                type="checkbox"
                name="hubo_aviso_30_dias"
                checked={form.hubo_aviso_30_dias}
                onChange={cambiarForm}
              />
              Hubo aviso escrito con 30 días
            </label>
          )}

          <label style={checkBox}>
            <input
              type="checkbox"
              name="incluir_liquidacion_pendiente"
              checked={form.incluir_liquidacion_pendiente}
              onChange={cambiarForm}
            />
            Sumar liquidación pendiente {montoLiquidacionPendiente > 0 ? formato(montoLiquidacionPendiente) : ""}
          </label>
        </div>

        <div style={alertaCalculo}>
          {reglaFiniquito.mensaje}
          {calculandoServidor ? " Calculando en el servidor…" : ""}
        </div>

        {avisosServidor.length > 0 && (
          <ul style={listaAvisos}>
            {avisosServidor.map((aviso) => (
              <li key={aviso}>{aviso}</li>
            ))}
          </ul>
        )}

        <h2 style={tituloSeccionSeparado}>Conceptos del finiquito</h2>

        <div style={conceptosGrid}>
          <ConceptoCard
            titulo="Remuneraciones pendientes"
            monto={formato(form.sueldo_pendiente)}
            detalle={form.incluir_liquidacion_pendiente ? "Desde liquidacion del periodo" : `${form.dias_trabajados_mes || 0} dias trabajados`}
            obs={form.observacion_sueldo_pendiente}
            onEditar={() => abrirModal("remuneracionPendiente", "Remuneraciones pendientes")}
          />

          <ConceptoCard
            titulo="Feriado proporcional"
            monto={formato(form.vacaciones_proporcionales)}
            detalle={`${form.dias_vacaciones_pendientes || 0} días habiles / ${form.vacaciones_pendientes || 0} dias corridos`}
            obs={form.observacion_vacaciones}
            onEditar={() => abrirModal("vacaciones", "Feriado proporcional / vacaciones")}
          />

          <ConceptoCard
            titulo="Indemnizacion aviso previo"
            monto={formato(form.indemnizacion_aviso_previo)}
            detalle={form.hubo_aviso_30_dias ? "No aplica por aviso de 30 días" : "Una remuneracion indemnizable"}
            obs={form.observacion_aviso_previo}
            onEditar={() => abrirModal("avisoPrevio", "Indemnizacion aviso previo")}
          />

          <ConceptoCard
            titulo={tituloIndemnizacionServicio}
            monto={formato(form.indemnizacion_anios_servicio)}
            detalle={detalleIndemnizacionServicio}
            obs={form.observacion_anios_servicio}
            onEditar={() => abrirModal("aniosServicio", tituloIndemnizacionServicio)}
          />

          <ConceptoCard
            titulo="Indemnizacion voluntaria"
            monto={formato(form.indemnizacion_voluntaria)}
            detalle="Monto pactado o voluntario"
            obs={form.observacion_indemnizacion_voluntaria}
            onEditar={() => abrirModal("voluntaria", "Indemnizacion voluntaria")}
          />

          <ConceptoCard
            titulo="Otros haberes"
            monto={formato(form.otros_haberes)}
            detalle="Bonos u otros conceptos"
            obs={form.observacion_otros_haberes}
            onEditar={() => abrirModal("otrosHaberes", "Otros haberes")}
          />

          <ConceptoCard
            titulo="Seguro cesantia / descuento"
            monto={formato(form.seguro_cesantia_descuento)}
            detalle="Descuento AFC certificado si corresponde"
            obs={form.observacion_descuentos}
            negativo
            onEditar={() => abrirModal("seguroCesantia", "Seguro cesantia / descuento")}
          />

          <ConceptoCard
            titulo="Otros descuentos"
            monto={formato(form.otros_descuentos)}
            detalle="Anticipos u otros descuentos"
            obs={form.observacion_descuentos}
            negativo
            onEditar={() => abrirModal("otrosDescuentos", "Otros descuentos")}
          />

          {numero(form.impuesto_unico_finiquito) > 0 && (
            <ConceptoCard
              titulo="Impuesto único sobre voluntaria"
              monto={formato(form.impuesto_unico_finiquito)}
              detalle="Calculado por el servidor sobre lo que excede la indemnización legal"
              obs={form.observacion_indemnizacion_voluntaria}
              negativo
              onEditar={() => abrirModal("voluntaria", "Indemnizacion voluntaria")}
            />
          )}
        </div>

        <div style={totalesBox}>
          <div>
            <span>Total haberes</span>
            <strong>{formato(totalHaberesVista())}</strong>
          </div>

          <div>
            <span>Total descuentos</span>
            <strong>{formato(totalDescuentosVista())}</strong>
          </div>

          <div style={totalFinal}>
            <span>Total finiquito</span>
            <strong>{formato(totalFiniquitoVista())}</strong>
          </div>
        </div>

        <h2 style={tituloSeccionSeparado}>Opciones adicionales</h2>

        <div style={grid}>
          <label style={checkBox}>
            <input type="checkbox" name="revisado" checked={form.revisado} onChange={cambiarForm} />
            Marcar como revisado
          </label>

          <label style={checkBox}>
            <input type="checkbox" name="pagado" checked={form.pagado} onChange={cambiarForm} />
            Marcar como pagado
          </label>
        </div>

        <div style={{ marginTop: "16px" }}>
          <label style={label}>Observacion general</label>
          <textarea
            style={textarea}
            name="observacion"
            value={form.observacion}
            onChange={cambiarForm}
            placeholder="Detalle adicional del finiquito..."
          />
        </div>

        <button style={botonGuardar} type="submit" disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar finiquito"}
        </button>
      </form>

      <div style={card}>
        <h2 style={tituloSeccion}>Finiquitos registrados</h2>

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Fecha termino</th>
                <th style={th}>Trabajador</th>
                <th style={th}>Causal</th>
                <th style={thNumero}>Vacaciones</th>
                <th style={thNumero}>Indemnizaciones</th>
                <th style={thNumero}>Descuentos</th>
                <th style={thNumero}>Total</th>
                <th style={thAccion}>Estado</th>
                <th style={thAccion}>Contab.</th>
                <th style={thAccion}>Pago</th>
                <th style={thAccion}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {finiquitos.map((item) => {
                const indemnizaciones =
                  numero(item.indemnizacion_aviso_previo) +
                  numero(item.indemnizacion_anios_servicio) +
                  numero(item.indemnizacion_voluntaria);
                const descuentosItem =
                  numero(item.descuentos) +
                  numero(item.seguro_cesantia_descuento) +
                  numero(item.otros_descuentos);

                return (
                  <tr key={item.id}>
                    <td style={td}>{item.fecha_termino?.substring(0, 10)}</td>
                    <td style={td}>
                      {item.trabajador_rut} - {item.trabajador_nombres} {item.trabajador_apellidos}
                    </td>
                    <td style={td}>{item.causal}</td>
                    <td style={tdNumero}>{formato(item.vacaciones_proporcionales)}</td>
                    <td style={tdNumero}>{formato(indemnizaciones)}</td>
                    <td style={tdNumero}>{formato(descuentosItem)}</td>
                    <td style={tdNumero}>{formato(item.total_finiquito)}</td>
                    <td style={tdAccion}>{item.pagado ? "Pagado" : item.revisado ? "Revisado" : "Pendiente"}</td>
                    <td style={tdAccion}>
                      {item.contabilizado ? (
                        <span style={badgeOk}>Si</span>
                      ) : (
                        <button
                          type="button"
                          style={botonContabilizar}
                          onClick={() => contabilizarFiniquitoClick(item.id)}
                          title="Contabilizar finiquito"
                          aria-label="Contabilizar finiquito"
                        >
                          {"\u2713"}
                        </button>
                      )}
                    </td>
                    <td style={tdAccion}>
                      {item.pagado ? (
                        <span style={badgeOk}>Si</span>
                      ) : (
                        <button
                          type="button"
                          style={item.contabilizado ? botonPagar : botonPagarDisabled}
                          onClick={() => pagarFiniquitoClick(item)}
                          disabled={!item.contabilizado}
                          title="Registrar pago"
                          aria-label="Registrar pago"
                        >
                          $
                        </button>
                      )}
                    </td>
                    <td style={tdAccionBotones}>
                      <button
                        type="button"
                        style={botonPDF}
                        onClick={() => exportarPDFClick(item.id)}
                        title="Exportar PDF"
                        aria-label="Exportar PDF"
                      >
                        {"\uD83D\uDCC4"}
                      </button>
                      <button
                        type="button"
                        style={botonEliminar}
                        onClick={() => eliminarFiniquitoClick(item.id)}
                        title="Eliminar finiquito"
                        aria-label="Eliminar finiquito"
                      >
                        {"\u2715"}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {finiquitos.length === 0 && (
                <tr>
                  <td style={td} colSpan="11">
                    No hay finiquitos registrados para este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal.abierto && (
        <ModalConcepto
          modal={modal}
          form={form}
          cambiarForm={cambiarForm}
          cerrarModal={cerrarModal}
          formato={formato}
          totalFiniquitoVista={totalFiniquitoVista}
        />
      )}
    </div>
  );
}

function ModalConcepto({
  modal,
  form,
  cambiarForm,
  cerrarModal,
  formato,
  totalFiniquitoVista,
}) {
  return (
    <div style={modalFondo}>
      <div style={modalCard}>
        <h2 style={tituloSeccion}>{modal.titulo}</h2>

        {modal.concepto === "remuneracionPendiente" && (
          <>
            <div style={grid}>
              <Campo label="Días trabajados del mes" name="dias_trabajados_mes" value={form.dias_trabajados_mes} onChange={cambiarForm} />
              <Campo label="Sueldo base" name="sueldo_base" value={form.sueldo_base} onChange={cambiarForm} />
              <Campo label="Monto final" name="sueldo_pendiente" value={form.sueldo_pendiente} onChange={cambiarForm} />
            </div>
            <CampoTexto label="Observacion" name="observacion_sueldo_pendiente" value={form.observacion_sueldo_pendiente} onChange={cambiarForm} />
          </>
        )}

        {modal.concepto === "vacaciones" && (
          <>
            <div style={grid}>
              <Campo label="Base vacaciones" name="base_vacaciones" value={form.base_vacaciones} onChange={cambiarForm} />
              <Campo label="Días habiles pendientes" name="dias_vacaciones_pendientes" value={form.dias_vacaciones_pendientes} onChange={cambiarForm} />
              <Campo label="Días corridos a pagar" name="vacaciones_pendientes" value={form.vacaciones_pendientes} onChange={cambiarForm} />
              <Campo label="Valor dia" name="valor_dia_vacaciones" value={form.valor_dia_vacaciones} onChange={cambiarForm} />
              <Campo label="Monto final" name="vacaciones_proporcionales" value={form.vacaciones_proporcionales} onChange={cambiarForm} />
            </div>
            <CampoTexto label="Observacion" name="observacion_vacaciones" value={form.observacion_vacaciones} onChange={cambiarForm} />
          </>
        )}

        {modal.concepto === "avisoPrevio" && (
          <>
            <div style={grid}>
              <Campo label="Sueldo base indemnizable" name="sueldo_indemnizable" value={form.sueldo_indemnizable} onChange={cambiarForm} />
              <Campo label="Monto aviso previo" name="indemnizacion_aviso_previo" value={form.indemnizacion_aviso_previo} onChange={cambiarForm} />
            </div>
            <CampoTexto label="Observacion" name="observacion_aviso_previo" value={form.observacion_aviso_previo} onChange={cambiarForm} />
          </>
        )}

        {modal.concepto === "aniosServicio" && (
          <>
            <div style={grid}>
              <Campo label="Base indemnización" name="base_indemnizacion" value={form.base_indemnizacion} onChange={cambiarForm} />
              <Campo label="Sueldo indemnizable" name="sueldo_indemnizable" value={form.sueldo_indemnizable} onChange={cambiarForm} />
              <Campo label="Años reconocidos" name="anios_servicio" value={form.anios_servicio} onChange={cambiarForm} />
              <Campo label="Meses servicio" name="meses_servicio" value={form.meses_servicio} onChange={cambiarForm} />
              <Campo label="Días servicio" name="dias_servicio" value={form.dias_servicio} onChange={cambiarForm} />
              <Campo label="Monto final" name="indemnizacion_anios_servicio" value={form.indemnizacion_anios_servicio} onChange={cambiarForm} />
            </div>
            <CampoTexto label="Observacion" name="observacion_anios_servicio" value={form.observacion_anios_servicio} onChange={cambiarForm} />
          </>
        )}

        {modal.concepto === "voluntaria" && (
          <>
            <Campo label="Indemnización voluntaria" name="indemnizacion_voluntaria" value={form.indemnizacion_voluntaria} onChange={cambiarForm} />
            <CampoTexto label="Observacion" name="observacion_indemnizacion_voluntaria" value={form.observacion_indemnizacion_voluntaria} onChange={cambiarForm} />
          </>
        )}

        {modal.concepto === "otrosHaberes" && (
          <>
            <Campo label="Otros haberes" name="otros_haberes" value={form.otros_haberes} onChange={cambiarForm} />
            <CampoTexto label="Observacion" name="observacion_otros_haberes" value={form.observacion_otros_haberes} onChange={cambiarForm} />
          </>
        )}

        {modal.concepto === "seguroCesantia" && (
          <>
            <Campo label="Seguro cesantia / descuento" name="seguro_cesantia_descuento" value={form.seguro_cesantia_descuento} onChange={cambiarForm} />
            <CampoTexto label="Observacion" name="observacion_descuentos" value={form.observacion_descuentos} onChange={cambiarForm} />
          </>
        )}

        {modal.concepto === "otrosDescuentos" && (
          <>
            <Campo label="Otros descuentos" name="otros_descuentos" value={form.otros_descuentos} onChange={cambiarForm} />
            <CampoTexto label="Observacion" name="observacion_descuentos" value={form.observacion_descuentos} onChange={cambiarForm} />
          </>
        )}

        <div style={modalResumen}>
          <span>Total estimado</span>
          <strong>{formato(totalFiniquitoVista())}</strong>
        </div>

        <button type="button" style={botonGuardar} onClick={cerrarModal}>
          Guardar concepto
        </button>
      </div>
    </div>
  );
}

function Campo({ label, name, value, onChange, type = "number" }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        style={inputStyle}
        type={type}
        step={type === "number" ? "0.0001" : undefined}
        name={name}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

function CampoTexto({ label, name, value, onChange }) {
  return (
    <div style={{ marginTop: "14px" }}>
      <label style={labelStyle}>{label}</label>
      <textarea
        style={textarea}
        name={name}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

function ConceptoCard({ titulo, monto, detalle, obs, onEditar, negativo }) {
  return (
    <div style={negativo ? conceptoCardNegativo : conceptoCard}>
      <strong>{titulo}</strong>
      <span style={conceptoMonto}>{monto}</span>
      <small>{detalle}</small>
      {obs && <small style={obsTexto}>Obs: {obs}</small>}
      <button
        type="button"
        style={botonEditar}
        onClick={onEditar}
        title={`Editar ${titulo}`}
        aria-label={`Editar ${titulo}`}
      >
        {"\u270E"}
      </button>
    </div>
  );
}

function ResumenCard({ titulo, valor, icono }) {
  return (
    <div style={resumenCard}>
      {icono && <span style={resumenIcono}>{icono}</span>}
      <strong>{titulo}</strong>
      <p>{valor}</p>
    </div>
  );
}

function IconoResumen({ tipo }) {
  const props = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  const iconos = {
    finiquitos: (
      <svg {...props}>
        <path d="M9 4h6l1 2h3v15H5V6h3z" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
      </svg>
    ),
    pago: (
      <svg {...props}>
        <path d="M4 7h16v10H4z" />
        <path d="M4 11h16" />
        <path d="M8 15h3" />
        <path d="M16 15h1" />
      </svg>
    ),
    vacaciones: (
      <svg {...props}>
        <path d="M4 17c3-4 6-6 10-6h6" />
        <path d="M7 17c1-5 4-9 9-12" />
        <path d="M5 20h14" />
        <path d="M16 5l3 3" />
      </svg>
    ),
    indemnizaciones: (
      <svg {...props}>
        <path d="M12 3v18" />
        <path d="M5 7h14" />
        <path d="m6 7-3 6h6z" />
        <path d="m18 7-3 6h6z" />
      </svg>
    ),
  };

  return iconos[tipo] || iconos.finiquitos;
}

const hero = {
  background: "linear-gradient(135deg, var(--sc-ink), var(--sc-azul), #0ea5e9)",
  borderRadius: "22px",
  padding: "28px",
  color: "white",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "end",
  gap: "20px",
  flexWrap: "wrap",
  marginBottom: "22px",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.18)",
};

const titulo = {
  margin: 0,
  fontSize: "32px",
};

const subtitulo = {
  color: "var(--sc-celeste-suave)",
  marginBottom: 0,
};

const filtrosHero = {
  display: "flex",
  gap: "12px",
  alignItems: "end",
  flexWrap: "wrap",
};

const labelHero = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-celeste-suave)",
  marginBottom: "5px",
};

const inputHero = {
  width: "160px",
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "10px",
  height: "40px",
  boxSizing: "border-box",
};

const botonHero = {
  background: "white",
  color: "var(--sc-azul)",
  border: "none",
  padding: "10px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  height: "40px",
};

const gridResumen = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "14px",
  marginBottom: "22px",
};

const resumenCard = {
  background: "white",
  borderRadius: "18px",
  padding: "18px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  color: "var(--sc-text)",
  display: "flex",
  flexDirection: "column",
  gap: "7px",
};

const resumenIcono = {
  width: "38px",
  height: "38px",
  borderRadius: "13px",
  background: "linear-gradient(135deg, var(--sc-celeste-suave), #ffffff)",
  border: "1px solid #67e8f9",
  color: "var(--sc-azul)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 8px 18px rgba(15, 76, 129, 0.12)",
};

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

const tituloSeccionSeparado = {
  color: "var(--sc-azul)",
  marginTop: "26px",
  paddingTop: "18px",
  borderTop: "1px solid var(--sc-borde-claro)",
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
};

const opcionesCalculo = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "12px",
  marginTop: "14px",
};

const alertaCalculo = {
  background: "#eef2ff",
  border: "1px solid #c7d2fe",
  borderRadius: "12px",
  color: "#312e81",
  fontWeight: "bold",
  padding: "12px",
  marginTop: "14px",
};

const conceptosGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: "14px",
};

const conceptoCard = {
  background: "var(--sc-fondo-claro)",
  border: "1px solid var(--sc-borde-claro)",
  borderRadius: "16px",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: "7px",
  color: "var(--sc-text)",
};

const conceptoCardNegativo = {
  ...conceptoCard,
  background: "var(--sc-naranja-fondo)",
  border: "1px solid #fed7aa",
};

const conceptoMonto = {
  fontSize: "22px",
  color: "var(--sc-azul)",
  fontWeight: "bold",
};

const obsTexto = {
  color: "var(--sc-gris)",
  fontStyle: "italic",
};

const botonEditar = {
  marginTop: "8px",
  background: "linear-gradient(135deg, var(--sc-azul), var(--sc-cian-medio))",
  color: "white",
  border: "none",
  width: "34px",
  height: "32px",
  padding: 0,
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
  fontSize: "15px",
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const label = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-text)",
  marginBottom: "5px",
};

const labelStyle = label;

const input = {
  width: "100%",
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "10px",
  height: "40px",
  boxSizing: "border-box",
};

const inputStyle = input;

const textarea = {
  width: "100%",
  minHeight: "90px",
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "10px",
  boxSizing: "border-box",
  resize: "vertical",
};

const totalesBox = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
  background: "var(--sc-fondo-claro)",
  borderRadius: "14px",
  padding: "16px",
  marginTop: "20px",
};

const totalFinal = {
  color: "var(--sc-azul)",
};

const checkBox = {
  background: "var(--sc-fondo-claro)",
  border: "1px solid var(--sc-borde-claro)",
  borderRadius: "12px",
  padding: "12px",
  color: "var(--sc-text)",
  fontWeight: "bold",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const botonGuardar = {
  marginTop: "18px",
  background: "var(--sc-teal)",
  color: "white",
  border: "none",
  padding: "12px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
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

const thAccion = {
  ...th,
  textAlign: "center",
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

const tdAccion = {
  ...td,
  textAlign: "center",
  whiteSpace: "nowrap",
};

const tdAccionBotones = {
  ...tdAccion,
  display: "flex",
  justifyContent: "center",
  gap: "6px",
};

const botonAccionBase = {
  color: "white",
  border: "none",
  width: "32px",
  height: "32px",
  padding: 0,
  borderRadius: "9px",
  fontWeight: "bold",
  cursor: "pointer",
  fontSize: "15px",
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const botonEliminar = {
  ...botonAccionBase,
  background: "linear-gradient(135deg, var(--sc-danger), var(--sc-warning))",
};

const modalFondo = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.65)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "20px",
  zIndex: 1000,
};

const modalCard = {
  background: "white",
  borderRadius: "20px",
  padding: "24px",
  width: "100%",
  maxWidth: "760px",
  boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
};

const modalResumen = {
  background: "linear-gradient(135deg, var(--sc-celeste-suave), var(--sc-cian-fondo))",
  color: "var(--sc-azul)",
  borderRadius: "14px",
  padding: "14px",
  marginTop: "18px",
  display: "flex",
  justifyContent: "space-between",
  fontWeight: "bold",
};

const ok = {
  color: "var(--sc-teal)",
  fontWeight: "bold",
};

const err = {
  color: "var(--sc-danger)",
  fontWeight: "bold",
};

const botonPDF = {
  ...botonAccionBase,
  background: "linear-gradient(135deg, var(--sc-azul), var(--sc-cian-medio))",
};

const botonContabilizar = {
  ...botonAccionBase,
  background: "linear-gradient(135deg, var(--sc-teal), var(--sc-cian-medio))",
};

const badgeOk = {
  background: "#dcfce7",
  color: "#166534",
  padding: "6px 10px",
  borderRadius: "999px",
  fontWeight: "bold",
  display: "inline-block",
};

const botonPagar = {
  ...botonAccionBase,
  background: "linear-gradient(135deg, var(--sc-teal), var(--sc-cian-medio))",
};

const botonPagarDisabled = {
  ...botonPagar,
  background: "#94a3b8",
  cursor: "not-allowed",
};



