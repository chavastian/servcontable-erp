/**
 * Calendario de obligaciones, por empresa o para todas las del usuario.
 *
 * Las fechas son de referencia y así se informan. Ver el aviso del helper.
 */

const pool = require("../database/db");
const { obtenerEmpresasPermitidas } = require("../helpers/auth.helper");
const { obligacionesDelPeriodo, sumarMes } = require("../helpers/calendarioTributario.helper");

function siNoViene(valor, porDefecto) {
  if (valor === undefined || valor === null || valor === "") return porDefecto;

  return String(valor).toLowerCase() === "true";
}

function periodoAnterior() {
  // Las obligaciones de un mes se declaran al mes siguiente, así que el período
  // que interesa hoy casi siempre es el cerrado, no el que va corriendo.
  return sumarMes(new Date().toISOString().slice(0, 7), -1);
}

async function obtenerCalendario(req, res) {
  try {
    const periodo = String(req.query.periodo || periodoAnterior());

    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      return res.status(400).json({ error: "El periodo debe tener el formato AAAA-MM" });
    }

    const opciones = {
      facturadorElectronico: siNoViene(req.query.facturador_electronico, true),
      previredElectronico: siNoViene(req.query.previred_electronico, true),
    };

    const calendario = obligacionesDelPeriodo(periodo, opciones);

    // Sin empresa, el calendario es el mismo para todas: se responde una vez y
    // se listan las empresas a las que aplica.
    if (!req.query.empresa_id) {
      const empresas = await obtenerEmpresasPermitidas(pool, req.usuario);

      return res.json({
        ...calendario,
        alcance: "todas_las_empresas",
        empresas: empresas.map((e) => ({
          empresa_id: Number(e.id),
          rut: e.rut,
          razon_social: e.razon_social,
        })),
      });
    }

    return res.json({
      ...calendario,
      alcance: "empresa",
      empresa_id: Number(req.query.empresa_id),
    });
  } catch (error) {
    console.error("Error al obtener el calendario tributario:", error);

    return res.status(500).json({ error: "Error interno al obtener el calendario" });
  }
}

module.exports = { obtenerCalendario };
