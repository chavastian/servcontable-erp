# Migraciones

Toda modificación del esquema de la base de datos vive acá. No se ejecuta DDL
en tiempo de ejecución desde los controladores.

## Uso

```bash
npm run migrate            # aplica las migraciones pendientes
npm run migrate:down       # revierte la última
npm run migrate:create -- nombre-de-la-migracion
npm run migrate:status     # lista aplicadas y pendientes
```

Requiere `DATABASE_URL` en el entorno (o en `backend/.env`).

## Reglas

- Una migración ya aplicada en producción nunca se edita: se corrige con una nueva.
- Migraciones idempotentes donde sea posible (`IF NOT EXISTS`, `IF EXISTS`).
- Nada de `DROP TABLE` ni `DELETE` de datos contables sin aprobación explícita.
- `database/schema.sql` es la foto del esquema, no el mecanismo de cambio.
  Se regenera con `npm run schema:dump` después de aplicar migraciones.

## Respaldos

```bash
cd backend
node scripts/respaldo.js                       # respaldo de DATABASE_URL a respaldos/
node scripts/restaurar.js <archivo.sql> --vaciar
```

`respaldo.js` escribe dos archivos: el `.sql` con esquema y datos, y un
`.manifest.json` con el número de filas y una huella MD5 por tabla.
`restaurar.js` compara contra ese manifiesto y falla si algo no coincide: un
respaldo que no se puede verificar no sirve de nada.

Detalles que importan:

- Cada `INSERT` ocupa exactamente una línea, incluso con textos que traen
  saltos de línea. Así el archivo se vuelve a leer sin interpretar SQL.
- Las fechas y horas se leen como texto crudo. El driver `pg` convierte
  `timestamp without time zone` a un `Date` en la zona de la máquina, y al
  volver a escribirlo desplazaba cada marca de tiempo 4 horas.
- `restaurar.js` se niega a correr contra una base cuyo nombre no contenga
  `test` o `staging`, salvo que se pase `--forzar`.
- La carpeta `respaldos/` está fuera de Git: contiene datos reales de clientes.

Render mantiene además recuperación punto en el tiempo de la base de
producción. Su API de exportación manual devuelve error 500, así que el
respaldo propio es el mecanismo explícito.
