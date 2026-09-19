const { parse } = require("csv-parse/sync");
const pool = require("../database/db");
const { registrarAuditoria } = require("../helpers/auditoria.helper");

function normalizarClave(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function valorFila(fila, aliases = []) {
  const mapa = new Map(
    Object.entries(fila || {}).map(([clave, valor]) => [normalizarClave(clave), valor])
  );

  for (const alias of aliases) {
    const valor = mapa.get(normalizarClave(alias));
    if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
      return valor;
    }
  }

  return "";
}

function convertirMonto(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;

  const limpio = String(valor)
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/\(([^)]+)\)/, "-$1")
    .trim();

  const numero = Number(limpio);
  return Number.isNaN(numero) ? 0 : numero;
}

function convertirFechaFlexible(valor) {
  if (!valor) return null;

  const limpio = String(valor).trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(limpio)) {
    return limpio.substring(0, 10);
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(limpio)) {
    const [dia, mes, anio] = limpio.split("/");
    return `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(limpio)) {
    const [dia, mes, anio] = limpio.split("-");
    return `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
  }

  return null;
}

function detectarDelimitador(texto) {
  const primeraLinea =
    String(texto || "")
      .split(/\r?\n/)
      .find((linea) => linea.trim().length > 0) || "";

  const candidatos = [";", "\t", ","];
  return candidatos
    .map((delimitador) => ({
      delimitador,
      cantidad: primeraLinea.split(delimitador).length,
    }))
    .sort((a, b) => b.cantidad - a.cantidad)[0].delimitador;
}

function parsearArchivo(file) {
  const texto = (file?.buffer || Buffer.alloc(0)).toString("utf8");
  const delimiter = detectarDelimitador(texto);

  return parse(texto, {
    columns: true,
    delimiter,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_column_count: true,
  });
}

async function listarMovimientos(req, res) {
  try {
    const { empresa_id, fecha_desde, fecha_hasta } = req.query;

    if (!empresa_id) {
      return res.status(400).json({ error: "Debe indicar empresa_id" });
    }


    const params = [empresa_id];
    const condiciones = ["empresa_id = $1"];

    if (fecha_desde) {
      params.push(fecha_desde);
      condiciones.push(`fecha >= $${params.length}`);
    }

    if (fecha_hasta) {
      params.push(fecha_hasta);
      condiciones.push(`fecha <= $${params.length}`);
    }

    const resultado = await pool.query(
      `
      SELECT *
      FROM conciliacion_bancaria_movimientos
      WHERE ${condiciones.join(" AND ")}
      ORDER BY fecha DESC, id DESC
      `,
      params
    );

    const movimientos = resultado.rows;
    const totales = movimientos.reduce(
      (acc, mov) => {
        acc.cargos += Number(mov.cargo || 0);
        acc.abonos += Number(mov.abono || 0);
        acc.pendientes += mov.estado === "pendiente" ? 1 : 0;
        acc.conciliados += mov.estado === "conciliado" ? 1 : 0;
        return acc;
      },
      { cargos: 0, abonos: 0, pendientes: 0, conciliados: 0 }
    );

    res.json({ movimientos, totales });
  } catch (error) {
    console.error("Error al listar conciliacion bancaria:", error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Error al listar conciliacion bancaria",
    });
  }
}

