/**
 * Panel del estudio contable.
 *
 * Una sola pantalla con todas las empresas del usuario y el estado de cada una.
 * Hasta ahora, para saber si a una empresa le faltaba algo había que entrar a
 * ella, elegir el ejercicio y revisar módulo por módulo. Un contador con veinte
 * clientes no puede hacer eso cada mañana, así que en la práctica no lo hacía y
 * los problemas aparecían al declarar.
 *
 * La consulta es por concepto y no por empresa: una consulta que trae los
 * documentos sin cuenta de **todas** las empresas, otra los asientos
 * descuadrados de todas, y así. Con veinte empresas eso son siete consultas, no
 * ciento cuarenta.
 */

const pool = require("../database/db");
const { obtenerEmpresasPermitidas } = require("../helpers/auth.helper");
const { normalizarRolEmpresa } = require("../helpers/roles.helper");
const {
  sumaConSigno,
  sumaConSignoSi,
} = require("../helpers/documentoTributario.helper");

function periodoActual() {
  return new Date().toISOString().slice(0, 7);
}

function limitesDelPeriodo(periodo) {
  const anio = Number(String(periodo).slice(0, 4));
  const mes = Number(String(periodo).slice(5, 7));

  return {
    desde: `${periodo}-01`,
    hasta: new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10),
  };
}

/**
 * Convierte filas agrupadas por empresa en un mapa, para armar el panel sin
 * recorrer los resultados una vez por empresa.
 */
function porEmpresa(filas, campo = "empresa_id") {
  return filas.reduce((mapa, fila) => {
    mapa[Number(fila[campo])] = fila;
    return mapa;
  }, {});
}

