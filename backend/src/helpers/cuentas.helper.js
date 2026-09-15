function crearErrorValidacion(mensaje) {
  const error = new Error(mensaje);
  error.statusCode = 400;
  return error;
}

async function validarCuentaOperativa(
  client,
  { empresaId, cuentaId, etiqueta = "cuenta contable" }
) {
  const id = Number(cuentaId || 0);

  if (!id) return null;

  const cuentaResult = await client.query(
    `
    SELECT id, codigo, nombre, activo
    FROM plan_cuentas
    WHERE id = $1
      AND empresa_id = $2
    LIMIT 1
    `,
    [id, empresaId]
  );

  if (cuentaResult.rows.length === 0) {
    throw crearErrorValidacion(`La ${etiqueta} seleccionada no existe para esta empresa.`);
  }

  const cuenta = cuentaResult.rows[0];

  if (cuenta.activo === false) {
    throw crearErrorValidacion(
      `La cuenta ${cuenta.codigo} - ${cuenta.nombre} esta inactiva y no puede usarse para contabilizar.`
    );
  }

  const codigo = String(cuenta.codigo || "").trim();

  if (codigo) {
    const hijosResult = await client.query(
      `
      SELECT 1
      FROM plan_cuentas hija
      WHERE hija.empresa_id = $1
        AND hija.id <> $2
        AND COALESCE(hija.activo, true) = true
        AND hija.codigo LIKE $3 || '%'
        AND LENGTH(hija.codigo) > LENGTH($3)
      LIMIT 1
      `,
      [empresaId, id, codigo]
    );

    if (hijosResult.rows.length > 0) {
      throw crearErrorValidacion(
        `La cuenta ${cuenta.codigo} - ${cuenta.nombre} es de agrupacion. Selecciona una cuenta imputable.`
      );
    }
  }

  return cuenta;
}

module.exports = {
  validarCuentaOperativa,
};
