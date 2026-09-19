const pool = require("../database/db");

const {
  calcularVacacionesPendientesFiniquito,
} = require("../helpers/vacaciones.helper");
const { calcularFiniquito } = require("../helpers/finiquito.helper");
const {
  obtenerSiguienteNumeroComprobante,
  insertarDetallesComprobante,
} = require("../helpers/comprobante.helper");

function numero(valor) {
  return Number(valor || 0);
}

function obtenerPeriodoDesdeFecha(fecha) {
  if (!fecha) return "";

  const fechaTexto =
    fecha instanceof Date ? fecha.toISOString() : String(fecha || "");

  return fechaTexto.substring(0, 7);
}

async function obtenerConfiguracionContable(client, empresaId, periodo) {
  const exacta = await client.query(
    `
    SELECT *
    FROM configuracion_remuneraciones
    WHERE empresa_id = $1
      AND periodo = $2
    LIMIT 1
    `,
    [empresaId, periodo]
  );

  if (exacta.rows.length > 0) {
    return exacta.rows[0];
  }

  const anterior = await client.query(
    `
    SELECT *
    FROM configuracion_remuneraciones
    WHERE empresa_id = $1
      AND periodo <= $2
    ORDER BY periodo DESC
    LIMIT 1
    `,
    [empresaId, periodo]
  );

  return anterior.rows[0] || null;
}

