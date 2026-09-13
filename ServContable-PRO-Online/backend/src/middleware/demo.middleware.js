const pool = require("../database/db");

const CODIGO_RESTRINGIDO = "DEMO_RESTRINGIDO";
const CODIGO_LIMITE = "DEMO_LIMITE";

function esUsuarioDemo(req) {
  return req.usuario?.demo === true;
}

function numeroPositivo(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function obtenerEmpresaIdRequest(req) {
  return numeroPositivo(
    req.body?.empresa_id ||
      req.body?.empresaId ||
      req.query?.empresa_id ||
      req.query?.empresaId ||
      req.params?.empresa_id ||
      req.params?.empresaId
  );
}

function mensajeDemo(detalle) {
  return `${detalle} Para continuar sin limites, contrata ServContable PRO.`;
}

function bloquearDemo(detalle = "Esta accion no esta disponible en la version demo.") {
  return (req, res, next) => {
    if (!esUsuarioDemo(req)) return next();

    return res.status(403).json({
      codigo: CODIGO_RESTRINGIDO,
      error: mensajeDemo(`Demo limitada: ${detalle}`),
    });
  };
}

function limitarEmpresasDemo(limite = 1) {
  return async (req, res, next) => {
    if (!esUsuarioDemo(req)) return next();

    try {
      const resultado = await pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM usuarios_empresas ue
        INNER JOIN empresas e ON e.id = ue.empresa_id
        WHERE ue.usuario_id = $1
          AND ue.activo = true
          AND e.activa = true
          AND NOT (
            UPPER(COALESCE(e.rut, '')) LIKE 'DEMO-%'
            OR e.razon_social ILIKE 'Empresa demo %'
            OR e.razon_social ILIKE 'EMPRESA DEMO SERVCONTABLE%'
          )
        `,
        [req.usuario.id]
      );

      if (Number(resultado.rows[0]?.total || 0) >= limite) {
        return res.status(403).json({
          codigo: CODIGO_LIMITE,
          error: mensajeDemo(
            `Demo limitada: puedes crear hasta ${limite} empresa de prueba.`
          ),
        });
      }

      return next();
    } catch (error) {
      console.error("Error al validar limite demo de empresas:", error);
      return res.status(500).json({
        error: "Error interno al validar limites de demo",
      });
    }
  };
}

function limitarCreacionDemoPorEmpresa({
  modulo,
  tabla,
  limite,
  condicion = "1 = 1",
  campoEmpresa = "empresa_id",
}) {
  return async (req, res, next) => {
    if (!esUsuarioDemo(req)) return next();

    const empresaId = obtenerEmpresaIdRequest(req);

    if (!empresaId) {
      return next();
    }

    try {
      const resultado = await pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM ${tabla}
        WHERE ${campoEmpresa} = $1
          AND ${condicion}
        `,
        [empresaId]
      );

      if (Number(resultado.rows[0]?.total || 0) >= Number(limite)) {
        return res.status(403).json({
          codigo: CODIGO_LIMITE,
          error: mensajeDemo(
            `Demo limitada: puedes crear hasta ${limite} ${modulo}.`
          ),
        });
      }

      return next();
    } catch (error) {
      console.error(`Error al validar limite demo de ${modulo}:`, error);
      return res.status(500).json({
        error: "Error interno al validar limites de demo",
      });
    }
  };
}

module.exports = {
  bloquearDemo,
  limitarEmpresasDemo,
  limitarCreacionDemoPorEmpresa,
};
