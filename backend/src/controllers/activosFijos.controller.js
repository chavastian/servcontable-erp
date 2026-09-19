const pool = require("../database/db");
const { exigirDeEmpresa } = require("../helpers/empresa.helper");
const {
  VIDAS_UTILES_SUGERIDAS,
  vidaUtilAcelerada,
  puedeAcelerar,
  calcularDepreciacion,
  cuadroDepreciacion,
  periodoDeFecha,
} = require("../helpers/activoFijo.helper");
const {
  obtenerSiguienteNumeroComprobante,
  insertarDetallesComprobante,
} = require("../helpers/comprobante.helper");
const { registrarAuditoria } = require("../helpers/auditoria.helper");
const {
  leerPaginacion,
  aplicarPaginacion,
  recortarPagina,
} = require("../helpers/paginacion.helper");

function responderError(res, error, mensaje) {
  return res.status(error.statusCode || 500).json({
    // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
    // columnas y restricciones. Los errores de validacion propios
    // si conservan su mensaje y su codigo.
    error: error.statusCode ? error.message : mensaje,
  });
}

function error(mensaje, statusCode) {
  return Object.assign(new Error(mensaje), { statusCode });
}

function texto(valor, maximo) {
  return String(valor === null || valor === undefined ? "" : valor)
    .trim()
    .slice(0, maximo);
}

function numero(valor) {
  return Number(valor || 0);
}

function redondear(valor) {
  return Math.round(numero(valor));
}

async function cuentaDeEmpresa(client, empresaId, cuentaId) {
  if (!cuentaId) return null;

  const cuenta = await exigirDeEmpresa(client, "plan_cuentas", cuentaId, empresaId, "id");

  return cuenta ? cuenta.id : null;
}

function tablaVidasUtiles(req, res) {
  return res.json({
    // Sugerencias, no dato cerrado: la vida útil la fija el contador.
    aviso:
      "Sugerencias tomadas de la Resolución Exenta SII N°43 de 2002. REQUIERE VALIDACIÓN TRIBUTARIA contra la tabla vigente antes de usarlas.",
    vidas_utiles: VIDAS_UTILES_SUGERIDAS.map((fila) => ({
      ...fila,
      meses: fila.anios * 12,
      meses_acelerada: puedeAcelerar(fila.anios * 12) ? vidaUtilAcelerada(fila.anios * 12) : null,
    })),
  });
}

async function listarActivosFijos(req, res) {
  try {
    const { empresa_id, estado, categoria, periodo } = req.query;

    if (!empresa_id) {
      return res.status(400).json({ error: "Debe indicar empresa_id" });
    }

    let query = `
      SELECT af.*,
             ca.codigo AS cuenta_activo_codigo, ca.nombre AS cuenta_activo_nombre,
             cc.codigo AS centro_codigo, cc.nombre AS centro_nombre,
             t.razon_social AS proveedor
      FROM activos_fijos af
      LEFT JOIN plan_cuentas ca ON ca.id = af.cuenta_activo_id
      LEFT JOIN centros_costo cc ON cc.id = af.centro_costo_id
      LEFT JOIN terceros t ON t.id = af.tercero_id
      WHERE af.empresa_id = $1
    `;
    const valores = [empresa_id];

    if (["vigente", "baja", "vendido"].includes(estado)) {
      valores.push(estado);
      query += ` AND af.estado = $${valores.length}`;
    }

    if (categoria) {
      valores.push(categoria);
      query += ` AND af.categoria = $${valores.length}`;
    }

    query += ` ORDER BY af.categoria ASC, af.codigo ASC`;

    const paginacion = leerPaginacion(req.query);
    query = aplicarPaginacion(query, valores, paginacion);

    const resultado = await pool.query(query, valores);
    const pagina = recortarPagina(resultado.rows, paginacion);

    // Con período se agrega el estado de la depreciación a esa fecha: es lo que
    // el usuario quiere ver antes de contabilizar el mes.
    const activos = pagina.filas.map((activo) => ({
      ...activo,
      depreciacion: periodo ? calcularDepreciacion(activo, periodo) : null,
    }));

    const totales = activos.reduce(
      (acc, activo) => {
        acc.valor_adquisicion += redondear(activo.valor_adquisicion);

        if (activo.depreciacion) {
          acc.depreciacion_mes += activo.depreciacion.depreciacion_mes;
          acc.acumulada += activo.depreciacion.acumulada;
          acc.valor_libro += activo.depreciacion.valor_libro;
          acc.depreciacion_mes_acelerada += activo.depreciacion.depreciacion_mes_acelerada;
        }

        return acc;
      },
      {
        valor_adquisicion: 0,
        depreciacion_mes: 0,
        acumulada: 0,
        valor_libro: 0,
        depreciacion_mes_acelerada: 0,
      }
    );

    return res.json({
      total: activos.length,
      paginacion: pagina.paginacion,
      periodo: periodo || null,
      activos,
      totales,
    });
  } catch (err) {
    console.error("Error al listar activos fijos:", err);

    return responderError(res, err, "Error interno al listar los activos fijos");
  }
}