async function crearFiniquito(req, res) {
  try {
    const {
      empresa_id,
      trabajador_id,
      fecha_aviso,
      fecha_termino,
      fecha_pago,
      causal,
      observacion,
      observacion_otros_haberes,
      revisado,
      pagado,
    } = req.body;

    if (!empresa_id || !trabajador_id || !fecha_termino || !causal) {
      return res.status(400).json({
        error:
          "Debe indicar empresa_id, trabajador_id, fecha de término y causal",
      });
    }

    // El servidor calcula el finiquito. Del cliente solo se toman los
    // supuestos (causal, fechas, aviso, montos voluntarios y descuentos);
    // antes se guardaba cualquier monto que llegara en el cuerpo.
    const resultadoCalculo = await calcularFiniquito(pool, req.body);
    const c = resultadoCalculo.calculo;
    const periodo = c.periodo;
    const vacacionesAuto = {
      dias_devengados: c.dias_vacaciones_devengadas,
      dias_usados: c.dias_vacaciones_usadas,
      dias_pendientes: c.dias_vacaciones_pendientes,
      dias_a_pagar: c.dias_vacaciones_a_pagar,
      valor_dia_vacaciones: c.valor_dia_vacaciones,
      monto_vacaciones_pendientes: c.monto_vacaciones_pendientes,
    };

    const dias_trabajados_mes = c.dias_trabajados_mes;
    const sueldo_base = c.sueldo_base;
    const sueldo_pendiente = c.sueldo_pendiente;
    const base_vacaciones = c.base_vacaciones;
    const diasVacacionesDevengadas = c.dias_vacaciones_devengadas;
    const diasVacacionesUsadas = c.dias_vacaciones_usadas;
    const diasVacacionesPendientes = c.dias_vacaciones_pendientes;
    const diasVacacionesAPagar = c.dias_vacaciones_a_pagar;
    const valorDiaVacaciones = c.valor_dia_vacaciones;
    const montoVacacionesPendientes = c.monto_vacaciones_pendientes;
    const sueldo_indemnizable = c.sueldo_indemnizable;
    const base_indemnizacion = c.base_indemnizacion;
    const anios_servicio = c.anios_servicio;
    const meses_servicio = c.meses_servicio;
    const dias_servicio = c.dias_servicio;
    const indemnizacion_aviso_previo = c.indemnizacion_aviso_previo;
    const indemnizacion_anios_servicio = c.indemnizacion_anios_servicio;
    const indemnizacion_voluntaria = c.indemnizacion_voluntaria;
    const otros_haberes = c.otros_haberes;
    const seguro_cesantia_descuento = c.seguro_cesantia_descuento;
    const otros_descuentos = c.otros_descuentos;
    const totalDescuentos = c.total_descuentos;
    const totalHaberes = c.total_haberes;
    const totalFiniquito = c.total_finiquito;
    const observacion_sueldo_pendiente = c.observacion_sueldo_pendiente;
    const observacion_vacaciones = c.observacion_vacaciones;
    const observacion_aviso_previo = c.observacion_aviso_previo;
    const observacion_anios_servicio = c.observacion_anios_servicio;
    const observacion_indemnizacion_voluntaria = c.observacion_indemnizacion_voluntaria;
    const observacion_descuentos = c.observacion_descuentos;

    const resultado = await pool.query(
      `
      INSERT INTO finiquitos
      (
        empresa_id,
        trabajador_id,
        periodo,

        fecha_aviso,
        fecha_termino,
        fecha_pago,
        causal,

        dias_trabajados_mes,
        sueldo_base,
        sueldo_pendiente,

        vacaciones_pendientes,
        valor_dia_vacaciones,
        base_vacaciones,
        vacaciones_proporcionales,

        dias_vacaciones_devengadas,
        dias_vacaciones_usadas,
        dias_vacaciones_pendientes,
        dias_vacaciones_a_pagar,
        monto_vacaciones_pendientes,

        sueldo_indemnizable,
        base_indemnizacion,
        anios_servicio,
        meses_servicio,
        dias_servicio,
        indemnizacion_aviso_previo,
        indemnizacion_anios_servicio,
        indemnizacion_voluntaria,

        otros_haberes,
        descuentos,
        seguro_cesantia_descuento,
        otros_descuentos,

        total_haberes,
        total_finiquito,

        observacion,
        observacion_sueldo_pendiente,
        observacion_vacaciones,
        observacion_aviso_previo,
        observacion_anios_servicio,
        observacion_indemnizacion_voluntaria,
        observacion_otros_haberes,
        observacion_descuentos,

        revisado,
        pagado,
        estado
      )
      VALUES
      (
        $1,$2,$3,
        $4,$5,$6,$7,
        $8,$9,$10,
        $11,$12,$13,$14,
        $15,$16,$17,$18,$19,
        $20,$21,$22,$23,$24,$25,$26,$27,
        $28,$29,$30,$31,
        $32,$33,
        $34,$35,$36,$37,$38,$39,$40,$41,
        $42,$43,
        'vigente'
      )
      RETURNING *
      `,
      [
        empresa_id,
        trabajador_id,
        periodo,

        fecha_aviso || null,
        fecha_termino,
        fecha_pago || null,
        causal,

        numero(dias_trabajados_mes),
        numero(sueldo_base),
        numero(sueldo_pendiente),

        diasVacacionesAPagar,
        valorDiaVacaciones,
        numero(base_vacaciones || sueldo_base),
        montoVacacionesPendientes,

        diasVacacionesDevengadas,
        diasVacacionesUsadas,
        diasVacacionesPendientes,
        diasVacacionesAPagar,
        montoVacacionesPendientes,

        numero(sueldo_indemnizable),
        numero(base_indemnizacion),
        numero(anios_servicio),
        numero(meses_servicio),
        numero(dias_servicio),
        numero(indemnizacion_aviso_previo),
        numero(indemnizacion_anios_servicio),
        numero(indemnizacion_voluntaria),

        numero(otros_haberes),
        numero(c.descuentos),
        numero(seguro_cesantia_descuento),
        numero(otros_descuentos),

        totalHaberes,
        totalFiniquito,

        observacion || "",
        observacion_sueldo_pendiente || "",
        observacion_vacaciones || "",
        observacion_aviso_previo || "",
        observacion_anios_servicio || "",
        observacion_indemnizacion_voluntaria || "",
        observacion_otros_haberes || "",
        observacion_descuentos || "",

        !!revisado,
        !!pagado,
      ]
    );

    // Un trabajador finiquitado deja la nómina: antes seguía apareciendo en
    // las liquidaciones del mes siguiente.
    await pool.query(
      `UPDATE trabajadores SET estado = 'finiquitado', fecha_termino = $3
       WHERE id = $1 AND empresa_id = $2 AND estado = 'activo'`,
      [trabajador_id, empresa_id, c.fecha_termino]
    );

    // Lo que el cálculo del servidor agrega respecto del formulario antiguo.
    const detalle = await pool.query(
      `UPDATE finiquitos
       SET impuesto_unico_finiquito = $3,
           tope_90_uf_aplicado = $4,
           valor_uf = $5,
           calculado_en_servidor = true,
           supuestos = $6
       WHERE id = $1 AND empresa_id = $2
       RETURNING *`,
      [
        resultado.rows[0].id,
        empresa_id,
        numero(c.impuesto_unico_finiquito),
        Boolean(c.tope_90_uf_aplicado),
        c.valor_uf,
        JSON.stringify({
          causal,
          hubo_aviso_30_dias: c.hubo_aviso_30_dias,
          fecha_aviso: c.fecha_aviso,
          incluir_liquidacion_pendiente: Boolean(req.body.incluir_liquidacion_pendiente),
          base_indemnizacion_sin_tope: c.base_indemnizacion_sin_tope,
          regla: resultadoCalculo.regla,
          avisos: resultadoCalculo.avisos,
        }),
      ]
    );

    return res.status(201).json({
      mensaje: "Finiquito registrado correctamente",
      finiquito: detalle.rows[0] || resultado.rows[0],
      vacaciones: vacacionesAuto,
      avisos: resultadoCalculo.avisos,
    });
  } catch (error) {
    console.error("Error al crear finiquito:", error);

    return res.status(error.statusCode || 500).json({
      // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
      // columnas y restricciones. Los errores de validacion propios
      // si conservan su mensaje y su codigo.
      error: error.statusCode ? error.message : "Error interno al crear finiquito",
    });
  }
}

