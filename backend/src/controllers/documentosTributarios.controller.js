/**
 * Anulación y edición de compras y ventas.
 *
 * Hasta ahora no existía ninguna de las dos. Una factura duplicada o mal
 * digitada solo se "arreglaba" anulando su asiento, y entonces el documento
 * seguía vigente: el libro, el resumen de IVA y el F29 la seguían sumando. Era
 * la carencia que más se iba a notar cuando el cierre mensual empezara a marcar
 * cosas en rojo, porque las denunciaba y no había cómo resolverlas.
 *
 * Reglas:
 *
 * - Anular es lógico: el documento queda con estado, autor, fecha y motivo. Su
 *   asiento se anula en la misma transacción y sigue enlazado, para que quede
 *   claro contra qué se contabilizó.
 * - Un documento con pagos o cobros vigentes no se anula ni cambia de monto:
 *   primero se anulan los pagos, que es lo que un contador haría.
 * - Editar regenera el asiento: el anterior se anula con motivo y se crea uno
 *   nuevo. No se reescribe el asiento viejo, porque el rastro importa.
 * - Nada de esto entra en un ejercicio cerrado.
 */

const pool = require("../database/db");
const { registrarAuditoria } = require("../helpers/auditoria.helper");
const { exigirPeriodoAbierto } = require("../helpers/periodo.helper");
const {
  crearComprobanteAutomaticoCompra,
  crearComprobanteAutomaticoVenta,
} = require("../helpers/comprobante.helper");
const { validarCuentaOperativa } = require("../helpers/cuentas.helper");
const {
  normalizarRutDocumento,
  normalizarNombreTercero,
} = require("../helpers/trazabilidadRut.helper");
const {
  codigoSiiDesdeTipoDocumento,
  obtenerPeriodoDesdeFecha,
} = require("../helpers/siiCsv.helper");
const { aFechaISO } = require("../helpers/fecha.helper");

const LIBROS = Object.freeze({
  compras: {
    tabla: "compras",
    etiqueta: "compra",
    tipoPago: "Compra",
    rut: "rut_proveedor",
    nombre: "razon_social_proveedor",
    cuenta: "cuenta_gasto_id",
    montos: ["neto", "exento", "iva_credito", "iva_no_recuperable", "otros_impuestos", "total"],
    extras: ["cuenta_otros_impuestos_id", "fecha_recepcion"],
    crearAsiento: crearComprobanteAutomaticoCompra,
  },
  ventas: {
    tabla: "ventas",
    etiqueta: "venta",
    tipoPago: "Venta",
    rut: "rut_cliente",
    nombre: "razon_social_cliente",
    cuenta: "cuenta_ingreso_id",
    montos: ["neto", "exento", "iva", "total"],
    extras: [],
    crearAsiento: crearComprobanteAutomaticoVenta,
  },
});

function error(mensaje, statusCode) {
  return Object.assign(new Error(mensaje), { statusCode });
}

// Las columnas DATE llegan como objetos Date desde PostgreSQL: String() da
// "Wed Jun 10" y la base rechaza la fecha. Todo pasa por fecha.helper.
function fechaONull(valor) {
  if (valor === undefined) return undefined;
  if (valor === null || valor === "") return null;

  return aFechaISO(valor);
}

