# Entornos

Actualizado: 2026-09-18.

El objetivo es que quien usa la plataforma hoy siga trabajando sin interrupción,
mientras la versión nueva se revisa por separado. Son dos mundos que no se
tocan: base de datos distinta, API distinta, frontend distinto.

## Producción — la que usan los clientes

| Pieza | Dónde |
|---|---|
| Aplicación | `app.servcontablepro.cl` (Cloudflare Pages, proyecto `servcontablepro`) |
| Landing | `servcontablepro.cl` y `www` (proyecto `servcontablepro-web`) |
| Demo | `demo.servcontablepro.cl` (proyecto `ervcontablepro-demo`) |
| API | `api.servcontablepro.cl` (Render `servcontablepro-api`, plan Starter) |
| Base | Render `servcontablepro-db`, base `servcontable_pro` |
| Código | rama `main` de `contacto983/servcontable-pro` |

Nada de lo que se hace en la versión nueva llega acá hasta que se apruebe
explícitamente un despliegue. Producción se despliega solo desde `main`.

## Versión nueva — la que se está construyendo

| Pieza | Dónde |
|---|---|
| Aplicación | `servcontablepro-nueva.pages.dev` (Cloudflare Pages, carga directa) |
| API | `servcontablepro-api-staging.onrender.com` (Render, plan gratuito) |
| Base | Render, misma instancia, base `servcontable_staging` |
| Código | rama `staging` de `chavastian/servcontable-erp`, autodespliegue de la API |

## Página de acceso

`servcontablepro-acceso.pages.dev` presenta las dos versiones con un botón cada
una. El código está en `deploy/acceso/index.html` y se publica con:

```bash
npx wrangler pages deploy deploy/acceso --project-name=servcontablepro-acceso --branch=main
```

### Acceso de revisión a la versión nueva

Usuario `revision@servcontablepro.cl`, contraseña `RevisionNueva2026`, con
acceso a las 15 empresas de la copia. Existe solo en `servcontable_staging`.

### Cómo se publica la versión nueva

La API se despliega sola al empujar a la rama `staging`. El frontend se compila
a mano porque el proyecto de Pages es de carga directa:

```bash
cd frontend
VITE_API_URL=https://servcontablepro-api-staging.onrender.com/api npx vite build
npx wrangler pages deploy dist --project-name=servcontablepro-nueva --branch=staging
```

La API usa la **cadena interna** de Render para la base. La externa exige TLS y
la migración durante el despliegue falla con `SSL/TLS required`.

El plan gratuito apaga el servicio tras 15 minutos sin uso, así que la primera
visita tarda hasta un minuto. Pasar a Starter son 7 dólares al mes.

`servcontable_staging` es una copia completa de producción: mismo esquema con
las migraciones nuevas aplicadas, y los 2756 registros restaurados desde el
respaldo y verificados uno a uno.

También existe `servcontable_test`, que se crea y destruye para probar que las
migraciones corren sobre una base vacía.

### Seguridad del entorno nuevo

Tiene copia de datos reales, así que por diseño no puede:

- **Enviar correos.** No se configuran `SMTP_*`, y el ayudante de correo
  responde que el correo no está habilitado en lugar de enviar. Ningún cliente
  recibe avisos desde el entorno de pruebas.
- **Cobrar.** No se configuran `FLOW_API_KEY` ni `FLOW_SECRET_KEY`, y el
  controlador de pagos falla con un mensaje claro antes de contactar a Flow.
- Usa su propio `JWT_SECRET`, así que una sesión de un entorno no sirve en el otro.

## Cómo se prueba antes de tocar producción

```bash
cd backend
npm run migrate        # migraciones sobre la base de pruebas
npm run smoke          # carga los 101 módulos: detecta referencias rotas
npm run smoke:api      # levanta la API y recorre 39 endpoints con datos reales
```

`smoke:api` se niega a correr contra una base cuyo nombre no contenga `test` o
`staging`, porque crea un usuario de prueba.

## Respaldo y vuelta atrás

```bash
cd backend
npm run respaldo                                    # a respaldos/
node scripts/restaurar.js <archivo.sql> --vaciar    # a la base de pruebas
```

Ver `database/README.md`. Render mantiene además recuperación punto en el
tiempo de la base de producción.

Si un despliegue a producción saliera mal:

1. Revertir el servicio a la versión anterior desde el panel de Render.
2. Las migraciones aplicadas son aditivas: agregan índices y restricciones
   únicas, no borran ni transforman datos. Revertirlas es `npm run migrate:down`.
3. Si hiciera falta volver a los datos previos, restaurar el respaldo.