async function listarFiniquitos(req, res) {
  try {
    const { empresa_id, periodo } = req.query;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    let query = `
      SELECT
        f.*,
        t.rut AS trabajador_rut,
        t.nombres AS trabajador_nombres,
        t.apellidos AS trabajador_apellidos,
        t.cargo AS trabajador_cargo,
        t.fecha_ingreso AS trabajador_fecha_ingreso
      FROM finiquitos f
      INNER JOIN trabajadores t ON t.id = f.trabajador_id
      WHERE f.empresa_id = $1
        AND f.estado = 'vigente'
    `;

    const valores = [empresa_id];
    let posicion = 2;

    if (periodo) {
      query += ` AND f.periodo = $${posicion}`;
      valores.push(periodo);
      posicion++;
    }

    query += `
      ORDER BY f.fecha_termino DESC, f.id DESC
    `;

    const resultado = await pool.query(query, valores);

    const totales = resultado.rows.reduce(
      (acc, item) => {
        acc.total_haberes += numero(item.total_haberes);
        acc.total_finiquito += numero(item.total_finiquito);
        acc.descuentos += numero(item.descuentos);
        acc.vacaciones_proporcionales += numero(
          item.vacaciones_proporcionales
        );
        acc.monto_vacaciones_pendientes += numero(
          item.monto_vacaciones_pendientes
        );
        acc.indemnizaciones +=
          numero(item.indemnizacion_aviso_previo) +
          numero(item.indemnizacion_anios_servicio) +
          numero(item.indemnizacion_voluntaria);
        return acc;
      },
      {
        total_haberes: 0,
        total_finiquito: 0,
        descuentos: 0,
        vacaciones_proporcionales: 0,
        monto_vacaciones_pendientes: 0,
        indemnizaciones: 0,
      }
    );

    return res.json({
      total_registros: resultado.rows.length,
      finiquitos: resultado.rows,
      totales,
    });
  } catch (error) {
    console.error("Error al listar finiquitos:", error);

    return res.status(error.statusCode || 500).json({
      // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
      // columnas y restricciones. Los errores de validacion propios
      // si conservan su mensaje y su codigo.
      error: error.statusCode ? error.message : "Error interno al listar finiquitos",
    });
  }
}

