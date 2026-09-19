# Despliegue

Actualizado: 2026-09-19.

Dos entornos que no se tocan entre sí. El detalle de qué es cada uno está en
`docs/ENTORNOS.md`.

## Antes de tocar producción

Esta lista existe porque producción tiene clientes trabajando. Ninguno de los
pasos es opcional.

1. **Respaldo verificado.** No basta con tomarlo: hay que restaurarlo.

   ```bash
   cd backend
   ORIGEN_DATABASE_URL=<produccion> node scripts/probar-restauracion.js
   ```

   Toma el respaldo, crea una base descartable, aplica las migraciones,
   restaura, compara tabla por tabla contra el manifiesto, levanta la API sobre
   esa base, recorre los endpoints y borra la base de prueba. Si algo no
   coincide, termina con error y dice qué falló.

2. **Todas las pruebas en verde contra staging.**

   ```bash
   cd backend
   DATABASE_URL=<staging> npm run smoke
   DATABASE_URL=<staging> npm run smoke:api
   DATABASE_URL=<staging> npm test
   ```

3. **Revisar la versión nueva a ojo** en `servcontablepro-nueva.pages.dev`, con
   los datos copiados de producción.

4. **Leer las migraciones pendientes** una por una. Una migración aditiva es
   segura; una que transforma datos hay que entenderla antes de aplicarla.

   ```bash
   cd backend
   DATABASE_URL=<produccion> npm run migrate:status
   ```

   `migrate:status` **solo lee**. Hasta el 19-09-2026 era
   `node-pg-migrate --dry-run up`, y eso no era seguro: `--dry-run` evita
   ejecutar las sentencias que una migración **encola** con `pgm.sql()`, pero no
   las que corre de inmediato con `pgm.db.query()`, y las migraciones de este
   proyecto usan mucho la segunda forma. Un `migrate:status` contra producción
   llegó hasta el bloque 6 y falló ahí, dentro de la transacción. No dejó nada
   aplicado, porque `--single-transaction` viene activado y revirtió todo, pero
   escribió. Ahora apunta a `scripts/estado-migraciones.js`, que hace `SELECT` y
   nada más, y además dice si alguna pieza del esquema quedó a medias.

   **Revisión del 19-09-2026, hecha:** de los 16 archivos de `database/migrations`
   el primero es la línea base, que describe el esquema que producción ya tiene.
   Quedan **15 pendientes**. Se leyeron todas y se comparó cada escritura de
   `estado` del código que hoy corre en producción (commit `4a7a44b` de
   `contacto983/servcontable-pro`) contra las restricciones nuevas. Aparecieron dos
   cosas que conviene tener presentes:

   - **Un choque real, ya corregido.** El bloque 2 admite en
     `comprobantes.estado` solo 'vigente' y 'anulado'. El código de producción, al
     eliminar una liquidación ya contabilizada, escribe 'eliminado'
     (`liquidaciones.controller.js`, rama de `estaContabilizada`). Entre migrar y
     desplegar, ese borrado le habría fallado a un cliente haciendo
     remuneraciones. La migración `1758201600000_bloque13-compatibilidad-estado-eliminado`
     traduce el valor viejo al nuevo con un disparador, que nunca se activa una vez
     desplegado el código nuevo. **Es la única de las 15 que no se puede omitir si
     la base se migra antes que el código.**
   - **El código de producción todavía ejecuta DDL en caliente** (16 archivos con
     `CREATE TABLE` o `ALTER TABLE` dentro de peticiones). Es lo que esta revisión
     eliminó. Contra un esquema ya migrado no es predecible: conviene no dejar
     producción mucho tiempo con la base nueva y el código viejo.

   Por eso, en este despliegue, el paso 1 y el paso 2 de «Desplegar» van seguidos,
   sin días de por medio.

## Desplegar

El orden importa: primero la base, después el código que la usa.

```bash
# 1. Migraciones
cd backend
DATABASE_URL=<produccion> npm run migrate

# 2. Codigo: empujar a main del repositorio de produccion
git push upstream main
```

