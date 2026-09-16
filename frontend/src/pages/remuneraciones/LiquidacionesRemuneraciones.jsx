import { useEffect, useMemo, useState } from "react";
import { obtenerEmpresaActiva } from "../../services/empresaService";
import { listarTrabajadores } from "../../services/trabajadoresService";
import { obtenerPeriodoTrabajo } from "../../services/periodoTrabajoService";
import PeriodoMesSelector from "../../components/PeriodoMesSelector";
import {
  calcularLiquidacion,
  guardarLiquidacion,
  actualizarLiquidacion as actualizarLiquidacionService,
  eliminarLiquidacion as eliminarLiquidacionService,
  listarLiquidaciones,
  contabilizarLiquidaciones,
} from "../../services/liquidacionesService";
import { obtenerResumenHaberesLiquidacion } from "../../services/haberesDescuentosService";

const FORMULARIO_INICIAL = {
  periodo: obtenerPeriodoTrabajo(),
  trabajador_id: "",
  dias_trabajados: 30,
  tipo_gratificacion: "MENSUAL",
  gratificacion: 0,
  haberes_no_imponibles: 0,
  tipo_calculo_horas_extras: "MENSUAL",
  horas_extras: 0,
  base_horas_extras: 0,
  jornada_horas_semanal: 42,
  aplica_semana_corrida_horas_extras: false,
  semana_corrida_horas_extras: 0,
  recargo_horas_extras: 50,
};

const TIPOS_HORAS_EXTRAS = [
  { value: "MENSUAL", label: "Sueldo mensual" },
  { value: "SEMANAL", label: "Sueldo semanal" },
  { value: "DIARIO_5", label: "Diario 5 dias" },
  { value: "DIARIO_6", label: "Diario 6 dias" },
  { value: "POR_HORA", label: "Por hora" },
  { value: "VARIABLE", label: "Variable / sin sueldo fijo" },
];