async function obtenerFiniquito(req, res) {
  try {
    const { id } = req.params;
    const { empresa_id } = req.query;

    if (!id || !empresa_id) {
      return res.status(400).json({
        error: "Debe indicar id y empresa_id",
      });
    }

    const resultado = await pool.query(
      `
      SELECT
        f.*,
        t.rut AS trabajador_rut,
        t.nombres AS trabajador_nombres,
        t.apellidos AS trabajador_apellidos,
        t.cargo AS trabajador_cargo,
        t.fecha_ingreso AS trabajador_fecha_ingreso,
        t.fecha_termino AS trabajador_fecha_termino,
        t.nacionalidad AS trabajador_nacionalidad,
        t.tipo_contrato AS trabajador_tipo_contrato,
        t.jornada AS trabajador_jornada,
        t.sueldo_base AS trabajador_sueldo_base,
        e.razon_social,
        e.rut AS empresa_rut,
        e.giro AS empresa_giro,
        e.direccion AS empresa_direccion,
        e.comuna AS empresa_comuna,
        e.ciudad AS empresa_ciudad
      FROM finiquitos f
      INNER JOIN trabajadores t ON t.id = f.trabajador_id
      INNER JOIN empresas e ON e.id = f.empresa_id
      WHERE f.id = $1
        AND f.empresa_id = $2
        AND f.estado = 'vigente'
      LIMIT 1
      `,
      [id, empresa_id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        error: "Finiquito no encontrado",
      });
    }

    return res.json({
      finiquito: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al obtener finiquito:", error);

    return res.status(error.statusCode || 500).json({
      // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
      // columnas y restricciones. Los errores de validacion propios
      // si conservan su mensaje y su codigo.
      error: error.statusCode ? error.message : "Error interno al obtener finiquito",
    });
  }
}

async function eliminarFiniquito(req, res) {
  try {
    const { id } = req.params;
    const { empresa_id } = req.body;

    if (!id || !empresa_id) {
      return res.status(400).json({
        error: "Debe indicar id y empresa_id",
      });
    }

    // Un finiquito contabilizado o pagado tiene asientos vigentes. Anularlo a
    // secas dejaba el asiento vivo y el finiquito fuera del listado: gasto e
    // indemnizacion contabilizados para un documento que ya no existia.
    const actual = await pool.query(
      `SELECT id, contabilizado, pagado FROM finiquitos
       WHERE id = $1 AND empresa_id = $2 AND estado = 'vigente'`,
      [id, empresa_id]
    );

    if (actual.rows.length === 0) {
      return res.status(404).json({
        error: "Finiquito no encontrado",
      });
    }

    if (actual.rows[0].contabilizado || actual.rows[0].pagado) {
      return res.status(409).json({
        error:
          "El finiquito esta contabilizado o pagado. Anula primero sus comprobantes y despues eliminalo.",
      });
    }

    const resultado = await pool.query(
      `
      UPDATE finiquitos
      SET estado = 'anulado',
          anulado_en = NOW(), anulado_por = NULLIF(current_setting('app.usuario_id', true), '')::integer,
          actualizado_en = NOW()
      WHERE id = $1
        AND empresa_id = $2
      RETURNING *
      `,
      [id, empresa_id]
    );

    return res.json({
      mensaje: "Finiquito eliminado correctamente",
      finiquito: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al eliminar finiquito:", error);

    return res.status(error.statusCode || 500).json({
      // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
      // columnas y restricciones. Los errores de validacion propios
      // si conservan su mensaje y su codigo.
      error: error.statusCode ? error.message : "Error interno al eliminar finiquito",
    });
  }
}

async function contabilizarFiniquito(req, res) {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { empresa_id } = req.body;

    if (!id || !empresa_id) {
      return res.status(400).json({
        error: "Debe indicar id y empresa_id",
      });
    }

    await client.query("BEGIN");

    const finiquitoResult = await client.query(
      `
      SELECT
        f.*,
        t.rut AS trabajador_rut,
        t.nombres AS trabajador_nombres,
        t.apellidos AS trabajador_apellidos
      FROM finiquitos f
      INNER JOIN trabajadores t ON t.id = f.trabajador_id
      WHERE f.id = $1
        AND f.empresa_id = $2
        AND f.estado = 'vigente'
      LIMIT 1
      `,
      [id, empresa_id]
    );

    if (finiquitoResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Finiquito no encontrado",
      });
    }

    const finiquito = finiquitoResult.rows[0];

    if (finiquito.contabilizado) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "Este finiquito ya está contabilizado",
      });
    }

    const periodoContable =
      obtenerPeriodoDesdeFecha(finiquito.fecha_termino) || finiquito.periodo;

    const config = await obtenerConfiguracionContable(
      client,
      empresa_id,
      periodoContable
    );

    if (!config) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error:
          "No existe configuracion de remuneraciones para este periodo. Debes configurar cuentas contables antes de contabilizar.",
      });
    }
    const cuentaGastoSueldos = config.cuenta_sueldos_id;
    const cuentaIndemnizaciones =
      config.cuenta_indemnizaciones_id || config.cuenta_sueldos_id;
    const cuentaFiniquitoPorPagar =
      config.cuenta_finiquito_por_pagar_id ||
      config.cuenta_sueldos_por_pagar_id;
    const cuentaDescuentos =
      config.cuenta_descuentos_finiquito_id ||
      config.cuenta_afc_id ||
      config.cuenta_sueldos_por_pagar_id;

    if (!cuentaGastoSueldos || !cuentaFiniquitoPorPagar) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error:
          "Faltan cuentas contables para finiquitos. Debes configurar cuenta gasto sueldos y cuenta finiquito por pagar.",
      });
    }

    const sueldoPendiente = numero(finiquito.sueldo_pendiente);
    const vacaciones = numero(
      finiquito.monto_vacaciones_pendientes ||
        finiquito.vacaciones_proporcionales
    );
    const otrosHaberes = numero(finiquito.otros_haberes);

    const indemnizacionAviso = numero(finiquito.indemnizacion_aviso_previo);
    const indemnizacionAnios = numero(finiquito.indemnizacion_anios_servicio);
    const indemnizacionVoluntaria = numero(finiquito.indemnizacion_voluntaria);

    const seguroCesantia = numero(finiquito.seguro_cesantia_descuento);
    const otrosDescuentos = numero(finiquito.otros_descuentos);
    const descuentosGenerales = numero(finiquito.descuentos);

    const totalGastoSueldos = sueldoPendiente + vacaciones + otrosHaberes;

    const totalIndemnizaciones =
      indemnizacionAviso + indemnizacionAnios + indemnizacionVoluntaria;

    const totalDescuentos =
      descuentosGenerales + seguroCesantia + otrosDescuentos;

    const totalFiniquito = numero(finiquito.total_finiquito);

    if (totalFiniquito <= 0 && totalDescuentos <= 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "El finiquito no tiene monto suficiente para contabilizar",
      });
    }

    const trabajadorNombre = `${finiquito.trabajador_nombres || ""} ${
      finiquito.trabajador_apellidos || ""
    }`.trim();

    const glosa = `Contabilizacion finiquito ${trabajadorNombre} ${
      finiquito.trabajador_rut || ""
    } periodo ${periodoContable}`;

    const numeroComprobante = await obtenerSiguienteNumeroComprobante(
      client,
      empresa_id,
      "Traspaso"
    );

    const totalDebe = totalGastoSueldos + totalIndemnizaciones;
    const totalHaber = totalFiniquito + totalDescuentos;

    if (Math.round(totalDebe) !== Math.round(totalHaber)) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error: `El asiento no cuadra. Debe: ${totalDebe}, Haber: ${totalHaber}`,
      });
    }

    const comprobanteResult = await client.query(
      `
      INSERT INTO comprobantes
      (
        empresa_id,
        periodo,
        fecha,
        tipo,
        numero,
        glosa,
        total_debe,
        total_haber,
        estado
      )
      VALUES ($1,$2,$3,'Traspaso',$4,$5,$6,$7,'vigente')
      RETURNING *
      `,
      [
        empresa_id,
        periodoContable,
        finiquito.fecha_termino,
        numeroComprobante,
        glosa,
        totalDebe,
        totalHaber,
      ]
    );

    const comprobante = comprobanteResult.rows[0];

    // Las lineas se juntan y pasan por el punto central, que valida cuenta y
    // ejercicio abierto. Antes se insertaban directo.
    const lineasAsiento = [];

    async function insertarDetalle(cuentaId, glosaDetalle, debe, haber) {
      if (!cuentaId) return;
      if (numero(debe) === 0 && numero(haber) === 0) return;

      lineasAsiento.push({
        cuenta_id: cuentaId,
        glosa: glosaDetalle,
        debe: numero(debe),
        haber: numero(haber),
      });
    }

    await insertarDetalle(
      cuentaGastoSueldos,
      `Gasto remuneraciones finiquito ${trabajadorNombre}`,
      totalGastoSueldos,
      0
    );

    await insertarDetalle(
      cuentaIndemnizaciones,
      `Gasto indemnizaciones finiquito ${trabajadorNombre}`,
      totalIndemnizaciones,
      0
    );

    await insertarDetalle(
      cuentaFiniquitoPorPagar,
      `Finiquito por pagar ${trabajadorNombre}`,
      0,
      totalFiniquito
    );

    await insertarDetalle(
      cuentaDescuentos,
      `Descuentos finiquito ${trabajadorNombre}`,
      0,
      totalDescuentos
    );

    await insertarDetallesComprobante(client, comprobante.id, lineasAsiento);


    const updateResult = await client.query(
      `
      UPDATE finiquitos
      SET contabilizado = true,
          comprobante_id = $1,
          actualizado_en = NOW()
      WHERE id = $2
        AND empresa_id = $3
      RETURNING *
      `,
      [comprobante.id, id, empresa_id]
    );

    await client.query("COMMIT");

    return res.json({
      mensaje: "Finiquito contabilizado correctamente",
      finiquito: updateResult.rows[0],
      comprobante,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error al contabilizar finiquito:", error);

    return res.status(error.statusCode || 500).json({
      // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
      // columnas y restricciones. Los errores de validacion propios
      // si conservan su mensaje y su codigo.
      error: error.statusCode ? error.message : "Error interno al contabilizar finiquito",
    });
  } finally {
    client.release();
  }
}