async function obtenerPanelEstudio(req, res) {
  try {
    const periodo = String(req.query.periodo || periodoActual());

    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      return res.status(400).json({ error: "El periodo debe tener el formato AAAA-MM" });
    }

    const { desde, hasta } = limitesDelPeriodo(periodo);
    const anio = Number(periodo.slice(0, 4));

    const empresas = await obtenerEmpresasPermitidas(pool, req.usuario);

    if (empresas.length === 0) {
      return res.json({
        periodo,
        total_empresas: 0,
        empresas: [],
        resumen: { con_errores: 0, con_avisos: 0, al_dia: 0 },
      });
    }

    const ids = empresas.map((e) => Number(e.id));

    // Una consulta por concepto, para todas las empresas a la vez.
    const [
      documentos,
      descuadrados,
      conciliacion,
      iva,
      remuneraciones,
      ejercicios,
      actividad,
      duplicados,
    ] = await Promise.all([
      // Documentos del período: cuántos, cuántos sin cuenta, cuántos sin asiento.
      pool.query(
        `
        SELECT empresa_id,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE sin_cuenta)::int AS sin_cuenta,
               COUNT(*) FILTER (WHERE comprobante_id IS NULL)::int AS sin_asiento
        FROM (
          SELECT empresa_id, comprobante_id, cuenta_gasto_id IS NULL AS sin_cuenta
          FROM compras
          WHERE empresa_id = ANY($1::int[]) AND estado = 'vigente' AND fecha BETWEEN $2 AND $3
          UNION ALL
          SELECT empresa_id, comprobante_id, cuenta_ingreso_id IS NULL AS sin_cuenta
          FROM ventas
          WHERE empresa_id = ANY($1::int[]) AND estado = 'vigente' AND fecha BETWEEN $2 AND $3
        ) d
        GROUP BY empresa_id
        `,
        [ids, desde, hasta]
      ),

      pool.query(
        `
        SELECT c.empresa_id, COUNT(*)::int AS descuadrados
        FROM (
          SELECT c.id, c.empresa_id,
                 COALESCE(SUM(cd.debe), 0) AS debe,
                 COALESCE(SUM(cd.haber), 0) AS haber
          FROM comprobantes c
          LEFT JOIN comprobante_detalle cd ON cd.comprobante_id = c.id
          WHERE c.empresa_id = ANY($1::int[])
            AND c.estado = 'vigente'
            AND c.fecha BETWEEN $2 AND $3
          GROUP BY c.id, c.empresa_id
        ) c
        WHERE ROUND(c.debe) <> ROUND(c.haber)
        GROUP BY c.empresa_id
        `,
        [ids, desde, hasta]
      ),

      pool.query(
        `
        SELECT empresa_id, COUNT(*)::int AS pendientes
        FROM conciliacion_bancaria_movimientos
        WHERE empresa_id = ANY($1::int[])
          AND periodo = $2
          AND COALESCE(estado, 'pendiente') = 'pendiente'
        GROUP BY empresa_id
        `,
        [ids, periodo]
      ),

      pool.query(
        `
        SELECT v.empresa_id,
               ${sumaConSigno("iva", "v")} AS debito,
               ${sumaConSignoSi("iva", "v.comprobante_id IS NOT NULL", "v")}
                 AS debito_con_asiento,
               0 AS credito
        FROM ventas v
        WHERE v.empresa_id = ANY($1::int[]) AND v.periodo = $2 AND v.estado = 'vigente'
        GROUP BY v.empresa_id
        `,
        [ids, periodo]
      ),

      pool.query(
        `
        SELECT t.empresa_id,
               COUNT(DISTINCT t.id)::int AS trabajadores_activos,
               COUNT(DISTINCT l.id)::int AS liquidaciones_emitidas
        FROM trabajadores t
        LEFT JOIN liquidaciones l
          ON l.trabajador_id = t.id
         AND l.periodo = $2
         AND COALESCE(l.estado, 'emitida') <> 'eliminada'
        WHERE t.empresa_id = ANY($1::int[])
          AND COALESCE(t.estado, 'activo') = 'activo'
        GROUP BY t.empresa_id
        `,
        [ids, periodo]
      ),

      pool.query(
        `SELECT empresa_id, estado, anio FROM ejercicios_contables
         WHERE empresa_id = ANY($1::int[]) AND anio = $2`,
        [ids, anio]
      ),

      pool.query(
        `
        SELECT empresa_id, MAX(momento) AS ultima_actividad
        FROM (
          SELECT empresa_id, creado_en AS momento FROM comprobantes WHERE empresa_id = ANY($1::int[])
          UNION ALL
          SELECT empresa_id, creado_en FROM compras WHERE empresa_id = ANY($1::int[])
          UNION ALL
          SELECT empresa_id, creado_en FROM ventas WHERE empresa_id = ANY($1::int[])
        ) m
        GROUP BY empresa_id
        `,
        [ids]
      ),

      pool.query(
        `
        SELECT empresa_id, COUNT(*)::int AS duplicados
        FROM (
          SELECT empresa_id, tipo_documento, folio, rut_proveedor
          FROM compras
          WHERE empresa_id = ANY($1::int[]) AND periodo = $2 AND estado = 'vigente'
            AND COALESCE(folio, '') <> ''
          GROUP BY 1, 2, 3, 4 HAVING COUNT(*) > 1
          UNION ALL
          SELECT empresa_id, tipo_documento, folio, rut_cliente
          FROM ventas
          WHERE empresa_id = ANY($1::int[]) AND periodo = $2 AND estado = 'vigente'
            AND COALESCE(folio, '') <> ''
          GROUP BY 1, 2, 3, 4 HAVING COUNT(*) > 1
        ) d
        GROUP BY empresa_id
        `,
        [ids, periodo]
      ),
    ]);

    // Las tres revisiones que faltaban para que el semáforo del panel diga lo
    // mismo que el cierre mensual.
    //
    // Sin ellas el panel pintaba verde una empresa que el cierre marcaba en
    // rojo: el IVA de los libros podía no coincidir con lo contabilizado y el
    // panel no lo miraba. Un semáforo que contradice al detalle no se vuelve a
    // mirar. Siguen siendo una consulta por concepto para todas las empresas.
    const [ivaContable, folios, atipicos] = await Promise.all([
      // IVA de los asientos de los documentos del período, en las cuentas que
      // cada empresa declaró como sus cuentas de IVA. Las cuentas salen de la
      // configuración de cada una, así que el CASE compara contra la columna, no
      // contra un parámetro.
      //
      // Solo los asientos de esos documentos, igual que en el cierre mensual:
      // mirar todo el movimiento del mes en las cuentas de IVA daba falsas
      // alarmas, porque el asiento que paga el F29 debita la cuenta de IVA
      // débito para dejarla en cero.
      pool.query(
        `
        WITH asientos_de_documentos AS (
          SELECT empresa_id, comprobante_id FROM ventas
          WHERE empresa_id = ANY($1::int[]) AND periodo = $2 AND estado = 'vigente'
            AND comprobante_id IS NOT NULL
          UNION
          SELECT empresa_id, comprobante_id FROM compras
          WHERE empresa_id = ANY($1::int[]) AND periodo = $2 AND estado = 'vigente'
            AND comprobante_id IS NOT NULL
        )
        SELECT cc.empresa_id,
               (cc.cuenta_iva_debito_id IS NOT NULL
                AND cc.cuenta_iva_credito_id IS NOT NULL) AS configurado,
               COALESCE(SUM(CASE WHEN cd.cuenta_id = cc.cuenta_iva_debito_id
                                 THEN cd.haber - cd.debe ELSE 0 END), 0) AS debito_contable,
               COALESCE(SUM(CASE WHEN cd.cuenta_id = cc.cuenta_iva_credito_id
                                 THEN cd.debe - cd.haber ELSE 0 END), 0) AS credito_contable
        FROM configuracion_contable cc
        LEFT JOIN asientos_de_documentos ad ON ad.empresa_id = cc.empresa_id
        LEFT JOIN comprobantes c
          ON c.id = ad.comprobante_id
         AND c.estado = 'vigente'
        LEFT JOIN comprobante_detalle cd ON cd.comprobante_id = c.id
        WHERE cc.empresa_id = ANY($1::int[])
        GROUP BY cc.empresa_id, cc.cuenta_iva_debito_id, cc.cuenta_iva_credito_id
        `,
        [ids, periodo]
      ),

      // Saltos en la numeración de ventas, por empresa y tipo de documento.
      pool.query(
        `
        WITH numeradas AS (
          SELECT empresa_id, tipo_documento, folio::bigint AS folio
          FROM ventas
          WHERE empresa_id = ANY($1::int[])
            AND periodo = $2
            AND estado = 'vigente'
            AND folio ~ '^[0-9]+$'
        ),
        saltos AS (
          SELECT empresa_id, folio,
                 LAG(folio) OVER (PARTITION BY empresa_id, tipo_documento ORDER BY folio) AS anterior
          FROM numeradas
        )
        SELECT empresa_id, COALESCE(SUM(folio - anterior - 1), 0)::int AS faltan
        FROM saltos
        WHERE anterior IS NOT NULL AND folio - anterior > 1
        GROUP BY empresa_id
        `,
        [ids, periodo]
      ),

      // Compras muy por encima del promedio histórico de su proveedor.
      pool.query(
        `
        WITH historia AS (
          SELECT empresa_id, rut_proveedor,
                 AVG(total) AS promedio,
                 COUNT(*)::int AS documentos
          FROM compras
          WHERE empresa_id = ANY($1::int[])
            AND estado = 'vigente'
            AND periodo < $2
            AND COALESCE(rut_proveedor, '') <> ''
          GROUP BY empresa_id, rut_proveedor
          HAVING COUNT(*) >= 3
        )
        SELECT c.empresa_id, COUNT(*)::int AS atipicos
        FROM compras c
        JOIN historia h
          ON h.empresa_id = c.empresa_id
         AND h.rut_proveedor = c.rut_proveedor
        WHERE c.empresa_id = ANY($1::int[])
          AND c.periodo = $2
          AND c.estado = 'vigente'
          AND h.promedio > 0
          AND c.total > h.promedio * 5
        GROUP BY c.empresa_id
        `,
        [ids, periodo]
      ),
    ]);

    // Las cuatro revisiones nuevas del bloque 3, tambien por concepto, para
    // que el panel siga diciendo lo mismo que el cierre.
    const hoyPeriodo = new Date().toISOString().slice(0, 7);
    const [rezagados, f29s, honorariosSinPago, facturas46] = await Promise.all([
      pool.query(
        `SELECT empresa_id, COUNT(*)::int AS rezagados
         FROM compras
         WHERE empresa_id = ANY($1::int[]) AND periodo = $2 AND estado = 'vigente'
           AND (DATE_TRUNC('month', ($2 || '-01')::date) - DATE_TRUNC('month', fecha)) > INTERVAL '2 months'
         GROUP BY empresa_id`,
        [ids, periodo]
      ),
      pool.query(
        `SELECT d.empresa_id, d.total_pagado, r.total_f29 AS calculado, d.fecha_presentacion,
                (SELECT COUNT(*)::int FROM compras c WHERE c.empresa_id = d.empresa_id AND c.periodo = d.periodo
                   AND COALESCE(c.actualizado_en, c.creado_en) > d.fecha_presentacion + INTERVAL '1 day')
                + (SELECT COUNT(*)::int FROM ventas v WHERE v.empresa_id = d.empresa_id AND v.periodo = d.periodo
                   AND COALESCE(v.actualizado_en, v.creado_en) > d.fecha_presentacion + INTERVAL '1 day') AS posteriores
         FROM declaraciones_f29 d
         LEFT JOIN remanente_iva r ON r.empresa_id = d.empresa_id AND r.periodo = d.periodo
         WHERE d.empresa_id = ANY($1::int[]) AND d.periodo = $2 AND d.estado = 'vigente'`,
        [ids, periodo]
      ),
      pool.query(
        `SELECT empresa_id, COUNT(*)::int AS sin_pago
         FROM honorarios
         WHERE empresa_id = ANY($1::int[]) AND estado = 'vigente' AND fecha_pago IS NULL
           AND TO_CHAR(fecha_emision, 'YYYY-MM') = $2
         GROUP BY empresa_id`,
        [ids, periodo]
      ),
      pool.query(
        `SELECT empresa_id, COUNT(*)::int AS facturas
         FROM compras
         WHERE empresa_id = ANY($1::int[]) AND periodo = $2 AND estado = 'vigente' AND sii_tipo_doc = '46'
         GROUP BY empresa_id`,
        [ids, periodo]
      ),
    ]);

    // El crédito va aparte: viene de compras, no de ventas.
    const credito = await pool.query(
      `
      SELECT c.empresa_id,
             ${sumaConSigno("iva_credito", "c")} AS credito,
             ${sumaConSignoSi("iva_credito", "c.comprobante_id IS NOT NULL", "c")}
               AS credito_con_asiento
      FROM compras c
      WHERE c.empresa_id = ANY($1::int[]) AND c.periodo = $2 AND c.estado = 'vigente'
      GROUP BY c.empresa_id
      `,
      [ids, periodo]
    );

    const mapaDocumentos = porEmpresa(documentos.rows);
    const mapaDescuadrados = porEmpresa(descuadrados.rows);
    const mapaConciliacion = porEmpresa(conciliacion.rows);
    const mapaDebito = porEmpresa(iva.rows);
    const mapaCredito = porEmpresa(credito.rows);
    const mapaRemuneraciones = porEmpresa(remuneraciones.rows);
    const mapaEjercicios = porEmpresa(ejercicios.rows);
    const mapaActividad = porEmpresa(actividad.rows);
    const mapaDuplicados = porEmpresa(duplicados.rows);
    const mapaIvaContable = porEmpresa(ivaContable.rows);
    const mapaRezagados = porEmpresa(rezagados.rows);
    const mapaF29 = porEmpresa(f29s.rows);
    const mapaHonorariosSinPago = porEmpresa(honorariosSinPago.rows);
    const mapaFacturas46 = porEmpresa(facturas46.rows);
    const mapaFolios = porEmpresa(folios.rows);
    const mapaAtipicos = porEmpresa(atipicos.rows);

    const filas = empresas.map((empresa) => {
      const id = Number(empresa.id);
      const doc = mapaDocumentos[id] || {};
      const rem = mapaRemuneraciones[id] || {};
      const ejercicio = mapaEjercicios[id];

      const sinCuenta = Number(doc.sin_cuenta || 0);
      const sinAsiento = Number(doc.sin_asiento || 0);
      const descuadre = Number(mapaDescuadrados[id]?.descuadrados || 0);
      const duplicado = Number(mapaDuplicados[id]?.duplicados || 0);
      const pendienteBanco = Number(mapaConciliacion[id]?.pendientes || 0);

      const trabajadores = Number(rem.trabajadores_activos || 0);
      const liquidaciones = Number(rem.liquidaciones_emitidas || 0);
      const remuneracionesPendientes = Math.max(trabajadores - liquidaciones, 0);

      const debito = Math.round(Number(mapaDebito[id]?.debito || 0));
      const creditoFiscal = Math.round(Number(mapaCredito[id]?.credito || 0));
      const ivaDeterminado = debito - creditoFiscal;

      // El IVA del libro contra el contabilizado. Si la empresa no declaró sus
      // cuentas de IVA no se puede comparar, y eso se informa como aviso en
      // lugar de dar por bueno lo que no se revisó.
      const contable = mapaIvaContable[id];
      const ivaComparable = contable?.configurado === true;
      const debitoContable = Math.round(Number(contable?.debito_contable || 0));
      const creditoContable = Math.round(Number(contable?.credito_contable || 0));

      // Se compara lo mismo contra lo mismo: el IVA de los documentos que tienen
      // asiento, contra el IVA de esos asientos. Un documento sin asiento ya lo
      // informa otra revisión.
      const debitoConAsiento = Math.round(Number(mapaDebito[id]?.debito_con_asiento || 0));
      const creditoConAsiento = Math.round(Number(mapaCredito[id]?.credito_con_asiento || 0));

      const ivaDescuadrado =
        ivaComparable &&
        (debitoConAsiento !== debitoContable || creditoConAsiento !== creditoContable);

      const foliosFaltantes = Number(mapaFolios[id]?.faltan || 0);
      const montosAtipicos = Number(mapaAtipicos[id]?.atipicos || 0);

      const comprasRezagadas = Number(mapaRezagados[id]?.rezagados || 0);
      const f29 = mapaF29[id] || null;
      const f29SinRegistrar = !f29 && periodo < hoyPeriodo ? 1 : 0;
      const f29ConDiferencia =
        f29 && Math.round(Number(f29.total_pagado || 0) - Number(f29.calculado || 0)) !== 0 ? 1 : 0;
      const documentosPosteriores = f29 && !f29ConDiferencia ? Number(f29.posteriores || 0) : 0;
      const honorariosSinFechaPago = Number(mapaHonorariosSinPago[id]?.sin_pago || 0);
      const facturasCompra = Number(mapaFacturas46[id]?.facturas || 0);

      // Lo que hace que el panel sirva: un solo semáforo por empresa.
      // Rojo es algo que hace que lo declarado no cuadre; amarillo es algo que
      // conviene mirar; verde es que no hay nada pendiente.
      //
      // Son las mismas nueve revisiones del cierre mensual y con la misma
      // gravedad: el panel y el detalle no pueden decir cosas distintas de la
      // misma empresa.
      const errores =
        descuadre + duplicado + sinCuenta + (ivaDescuadrado ? 1 : 0) + comprasRezagadas + f29ConDiferencia;
      const avisos =
        sinAsiento +
        pendienteBanco +
        remuneracionesPendientes +
        foliosFaltantes +
        montosAtipicos +
        (ivaComparable ? 0 : 1) +
        f29SinRegistrar +
        (documentosPosteriores > 0 ? 1 : 0) +
        honorariosSinFechaPago +
        facturasCompra;

      return {
        empresa_id: id,
        rut: empresa.rut,
        razon_social: empresa.razon_social,
        rol_empresa: normalizarRolEmpresa(empresa.rol_empresa),

        estado: errores > 0 ? "error" : avisos > 0 ? "aviso" : "ok",

        pendientes: {
          asientos_descuadrados: descuadre,
          documentos_duplicados: duplicado,
          documentos_sin_cuenta: sinCuenta,
          documentos_sin_asiento: sinAsiento,
          movimientos_banco_sin_conciliar: pendienteBanco,
          liquidaciones_faltantes: remuneracionesPendientes,
          iva_descuadrado: ivaDescuadrado ? 1 : 0,
          folios_de_venta_faltantes: foliosFaltantes,
          montos_atipicos: montosAtipicos,
          cuentas_de_iva_sin_configurar: ivaComparable ? 0 : 1,
          compras_fuera_de_plazo: comprasRezagadas,
          f29_sin_registrar: f29SinRegistrar,
          f29_con_diferencia: f29ConDiferencia,
          documentos_posteriores_al_f29: documentosPosteriores,
          honorarios_sin_fecha_pago: honorariosSinFechaPago,
          facturas_de_compra: facturasCompra,
        },
        f29_presentado: f29
          ? {
              fecha_presentacion: f29.fecha_presentacion,
              total_pagado: Number(f29.total_pagado || 0),
            }
          : null,

        documentos_del_periodo: Number(doc.total || 0),

        iva: {
          debito,
          credito: creditoFiscal,
          determinado: ivaDeterminado,
          a_pagar: ivaDeterminado > 0 ? ivaDeterminado : 0,
          remanente: ivaDeterminado < 0 ? Math.abs(ivaDeterminado) : 0,
          comparable_con_contabilidad: ivaComparable,
          debito_contabilizado: debitoContable,
          credito_contabilizado: creditoContable,
          cuadra_con_contabilidad: ivaComparable ? !ivaDescuadrado : null,
        },

        remuneraciones: {
          trabajadores_activos: trabajadores,
          liquidaciones_emitidas: liquidaciones,
          faltantes: remuneracionesPendientes,
        },

        ejercicio: ejercicio
          ? { anio: Number(ejercicio.anio), estado: ejercicio.estado }
          : { anio, estado: "sin_crear" },

        ultima_actividad: mapaActividad[id]?.ultima_actividad || null,
      };
    });

    // Las que necesitan atención primero: es para lo que se abre el panel.
    const orden = { error: 0, aviso: 1, ok: 2 };
    filas.sort(
      (a, b) =>
        orden[a.estado] - orden[b.estado] ||
        String(a.razon_social).localeCompare(String(b.razon_social), "es")
    );

    return res.json({
      periodo,
      total_empresas: filas.length,
      empresas: filas,
      resumen: {
        con_errores: filas.filter((f) => f.estado === "error").length,
        con_avisos: filas.filter((f) => f.estado === "aviso").length,
        al_dia: filas.filter((f) => f.estado === "ok").length,
        iva_a_pagar_total: filas.reduce((suma, f) => suma + f.iva.a_pagar, 0),
        documentos_del_periodo: filas.reduce((suma, f) => suma + f.documentos_del_periodo, 0),
      },
    });
  } catch (error) {
    console.error("Error al obtener el panel del estudio:", error);

    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Error interno al obtener el panel",
    });
  }
}

module.exports = { obtenerPanelEstudio };