async function importarCartola(req, res) {
  const client = await pool.connect();

  try {
    const empresaId = req.body.empresa_id;

    if (!empresaId) {
      return res.status(400).json({ error: "Debe indicar empresa_id" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Debe adjuntar archivo de cartola bancaria" });
    }

    const filas = parsearArchivo(req.file);
    const resumen = {
      total_filas: filas.length,
      insertadas: 0,
      omitidas: 0,
      cargos: 0,
      abonos: 0,
      errores: [],
    };

    await client.query("BEGIN");

    for (let index = 0; index < filas.length; index += 1) {
      const fila = filas[index];
      const fecha = convertirFechaFlexible(
        valorFila(fila, [
          "Fecha",
          "Fecha Movimiento",
          "Fecha Contable",
          "Fecha Transaccion",
          "Fecha Transacción",
        ])
      );

      if (!fecha) {
        resumen.omitidas += 1;
        resumen.errores.push(`Fila ${index + 1}: fecha no valida.`);
        continue;
      }

      const descripcion =
        String(
          valorFila(fila, [
            "Descripcion",
            "Descripción",
            "Glosa",
            "Detalle",
            "Movimiento",
            "Operacion",
          ]) || "Movimiento bancario"
        ).trim() || "Movimiento bancario";
      const documento = String(
        valorFila(fila, ["Documento", "Nro", "Numero", "Número", "Referencia"]) || ""
      ).trim();
      let cargo = convertirMonto(valorFila(fila, ["Cargo", "Cargos", "Debe", "Egreso", "Retiros"]));
      let abono = convertirMonto(valorFila(fila, ["Abono", "Abonos", "Haber", "Ingreso", "Depositos", "Depósitos"]));
      const montoInformado = convertirMonto(valorFila(fila, ["Monto", "Importe", "Valor"]));
      const saldo = convertirMonto(valorFila(fila, ["Saldo", "Saldo Contable", "Saldo Disponible"]));

      if (cargo === 0 && abono === 0 && montoInformado !== 0) {
        if (montoInformado < 0) {
          cargo = Math.abs(montoInformado);
        } else {
          abono = montoInformado;
        }
      }

      if (cargo === 0 && abono === 0) {
        resumen.omitidas += 1;
        resumen.errores.push(`Fila ${index + 1}: sin cargo ni abono.`);
        continue;
      }

      const existente = await client.query(
        `
        SELECT id
        FROM conciliacion_bancaria_movimientos
        WHERE empresa_id = $1
          AND fecha = $2
          AND descripcion = $3
          AND documento = $4
          AND cargo = $5
          AND abono = $6
        LIMIT 1
        `,
        [empresaId, fecha, descripcion, documento, cargo, abono]
      );

      if (existente.rows.length > 0) {
        resumen.omitidas += 1;
        continue;
      }

      await client.query(
        `
        INSERT INTO conciliacion_bancaria_movimientos
        (empresa_id, periodo, fecha, descripcion, documento, cargo, abono, monto, saldo)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          empresaId,
          fecha.substring(0, 7),
          fecha,
          descripcion,
          documento,
          cargo,
          abono,
          abono - cargo,
          saldo,
        ]
      );

      resumen.insertadas += 1;
      resumen.cargos += cargo;
      resumen.abonos += abono;
    }

    await client.query("COMMIT");

    await registrarAuditoria({
      req,
      empresaId,
      modulo: "Conciliacion bancaria",
      accion: "Importar cartola bancaria",
      detalle: `Importacion de cartola: ${resumen.insertadas} movimientos insertados.`,
      tablaAfectada: "conciliacion_bancaria_movimientos",
      datos: resumen,
    });

    res.json({ mensaje: "Importacion de cartola finalizada", resumen });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error al importar cartola bancaria:", error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Error al importar cartola bancaria",
    });
  } finally {
    client.release();
  }
}

async function actualizarEstado(req, res) {
  try {
    const { id } = req.params;
    const { empresa_id, estado, comprobante_id } = req.body;
    const estadosValidos = ["pendiente", "conciliado"];

    if (!empresa_id) {
      return res.status(400).json({ error: "Debe indicar empresa_id" });
    }

    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ error: "Estado no valido" });
    }

    // Con que documento se concilio. Es opcional porque no todo movimiento
    // corresponde a un asiento (una comision del banco, un traspaso entre
    // cuentas propias), pero cuando viene hay que comprobar que el comprobante
    // sea de esta empresa: sin eso el calce podria apuntar al asiento de otro
    // cliente y la cartola quedaria explicada con datos ajenos.
    let comprobanteConciliado = null;

    if (comprobante_id !== undefined && comprobante_id !== null && comprobante_id !== "") {
      const numeroComprobante = Number(comprobante_id);

      if (!Number.isInteger(numeroComprobante) || numeroComprobante <= 0) {
        return res.status(400).json({ error: "comprobante_id no valido" });
      }

      const { rows: comprobantes } = await pool.query(
        `SELECT id FROM comprobantes WHERE id = $1 AND empresa_id = $2`,
        [numeroComprobante, empresa_id]
      );

      if (comprobantes.length === 0) {
        return res
          .status(404)
          .json({ error: "El comprobante no existe en esta empresa" });
      }

      comprobanteConciliado = numeroComprobante;
    }

    const resultado = await pool.query(
      `
      UPDATE conciliacion_bancaria_movimientos
      SET estado = $1,
          comprobante_id = CASE WHEN $4::int IS NOT NULL THEN $4::int ELSE comprobante_id END,
          actualizado_en = NOW()
      WHERE id = $2 AND empresa_id = $3
      RETURNING *
      `,
      [estado, id, empresa_id, comprobanteConciliado]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: "Movimiento no encontrado" });
    }

    await registrarAuditoria({
      req,
      empresaId: empresa_id,
      modulo: "Conciliacion bancaria",
      accion: estado === "conciliado" ? "Marcar conciliado" : "Reabrir movimiento",
      detalle: `Movimiento bancario ${id} actualizado a ${estado}.`,
      tablaAfectada: "conciliacion_bancaria_movimientos",
      registroId: id,
      datos: resultado.rows[0],
    });

    res.json({ movimiento: resultado.rows[0] });
  } catch (error) {
    console.error("Error al actualizar conciliacion bancaria:", error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Error al actualizar conciliacion bancaria",
    });
  }
}

module.exports = {
  listarMovimientos,
  importarCartola,
  actualizarEstado,
};
