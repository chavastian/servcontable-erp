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
const { sumaConSigno } = require("../helpers/documentoTributario.helper");

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

    // El crédito va aparte: viene de compras, no de ventas.
    const credito = await pool.query(
      `
      SELECT c.empresa_id, ${sumaConSigno("iva_credito", "c")} AS credito
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

      // Lo que hace que el panel sirva: un solo semáforo por empresa.
      // Rojo es algo que hace que lo declarado no cuadre; amarillo es algo que
      // conviene mirar; verde es que no hay nada pendiente.
      const errores = descuadre + duplicado + sinCuenta;
      const avisos = sinAsiento + pendienteBanco + remuneracionesPendientes;

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
        },

        documentos_del_periodo: Number(doc.total || 0),

        iva: {
          debito,
          credito: creditoFiscal,
          determinado: ivaDeterminado,
          a_pagar: ivaDeterminado > 0 ? ivaDeterminado : 0,
          remanente: ivaDeterminado < 0 ? Math.abs(ivaDeterminado) : 0,
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