async function pagosVigentes(client, empresaId, tipoPago, documentoId) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS cantidad
     FROM pagos_cobros
     WHERE empresa_id = $1 AND tipo_documento = $2 AND documento_id = $3 AND estado = 'vigente'`,
    [empresaId, tipoPago, documentoId]
  );

  return rows[0].cantidad;
}

async function anularAsiento(client, empresaId, comprobanteId, usuarioId, motivo) {
  if (!comprobanteId) return;

  await client.query(
    `UPDATE comprobantes
     SET estado = 'anulado', anulado_en = NOW(), anulado_por = $3, motivo_anulacion = $4
     WHERE id = $1 AND empresa_id = $2 AND estado = 'vigente'`,
    [comprobanteId, empresaId, usuarioId, motivo]
  );
}

function responderError(res, err, accion) {
  if (err.code === "23505") {
    return res.status(409).json({
      error: "Ya existe un documento vigente con ese tercero, tipo y folio.",
    });
  }

  console.error(`Error al ${accion}:`, err);

  return res.status(err.statusCode || 500).json({
    error: err.statusCode ? err.message : `Error interno al ${accion}`,
  });
}

function anular(libro) {
  const def = LIBROS[libro];

  return async function anularDocumento(req, res) {
    const client = await pool.connect();

    try {
      const { id } = req.params;
      const { empresa_id, motivo } = req.body;
      const motivoTexto = String(motivo || "").trim();

      if (motivoTexto.length < 3) {
        return res.status(400).json({ error: "Indica el motivo de la anulación." });
      }

      await client.query("BEGIN");

      const { rows } = await client.query(
        `SELECT * FROM ${def.tabla} WHERE id = $1 AND empresa_id = $2 FOR UPDATE`,
        [id, empresa_id]
      );

      if (rows.length === 0) {
        throw error(`La ${def.etiqueta} no existe en esta empresa`, 404);
      }

      const documento = rows[0];

      if (documento.estado !== "vigente") {
        throw error(`La ${def.etiqueta} ya está anulada`, 409);
      }

      await exigirPeriodoAbierto(client, empresa_id, documento.fecha);

      const pagos = await pagosVigentes(client, empresa_id, def.tipoPago, documento.id);

      if (pagos > 0) {
        throw error(
          `La ${def.etiqueta} tiene ${pagos} pago(s) o cobro(s) vigentes. Anúlalos primero.`,
          409
        );
      }

      const usuarioId = req.usuario?.id || null;

      const actualizado = await client.query(
        `UPDATE ${def.tabla}
         SET estado = 'anulado', anulado_en = NOW(), anulado_por = $3, motivo_anulacion = $4
         WHERE id = $1 AND empresa_id = $2
         RETURNING *`,
        [id, empresa_id, usuarioId, motivoTexto]
      );

      await anularAsiento(
        client,
        empresa_id,
        documento.comprobante_id,
        usuarioId,
        `Anulación de ${def.etiqueta} folio ${documento.folio || "s/f"}: ${motivoTexto}`
      );

      await registrarAuditoria({
        client,
        req,
        empresaId: Number(empresa_id),
        modulo: libro === "compras" ? "Compras" : "Ventas",
        accion: `Anular ${def.etiqueta}`,
        detalle: `${def.etiqueta} folio ${documento.folio || "s/f"} anulada: ${motivoTexto}`,
        tablaAfectada: def.tabla,
        registroId: Number(id),
        datos: {
          folio: documento.folio,
          tipo_documento: documento.tipo_documento,
          total: Number(documento.total || 0),
          comprobante_anulado: documento.comprobante_id || null,
          motivo: motivoTexto,
        },
      });

      await client.query("COMMIT");

      return res.json({
        mensaje: documento.comprobante_id
          ? `${def.etiqueta} anulada junto con su asiento.`
          : `${def.etiqueta} anulada.`,
        documento: actualizado.rows[0],
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      return responderError(res, err, `anular ${def.etiqueta}`);
    } finally {
      client.release();
    }
  };
}

function actualizar(libro) {
  const def = LIBROS[libro];

  return async function actualizarDocumento(req, res) {
    const client = await pool.connect();

    try {
      const { id } = req.params;
      const { empresa_id, regenerar_comprobante = true } = req.body;

      await client.query("BEGIN");

      const { rows } = await client.query(
        `SELECT * FROM ${def.tabla} WHERE id = $1 AND empresa_id = $2 FOR UPDATE`,
        [id, empresa_id]
      );

      if (rows.length === 0) {
        throw error(`La ${def.etiqueta} no existe en esta empresa`, 404);
      }

      const actual = rows[0];

      if (actual.estado !== "vigente") {
        throw error(`La ${def.etiqueta} está anulada y no se puede editar`, 409);
      }

      await exigirPeriodoAbierto(client, empresa_id, actual.fecha);

      // Nuevos valores: lo que venga en el cuerpo, o lo que ya había.
      const cuerpo = req.body;
      const fecha = cuerpo.fecha ? aFechaISO(cuerpo.fecha) : aFechaISO(actual.fecha);

      await exigirPeriodoAbierto(client, empresa_id, fecha);

      const tipoDocumento = cuerpo.tipo_documento || actual.tipo_documento;
      const nuevo = {
        periodo: cuerpo.periodo || (cuerpo.fecha ? obtenerPeriodoDesdeFecha(fecha) : actual.periodo),
        fecha,
        tipo_documento: tipoDocumento,
        sii_tipo_doc: cuerpo.tipo_documento
          ? codigoSiiDesdeTipoDocumento(tipoDocumento) || actual.sii_tipo_doc
          : actual.sii_tipo_doc,
        folio: cuerpo.folio !== undefined ? String(cuerpo.folio || "").trim() : actual.folio,
        [def.rut]:
          cuerpo[def.rut] !== undefined
            ? normalizarRutDocumento(cuerpo[def.rut], "RUT del tercero")
            : actual[def.rut],
        [def.nombre]:
          cuerpo[def.nombre] !== undefined
            ? normalizarNombreTercero(cuerpo[def.nombre])
            : actual[def.nombre],
        fecha_vencimiento:
          fechaONull(cuerpo.fecha_vencimiento) === undefined
            ? fechaONull(actual.fecha_vencimiento)
            : fechaONull(cuerpo.fecha_vencimiento),
        ref_sii_tipo_doc: cuerpo.ref_sii_tipo_doc ?? actual.ref_sii_tipo_doc,
        ref_folio: cuerpo.ref_folio ?? actual.ref_folio,
        ref_fecha:
          fechaONull(cuerpo.ref_fecha) === undefined
            ? fechaONull(actual.ref_fecha)
            : fechaONull(cuerpo.ref_fecha),
      };

      for (const columna of def.montos) {
        nuevo[columna] =
          cuerpo[columna] !== undefined && cuerpo[columna] !== null && cuerpo[columna] !== ""
            ? Number(cuerpo[columna])
            : Number(actual[columna] || 0);
      }

      for (const columna of def.extras) {
        if (cuerpo[columna] !== undefined) {
          nuevo[columna] =
            cuerpo[columna] === "" ? null : columna.startsWith("fecha") ? aFechaISO(cuerpo[columna]) : cuerpo[columna];
        }
      }

      if (cuerpo[def.cuenta] !== undefined) {
        const cuentaId = Number(cuerpo[def.cuenta]);
        nuevo[def.cuenta] = Number.isInteger(cuentaId) && cuentaId > 0 ? cuentaId : null;
      }

      if (nuevo[def.cuenta]) {
        await validarCuentaOperativa(client, {
          empresaId: empresa_id,
          cuentaId: nuevo[def.cuenta],
          etiqueta: `cuenta de la ${def.etiqueta}`,
        });
      }

      if (!nuevo.folio) {
        throw error("El folio es obligatorio", 400);
      }

      // Con pagos o cobros aplicados, cambiar el monto dejaría un saldo que no
      // corresponde a nada. Primero se anulan los pagos.
      const cambiaMonto = Number(nuevo.total) !== Number(actual.total || 0);

      if (cambiaMonto && (await pagosVigentes(client, empresa_id, def.tipoPago, actual.id)) > 0) {
        throw error(
          `La ${def.etiqueta} tiene pagos o cobros vigentes: anúlalos antes de cambiar sus montos.`,
          409
        );
      }

      const columnas = Object.keys(nuevo);
      const valores = columnas.map((c) => nuevo[c]);
      const asignaciones = columnas.map((c, i) => `${c} = $${i + 3}`).join(", ");

      const actualizado = await client.query(
        `UPDATE ${def.tabla} SET ${asignaciones} WHERE id = $1 AND empresa_id = $2 RETURNING *`,
        [id, empresa_id, ...valores]
      );

      const documento = actualizado.rows[0];
      const usuarioId = req.usuario?.id || null;
      let comprobante = null;

      // El asiento anterior se anula con motivo y se genera uno nuevo desde el
      // documento corregido. No se reescribe el viejo: el rastro importa.
      if (actual.comprobante_id) {
        await anularAsiento(
          client,
          empresa_id,
          actual.comprobante_id,
          usuarioId,
          `Reemplazado por edición de ${def.etiqueta} folio ${documento.folio}`
        );
      }

      if (regenerar_comprobante) {
        const config = await client.query(
          `SELECT * FROM configuracion_contable WHERE empresa_id = $1`,
          [empresa_id]
        );

        if (config.rows.length === 0) {
          throw error(
            "Debes guardar la Configuración Contable antes de regenerar el comprobante",
            400
          );
        }

        comprobante = await def.crearAsiento(client, documento, config.rows[0]);

        await client.query(`UPDATE ${def.tabla} SET comprobante_id = $1 WHERE id = $2`, [
          comprobante.id,
          documento.id,
        ]);
        documento.comprobante_id = comprobante.id;
      } else if (actual.comprobante_id) {
        await client.query(`UPDATE ${def.tabla} SET comprobante_id = NULL WHERE id = $1`, [
          documento.id,
        ]);
        documento.comprobante_id = null;
      }

      await registrarAuditoria({
        client,
        req,
        empresaId: Number(empresa_id),
        modulo: libro === "compras" ? "Compras" : "Ventas",
        accion: `Editar ${def.etiqueta}`,
        detalle: `${def.etiqueta} folio ${documento.folio} editada`,
        tablaAfectada: def.tabla,
        registroId: Number(id),
        datos: {
          anterior: Object.fromEntries(columnas.map((c) => [c, actual[c]])),
          nuevo,
          comprobante_anterior: actual.comprobante_id || null,
          comprobante_nuevo: comprobante ? comprobante.id : null,
        },
      });

      await client.query("COMMIT");

      return res.json({
        mensaje: comprobante
          ? `${def.etiqueta} actualizada y comprobante regenerado.`
          : `${def.etiqueta} actualizada.`,
        documento,
        comprobante,
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      return responderError(res, err, `actualizar ${def.etiqueta}`);
    } finally {
      client.release();
    }
  };
}

module.exports = {
  anularCompra: anular("compras"),
  anularVenta: anular("ventas"),
  actualizarCompra: actualizar("compras"),
  actualizarVenta: actualizar("ventas"),
};