async function obtenerActivoFijo(req, res) {
  try {
    const { id } = req.params;
    const { empresa_id, periodo } = req.query;

    if (!empresa_id) {
      return res.status(400).json({ error: "Debe indicar empresa_id" });
    }

    const activo = await exigirDeEmpresa(pool, "activos_fijos", id, empresa_id);

    const registradas = await pool.query(
      `SELECT * FROM depreciaciones
       WHERE empresa_id = $1 AND activo_fijo_id = $2 AND estado = 'vigente'
       ORDER BY periodo`,
      [empresa_id, activo.id]
    );

    return res.json({
      activo,
      depreciacion_actual: periodo ? calcularDepreciacion(activo, periodo) : null,
      // El cuadro completo, mes a mes, hasta el fin de la vida útil.
      cuadro: cuadroDepreciacion(activo),
      registradas: registradas.rows,
    });
  } catch (err) {
    console.error("Error al obtener el activo fijo:", err);

    return responderError(res, err, "Error interno al obtener el activo fijo");
  }
}

async function crearActivoFijo(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id } = req.body;

    const codigo = texto(req.body.codigo, 40).toUpperCase();
    const nombre = texto(req.body.nombre, 200);
    const vidaUtilMeses = Math.trunc(numero(req.body.vida_util_meses));
    const valorAdquisicion = redondear(req.body.valor_adquisicion);

    if (!codigo || !nombre) {
      return res.status(400).json({ error: "Debe indicar código y nombre del bien." });
    }

    if (vidaUtilMeses <= 0) {
      return res.status(400).json({
        error: "Debe indicar la vida útil en meses. La fija el contador según la tabla del SII.",
      });
    }

    if (valorAdquisicion <= 0) {
      return res.status(400).json({ error: "El valor de adquisición debe ser mayor que cero." });
    }

    const valorResidual = redondear(req.body.valor_residual);

    if (valorResidual >= valorAdquisicion) {
      return res.status(400).json({
        error: "El valor residual tiene que ser menor que el valor de adquisición.",
      });
    }

    const aplicaAcelerada = req.body.aplica_acelerada === true || req.body.aplica_acelerada === "true";
    const avisos = [];

    if (aplicaAcelerada && !puedeAcelerar(vidaUtilMeses)) {
      // No se bloquea: el criterio es del contador, pero queda dicho.
      avisos.push(
        "La depreciación acelerada del artículo 31 N°5 exige vida útil normal de tres años o más, y este bien tiene menos. REQUIERE VALIDACIÓN TRIBUTARIA."
      );
    }

    if (aplicaAcelerada) {
      avisos.push(
        "La depreciación acelerada es solo tributaria: no se contabiliza. El asiento mensual usa la depreciación normal."
      );
    }

    await client.query("BEGIN");

    const compra = req.body.compra_id
      ? await exigirDeEmpresa(client, "compras", req.body.compra_id, empresa_id)
      : null;
    const tercero = req.body.tercero_id
      ? await exigirDeEmpresa(client, "terceros", req.body.tercero_id, empresa_id, "id")
      : null;
    const centro = req.body.centro_costo_id
      ? await exigirDeEmpresa(client, "centros_costo", req.body.centro_costo_id, empresa_id, "id")
      : null;

    const fechaAdquisicion = req.body.fecha_adquisicion;
    const fechaInicio = req.body.fecha_inicio_depreciacion || fechaAdquisicion;

    if (periodoDeFecha(fechaInicio) < periodoDeFecha(fechaAdquisicion)) {
      throw error("La depreciación no puede empezar antes de la fecha de adquisición.", 400);
    }

    const resultado = await client.query(
      `INSERT INTO activos_fijos
         (empresa_id, codigo, nombre, descripcion, categoria,
          fecha_adquisicion, fecha_inicio_depreciacion, compra_id, tercero_id, documento,
          valor_adquisicion, valor_residual, vida_util_meses, vida_util_acelerada_meses,
          aplica_acelerada, cuenta_activo_id, cuenta_depreciacion_acumulada_id,
          cuenta_gasto_depreciacion_id, centro_costo_id, observacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        empresa_id,
        codigo,
        nombre,
        texto(req.body.descripcion, 1000),
        texto(req.body.categoria, 100),
        fechaAdquisicion,
        fechaInicio,
        compra?.id || null,
        tercero?.id || null,
        texto(req.body.documento, 120) || (compra ? `${compra.tipo_documento} ${compra.folio}` : ""),
        valorAdquisicion,
        valorResidual,
        vidaUtilMeses,
        req.body.vida_util_acelerada_meses
          ? Math.trunc(numero(req.body.vida_util_acelerada_meses))
          : vidaUtilAcelerada(vidaUtilMeses),
        aplicaAcelerada,
        await cuentaDeEmpresa(client, empresa_id, req.body.cuenta_activo_id),
        await cuentaDeEmpresa(client, empresa_id, req.body.cuenta_depreciacion_acumulada_id),
        await cuentaDeEmpresa(client, empresa_id, req.body.cuenta_gasto_depreciacion_id),
        centro?.id || null,
        texto(req.body.observacion, 1000),
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      mensaje: "Bien registrado correctamente",
      activo: resultado.rows[0],
      avisos,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});

    if (err.code === "23505") {
      return res.status(409).json({ error: "Ya existe un bien con ese código en la empresa." });
    }

    console.error("Error al crear el activo fijo:", err);

    return responderError(res, err, "Error interno al registrar el bien");
  } finally {
    client.release();
  }
}

async function actualizarActivoFijo(req, res) {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { empresa_id } = req.body;

    await client.query("BEGIN");

    const activo = await exigirDeEmpresa(client, "activos_fijos", id, empresa_id);

    // Con depreciación ya contabilizada no se cambian las bases del cálculo:
    // el gasto de los meses cerrados quedaría sin respaldo.
    const contabilizadas = await client.query(
      `SELECT COUNT(*)::int AS n FROM depreciaciones
       WHERE activo_fijo_id = $1 AND estado = 'vigente' AND contabilizada = true`,
      [activo.id]
    );

    const tieneContabilizadas = contabilizadas.rows[0].n > 0;
    const vidaUtilMeses = req.body.vida_util_meses
      ? Math.trunc(numero(req.body.vida_util_meses))
      : Number(activo.vida_util_meses);
    const valorAdquisicion =
      req.body.valor_adquisicion !== undefined
        ? redondear(req.body.valor_adquisicion)
        : redondear(activo.valor_adquisicion);

    if (
      tieneContabilizadas &&
      (vidaUtilMeses !== Number(activo.vida_util_meses) ||
        valorAdquisicion !== redondear(activo.valor_adquisicion))
    ) {
      throw error(
        "Este bien ya tiene depreciación contabilizada: no se puede cambiar su valor ni su vida útil. Anula los asientos primero.",
        409
      );
    }

    // Lo que no viene en el cuerpo se conserva. Antes un PUT que solo corregía
    // el nombre apagaba la depreciación acelerada y borraba las cuentas del
    // bien, porque los campos ausentes se leían como vacíos.
    const enviado = (campo) => Object.prototype.hasOwnProperty.call(req.body, campo);
    const textoODeja = (campo, maximo) =>
      enviado(campo) ? texto(req.body[campo], maximo) : activo[campo];
    const cuentaODeja = async (campo) =>
      enviado(campo) ? await cuentaDeEmpresa(client, empresa_id, req.body[campo]) : activo[campo];

    const centroCostoId = enviado("centro_costo_id")
      ? (
          req.body.centro_costo_id
            ? await exigirDeEmpresa(client, "centros_costo", req.body.centro_costo_id, empresa_id, "id")
            : null
        )?.id || null
      : activo.centro_costo_id;

    const resultado = await client.query(
      `UPDATE activos_fijos SET
         nombre = $3,
         descripcion = $4,
         categoria = $5,
         valor_adquisicion = $6,
         valor_residual = $7,
         vida_util_meses = $8,
         vida_util_acelerada_meses = $9,
         aplica_acelerada = $10,
         cuenta_activo_id = $11,
         cuenta_depreciacion_acumulada_id = $12,
         cuenta_gasto_depreciacion_id = $13,
         centro_costo_id = $14,
         observacion = $15,
         actualizado_en = NOW()
       WHERE id = $1 AND empresa_id = $2
       RETURNING *`,
      [
        id,
        empresa_id,
        texto(req.body.nombre, 200) || activo.nombre,
        textoODeja("descripcion", 1000),
        textoODeja("categoria", 100),
        valorAdquisicion,
        enviado("valor_residual") ? redondear(req.body.valor_residual) : redondear(activo.valor_residual),
        vidaUtilMeses,
        enviado("vida_util_acelerada_meses") && req.body.vida_util_acelerada_meses
          ? Math.trunc(numero(req.body.vida_util_acelerada_meses))
          : vidaUtilMeses !== Number(activo.vida_util_meses)
          ? vidaUtilAcelerada(vidaUtilMeses)
          : activo.vida_util_acelerada_meses,
        enviado("aplica_acelerada")
          ? req.body.aplica_acelerada === true || req.body.aplica_acelerada === "true"
          : activo.aplica_acelerada,
        await cuentaODeja("cuenta_activo_id"),
        await cuentaODeja("cuenta_depreciacion_acumulada_id"),
        await cuentaODeja("cuenta_gasto_depreciacion_id"),
        centroCostoId,
        textoODeja("observacion", 1000),
      ]
    );

    await client.query("COMMIT");

    return res.json({
      mensaje: "Bien actualizado correctamente",
      activo: resultado.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error al actualizar el activo fijo:", err);

    return responderError(res, err, "Error interno al actualizar el bien");
  } finally {
    client.release();
  }
}

/**
 * Baja o venta del bien. No se borra: queda con su historia y deja de
 * depreciarse desde el mes siguiente al de la baja.
 */
async function darDeBajaActivoFijo(req, res) {
  try {
    const { id } = req.params;
    const { empresa_id, fecha_baja, motivo, valor_venta, tipo } = req.body;

    const motivoLimpio = texto(motivo, 1000);

    if (motivoLimpio.length < 5) {
      return res.status(400).json({ error: "Debes indicar el motivo de la baja (mínimo 5 caracteres)." });
    }

    if (!fecha_baja) {
      return res.status(400).json({ error: "Debes indicar la fecha de la baja." });
    }

    const estado = tipo === "vendido" ? "vendido" : "baja";

    const activo = await exigirDeEmpresa(pool, "activos_fijos", id, empresa_id);

    if (activo.estado !== "vigente") {
      return res.status(400).json({ error: "Este bien ya está dado de baja." });
    }

    const resultado = await pool.query(
      `UPDATE activos_fijos
       SET estado = $3, fecha_baja = $4, motivo_baja = $5, valor_venta = $6, actualizado_en = NOW()
       WHERE id = $1 AND empresa_id = $2
       RETURNING *`,
      [id, empresa_id, estado, fecha_baja, motivoLimpio, valor_venta ? redondear(valor_venta) : null]
    );

    const alBajar = calcularDepreciacion(activo, periodoDeFecha(fecha_baja));

    await registrarAuditoria({
      req,
      empresaId: Number(empresa_id),
      modulo: "Activo fijo",
      accion: estado === "vendido" ? "Vender bien" : "Dar de baja bien",
      detalle: `${activo.codigo} ${activo.nombre}: ${motivoLimpio}`,
      tablaAfectada: "activos_fijos",
      registroId: Number(id),
    });

    return res.json({
      mensaje: estado === "vendido" ? "Bien marcado como vendido" : "Bien dado de baja",
      activo: resultado.rows[0],
      // El resultado de la baja lo decide el contador: el sistema entrega el
      // valor libro y el de venta, sin generar el asiento.
      valor_libro_a_la_baja: alBajar.valor_libro,
      resultado_venta:
        estado === "vendido" && valor_venta ? redondear(valor_venta) - alBajar.valor_libro : null,
      aviso:
        "El asiento de la baja o venta no se genera automáticamente: el resultado y las cuentas dependen del criterio contable. REQUIERE VALIDACIÓN CONTABLE.",
    });
  } catch (err) {
    console.error("Error al dar de baja el activo fijo:", err);

    return responderError(res, err, "Error interno al dar de baja el bien");
  }
}

/**
 * Depreciación del período: qué correspondería contabilizar, sin escribir nada.
 */
async function calcularDepreciacionPeriodo(req, res) {
  try {
    const { empresa_id, periodo } = req.query;

    if (!empresa_id || !/^\d{4}-\d{2}$/.test(String(periodo || ""))) {
      return res.status(400).json({ error: "Debe indicar empresa_id y periodo AAAA-MM" });
    }

    const { rows } = await pool.query(
      `SELECT * FROM activos_fijos
       WHERE empresa_id = $1 AND estado IN ('vigente', 'vendido', 'baja')
       ORDER BY categoria, codigo`,
      [empresa_id]
    );

    const yaRegistradas = await pool.query(
      `SELECT activo_fijo_id, contabilizada FROM depreciaciones
       WHERE empresa_id = $1 AND periodo = $2 AND estado = 'vigente'`,
      [empresa_id, periodo]
    );

    const registradas = new Map(
      yaRegistradas.rows.map((fila) => [Number(fila.activo_fijo_id), fila.contabilizada])
    );

    const detalle = rows
      .map((activo) => ({
        activo_fijo_id: activo.id,
        codigo: activo.codigo,
        nombre: activo.nombre,
        categoria: activo.categoria,
        centro_costo_id: activo.centro_costo_id,
        valor_adquisicion: redondear(activo.valor_adquisicion),
        ya_registrada: registradas.has(Number(activo.id)),
        ya_contabilizada: registradas.get(Number(activo.id)) === true,
        ...calcularDepreciacion(activo, periodo),
      }))
      .filter((fila) => fila.depreciacion_mes > 0 || fila.ya_registrada);

    const totales = detalle.reduce(
      (acc, fila) => {
        acc.depreciacion_mes += fila.depreciacion_mes;
        acc.depreciacion_mes_acelerada += fila.depreciacion_mes_acelerada;
        acc.acumulada += fila.acumulada;
        acc.valor_libro += fila.valor_libro;
        return acc;
      },
      { depreciacion_mes: 0, depreciacion_mes_acelerada: 0, acumulada: 0, valor_libro: 0 }
    );

    return res.json({
      periodo,
      detalle,
      totales,
      // La diferencia entre las dos es lo que después ajusta la renta líquida.
      diferencia_acelerada: totales.depreciacion_mes_acelerada - totales.depreciacion_mes,
      aviso:
        "El asiento contabiliza la depreciación normal. La acelerada del artículo 31 N°5 es solo tributaria y se informa aparte.",
    });
  } catch (err) {
    console.error("Error al calcular la depreciación del período:", err);

    return responderError(res, err, "Error interno al calcular la depreciación");
  }
}

/**
 * Registra y contabiliza la depreciación del período en una sola transacción.
 *
 * El asiento carga el gasto y abona la depreciación acumulada, agrupando por
 * las cuentas de cada bien (o las de la configuración, si el bien no las
 * tiene). Cada bien se deprecia una sola vez por período: el índice único lo
 * garantiza además del control por código.
 */
async function contabilizarDepreciacion(req, res) {
  const client = await pool.connect();

  try {
    const { empresa_id, periodo } = req.body;

    if (!empresa_id || !/^\d{4}-\d{2}$/.test(String(periodo || ""))) {
      return res.status(400).json({ error: "Debe indicar empresa_id y periodo AAAA-MM" });
    }

    await client.query("BEGIN");

    const configResult = await client.query(
      `SELECT cuenta_depreciacion_acumulada_id, cuenta_gasto_depreciacion_id
       FROM configuracion_contable WHERE empresa_id = $1`,
      [empresa_id]
    );
    const config = configResult.rows[0] || {};

    const { rows: activos } = await client.query(
      `SELECT * FROM activos_fijos
       WHERE empresa_id = $1 AND estado IN ('vigente', 'vendido', 'baja')
       ORDER BY categoria, codigo
       FOR UPDATE`,
      [empresa_id]
    );

    const yaRegistradas = await client.query(
      `SELECT activo_fijo_id FROM depreciaciones
       WHERE empresa_id = $1 AND periodo = $2 AND estado = 'vigente'`,
      [empresa_id, periodo]
    );
    const registrados = new Set(yaRegistradas.rows.map((fila) => Number(fila.activo_fijo_id)));

    const porContabilizar = [];

    for (const activo of activos) {
      if (registrados.has(Number(activo.id))) continue;

      const calculo = calcularDepreciacion(activo, periodo);

      if (calculo.depreciacion_mes <= 0) continue;

      const cuentaGasto = activo.cuenta_gasto_depreciacion_id || config.cuenta_gasto_depreciacion_id;
      const cuentaAcumulada =
        activo.cuenta_depreciacion_acumulada_id || config.cuenta_depreciacion_acumulada_id;

      if (!cuentaGasto || !cuentaAcumulada) {
        throw error(
          `Falta la cuenta de gasto por depreciación o la de depreciación acumulada para ${activo.codigo}. Configúralas en el bien o en la Configuración Contable.`,
          400
        );
      }

      porContabilizar.push({ activo, calculo, cuentaGasto, cuentaAcumulada });
    }

    if (porContabilizar.length === 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "No hay depreciación pendiente de contabilizar en este período.",
      });
    }

    // Una línea por cuenta y centro, no una por bien: un asiento con cien
    // líneas iguales no se lee.
    const lineasGasto = new Map();
    const lineasAcumulada = new Map();

    for (const { activo, calculo, cuentaGasto, cuentaAcumulada } of porContabilizar) {
      const claveGasto = `${cuentaGasto}|${activo.centro_costo_id || ""}`;
      const claveAcumulada = `${cuentaAcumulada}`;

      const gasto = lineasGasto.get(claveGasto) || {
        cuenta_id: Number(cuentaGasto),
        centro_costo_id: activo.centro_costo_id || null,
        glosa: `Depreciación ${periodo}`,
        debe: 0,
        haber: 0,
      };
      gasto.debe += calculo.depreciacion_mes;
      lineasGasto.set(claveGasto, gasto);

      const acumulada = lineasAcumulada.get(claveAcumulada) || {
        cuenta_id: Number(cuentaAcumulada),
        glosa: `Depreciación acumulada ${periodo}`,
        debe: 0,
        haber: 0,
      };
      acumulada.haber += calculo.depreciacion_mes;
      lineasAcumulada.set(claveAcumulada, acumulada);
    }

    const lineas = [...lineasGasto.values(), ...lineasAcumulada.values()];
    const totalDebe = lineas.reduce((suma, linea) => suma + linea.debe, 0);
    const totalHaber = lineas.reduce((suma, linea) => suma + linea.haber, 0);

    // El último día del mes, como el resto de los asientos de cierre mensual.
    const [anio, mes] = periodo.split("-").map(Number);
    const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    const fecha = `${periodo}-${String(ultimoDia).padStart(2, "0")}`;

    const numeroComprobante = await obtenerSiguienteNumeroComprobante(client, empresa_id, "Depreciacion");

    const comprobanteResult = await client.query(
      `INSERT INTO comprobantes
         (empresa_id, periodo, fecha, tipo, numero, glosa, total_debe, total_haber, estado)
       VALUES ($1, $2, $3, 'Depreciacion', $4, $5, $6, $7, 'vigente')
       RETURNING *`,
      [
        empresa_id,
        periodo,
        fecha,
        numeroComprobante,
        `Depreciación del activo fijo ${periodo}`,
        totalDebe,
        totalHaber,
      ]
    );

    const comprobante = comprobanteResult.rows[0];

    await insertarDetallesComprobante(client, comprobante.id, lineas);

    for (const { activo, calculo } of porContabilizar) {
      await client.query(
        `INSERT INTO depreciaciones
           (empresa_id, activo_fijo_id, periodo, depreciacion_mes, acumulada, valor_libro,
            depreciacion_mes_acelerada, acumulada_acelerada, valor_libro_acelerado,
            comprobante_id, contabilizada)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
        [
          empresa_id,
          activo.id,
          periodo,
          calculo.depreciacion_mes,
          calculo.acumulada,
          calculo.valor_libro,
          calculo.depreciacion_mes_acelerada,
          calculo.acumulada_acelerada,
          calculo.valor_libro_acelerado,
          comprobante.id,
        ]
      );
    }

    await registrarAuditoria({
      client,
      req,
      empresaId: Number(empresa_id),
      modulo: "Activo fijo",
      accion: "Contabilizar depreciación",
      detalle: `Depreciación ${periodo}: ${porContabilizar.length} bien(es) por ${totalDebe}`,
      tablaAfectada: "depreciaciones",
      registroId: Number(comprobante.id),
    });

    await client.query("COMMIT");

    return res.status(201).json({
      mensaje: `Depreciación de ${periodo} contabilizada`,
      comprobante,
      bienes: porContabilizar.length,
      total: totalDebe,
      total_acelerada: porContabilizar.reduce(
        (suma, item) => suma + item.calculo.depreciacion_mes_acelerada,
        0
      ),
      aviso:
        "Se contabilizó la depreciación normal. La acelerada quedó registrada aparte para la renta líquida imponible.",
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});

    if (err.code === "23505") {
      return res.status(409).json({
        error: "La depreciación de este período ya estaba registrada para alguno de los bienes.",
      });
    }

    console.error("Error al contabilizar la depreciación:", err);

    return responderError(res, err, "Error interno al contabilizar la depreciación");
  } finally {
    client.release();
  }
}

