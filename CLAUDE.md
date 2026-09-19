# ServContable PRO

Sistema contable y de remuneraciones chileno. Frontend React 19 con Vite, API
Node/Express 5, PostgreSQL 18. Producción en Render, frontend en Cloudflare
Pages. No usa Firebase.

## Antes de tocar nada

- `docs/PLAN.md` es el estado real del trabajo, por fases.
- `docs/AUDIT-2026-09.md` es la auditoría de la que salió ese plan. Los
  hallazgos van numerados (C1, A4, etc.) y el plan dice cuáles están cerrados.
- `docs/ENTORNOS.md` explica qué es producción y qué es la versión en revisión.
  **Producción tiene clientes trabajando.**
- `docs/DESPLIEGUE.md` es la lista de pasos antes de desplegar. No es opcional.
- `docs/RESPALDOS.md` y `docs/DATABASE_SCHEMA.md` para base de datos.

## Reglas que este proyecto ya aprendió

Cada una está aquí porque se rompió antes.

**La base de datos se cambia solo con migraciones.** `database/migrations/`. El
backend no ejecuta DDL: hasta septiembre de 2026 creaba tablas y columnas en
cada petición autenticada, y una instalación limpia no arrancaba.

**Toda consulta filtra por `empresa_id`, y toda clave foránea se valida contra
la empresa.** Filtrar la consulta principal no alcanza: un `cuenta_id` de otra
empresa mezcla los saldos de dos clientes con la empresa correcta en el `WHERE`.

**En las rutas que reciben archivos, la empresa se valida después de multer.**
Antes de multer `req.body` está vacío, así que cualquier comprobación de
membresía se salta en silencio.

**Nada de `DELETE` físico en tablas contables.** Estados, reversas y auditoría.
La auditoría es de solo agregado: un disparador rechaza `UPDATE` y `DELETE`.

**El mensaje de PostgreSQL no vuelve al cliente.** Revela tablas, columnas y
restricciones. El manejador central traduce los códigos conocidos.

**Las fechas se comparan en UTC.** Mezclar medianoche local con medianoche UTC
daba un día de diferencia en Chile: las suscripciones quedaban vigentes un día
extra y los avisos salían desfasados.

**Un pago activa una sola vez.** Flow avisa por el webhook y por el retorno del
navegador a la vez. La activación va en una transacción con la fila bloqueada.

**Nada tributario se inventa.** Lo que requiera criterio contable se marca
`REQUIERE VALIDACIÓN CONTABLE/TRIBUTARIA` en el código y en el plan.

**Sin secretos en Git.** Ni claves, ni cadenas de conexión, ni respaldos.

## Cómo verificar un cambio

Siempre contra `servcontable_staging`, nunca contra producción.

```bash
cd backend
DATABASE_URL=<staging> npm run smoke      # carga los 116 modulos
DATABASE_URL=<staging> npm run smoke:api  # 39 endpoints con datos reales
DATABASE_URL=<staging> npm test           # bateria completa
```

Las pruebas se niegan a correr contra una base cuyo nombre no contenga `test` o
`staging`, porque crean y borran datos.

Para el frontend: `cd frontend && npx vite build` y `npx eslint src`.

## Convenciones del código

- Español en nombres, comentarios y mensajes al usuario. El módulo de
  suscripciones está en inglés porque su esquema nació así; se respeta.
- Sin TypeScript. CommonJS en el backend, módulos de ES en el frontend.
- Identidad visual: tokens `--sc-*` y clases `sc-*`. No se rediseña.
- Los comentarios explican **por qué**, no qué. Si algo parece raro, lo más
  probable es que ahí hubo un error y el comentario lo cuenta.

## Dónde está cada cosa

```
backend/src/
  middleware/     autenticación, empresa y permisos, subidas, errores, validación
  helpers/        lógica compartida: suscripciones, cobranza, roles, comprobantes
  controllers/    40 controladores con SQL directo
  routes/         41 routers
backend/scripts/  respaldo, restauración, esquema, pruebas de humo
backend/test/     pruebas con node:test, contra base real
database/         schema.sql y migrations/
frontend/src/     pages, components, services, utils
deploy/acceso/    página con un botón por versión
docs/             plan, auditoría, entornos, despliegue, respaldos, esquema
```

## Lo que falta

`docs/PLAN.md` lo mantiene al día. A la fecha: unificar montos a enteros en
pesos, proveedores y clientes como entidades propias, adjuntos por documento, y
programar el respaldo automático. Los dos últimos necesitan una decisión de
costo.
