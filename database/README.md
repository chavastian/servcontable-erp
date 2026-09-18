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
