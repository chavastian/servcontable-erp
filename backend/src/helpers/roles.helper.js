/**
 * Roles dentro de una empresa y qué puede hacer cada uno.
 *
 * Hasta ahora `usuarios_empresas.rol_empresa` solo servía para decidir quién
 * administra usuarios. Para la contabilidad no se usaba en ninguna parte: quien
 * tenía acceso a una empresa podía crear asientos, anular documentos y cerrar
 * ejercicios por igual. Un estudio contable que da acceso a un asistente para
 * que solo consulte no podía hacerlo.
 *
 * Los cinco roles, de más a menos:
 *
 *   OWNER       el dueño de la cuenta. Todo, incluida la empresa misma.
 *   ADMIN       todo lo operativo, y administra los usuarios de la empresa.
 *   CONTADOR    toda la contabilidad, incluido cerrar y reabrir ejercicios.
 *   EDITOR      registra y corrige documentos y asientos. No cierra ni anula.
 *   CONSULTA    solo lectura. Ve libros, balances e informes.
 *
 * Los valores heredados (`admin`, `administrador`, `usuario`) se traducen al
 * leerlos, así que nada se rompe con lo que ya existe en la base.
 */

const ROLES = Object.freeze({
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  CONTADOR: "CONTADOR",
  EDITOR: "EDITOR",
  CONSULTA: "CONSULTA",
});

// Jerarquía: un rol incluye lo que pueden los de abajo.
const ORDEN = [ROLES.CONSULTA, ROLES.EDITOR, ROLES.CONTADOR, ROLES.ADMIN, ROLES.OWNER];

// Traducción de lo que ya está guardado.
const EQUIVALENCIAS = new Map([
  ["owner", ROLES.OWNER],
  ["dueno", ROLES.OWNER],
  ["dueño", ROLES.OWNER],
  ["admin", ROLES.ADMIN],
  ["administrador", ROLES.ADMIN],
  ["contador", ROLES.CONTADOR],
  ["accountant", ROLES.CONTADOR],
  ["editor", ROLES.EDITOR],
  ["usuario", ROLES.EDITOR],
  ["user", ROLES.EDITOR],
  ["consulta", ROLES.CONSULTA],
  ["viewer", ROLES.CONSULTA],
  ["lectura", ROLES.CONSULTA],
]);

/**
 * Permisos, agrupados por lo que significan para el negocio.
 *
 * Se declara el rol mínimo que los tiene. Así agregar un permiso no obliga a
 * repasar los cinco roles.
 */
const PERMISOS = Object.freeze({
  // Lectura de libros, balances, informes y documentos.
  VER: ROLES.CONSULTA,
  // Exportar a Excel o PDF lo que ya se puede ver.
  EXPORTAR: ROLES.CONSULTA,
  // Registrar y corregir documentos y asientos.
  REGISTRAR: ROLES.EDITOR,
  // Importar libros del SII y cartolas.
  IMPORTAR: ROLES.EDITOR,
  // Anular un documento o un asiento vigente.
  ANULAR: ROLES.CONTADOR,
  // Cerrar y reabrir un ejercicio contable.
  CERRAR_EJERCICIO: ROLES.CONTADOR,
  // Cambiar el plan de cuentas y la configuración contable.
  CONFIGURAR: ROLES.CONTADOR,
  // Remuneraciones: liquidaciones, finiquitos, Previred.
  REMUNERACIONES: ROLES.CONTADOR,
  // Invitar, quitar y cambiar el rol de los usuarios de la empresa.
  ADMINISTRAR_USUARIOS: ROLES.ADMIN,
  // Editar los datos de la empresa.
  EDITAR_EMPRESA: ROLES.ADMIN,
  // Desactivar la empresa.
  DESACTIVAR_EMPRESA: ROLES.OWNER,
});

function normalizarRolEmpresa(valor) {
  const texto = String(valor ?? "").trim().toLowerCase();

  if (!texto) {
    return ROLES.CONSULTA;
  }

  const directo = texto.toUpperCase();

  if (Object.values(ROLES).includes(directo)) {
    return directo;
  }

  return EQUIVALENCIAS.get(texto) || ROLES.CONSULTA;
}

function nivel(rol) {
  return ORDEN.indexOf(normalizarRolEmpresa(rol));
}

/**
 * Decide si un rol alcanza para un permiso.
 */
function rolTienePermiso(rol, permiso) {
  const minimo = PERMISOS[permiso];

  if (!minimo) {
    // Un permiso que no existe no se concede: es un error de programación y
    // conceder por defecto sería la peor forma de descubrirlo.
    return false;
  }

  return nivel(rol) >= nivel(minimo);
}

/**
 * Lista los permisos de un rol, para que el frontend pueda esconder lo que la
 * persona no va a poder hacer. La decisión real la toma el backend.
 */
function permisosDelRol(rol) {
  return Object.keys(PERMISOS).filter((permiso) => rolTienePermiso(rol, permiso));
}

function descripcionRol(rol) {
  const descripciones = {
    [ROLES.OWNER]: "Dueño de la cuenta. Puede todo, incluido desactivar la empresa.",
    [ROLES.ADMIN]: "Administra la empresa y sus usuarios, y hace todo lo operativo.",
    [ROLES.CONTADOR]: "Toda la contabilidad y las remuneraciones. Cierra ejercicios y anula.",
    [ROLES.EDITOR]: "Registra y corrige documentos y asientos. No cierra ejercicios ni anula.",
    [ROLES.CONSULTA]: "Solo consulta: libros, balances e informes.",
  };

  return descripciones[normalizarRolEmpresa(rol)] || "";
}

module.exports = {
  ROLES,
  ORDEN,
  PERMISOS,
  normalizarRolEmpresa,
  rolTienePermiso,
  permisosDelRol,
  descripcionRol,
  nivel,
};
