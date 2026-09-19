/**
 * Compatibilidad entre el esquema nuevo y el código que hoy corre en producción.
 *
 * `docs/DESPLIEGUE.md` dice que primero va la base y después el código, y que eso
 * es seguro porque las migraciones son aditivas. Al revisar las 15 pendientes una
 * por una —el paso 4 de esa lista— apareció el único lugar donde no lo es.
 *
 * El bloque 2 pone una restricción en `comprobantes.estado` que admite solo
 * 'vigente' y 'anulado', y convierte los 'eliminado' que venían de un flujo
 * anterior. Pero el código que está en producción, al eliminar una liquidación ya
 * contabilizada, escribe justamente `estado = 'eliminado'`
 * (`liquidaciones.controller.js`, rama de `estaContabilizada`). Entre aplicar las
 * migraciones y desplegar el código nuevo, ese borrado le fallaría a un cliente
 * real que está haciendo remuneraciones.
 *
 * El código nuevo escribe 'anulado' en ese mismo lugar: es la misma intención con
 * otra palabra. Así que este disparador traduce, y no inventa nada: convierte el
 * valor viejo en el nuevo antes de que la restricción lo vea.
 *
 * Es un puente, no una pieza permanente. Con el código nuevo desplegado nunca se
 * activa, porque nadie vuelve a escribir 'eliminado'. Se puede quitar revirtiendo
 * esta migración una vez que producción corra la versión nueva.
 */

exports.shorthands = undefined;

exports.up = async (pgm) => {
  await pgm.db.query(`
    CREATE OR REPLACE FUNCTION traducir_estado_eliminado_comprobante()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Un comprobante que no está vigente está anulado: mismo tratamiento en
      -- libros e informes. 'eliminado' era la palabra del flujo anterior.
      IF NEW.estado = 'eliminado' THEN
        NEW.estado := 'anulado';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  // BEFORE, para alcanzar a cambiar el valor antes de que se compruebe la
  // restricción. En INSERT y en UPDATE, porque el código viejo hace las dos.
  await pgm.db.query(
    `DROP TRIGGER IF EXISTS trg_traducir_estado_eliminado ON comprobantes`
  );
  await pgm.db.query(`
    CREATE TRIGGER trg_traducir_estado_eliminado
      BEFORE INSERT OR UPDATE OF estado ON comprobantes
      FOR EACH ROW EXECUTE FUNCTION traducir_estado_eliminado_comprobante()
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TRIGGER IF EXISTS trg_traducir_estado_eliminado ON comprobantes`);
  pgm.sql(`DROP FUNCTION IF EXISTS traducir_estado_eliminado_comprobante()`);
};
