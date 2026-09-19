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
   migraciones aplicadas hasta ahora son aditivas y el código anterior funciona
   con ellas, porque agregan columnas e índices y no quitan nada.

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
