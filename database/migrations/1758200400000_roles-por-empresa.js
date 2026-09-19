/**
 * Normaliza los roles por empresa y los deja verificados por la base.
 *
 * `usuarios_empresas.rol_empresa` guardaba texto libre: en producción hay
 * `admin` y `usuario`, pero nada impedía escribir cualquier otra cosa, y un
 * valor inesperado caía silenciosamente en el permiso más bajo o más alto según
 * la comparación que tocara.
 *
 * Se traducen los valores existentes a los cinco roles del modelo y se agrega
 * una restricción para que no vuelva a entrar nada distinto.
 *
 * El primer usuario de cada empresa queda como OWNER: es quien la creó y alguien
 * tiene que poder desactivarla.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // 1. Traducir lo que ya existe.
  pgm.sql(`
    UPDATE usuarios_empresas
    SET rol_empresa = CASE LOWER(TRIM(COALESCE(rol_empresa, '')))
      WHEN 'owner'         THEN 'OWNER'
      WHEN 'dueno'         THEN 'OWNER'
      WHEN 'admin'         THEN 'ADMIN'
      WHEN 'administrador' THEN 'ADMIN'
      WHEN 'contador'      THEN 'CONTADOR'
      WHEN 'accountant'    THEN 'CONTADOR'
      WHEN 'editor'        THEN 'EDITOR'
      WHEN 'usuario'       THEN 'EDITOR'
      WHEN 'user'          THEN 'EDITOR'
      WHEN 'consulta'      THEN 'CONSULTA'
      WHEN 'viewer'        THEN 'CONSULTA'
      WHEN 'lectura'       THEN 'CONSULTA'
      ELSE 'CONSULTA'
    END
    WHERE rol_empresa IS NULL
       OR rol_empresa <> UPPER(TRIM(rol_empresa))
       OR UPPER(TRIM(rol_empresa)) NOT IN ('OWNER','ADMIN','CONTADOR','EDITOR','CONSULTA')
  `);

  // 2. El miembro más antiguo de cada empresa que hoy es ADMIN pasa a OWNER.
  //    Sin dueño, nadie podría desactivar la empresa.
  pgm.sql(`
    WITH primeros AS (
      SELECT DISTINCT ON (empresa_id) id
      FROM usuarios_empresas
      WHERE activo = true AND rol_empresa = 'ADMIN'
      ORDER BY empresa_id, creado_en ASC, id ASC
    )
    UPDATE usuarios_empresas
    SET rol_empresa = 'OWNER'
    WHERE id IN (SELECT id FROM primeros)
  `);

  // 3. Que la base rechace cualquier otro valor.
  pgm.sql(`
    ALTER TABLE usuarios_empresas
    DROP CONSTRAINT IF EXISTS usuarios_empresas_rol_valido
  `);

  pgm.sql(`
    ALTER TABLE usuarios_empresas
    ADD CONSTRAINT usuarios_empresas_rol_valido
    CHECK (rol_empresa IN ('OWNER','ADMIN','CONTADOR','EDITOR','CONSULTA'))
  `);

  pgm.sql(`
    ALTER TABLE usuarios_empresas
    ALTER COLUMN rol_empresa SET DEFAULT 'CONSULTA'
  `);

  // El rol se consulta en cada operación que escribe.
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_rol
    ON usuarios_empresas (usuario_id, empresa_id, rol_empresa)
    WHERE activo = true
  `);
};

exports.down = (pgm) => {
  pgm.sql("DROP INDEX IF EXISTS idx_usuarios_empresas_rol");
  pgm.sql(`
    ALTER TABLE usuarios_empresas
    DROP CONSTRAINT IF EXISTS usuarios_empresas_rol_valido
  `);
  pgm.sql(`
    ALTER TABLE usuarios_empresas
    ALTER COLUMN rol_empresa SET DEFAULT 'usuario'
  `);
  pgm.sql(`
    UPDATE usuarios_empresas
    SET rol_empresa = CASE rol_empresa
      WHEN 'OWNER' THEN 'admin'
      WHEN 'ADMIN' THEN 'admin'
      ELSE 'usuario'
    END
  `);
};