Render y Cloudflare despliegan solos desde `main` de
`contacto983/servcontable-pro`. El servicio queda en línea sin caída: Render
levanta la versión nueva antes de bajar la anterior.

## Después de desplegar

```bash
curl https://api.servcontablepro.cl/api/salud
```

Responde `200` con `estado: "sano"` y la última migración aplicada. Si algo
esencial falta, responde `503`, que es lo que un vigilante de disponibilidad
puede detectar sin interpretar el contenido.

Después: entrar a `app.servcontablepro.cl`, iniciar sesión, abrir un libro y
comprobar que las cifras son las esperadas.

## Si algo sale mal

En orden, del menos al más invasivo:

1. **Volver a la versión anterior del código.** En el panel de Render, en
   Deploys, `Rollback` al despliegue previo. La base queda como está: las
   migraciones agregan tablas, columnas e índices y no quitan nada, así que el
   código anterior sigue funcionando sobre ellas. Con una salvedad, encontrada el
   19-09-2026: el único punto donde el código viejo escribía un valor que el
   esquema nuevo ya no admite (`comprobantes.estado = 'eliminado'`) está cubierto
   por el disparador de
   `1758201600000_bloque13-compatibilidad-estado-eliminado`. **No revertir esa
   migración mientras producción pueda volver al código anterior.**

2. **Revertir la última migración**, solo si el problema es del esquema.

   ```bash
   cd backend
   DATABASE_URL=<produccion> npm run migrate:down
   ```

   La migración base se niega a revertirse a propósito: eliminaría el esquema
   completo.

3. **Restaurar el respaldo.** Es el último recurso y pierde lo que los clientes
   hayan escrito desde que se tomó.

   ```bash
   cd backend
   DATABASE_URL=<produccion> node scripts/restaurar.js <archivo.sql> --vaciar --forzar
   ```

   `--forzar` es obligatorio contra producción justamente para que no ocurra por
   descuido.

Render mantiene además recuperación punto en el tiempo, que permite volver a un
instante concreto sin depender de estos archivos.

## Variables de entorno de producción

El servicio no arranca sin las obligatorias: `backend/src/config/env.js` las
verifica y falla con la lista de las que faltan.

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Base de datos. Dentro de Render, la cadena **interna**: la externa exige TLS y la migración durante el despliegue falla. |
| `JWT_SECRET` | Firma de las sesiones. Mínimo 32 caracteres. Cambiarlo cierra todas las sesiones abiertas. |
| `CORS_ORIGIN` | Dominios que pueden llamar a la API, separados por coma. |
| `NODE_ENV` | `production`. |
| `TRUST_PROXY` | `1`. Confía en un solo salto: confiar en toda la cadena permitiría falsear la IP y burlar los límites de intentos. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Correo. Sin esto no se envían avisos de cobranza ni recuperaciones de contraseña, y el sistema lo informa en lugar de fallar. |
| `FLOW_API_KEY`, `FLOW_SECRET_KEY`, `FLOW_API_BASE`, `FLOW_RETURN_URL`, `FLOW_CONFIRMATION_URL` | Pagos. Sin esto el cobro falla con un mensaje claro antes de contactar a Flow. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Crean o actualizan el administrador del sistema al arrancar. Es la única vía: el registro público ya no puede crear un superadministrador. |
| `COBRANZA_AUTOMATICA` | `false` apaga el proceso diario de avisos. En el entorno de pruebas va apagado. |
| `PASSWORD_RESET_URL_BASE` | Base de los enlaces de recuperación e invitación. |
| `UPLOAD_MAX_MB` | Tamaño máximo de un archivo importado. Por defecto 10. |

## Lo que nunca va a Git

`.gitignore` ya las excluye, pero conviene tenerlo presente:

- `backend/.env` y cualquier variante.
- `respaldos/`, que contiene datos reales de clientes.
- Cadenas de conexión y claves, en cualquier archivo.

Verificado el 2026-09-18: no hay ninguna credencial en el árbol ni en el
historial completo del repositorio.