async function pagarFiniquito(req, res) {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { empresa_id, fecha_pago, cuenta_banco_id, glosa_pago } = req.body;

    if (!id || !empresa_id) {
      return res.status(400).json({
        error: "Debe indicar id y empresa_id",
      });
    }

    await client.query("BEGIN");

    const finiquitoResult = await client.query(
      `
      SELECT
        f.*,
        t.rut AS trabajador_rut,
        t.nombres AS trabajador_nombres,
        t.apellidos AS trabajador_apellidos
      FROM finiquitos f
      INNER JOIN trabajadores t ON t.id = f.trabajador_id
      WHERE f.id = $1
        AND f.empresa_id = $2
        AND f.estado = 'vigente'
      LIMIT 1
      `,
      [id, empresa_id]
    );

    if (finiquitoResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Finiquito no encontrado",
      });
    }

    const finiquito = finiquitoResult.rows[0];

    if (finiquito.pagado) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "Este finiquito ya está marcado como pagado",
      });
    }

    const fechaComprobante =
      fecha_pago || finiquito.fecha_pago || finiquito.fecha_termino;

    const periodoContable =
      obtenerPeriodoDesdeFecha(fechaComprobante) || finiquito.periodo;

    const config = await obtenerConfiguracionContable(
      client,
      empresa_id,
      periodoContable
    );

    if (!config) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error:
          "No existe configuracion de remuneraciones para este periodo. Debes configurar cuentas contables antes de contabilizar.",
      });
    }
    const cuentaFiniquitoPorPagar =
      config.cuenta_finiquito_por_pagar_id ||
      config.cuenta_sueldos_por_pagar_id;

    const cuentaBanco = cuenta_banco_id || config.cuenta_banco_pago_id;

    if (!cuentaFiniquitoPorPagar || !cuentaBanco) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error:
          "Faltan cuentas contables. Debes configurar cuenta finiquito por pagar y cuenta banco.",
      });
    }

    const montoPago = numero(finiquito.total_finiquito);

    if (montoPago <= 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "El finiquito no tiene monto válido para pagar",
      });
    }

    const trabajadorNombre = `${finiquito.trabajador_nombres || ""} ${
      finiquito.trabajador_apellidos || ""
    }`.trim();

    const glosa =
      glosa_pago ||
      `Pago finiquito ${trabajadorNombre} ${
        finiquito.trabajador_rut || ""
      } periodo ${periodoContable}`;

    const numeroComprobante = await obtenerSiguienteNumeroComprobante(
      client,
      empresa_id,
      "Egreso"
    );

    const comprobanteResult = await client.query(
      `
      INSERT INTO comprobantes
      (
        empresa_id,
        periodo,
        fecha,
        tipo,
        numero,
        glosa,
        total_debe,
        total_haber,
        estado
      )
      VALUES ($1,$2,$3,'Egreso',$4,$5,$6,$7,'vigente')
      RETURNING *
      `,
      [
        empresa_id,
        periodoContable,
        fechaComprobante,
        numeroComprobante,
        glosa,
        montoPago,
        montoPago,
      ]
    );

    const comprobante = comprobanteResult.rows[0];

    // cuentaBanco viene del cuerpo: el punto central comprueba que sea de
    // esta empresa antes de imputarla.
    await insertarDetallesComprobante(client, comprobante.id, [
      {
        cuenta_id: cuentaFiniquitoPorPagar,
        glosa: `Pago finiquito por pagar ${trabajadorNombre}`,
        debe: montoPago,
        haber: 0,
      },
      {
        cuenta_id: cuentaBanco,
        glosa: `Salida banco pago finiquito ${trabajadorNombre}`,
        debe: 0,
        haber: montoPago,
      },
    ]);

    const updateResult = await client.query(
      `
      UPDATE finiquitos
      SET pagado = true,
          fecha_pago = COALESCE($1, fecha_pago),
          actualizado_en = NOW()
      WHERE id = $2
        AND empresa_id = $3
      RETURNING *
      `,
      [fechaComprobante, id, empresa_id]
    );

    await client.query("COMMIT");

    return res.json({
      mensaje: "Pago de finiquito registrado correctamente",
      finiquito: updateResult.rows[0],
      comprobante,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error al pagar finiquito:", error);

    return res.status(error.statusCode || 500).json({
      // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
      // columnas y restricciones. Los errores de validacion propios
      // si conservan su mensaje y su codigo.
      error: error.statusCode ? error.message : "Error interno al pagar finiquito",
    });
  } finally {
    client.release();
  }
}