export default function LiquidacionesRemuneraciones() {
  const empresaActiva = obtenerEmpresaActiva();

  const [trabajadores, setTrabajadores] = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [calculo, setCalculo] = useState(null);
  const [editandoLiquidacionId, setEditandoLiquidacionId] = useState(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);

  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL);

  const [totales, setTotales] = useState({
    total_haberes: 0,
    total_horas_extras: 0,
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

  useEffect(() => {
    if (!empresaActiva || !formulario.periodo) {
      return;
    }

    if (!formulario.trabajador_id) {
      setFormulario((prev) => {
        if (Number(prev.haberes_no_imponibles || 0) === 0) {
          return prev;
        }

        return {
          ...prev,
          haberes_no_imponibles: 0,
        };
      });
      return;
    }

    autocompletarVariablesTrabajador(formulario.trabajador_id, formulario.periodo);
  }, [empresaActiva?.id, formulario.trabajador_id, formulario.periodo]);

  const gratificacionEsManual = formulario.tipo_gratificacion === "ANUAL";

  const textoAyudaGratificacion = useMemo(() => {
    if (formulario.tipo_gratificacion === "MENSUAL") {
      return "Mensual: se calcula automaticamente como 25% del imponible (sin gratificacion previa).";
    }

    if (formulario.tipo_gratificacion === "SIN_GRATIFICACION") {
      return "Sin gratificacion: se aplica monto 0.";
    }

    return "Anual: ingresa manualmente el monto a aplicar en este periodo.";
  }, [formulario.tipo_gratificacion]);

  const permiteSemanaCorridaHorasExtras =
    formulario.tipo_calculo_horas_extras === "DIARIO_5" ||
    formulario.tipo_calculo_horas_extras === "DIARIO_6" ||
    formulario.tipo_calculo_horas_extras === "POR_HORA";

  const labelBaseHorasExtras = useMemo(() => {
    if (formulario.tipo_calculo_horas_extras === "SEMANAL") {
      return "Sueldo semanal";
    }

    if (
      formulario.tipo_calculo_horas_extras === "DIARIO_5" ||
      formulario.tipo_calculo_horas_extras === "DIARIO_6"
    ) {
      return "Sueldo diario";
    }

    if (formulario.tipo_calculo_horas_extras === "POR_HORA") {
      return "Valor hora";
    }

    if (formulario.tipo_calculo_horas_extras === "VARIABLE") {
      return "Base variable";
    }

    return "Base opcional";
  }, [formulario.tipo_calculo_horas_extras]);

  async function cargarDatos() {
    try {
      setError("");

      const trabajadoresData = await listarTrabajadores(
        empresaActiva.id,
        "activo"
      );

      const liquidacionesData = await listarLiquidaciones(
        empresaActiva.id,
        formulario.periodo
      );

      setTrabajadores(trabajadoresData.trabajadores || []);
      setLiquidaciones(liquidacionesData.liquidaciones || []);
      setTotales(
        liquidacionesData.totales || {
          total_haberes: 0,
          total_horas_extras: 0,
          total_descuentos: 0,
          liquido_pagar: 0,
          costo_empresa: 0,
        }
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function autocompletarVariablesTrabajador(trabajadorId, periodo) {
    try {
      setCargandoResumen(true);

      const resumen = await obtenerResumenHaberesLiquidacion(
        empresaActiva.id,
        Number(trabajadorId),
        periodo,
        true
      );

      setFormulario((prev) => {
        if (String(prev.trabajador_id) !== String(trabajadorId)) {
          return prev;
        }

        return {
          ...prev,
          haberes_no_imponibles: Number(
            resumen?.totales?.haberes_no_imponibles || 0
          ),
        };
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setCargandoResumen(false);
    }
  }

  function cambiarFormulario(e) {
    const { name, value, type, checked } = e.target;
    const nuevoValor = type === "checkbox" ? checked : value;

    setFormulario((prev) => {
      if (name === "tipo_gratificacion") {
        const siguiente = {
          ...prev,
          tipo_gratificacion: nuevoValor,
        };

        if (nuevoValor === "SIN_GRATIFICACION" || nuevoValor === "MENSUAL") {
          siguiente.gratificacion = 0;
        }

        return siguiente;
      }

      if (name === "tipo_calculo_horas_extras") {
        return {
          ...prev,
          tipo_calculo_horas_extras: nuevoValor,
          aplica_semana_corrida_horas_extras:
            nuevoValor === "DIARIO_5" || nuevoValor === "DIARIO_6"
              ? prev.aplica_semana_corrida_horas_extras
              : false,
          semana_corrida_horas_extras:
            nuevoValor === "DIARIO_5" || nuevoValor === "DIARIO_6"
              ? prev.semana_corrida_horas_extras
              : 0,
        };
      }

      return {
        ...prev,
        [name]: nuevoValor,
      };
    });
  }

  function formato(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CL")}`;
  }

  function detalleConceptos(items = []) {
    if (!Array.isArray(items) || items.length === 0) {
      return "Sin conceptos.";
    }

    return items
      .map((item) => `${item.concepto}: ${formato(item.monto)}`)
      .join(" | ");
  }

  async function calcular(e) {
    e.preventDefault();

    try {
      setMensaje("");
      setError("");

      const data = await calcularLiquidacion({
        empresa_id: empresaActiva.id,
        trabajador_id: Number(formulario.trabajador_id),
        periodo: formulario.periodo,
        dias_trabajados: Number(formulario.dias_trabajados || 30),
        tipo_gratificacion: formulario.tipo_gratificacion,
        gratificacion: gratificacionEsManual
          ? Number(formulario.gratificacion || 0)
          : 0,
        haberes_no_imponibles: Number(formulario.haberes_no_imponibles || 0),
        otros_descuentos: 0,
        tipo_calculo_horas_extras: formulario.tipo_calculo_horas_extras,
        horas_extras: Number(formulario.horas_extras || 0),
        base_horas_extras: Number(formulario.base_horas_extras || 0),
        jornada_horas_semanal: Number(
          formulario.jornada_horas_semanal || 42
        ),
        aplica_semana_corrida_horas_extras: Boolean(
          formulario.aplica_semana_corrida_horas_extras
        ),
        semana_corrida_horas_extras: formulario.aplica_semana_corrida_horas_extras
          ? Number(formulario.semana_corrida_horas_extras || 0)
          : 0,
        recargo_horas_extras: Number(formulario.recargo_horas_extras || 50),
      });

      setCalculo(data);
      setMensaje("Liquidacion calculada correctamente.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function guardar() {
    if (!calculo) {
      setError("Primero debes calcular la liquidacion.");
      return;
    }

    try {
      setMensaje("");
      setError("");

      const payload = {
        empresa_id: empresaActiva.id,
        trabajador_id: Number(formulario.trabajador_id),
        ...calculo.calculo,
      };

      const data = editandoLiquidacionId
        ? await actualizarLiquidacionService(editandoLiquidacionId, payload)
        : await guardarLiquidacion(payload);

      setMensaje(data.mensaje);
      setCalculo(null);
      setEditandoLiquidacionId(null);
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  function editarLiquidacion(item) {
    if (Boolean(item.contabilizada)) {
      setMensaje("");
      setError(
        "No puedes editar una liquidacion ya contabilizada. Si necesitas recalcularla, elimínala para anular su comprobante."
      );
      return;
    }

    setMensaje("");
    setError("");
    setCalculo(null);
    setEditandoLiquidacionId(item.id);

    setFormulario((prev) => ({
      ...prev,
      periodo: item.periodo || prev.periodo,
      trabajador_id: String(item.trabajador_id || ""),
      dias_trabajados: Number(item.dias_trabajados || 30),
      tipo_gratificacion: item.tipo_gratificacion || "MENSUAL",
      gratificacion: Number(item.gratificacion || 0),
      haberes_no_imponibles: Number(item.variables_haberes_no_imponibles || 0),
      tipo_calculo_horas_extras: item.tipo_calculo_horas_extras || "MENSUAL",
      horas_extras: Number(item.horas_extras || 0),
      base_horas_extras: Number(item.base_horas_extras || 0),
      jornada_horas_semanal: Number(item.jornada_horas_semanal || 42),
      aplica_semana_corrida_horas_extras: Boolean(
        item.aplica_semana_corrida_horas_extras
      ),
      semana_corrida_horas_extras: Number(
        item.semana_corrida_horas_extras || 0
      ),
      recargo_horas_extras: Number(item.recargo_horas_extras || 50),
    }));

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicion() {
    setEditandoLiquidacionId(null);
    setCalculo(null);
    setFormulario(FORMULARIO_INICIAL);
  }

  async function eliminarLiquidacionFila(item) {
    const esContabilizada = Boolean(item?.contabilizada);
    const confirmar = window.confirm(
      esContabilizada
        ? "Esta liquidacion esta contabilizada. Se anulara el comprobante asociado y luego se eliminara la liquidacion. Deseas continuar?"
        : "Deseas eliminar esta liquidacion?"
    );
    if (!confirmar) return;

    try {
      setMensaje("");
      setError("");

      const data = await eliminarLiquidacionService(item.id, empresaActiva.id);
      setMensaje(data.mensaje);

      if (editandoLiquidacionId === item.id) {
        cancelarEdicion();
      }

      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function contabilizarPeriodo() {
    const confirmar = window.confirm(
      `Deseas contabilizar todas las liquidaciones emitidas del periodo ${formulario.periodo}?`
    );

    if (!confirmar) return;

    try {
      setMensaje("");
      setError("");

      const data = await contabilizarLiquidaciones(
        empresaActiva.id,
        formulario.periodo
      );

      setMensaje(
        `${data.mensaje}. Comprobante generado N° ${data.comprobante.numero}`
      );

      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <form style={card} onSubmit={calcular}>
        <h2 style={tituloSeccion}>Calcular liquidacion parametrizada</h2>

        <div style={grid}>
          <div>
            <label style={label}>Periodo</label>
            <PeriodoMesSelector
              style={input}
              value={formulario.periodo}
              onChange={(nuevoPeriodo) =>
                setFormulario((prev) => ({
                  ...prev,
                  periodo: nuevoPeriodo,
                }))
              }
              containerStyle={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={label}>Trabajador</label>
            <select
              style={input}
              name="trabajador_id"
              value={formulario.trabajador_id}
              onChange={cambiarFormulario}
            >
              <option value="">Seleccionar trabajador</option>
              {trabajadores.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.rut} - {item.nombres} {item.apellidos} - AFP: {item.afp || "Sin AFP"}
                </option>
              ))}
            </select>
          </div>

          <Campo
            label="Dias trabajados"
            type="number"
            name="dias_trabajados"
            value={formulario.dias_trabajados}
            onChange={cambiarFormulario}
          />

          <div>
            <label style={label}>Tipo gratificacion</label>
            <select
              style={input}
              name="tipo_gratificacion"
              value={formulario.tipo_gratificacion}
              onChange={cambiarFormulario}
            >
              <option value="MENSUAL">Mensual (25% automatico)</option>
              <option value="ANUAL">Anual (manual)</option>
              <option value="SIN_GRATIFICACION">Sin gratificacion</option>
            </select>
          </div>

          <Campo
            label={gratificacionEsManual ? "Gratificacion manual" : "Gratificacion"}
            type="number"
            name="gratificacion"
            value={formulario.gratificacion}
            onChange={cambiarFormulario}
            disabled={!gratificacionEsManual}
          />

          <Campo
            label="Haberes no imponibles"
            type="number"
            name="haberes_no_imponibles"
            value={formulario.haberes_no_imponibles}
            onChange={cambiarFormulario}
          />
        </div>

        <div style={bloqueHorasExtras}>
          <h3 style={subtituloCompacto}>Horas extras</h3>

          <div style={gridHorasExtras}>
            <div>
              <label style={label}>Tipo calculo</label>
              <select
                style={input}
                name="tipo_calculo_horas_extras"
                value={formulario.tipo_calculo_horas_extras}
                onChange={cambiarFormulario}
              >
                {TIPOS_HORAS_EXTRAS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <Campo
              label="Horas del periodo"
              type="number"
              name="horas_extras"
              value={formulario.horas_extras}
              onChange={cambiarFormulario}
            />

            <Campo
              label={labelBaseHorasExtras}
              type="number"
              name="base_horas_extras"
              value={formulario.base_horas_extras}
              onChange={cambiarFormulario}
            />

            <Campo
              label="Jornada semanal"
              type="number"
              name="jornada_horas_semanal"
              value={formulario.jornada_horas_semanal}
              onChange={cambiarFormulario}
            />

            <Campo
              label="Recargo %"
              type="number"
              name="recargo_horas_extras"
              value={formulario.recargo_horas_extras}
              onChange={cambiarFormulario}
            />

            <div style={checkboxWrap}>
              <label style={checkLabel}>
                <input
                  type="checkbox"
                  name="aplica_semana_corrida_horas_extras"
                  checked={Boolean(formulario.aplica_semana_corrida_horas_extras)}
                  onChange={cambiarFormulario}
                  disabled={!permiteSemanaCorridaHorasExtras}
                />
                Aplica semana corrida
              </label>
            </div>

            <Campo
              label="Semana corrida"
              type="number"
              name="semana_corrida_horas_extras"
              value={formulario.semana_corrida_horas_extras}
              onChange={cambiarFormulario}
              disabled={
                !permiteSemanaCorridaHorasExtras ||
                !formulario.aplica_semana_corrida_horas_extras
              }
            />
          </div>

          <small style={notaCompacta}>
            Si la base queda en 0, el sistema usa el sueldo base del trabajador. Para remuneracion variable usa el ingreso minimo configurado cuando corresponda.
          </small>
        </div>

        <p style={ayudaGratificacion}>{textoAyudaGratificacion}</p>

        {formulario.trabajador_id && (
          <p style={ayudaAutocompletado}>
            {cargandoResumen
              ? "Actualizando haberes no imponibles del trabajador..."
              : "Haberes no imponibles autocompletados desde Haberes/Descuentos."}
          </p>
        )}

        <button style={botonGuardar} type="submit">
          Calcular liquidacion
        </button>

        <button type="button" style={botonBuscar} onClick={cargarDatos}>
          Actualizar listado
        </button>

        <button
          type="button"
          style={botonContabilizar}
          onClick={contabilizarPeriodo}
        >
          Contabilizar periodo
        </button>

        {editandoLiquidacionId && (
          <button type="button" style={botonCancelar} onClick={cancelarEdicion}>
            Cancelar edicion
          </button>
        )}
      </form>

      {calculo && (
        <div style={cardResultado}>
          <h2 style={tituloSeccion}>Resultado calculo</h2>

          <h3 style={subtituloSeccion}>Datos trabajador</h3>

          <div style={gridResumen}>
            <Resumen
              label="Trabajador"
              valor={`${calculo.trabajador.nombres} ${calculo.trabajador.apellidos || ""}`}
            />
            <Resumen label="RUT" valor={calculo.trabajador.rut} />
            <Resumen label="AFP" valor={calculo.trabajador.afp || "-"} />
            <Resumen label="Salud" valor={calculo.trabajador.salud || "-"} />
            <Resumen
              label="Tipo gratificacion"
              valor={calculo.calculo.tipo_gratificacion || "MENSUAL"}
            />
          </div>

          <h3 style={subtituloSeccion}>Parametros aplicados</h3>

          <div style={gridResumen}>
            <Resumen
              label="Tasa AFP"
              valor={`${Number(calculo.configuracion.tasa_afp || 0).toLocaleString("es-CL")}%`}
            />
            <Resumen
              label="Salud"
              valor={`${Number(calculo.configuracion.tasa_salud || 0).toLocaleString("es-CL")}%`}
            />
            <Resumen
              label="AFC trabajador"
              valor={`${Number(calculo.configuracion.tasa_afc_trabajador || 0).toLocaleString("es-CL")}%`}
            />
            <Resumen
              label="AFC empleador"
              valor={`${Number(calculo.configuracion.tasa_afc_empleador || 0).toLocaleString("es-CL")}%`}
            />
            <Resumen
              label="SIS"
              valor={`${Number(calculo.configuracion.tasa_sis || 0).toLocaleString("es-CL")}%`}
            />
            <Resumen
              label="Seguro social empleador"
              valor={`${Number(calculo.configuracion.tasa_seguro_social || 0).toLocaleString("es-CL")}%`}
            />
            <Resumen
              label="Mutual"
              valor={`${Number(calculo.configuracion.tasa_mutual || 0).toLocaleString("es-CL")}%`}
            />
            <Resumen
              label="Tope imponible"
              valor={formato(calculo.configuracion.tope_imponible_pesos)}
            />
          </div>

          <h3 style={subtituloSeccion}>Haberes</h3>

          <div style={gridResumen}>
            <Resumen label="Sueldo base" valor={formato(calculo.calculo.sueldo_base)} />
            <Resumen
              label="Sueldo proporcional"
              valor={formato(calculo.calculo.sueldo_proporcional)}
            />
            <Resumen
              label="Gratificacion"
              valor={formato(calculo.calculo.gratificacion)}
            />
            <Resumen
              label="Horas extras"
              valor={formato(calculo.calculo.monto_horas_extras)}
              detalle={`${Number(calculo.calculo.horas_extras || 0).toLocaleString("es-CL")} hrs x ${formato(calculo.calculo.valor_hora_extra)}. ${calculo.calculo.detalle_horas_extras || ""}`}
            />
            <Resumen
              label="Variables imponibles"
              valor={formato(calculo.calculo.variables_haberes_imponibles)}
              detalle={detalleConceptos(
                calculo.calculo.detalle_variables_haberes_imponibles
              )}
            />
            <Resumen
              label="Base imponible"
              valor={formato(calculo.calculo.base_imponible)}
            />
            <Resumen
              label="Base afecta descuentos"
              valor={formato(calculo.calculo.base_afecta_descuentos)}
            />
            <Resumen
              label="Haberes no imponibles"
              valor={formato(calculo.calculo.total_haberes_no_imponibles)}
              detalle={detalleConceptos(
                calculo.calculo.detalle_variables_haberes_no_imponibles
              )}
            />
            <Resumen
              label="Total haberes"
              valor={formato(calculo.calculo.total_haberes)}
              destacado
            />
          </div>

          <h3 style={subtituloSeccion}>Descuentos trabajador</h3>

          <div style={gridResumen}>
            <Resumen label="AFP" valor={formato(calculo.calculo.descuento_afp)} />
            <Resumen label="Salud" valor={formato(calculo.calculo.descuento_salud)} />
            <Resumen
              label="AFC trabajador"
              valor={formato(calculo.calculo.descuento_afc)}
            />
            <Resumen
              label="Descuentos variables"
              valor={formato(calculo.calculo.variables_descuentos)}
              detalle={detalleConceptos(
                calculo.calculo.detalle_variables_descuentos
              )}
            />
            <Resumen
              label="Base tributable"
              valor={formato(calculo.calculo.base_tributable)}
              detalle={`Base imponible menos AFP, salud y AFC: ${formato(
                calculo.calculo.descuentos_previsionales_tributarios
              )}`}
            />

            <Resumen
              label="Tramo impuesto unico"
              valor={
                calculo.calculo.tramo_impuesto_unico_id
                  ? `${formato(calculo.calculo.tramo_impuesto_unico_desde)} a ${
                      Number(calculo.calculo.tramo_impuesto_unico_hasta || 0) === 0
                        ? "sin tope"
                        : formato(calculo.calculo.tramo_impuesto_unico_hasta)
                    }`
                  : "Sin tramo"
              }
            />

            <Resumen
              label="Factor impuesto unico"
              valor={Number(calculo.calculo.factor_impuesto_unico || 0).toLocaleString(
                "es-CL",
                {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 6,
                }
              )}
            />

            <Resumen
              label="Rebaja impuesto unico"
              valor={formato(calculo.calculo.rebaja_impuesto_unico)}
            />
            <Resumen
              label="Impuesto unico"
              valor={formato(calculo.calculo.impuesto_unico)}
              destacado={Number(calculo.calculo.impuesto_unico || 0) > 0}
            />
            <Resumen
              label="Total descuentos"
              valor={formato(calculo.calculo.total_descuentos)}
              destacado
            />
          </div>

          <h3 style={subtituloSeccion}>Aportes empleador y costo empresa</h3>

          <div style={gridResumen}>
            <Resumen
              label="SIS empleador"
              valor={formato(calculo.calculo.aporte_sis_empleador)}
            />
            <Resumen
              label="Seguro social empleador"
              valor={formato(calculo.calculo.aporte_seguro_social_empleador)}
            />
            <Resumen
              label="AFC empleador"
              valor={formato(calculo.calculo.aporte_afc_empleador)}
            />
            <Resumen
              label="Mutual"
              valor={formato(calculo.calculo.aporte_mutual_empleador)}
            />
            <Resumen
              label="Costo empresa"
              valor={formato(calculo.calculo.costo_empresa)}
              destacado
            />
            <Resumen
              label="Liquido a pagar"
              valor={formato(calculo.calculo.liquido_pagar)}
              destacadoVerde
            />
          </div>

          <p style={advertencia}>{calculo.advertencia}</p>

          <button style={botonGuardar} onClick={guardar}>
            {editandoLiquidacionId
              ? "Actualizar liquidacion"
              : "Guardar liquidacion"}
          </button>
        </div>
      )}

      <div style={card}>
        <h2 style={tituloSeccion}>Liquidaciones emitidas</h2>

        <div style={totalesBox}>
          <div>
            <strong>Total haberes:</strong> {formato(totales.total_haberes)}
          </div>
          <div>
            <strong>Horas extras:</strong> {formato(totales.total_horas_extras)}
          </div>
          <div>
            <strong>Total descuentos:</strong> {formato(totales.total_descuentos)}
          </div>
          <div>
            <strong>Liquido a pagar:</strong> {formato(totales.liquido_pagar)}
          </div>
          <div>
            <strong>Costo empresa:</strong> {formato(totales.costo_empresa)}
          </div>
        </div>

        <div style={tablaBox}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Periodo</th>
                <th style={th}>Trabajador</th>
                <th style={th}>Cargo</th>
                <th style={th}>AFP</th>
                <th style={thNumero}>Haberes</th>
                <th style={thNumero}>Hrs extra</th>
                <th style={thNumero}>Descuentos</th>
                <th style={thNumero}>Dias ausencia</th>
                <th style={thNumero}>Desc. ausencias</th>
                <th style={thNumero}>Liquido</th>
                <th style={thNumero}>Costo empresa</th>
                <th style={th}>Estado</th>
                <th style={th}>Contab.</th>
                <th style={th}>Comp.</th>
                <th style={th}>Accion</th>
              </tr>
            </thead>

            <tbody>
              {liquidaciones.map((item) => (
                <tr key={item.id}>
                  <td style={td}>{item.periodo}</td>
                  <td style={td}>
                    {item.rut} - {item.nombres} {item.apellidos}
                  </td>
                  <td style={td}>{item.cargo}</td>
                  <td style={td}>{item.afp}</td>
                  <td style={tdNumero}>{formato(item.total_haberes)}</td>
                  <td style={tdNumero}>{formato(item.monto_horas_extras)}</td>
                  <td style={tdNumero}>{formato(item.total_descuentos)}</td>
                  <td style={tdNumero}>
                    {Number(item.dias_ausencia || 0).toLocaleString("es-CL")}
                  </td>
                  <td style={tdNumero}>
                    ${Number(item.descuento_ausencias || 0).toLocaleString("es-CL")}
                  </td>
                  <td style={tdNumero}>{formato(item.liquido_pagar)}</td>
                  <td style={tdNumero}>{formato(item.costo_empresa)}</td>
                  <td style={td}>{item.estado}</td>
                  <td style={td}>
                    {item.contabilizada ? (
                      <span style={badgeOk}>Si</span>
                    ) : (
                      <span style={badgePendiente}>No</span>
                    )}
                  </td>
                  <td style={td}>
                    {item.comprobante_id
                      ? item.comprobante_numero || item.comprobante_id
                      : "-"}
                  </td>
                  <td style={td}>
                    <div style={accionesFila}>
                      <button
                        type="button"
                        style={botonEditarIcono}
                        title="Editar liquidacion"
                        aria-label="Editar liquidacion"
                        onClick={() => editarLiquidacion(item)}
                      >
                        {"\u270E"}
                      </button>
                      <button
                        type="button"
                        style={botonEliminarIcono}
                        title="Eliminar liquidacion"
                        aria-label="Eliminar liquidacion"
                        onClick={() => eliminarLiquidacionFila(item)}
                      >
                        {"\u2715"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {liquidaciones.length === 0 && (
                <tr>
                  <td style={td} colSpan="15">
                    No hay liquidaciones emitidas.
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

function Campo({ label, name, value, onChange, type = "text", disabled = false }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        style={disabled ? inputStyleDisabled : inputStyle}
        type={type}
        step={type === "number" ? "any" : undefined}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

function Resumen({ label, valor, detalle, destacado, destacadoVerde }) {
  return (
    <div
      style={
        destacadoVerde
          ? resumenDestacadoVerde
          : destacado
          ? resumenDestacado
          : resumen
      }
    >
      <strong>{label}</strong>
      <span>{valor}</span>
      {detalle ? <small style={detalleResumen}>{detalle}</small> : null}
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

const cardResultado = {
  ...card,
  border: "2px solid #0ea5e9",
};

const tituloSeccion = {
  color: "#0369a1",
  marginTop: 0,
};

const subtituloSeccion = {
  color: "#1e293b",
  marginTop: "20px",
  marginBottom: "10px",
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "14px",
};

const gridResumen = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "12px",
};

const bloqueHorasExtras = {
  marginTop: "14px",
  padding: "14px",
  borderRadius: "14px",
  border: "1px solid #bae6fd",
  background: "linear-gradient(135deg, #f0f9ff, #ecfeff)",
};

const subtituloCompacto = {
  color: "#0369a1",
  margin: "0 0 10px",
  fontSize: "18px",
};

const gridHorasExtras = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "10px",
  alignItems: "end",
};

const checkboxWrap = {
  display: "flex",
  alignItems: "center",
  minHeight: "40px",
};

const checkLabel = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  color: "#1e293b",
  fontWeight: "bold",
};

const notaCompacta = {
  display: "block",
  marginTop: "8px",
  color: "#475569",
  lineHeight: 1.35,
};

const labelStyle = {
  display: "block",
  fontWeight: "bold",
  color: "#1e293b",
  marginBottom: "5px",
};

const inputStyle = {
  width: "100%",
  padding: "10px",
  border: "1px solid #a9d8ef",
  borderRadius: "10px",
  height: "40px",
  boxSizing: "border-box",
};

const inputStyleDisabled = {
  ...inputStyle,
  background: "#eef7ff",
  color: "#475569",
};

const label = labelStyle;
const input = inputStyle;

const botonGuardar = {
  marginTop: "18px",
  background: "#10b981",
  color: "white",
  border: "none",
  padding: "12px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const botonBuscar = {
  ...botonGuardar,
  background: "#0369a1",
  marginLeft: "10px",
};

const botonContabilizar = {
  ...botonGuardar,
  background: "#7c3aed",
  marginLeft: "10px",
};

const botonCancelar = {
  ...botonGuardar,
  background: "#475569",
  marginLeft: "10px",
};

const resumen = {
  background: "#f8fcff",
  padding: "14px",
  borderRadius: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  color: "#1e293b",
};

const detalleResumen = {
  color: "#475569",
  fontSize: "12px",
  lineHeight: 1.4,
};

const resumenDestacado = {
  ...resumen,
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  color: "#0369a1",
  fontWeight: "bold",
};

const resumenDestacadoVerde = {
  ...resumen,
  background: "#dcfce7",
  color: "#166534",
  fontWeight: "bold",
};

const advertencia = {
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  padding: "12px",
  borderRadius: "12px",
  marginTop: "16px",
};

const ayudaGratificacion = {
  marginTop: "12px",
  marginBottom: "0",
  background: "#eef2ff",
  border: "1px solid #c7d2fe",
  color: "#3730a3",
  padding: "10px 12px",
  borderRadius: "10px",
  fontWeight: "bold",
};

const ayudaAutocompletado = {
  marginTop: "10px",
  marginBottom: "0",
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  padding: "10px 12px",
  borderRadius: "10px",
  fontWeight: "bold",
};

const totalesBox = {
  display: "flex",
  gap: "18px",
  flexWrap: "wrap",
  background: "#f8fcff",
  borderRadius: "12px",
  padding: "14px",
  marginBottom: "14px",
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
  background: "linear-gradient(135deg, #dff7ff, #ecfeff)",
  color: "#0369a1",
  whiteSpace: "nowrap",
};

const thNumero = {
  ...th,
  textAlign: "right",
};

const td = {
  padding: "9px",
  borderBottom: "1px solid #e2e8f0",
  color: "#1e293b",
};

const tdNumero = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const accionesFila = {
  display: "flex",
  gap: "6px",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
};

const botonAccionBase = {
  border: "none",
  borderRadius: "9px",
  width: "32px",
  height: "32px",
  padding: 0,
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
  lineHeight: 1,
  fontSize: "15px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const botonEditarIcono = {
  ...botonAccionBase,
  background: "linear-gradient(135deg, #0369a1, #06b6d4)",
};

const botonEliminarIcono = {
  ...botonAccionBase,
  background: "linear-gradient(135deg, #ef4444, #f97316)",
};

const ok = {
  color: "#10b981",
  fontWeight: "bold",
};

const err = {
  color: "#ef4444",
  fontWeight: "bold",
};

const badgeOk = {
  background: "#dcfce7",
  color: "#166534",
  padding: "5px 8px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "12px",
};

const badgePendiente = {
  background: "#fef3c7",
  color: "#92400e",
  padding: "5px 8px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "12px",
};

