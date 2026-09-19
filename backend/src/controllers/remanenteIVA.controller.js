/**
 * Control del remanente de credito fiscal.
 *
 * El remanente se arrastra solo, en UTM, desde el periodo anterior (articulo
 * 26 del DL 825). Antes lo digitaba el usuario en pesos y no se conectaba con
 * el mes previo; el resultado diferia del que calcula el SII.
 *
 * El remanente anterior solo se puede fijar a mano cuando no existe registro
 * del periodo previo: es el punto de partida de una empresa que llega con
 * remanente desde otro sistema. Despues, manda la cadena.
 */

const pool = require("../database/db");
const { calcularF29, remanenteAnteriorDe } = require("../helpers/f29.helper");
const { utmDelPeriodo, periodoAnterior } = require("../helpers/parametrosNacionales.helper");

function redondear(valor) {
  return Math.round(Number(valor || 0));
}

async function obtenerControlRemanenteIVA(req, res) {
  try {
    const { empresa_id, periodo } = req.query;

    if (!empresa_id || !periodo) {
      return res.status(400).json({ error: "Debe indicar empresa_id y período" });
    }

    const [f29, registro] = await Promise.all([
      calcularF29(pool, Number(empresa_id), String(periodo)),
      pool.query(`SELECT * FROM remanente_iva WHERE empresa_id = $1 AND periodo = $2`, [
        empresa_id,
        periodo,
      ]),
    ]);

    const previo = await pool.query(
      `SELECT 1 FROM remanente_iva WHERE empresa_id = $1 AND periodo = $2`,
      [empresa_id, periodoAnterior(String(periodo))]
    );

    return res.json({
      empresa_id: Number(empresa_id),
      periodo,
      valor_utm: f29.valor_utm,
      remanente_anterior: f29.iva.remanente_anterior,
      remanente_anterior_utm: f29.iva.remanente_anterior_utm,
      iva_debito: f29.iva.iva_debito,
      iva_credito: f29.iva.iva_credito,
      iva_disponible: f29.iva.iva_disponible,
      iva_determinado: f29.iva.iva_determinado,
      iva_pagar: f29.iva.iva_pagar,
      remanente_siguiente: f29.iva.remanente_siguiente,
      remanente_siguiente_utm: f29.iva.remanente_siguiente_utm,
      observacion: registro.rows[0]?.observacion || "",
      guardado: registro.rows.length > 0,
      // Solo el primer periodo de la cadena admite un remanente inicial a mano.
      permite_remanente_inicial: previo.rows.length === 0,
      avisos: f29.avisos,
    });
  } catch (error) {
    console.error("Error al obtener control remanente IVA:", error);

    return res.status(500).json({ error: "Error interno al obtener control remanente IVA" });
  }
}

