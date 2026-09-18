const pool = require("../database/db");
const { registrarAuditoria } = require("../helpers/auditoria.helper");

function esTrue(valor) {
  const texto = String(valor || "").trim().toLowerCase();
  return texto === "1" || texto === "true" || texto === "si";
}

async function crearCuenta(req, res) {
  try {
    const {
      empresa_id,
      codigo,
      nombre,
      tipo,
      clasificacion,
      naturaleza,
      nivel,
    } = req.body;

    if (!empresa_id || !codigo || !nombre || !tipo || !naturaleza) {
      return res.status(400).json({
        error: "Empresa, codigo, nombre, tipo y naturaleza son obligatorios",
      });
    }

    const nuevaCuenta = await pool.query(
      `
      INSERT INTO plan_cuentas
      (empresa_id, codigo, nombre, tipo, clasificacion, naturaleza, nivel)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        empresa_id,
        codigo,
        nombre,
        tipo,
        clasificacion || "",
        naturaleza,
        Number(nivel || 1),
      ]
    );

    await registrarAuditoria({
      req,
      empresaId: Number(empresa_id),
      modulo: "Plan de cuentas",
      accion: "Crear cuenta",
      detalle: `${codigo} - ${nombre}`,
      tablaAfectada: "plan_cuentas",
      registroId: Number(nuevaCuenta.rows[0].id),
      datos: {
        tipo,
        clasificacion: clasificacion || "",
        naturaleza,
      },
    });

    return res.status(201).json({
      mensaje: "Cuenta creada correctamente",
      cuenta: nuevaCuenta.rows[0],
    });
  } catch (error) {
    console.error("Error al crear cuenta:", error);

    if (error.code === "23505") {
      return res.status(400).json({
        error: "Ya existe una cuenta con ese codigo para esta empresa",
      });
    }

    return res.status(500).json({
      error: "Error interno al crear cuenta",
    });
  }
}

async function listarCuentas(req, res) {
  try {
    const {
      empresa_id,
      incluir_inactivas,
      buscar,
      q,
      tipos,
      solo_imputables,
      solo_operativas,
      limit,
    } = req.query;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    const incluirInactivas = esTrue(incluir_inactivas);
    const busqueda = String(q || buscar || "").trim();
    const tiposFiltro = String(tipos || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const filtrarImputables =
      esTrue(solo_imputables) || esTrue(solo_operativas);

    let query = `
      SELECT pc.*
      FROM plan_cuentas pc
      WHERE pc.empresa_id = $1
    `;

    const valores = [empresa_id];

    if (!incluirInactivas) {
      query += " AND COALESCE(pc.activo, true) = true";
    }

    if (tiposFiltro.length > 0) {
      valores.push(tiposFiltro);
      query += ` AND pc.tipo = ANY($${valores.length}::text[])`;
    }

    let ordenBusqueda = "";
    if (busqueda) {
      const busquedaLower = busqueda.toLowerCase();

      valores.push(`%${busquedaLower}%`);
      const indiceContiene = valores.length;
      query += ` AND (
        LOWER(COALESCE(pc.codigo, '')) LIKE $${indiceContiene}
        OR LOWER(COALESCE(pc.nombre, '')) LIKE $${indiceContiene}
      )`;

      valores.push(busquedaLower);
      const indiceExacto = valores.length;
      valores.push(`${busquedaLower}%`);
      const indiceInicio = valores.length;

      ordenBusqueda = `
        CASE
          WHEN LOWER(COALESCE(pc.codigo, '')) = $${indiceExacto} THEN 0
          WHEN LOWER(COALESCE(pc.codigo, '')) LIKE $${indiceInicio} THEN 1
          WHEN LOWER(COALESCE(pc.nombre, '')) LIKE $${indiceInicio} THEN 2
          WHEN LOWER(COALESCE(pc.nombre, '')) LIKE $${indiceContiene} THEN 3
          ELSE 4
        END,
      `;
    }

    if (filtrarImputables) {
      query += `
        AND NOT EXISTS (
          SELECT 1
          FROM plan_cuentas hija
          WHERE hija.empresa_id = pc.empresa_id
            AND hija.id <> pc.id
            AND COALESCE(hija.activo, true) = true
            AND hija.codigo LIKE pc.codigo || '%'
            AND LENGTH(hija.codigo) > LENGTH(pc.codigo)
          LIMIT 1
        )
      `;
    }

    query += ` ORDER BY ${ordenBusqueda} COALESCE(pc.activo, true) DESC, pc.codigo ASC`;

    const limite = Math.min(Math.max(Number(limit || 0), 0), 200);
    if (limite > 0) {
      valores.push(limite);
      query += ` LIMIT $${valores.length}`;
    }

    const resultado = await pool.query(query, valores);

    return res.json({
      total: resultado.rows.length,
      cuentas: resultado.rows,
    });
  } catch (error) {
    console.error("Error al listar cuentas:", error);

    return res.status(500).json({
      error: "Error interno al listar cuentas",
    });
  }
}

async function actualizarCuenta(req, res) {
  try {
    const { id } = req.params;
    const {
      empresa_id,
      codigo,
      nombre,
      tipo,
      clasificacion,
      naturaleza,
      nivel,
    } = req.body;

    if (!id || !empresa_id) {
      return res.status(400).json({
        error: "Debe indicar id y empresa_id",
      });
    }

    if (!codigo || !nombre || !tipo) {
      return res.status(400).json({
        error: "Debe ingresar codigo, nombre y tipo de cuenta",
      });
    }

    const existe = await pool.query(
      `
      SELECT id
      FROM plan_cuentas
      WHERE empresa_id = $1
        AND codigo = $2
        AND id <> $3
      LIMIT 1
      `,
      [empresa_id, codigo, id]
    );

    if (existe.rows.length > 0) {
      return res.status(400).json({
        error: "Ya existe otra cuenta con ese codigo en esta empresa",
      });
    }

    const resultado = await pool.query(
      `
      UPDATE plan_cuentas
      SET
        codigo = $1,
        nombre = $2,
        tipo = $3,
        clasificacion = $4,
        naturaleza = $5,
        nivel = $6
      WHERE id = $7
        AND empresa_id = $8
      RETURNING *
      `,
      [
        codigo,
        nombre,
        tipo,
        clasificacion || "",
        naturaleza || "Deudora",
        Number(nivel || 1),
        id,
        empresa_id,
      ]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        error: "Cuenta no encontrada",
      });
    }

    await registrarAuditoria({
      req,
      empresaId: Number(empresa_id),
      modulo: "Plan de cuentas",
      accion: "Editar cuenta",
      detalle: `${codigo} - ${nombre}`,
      tablaAfectada: "plan_cuentas",
      registroId: Number(id),
      datos: {
        tipo,
        clasificacion: clasificacion || "",
        naturaleza: naturaleza || "Deudora",
        nivel: Number(nivel || 1),
      },
    });

    return res.json({
      mensaje: "Cuenta actualizada correctamente",
      cuenta: resultado.rows[0],
    });
  } catch (error) {
    console.error("Error al actualizar cuenta:", error);

    return res.status(error.statusCode || 500).json({
      // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
      // columnas y restricciones. Los errores de validacion propios
      // si conservan su mensaje y su codigo.
      error: error.statusCode ? error.message : "Error interno al actualizar cuenta",
    });
  }
}

async function cambiarEstadoCuenta(req, res) {
  try {
    const { id } = req.params;
    const { empresa_id, activo } = req.body;

    if (!id || !empresa_id) {
      return res.status(400).json({
        error: "Debe indicar id y empresa_id",
      });
    }

    const nuevoEstado = Boolean(activo);

    const resultado = await pool.query(
      `
      UPDATE plan_cuentas
      SET activo = $1
      WHERE id = $2
        AND empresa_id = $3
      RETURNING *
      `,
      [nuevoEstado, id, empresa_id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        error: "Cuenta no encontrada",
      });
    }

    const cuenta = resultado.rows[0];

    await registrarAuditoria({
      req,
      empresaId: Number(empresa_id),
      modulo: "Plan de cuentas",
      accion: nuevoEstado ? "Habilitar cuenta" : "Desactivar cuenta",
      detalle: `${cuenta.codigo} - ${cuenta.nombre}`,
      tablaAfectada: "plan_cuentas",
      registroId: Number(id),
      datos: { activo: nuevoEstado },
    });

    return res.json({
      mensaje: nuevoEstado
        ? "Cuenta habilitada correctamente"
        : "Cuenta desactivada correctamente",
      cuenta,
    });
  } catch (error) {
    console.error("Error al cambiar estado cuenta:", error);

    return res.status(error.statusCode || 500).json({
      // El mensaje de PostgreSQL no vuelve al cliente: revela tablas,
      // columnas y restricciones. Los errores de validacion propios
      // si conservan su mensaje y su codigo.
      error: error.statusCode ? error.message : "Error interno al cambiar estado cuenta",
    });
  }
}

async function cargarPlanBase(req, res) {
  try {
    const { empresa_id } = req.body;

    if (!empresa_id) {
      return res.status(400).json({
        error: "Debe indicar empresa_id",
      });
    }

    const cuentasBase = [
      ["1", "ACTIVO", "Activo", "Activo", "Deudora", 1],
      ["1.1", "ACTIVO CORRIENTE", "Activo", "Activo Corriente", "Deudora", 2],
      ["1.1.01", "Caja", "Activo", "Disponible", "Deudora", 3],
      ["1.1.02", "Banco", "Activo", "Disponible", "Deudora", 3],
      ["1.1.03", "Clientes", "Activo", "Cuentas por cobrar", "Deudora", 3],
      ["1.1.04", "IVA Credito Fiscal", "Activo", "Impuestos por recuperar", "Deudora", 3],
      ["1.1.05", "PPM", "Activo", "Impuestos por recuperar", "Deudora", 3],
      ["1.1.06", "Remanente IVA Credito Fiscal", "Activo", "Impuestos por recuperar", "Deudora", 3],
      ["2", "PASIVO", "Pasivo", "Pasivo", "Acreedora", 1],
      ["2.1", "PASIVO CORRIENTE", "Pasivo", "Pasivo Corriente", "Acreedora", 2],
      ["2.1.01", "Proveedores", "Pasivo", "Cuentas por pagar", "Acreedora", 3],
      ["2.1.02", "IVA Debito Fiscal", "Pasivo", "Impuestos por pagar", "Acreedora", 3],
      ["2.1.03", "IVA por Pagar", "Pasivo", "Impuestos por pagar", "Acreedora", 3],
      ["2.1.04", "Impuesto Unico Trabajadores", "Pasivo", "Retenciones por pagar", "Acreedora", 3],
      ["2.1.05", "Leyes Sociales por Pagar", "Pasivo", "Remuneraciones", "Acreedora", 3],
      ["2.1.06", "Prestamo Socio a Empresa", "Pasivo", "Cuentas relacionadas", "Acreedora", 3],
      ["3", "PATRIMONIO", "Patrimonio", "Patrimonio", "Acreedora", 1],
      ["3.1", "Capital", "Patrimonio", "Capital", "Acreedora", 2],
      ["3.2", "Utilidades Acumuladas", "Patrimonio", "Resultados acumulados", "Acreedora", 2],
      ["3.3", "Resultado del Ejercicio", "Patrimonio", "Resultado", "Acreedora", 2],
      ["3.4", "Retiros de Socios", "Patrimonio", "Retiros", "Deudora", 2],
      ["4", "INGRESOS", "Ingreso", "Ingresos", "Acreedora", 1],
      ["4.1", "Ventas Netas", "Ingreso", "Ventas", "Acreedora", 2],
      ["4.2", "Ingresos por Servicios", "Ingreso", "Servicios", "Acreedora", 2],
      ["4.3", "Otros Ingresos", "Ingreso", "Otros ingresos", "Acreedora", 2],
      ["5", "COSTOS", "Costo", "Costos", "Deudora", 1],
      ["5.1", "Costo de Ventas", "Costo", "Costo directo", "Deudora", 2],
      ["5.2", "Compras Netas", "Costo", "Compras", "Deudora", 2],
      ["6", "GASTOS", "Gasto", "Gastos", "Deudora", 1],
      ["6.1", "Remuneraciones", "Gasto", "Gastos de personal", "Deudora", 2],
      ["6.2", "Honorarios", "Gasto", "Servicios externos", "Deudora", 2],
      ["6.3", "Arriendos", "Gasto", "Gastos generales", "Deudora", 2],
      ["6.4", "Gastos Generales", "Gasto", "Gastos generales", "Deudora", 2],
      ["6.5", "Servicios Basicos", "Gasto", "Gastos generales", "Deudora", 2],
      ["6.6", "Gastos Bancarios", "Gasto", "Gastos financieros", "Deudora", 2],
      ["6.7", "Depreciacion", "Gasto", "Depreciacion", "Deudora", 2],
    ];

    let insertadas = 0;
    let omitidas = 0;

    for (const cuenta of cuentasBase) {
      const [codigo, nombre, tipo, clasificacion, naturaleza, nivel] = cuenta;

      try {
        await pool.query(
          `
          INSERT INTO plan_cuentas
          (empresa_id, codigo, nombre, tipo, clasificacion, naturaleza, nivel)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          `,
          [empresa_id, codigo, nombre, tipo, clasificacion, naturaleza, nivel]
        );

        insertadas++;
      } catch (error) {
        if (error.code === "23505") {
          omitidas++;
        } else {
          throw error;
        }
      }
    }

    await registrarAuditoria({
      req,
      empresaId: Number(empresa_id),
      modulo: "Plan de cuentas",
      accion: "Cargar plan base",
      detalle: `Insertadas: ${insertadas}, omitidas: ${omitidas}`,
      tablaAfectada: "plan_cuentas",
      registroId: null,
      datos: { insertadas, omitidas },
    });

    return res.json({
      mensaje: "Plan base cargado correctamente",
      insertadas,
      omitidas,
    });
  } catch (error) {
    console.error("Error al cargar plan base:", error);

    return res.status(500).json({
      error: "Error interno al cargar plan base",
    });
  }
}

module.exports = {
  crearCuenta,
  listarCuentas,
  actualizarCuenta,
  cambiarEstadoCuenta,
  cargarPlanBase,
};
