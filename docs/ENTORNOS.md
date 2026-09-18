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
| Base | Render, misma instancia, base `servcontable_staging` |
| Código | rama `staging` de `chavastian/servcontable-erp` |
| API | pendiente: Render no tiene acceso al repositorio de trabajo |
| Frontend | pendiente, depende de la API |

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