/**
 * Simula el finiquito con las reglas del servidor sin guardarlo. La pantalla
 * lo llama en cada cambio del formulario.
 */
async function calcularFiniquitoPrevio(req, res) {
  try {
    const { empresa_id, trabajador_id, fecha_termino, causal } = req.body;

    if (!empresa_id || !trabajador_id || !fecha_termino || !causal) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, trabajador_id, fecha_termino y causal",
      });
    }

    const resultado = await calcularFiniquito(pool, req.body);

    return res.json(resultado);
  } catch (error) {
    console.error("Error al calcular finiquito:", error);

    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Error interno al calcular finiquito",
    });
  }
}

async function calcularVacacionesFiniquito(req, res) {
  try {
    const { empresa_id, trabajador_id, fecha_termino, sueldo_base } = req.query;

    if (!empresa_id || !trabajador_id || !fecha_termino) {
      return res.status(400).json({
        error: "Debe indicar empresa_id, trabajador_id y fecha_termino",
      });
    }

    const vacaciones = await calcularVacacionesPendientesFiniquito({
      empresa_id,
      trabajador_id,
      fecha_termino,
      sueldo_base,
    });

    return res.json({
      vacaciones,
    });
  } catch (error) {
    console.error("Error al calcular vacaciones de finiquito:", error);

    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Error interno al calcular vacaciones de finiquito",
    });
  }
}

module.exports = {
  crearFiniquito,
  listarFiniquitos,
  obtenerFiniquito,
  eliminarFiniquito,
  contabilizarFiniquito,
  pagarFiniquito,
  calcularVacacionesFiniquito,
  calcularFiniquitoPrevio,
};