/**
 * Libro de activo fijo a una fecha: lo que se presenta en una fiscalización.
 */
async function informeActivoFijo(req, res) {
  try {
    const { empresa_id, periodo } = req.query;

    if (!empresa_id || !/^\d{4}-\d{2}$/.test(String(periodo || ""))) {
      return res.status(400).json({ error: "Debe indicar empresa_id y periodo AAAA-MM" });
    }

    const { rows } = await pool.query(
      `SELECT af.*, cc.codigo AS centro_codigo, cc.nombre AS centro_nombre
       FROM activos_fijos af
       LEFT JOIN centros_costo cc ON cc.id = af.centro_costo_id
       WHERE af.empresa_id = $1
       ORDER BY af.categoria, af.codigo`,
      [empresa_id]
    );

    const porCategoria = new Map();

    for (const activo of rows) {
      const calculo = calcularDepreciacion(activo, periodo);
      const categoria = activo.categoria || "Sin categoría";

      if (!porCategoria.has(categoria)) {
        porCategoria.set(categoria, {
          categoria,
          bienes: [],
          valor_adquisicion: 0,
          acumulada: 0,
          valor_libro: 0,
          acumulada_acelerada: 0,
          valor_libro_acelerado: 0,
        });
      }

      const grupo = porCategoria.get(categoria);
      const valorAdquisicion = redondear(activo.valor_adquisicion);

      grupo.bienes.push({
        id: activo.id,
        codigo: activo.codigo,
        nombre: activo.nombre,
        estado: activo.estado,
        fecha_adquisicion: activo.fecha_adquisicion,
        centro: activo.centro_codigo ? `${activo.centro_codigo} ${activo.centro_nombre}` : "",
        vida_util_meses: activo.vida_util_meses,
        aplica_acelerada: activo.aplica_acelerada,
        valor_adquisicion: valorAdquisicion,
        depreciacion_mes: calculo.depreciacion_mes,
        acumulada: calculo.acumulada,
        valor_libro: calculo.valor_libro,
        acumulada_acelerada: calculo.acumulada_acelerada,
        valor_libro_acelerado: calculo.valor_libro_acelerado,
      });

      grupo.valor_adquisicion += valorAdquisicion;
      grupo.acumulada += calculo.acumulada;
      grupo.valor_libro += calculo.valor_libro;
      grupo.acumulada_acelerada += calculo.acumulada_acelerada;
      grupo.valor_libro_acelerado += calculo.valor_libro_acelerado;
    }

    const categorias = [...porCategoria.values()];
    const totales = categorias.reduce(
      (acc, grupo) => {
        acc.valor_adquisicion += grupo.valor_adquisicion;
        acc.acumulada += grupo.acumulada;
        acc.valor_libro += grupo.valor_libro;
        acc.acumulada_acelerada += grupo.acumulada_acelerada;
        acc.valor_libro_acelerado += grupo.valor_libro_acelerado;
        return acc;
      },
      {
        valor_adquisicion: 0,
        acumulada: 0,
        valor_libro: 0,
        acumulada_acelerada: 0,
        valor_libro_acelerado: 0,
      }
    );

    return res.json({
      periodo,
      categorias,
      totales,
      // Sin corrección monetaria (módulo 8) los valores están a costo
      // histórico: eso hay que decirlo, no dejarlo suponer.
      aviso:
        "Valores a costo histórico, sin corrección monetaria del artículo 41 de la Ley de la Renta. REQUIERE VALIDACIÓN TRIBUTARIA para el balance tributario.",
    });
  } catch (err) {
    console.error("Error al obtener el libro de activo fijo:", err);

    return responderError(res, err, "Error interno al obtener el libro de activo fijo");
  }
}

module.exports = {
  tablaVidasUtiles,
  listarActivosFijos,
  obtenerActivoFijo,
  crearActivoFijo,
  actualizarActivoFijo,
  darDeBajaActivoFijo,
  calcularDepreciacionPeriodo,
  contabilizarDepreciacion,
  informeActivoFijo,
};