async function guardarControlRemanenteIVA(req, res) {
  try {
    const { empresa_id, periodo, remanente_anterior, observacion } = req.body;

    if (!empresa_id || !periodo) {
      return res.status(400).json({ error: "Debe indicar empresa_id y período" });
    }

    const previo = await pool.query(
      `SELECT 1 FROM remanente_iva WHERE empresa_id = $1 AND periodo = $2`,
      [empresa_id, periodoAnterior(String(periodo))]
    );

    const utm = await utmDelPeriodo(pool, String(periodo));
    const f29 = await calcularF29(pool, Number(empresa_id), String(periodo));

    // Remanente inicial a mano: solo si no hay cadena hacia atras.
    let remanenteAnterior = f29.iva.remanente_anterior;
    let remanenteAnteriorUtm = f29.iva.remanente_anterior_utm;
    const avisos = [...f29.avisos];

    if (remanente_anterior !== undefined && remanente_anterior !== null && remanente_anterior !== "") {
      if (previo.rows.length > 0) {
        avisos.push(
          "El remanente anterior viene del período previo y no se puede digitar. Corrige el período anterior si difiere."
        );
      } else {
        remanenteAnterior = redondear(remanente_anterior);
        remanenteAnteriorUtm = utm ? Number((remanenteAnterior / utm).toFixed(4)) : 0;
      }
    }

    const ivaDisponible = f29.iva.iva_credito + remanenteAnterior;
    const ivaDeterminado = f29.iva.iva_debito - ivaDisponible;
    const ivaPagar = ivaDeterminado > 0 ? ivaDeterminado : 0;
    const remanenteSiguiente = ivaDeterminado < 0 ? Math.abs(ivaDeterminado) : 0;
    const remanenteSiguienteUtm = utm ? Number((remanenteSiguiente / utm).toFixed(4)) : null;
    const totalF29 = ivaPagar + f29.ppm.monto_ppm + f29.honorarios.retencion + f29.iva.iva_retenido;

    const resultado = await pool.query(
      `INSERT INTO remanente_iva
         (empresa_id, periodo, remanente_anterior, iva_debito, iva_credito, iva_disponible,
          iva_determinado, iva_pagar, remanente_siguiente, remanente_anterior_utm,
          remanente_siguiente_utm, valor_utm, ppm, retenciones_honorarios, iva_retenido,
          total_f29, observacion, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
       ON CONFLICT (empresa_id, periodo) DO UPDATE SET
         remanente_anterior = EXCLUDED.remanente_anterior,
         iva_debito = EXCLUDED.iva_debito,
         iva_credito = EXCLUDED.iva_credito,
         iva_disponible = EXCLUDED.iva_disponible,
         iva_determinado = EXCLUDED.iva_determinado,
         iva_pagar = EXCLUDED.iva_pagar,
         remanente_siguiente = EXCLUDED.remanente_siguiente,
         remanente_anterior_utm = EXCLUDED.remanente_anterior_utm,
         remanente_siguiente_utm = EXCLUDED.remanente_siguiente_utm,
         valor_utm = EXCLUDED.valor_utm,
         ppm = EXCLUDED.ppm,
         retenciones_honorarios = EXCLUDED.retenciones_honorarios,
         iva_retenido = EXCLUDED.iva_retenido,
         total_f29 = EXCLUDED.total_f29,
         observacion = EXCLUDED.observacion,
         actualizado_en = NOW()
       RETURNING *`,
      [
        empresa_id,
        periodo,
        remanenteAnterior,
        f29.iva.iva_debito,
        f29.iva.iva_credito,
        ivaDisponible,
        ivaDeterminado,
        ivaPagar,
        remanenteSiguiente,
        remanenteAnteriorUtm,
        remanenteSiguienteUtm,
        utm,
        f29.ppm.monto_ppm,
        f29.honorarios.retencion,
        f29.iva.iva_retenido,
        totalF29,
        observacion || "",
      ]
    );

    return res.json({
      mensaje: "Control de remanente IVA guardado correctamente",
      control: resultado.rows[0],
      avisos,
    });
  } catch (error) {
    console.error("Error al guardar control remanente IVA:", error);

    return res.status(500).json({ error: "Error interno al guardar control remanente IVA" });
  }
}

async function listarControlesRemanenteIVA(req, res) {
  try {
    const { empresa_id } = req.query;

    if (!empresa_id) {
      return res.status(400).json({ error: "Debe indicar empresa_id" });
    }

    const resultado = await pool.query(
      `SELECT * FROM remanente_iva WHERE empresa_id = $1 ORDER BY periodo DESC`,
      [empresa_id]
    );

    return res.json({ total: resultado.rows.length, controles: resultado.rows });
  } catch (error) {
    console.error("Error al listar controles remanente IVA:", error);

    return res.status(500).json({ error: "Error interno al listar controles remanente IVA" });
  }
}

module.exports = {
  obtenerControlRemanenteIVA,
  guardarControlRemanenteIVA,
  listarControlesRemanenteIVA,
  remanenteAnteriorDe,
};
