/**
 * Indices de rendimiento e integridad que faltaban en el esquema heredado.
 *
 * Todo es aditivo e idempotente. No borra datos ni cambia tipos.
 * Verificado antes de escribirla: no hay duplicados en produccion que
 * impidan las restricciones unicas que se crean aca.
 */

exports.shorthands = undefined;

// Indices compuestos por empresa: toda consulta del sistema filtra por
// empresa_id y casi siempre acota por fecha o periodo.
const INDICES = [
  // Contabilidad
  ["comprobantes", "(empresa_id, fecha)"],
  ["comprobantes", "(empresa_id, periodo)"],
  ["comprobantes", "(empresa_id, estado)"],
  // Sin este indice, cada apertura de comprobante y cada libro recorre
  // comprobante_detalle completo.
  ["comprobante_detalle", "(comprobante_id)"],
  ["comprobante_detalle", "(cuenta_id)"],
  ["comprobante_detalle", "(rut_auxiliar)"],
  ["plan_cuentas", "(empresa_id, activo)"],
  ["ejercicios_contables", "(empresa_id, estado)"],

  // Documentos tributarios
  ["ventas", "(empresa_id, fecha)"],
  ["ventas", "(empresa_id, periodo)"],
  ["ventas", "(comprobante_id)"],
  ["compras", "(empresa_id, fecha)"],
  ["compras", "(empresa_id, periodo)"],
  ["compras", "(comprobante_id)"],
  ["honorarios", "(empresa_id, periodo)"],
  ["honorarios", "(comprobante_id)"],
  ["pagos_cobros", "(empresa_id, estado)"],

  // Remuneraciones
  ["trabajadores", "(empresa_id, activo)"],
  ["liquidaciones", "(empresa_id, periodo)"],
  ["liquidaciones", "(comprobante_id)"],
  ["liquidacion_detalle", "(liquidacion_id)"],
  ["haberes_descuentos_remuneraciones", "(empresa_id, periodo)"],
  ["haberes_descuentos_remuneraciones", "(trabajador_id)"],
  ["pagos_remuneraciones", "(empresa_id, periodo)"],
  ["pagos_remuneraciones", "(trabajador_id)"],
  ["finiquitos", "(empresa_id, trabajador_id)"],
  ["conceptos_remuneracion", "(empresa_id)"],

  // Auditoria y trazabilidad
  ["auditoria_movimientos", "(empresa_id, creado_en DESC)"],
  ["auditoria_movimientos", "(usuario_id)"],
  ["admin_audit_logs", "(created_at DESC)"],

  // Suscripciones y cobranza
  ["subscription_payments", "(subscription_id)"],
  ["subscription_payments", "(payment_date DESC)"],
  ["subscription_history", "(subscription_id)"],
  ["subscription_notifications", "(user_id, event_type)"],
  ["subscription_notifications", "(status, scheduled_at)"],
  ["contrataciones_web", "(correo)"],
  ["contrataciones_web", "(estado)"],
];

function nombreIndice(tabla, columnas) {
  const limpio = columnas
    .replace(/[()]/g, "")
    .replace(/\s+DESC/gi, "")
    .split(",")
    .map((columna) => columna.trim())
    .join("_");

  return `idx_${tabla}_${limpio}`;
}

async function existeColumna(pgm, tabla, columna) {
  const { rows } = await pgm.db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tabla, columna]
  );

  return rows.length > 0;
}

async function existeTabla(pgm, tabla) {
  const { rows } = await pgm.db.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tabla]
  );

  return rows.length > 0;
}

exports.up = async (pgm) => {
  for (const [tabla, columnas] of INDICES) {
    if (!(await existeTabla(pgm, tabla))) {
      continue;
    }

    const requeridas = columnas
      .replace(/[()]/g, "")
      .replace(/\s+DESC/gi, "")
      .split(",")
      .map((columna) => columna.trim());

    const todas = await Promise.all(
      requeridas.map((columna) => existeColumna(pgm, tabla, columna))
    );

    if (todas.some((existe) => !existe)) {
      continue;
    }

    pgm.sql(
      `CREATE INDEX IF NOT EXISTS ${nombreIndice(tabla, columnas)} ON ${tabla} ${columnas}`
    );
  }

  // El RUT de empresa es la identidad tributaria: no puede repetirse.
  pgm.sql(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_rut
     ON empresas (UPPER(REPLACE(REPLACE(rut, '.', ''), ' ', '')))
     WHERE rut IS NOT NULL AND rut <> ''`
  );

  // Idempotencia de cobros: una orden de Flow activa una sola suscripcion.
  if (await existeColumna(pgm, "contrataciones_web", "flow_order")) {
    pgm.sql(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_contrataciones_web_flow_order
       ON contrataciones_web (flow_order)
       WHERE flow_order IS NOT NULL`
    );
  }

  // Un pago por transaccion y proveedor: evita doble registro cuando el
  // webhook y el retorno del navegador llegan a la vez.
  pgm.sql(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_payments_proveedor_transaccion
     ON subscription_payments (provider, transaction_id)
     WHERE transaction_id IS NOT NULL AND provider IS NOT NULL`
  );

  // Un aviso por suscripcion, tipo de evento y dia: deduplica la cobranza.
  pgm.sql(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_notifications_evento_dia
     ON subscription_notifications (user_id, event_type, (scheduled_at::date))
     WHERE scheduled_at IS NOT NULL`
  );
};

exports.down = (pgm) => {
  for (const [tabla, columnas] of INDICES) {
    pgm.sql(`DROP INDEX IF EXISTS ${nombreIndice(tabla, columnas)}`);
  }

  pgm.sql("DROP INDEX IF EXISTS uq_empresas_rut");
  pgm.sql("DROP INDEX IF EXISTS uq_contrataciones_web_flow_order");
  pgm.sql("DROP INDEX IF EXISTS uq_subscription_payments_proveedor_transaccion");
  pgm.sql("DROP INDEX IF EXISTS uq_subscription_notifications_evento_dia");
};
