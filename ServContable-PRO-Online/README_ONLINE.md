# ServContable PRO - Version online

Esta guia explica como publicar esta version del sistema como aplicacion web online.

## Arquitectura

- Frontend: React/Vite, carpeta `frontend/dist` despues de compilar.
- Backend/API: Node.js + Express, carpeta `backend`.
- Base de datos: PostgreSQL en servidor o servicio administrado.
- HTTPS: Nginx, Apache, IIS, proxy del hosting o balanceador.

## Modalidades de publicacion

### Opcion A: un solo dominio

Ejemplo:

```text
https://app.tu-dominio.cl
https://app.tu-dominio.cl/api
```

En esta modalidad el backend publica tambien el frontend compilado. Es la forma mas simple.

Backend `.env`:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
TRUST_PROXY=true
SERVE_FRONTEND=true
FRONTEND_DIST=../frontend/dist
DATABASE_URL=postgresql://usuario:password@host:5432/servcontable_pro
DATABASE_SSL=false
JWT_SECRET=cambiar_por_una_clave_segura_de_minimo_32_caracteres
ADMIN_NOMBRE=Administrador ServContable
ADMIN_EMAIL=admin@tu-dominio.cl
ADMIN_PASSWORD=cambiar_esta_clave_inicial
ALLOW_PUBLIC_REGISTRATION=false
CORS_ORIGIN=https://app.tu-dominio.cl
FRONTEND_URL=https://app.tu-dominio.cl
PASSWORD_RESET_URL_BASE=https://app.tu-dominio.cl
```

Frontend `.env` antes de compilar:

```env
VITE_API_URL=/api
VITE_ALLOW_PUBLIC_REGISTRATION=false
VITE_DEMO_MODE=false
```

### Opcion B: frontend y API separados

Ejemplo:

```text
https://app.tu-dominio.cl
https://api.tu-dominio.cl/api
```

Backend `.env`:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
TRUST_PROXY=true
SERVE_FRONTEND=false
DATABASE_URL=postgresql://usuario:password@host:5432/servcontable_pro
DATABASE_SSL=false
JWT_SECRET=cambiar_por_una_clave_segura_de_minimo_32_caracteres
ADMIN_NOMBRE=Administrador ServContable
ADMIN_EMAIL=admin@tu-dominio.cl
ADMIN_PASSWORD=cambiar_esta_clave_inicial
ALLOW_PUBLIC_REGISTRATION=false
CORS_ORIGIN=https://app.tu-dominio.cl
FRONTEND_URL=https://app.tu-dominio.cl
PASSWORD_RESET_URL_BASE=https://app.tu-dominio.cl
```

Frontend `.env` antes de compilar:

```env
VITE_API_URL=https://api.tu-dominio.cl/api
VITE_ALLOW_PUBLIC_REGISTRATION=false
VITE_DEMO_MODE=false
```

## Crear paquete online

Desde la raiz del proyecto:

```powershell
npm run package:online
```

Esto genera:

```text
online-dist
ServContable-PRO-Online.zip
```

El ZIP incluye backend, frontend compilado, esquema de base de datos si existe y guias. No incluye `node_modules`, `.env` real ni respaldos privados.

## Instalar en servidor desde el ZIP

Descomprimir `ServContable-PRO-Online.zip` en el servidor. El ZIP ya contiene `frontend/dist`.

```powershell
cd backend
copy .env.online.example .env
npm install --omit=dev
npm start
```

Antes de iniciar, editar `backend/.env` con:

- `DATABASE_URL` real.
- `JWT_SECRET` seguro.
- `ADMIN_EMAIL` y `ADMIN_PASSWORD`.
- `CORS_ORIGIN` con el dominio final.
- `SERVE_FRONTEND=true` si se usara un solo dominio.

## Base de datos

Crear una base PostgreSQL limpia:

```sql
CREATE DATABASE servcontable_pro;
```

Aplicar el esquema del proyecto si corresponde:

```powershell
psql -U usuario -d servcontable_pro -f database/schema.sql
```

Si se migra desde otra instalacion, primero generar respaldo y restaurarlo en el servidor. No usar datos de otro cliente.

## Seguridad

- Activar HTTPS.
- Mantener `ALLOW_PUBLIC_REGISTRATION=false`.
- No subir ni entregar archivos `.env` reales.
- No exponer PostgreSQL directamente a internet.
- Configurar respaldos automaticos diarios.
- Usar claves diferentes para cada instalacion.

## Actualizaciones online

1. Respaldar PostgreSQL.
2. Subir nueva version de backend/frontend.
3. Ejecutar `npm install` si cambiaron dependencias.
4. Compilar frontend si corresponde.
5. Reiniciar backend.
6. Probar login, empresas, comprobantes, remuneraciones, PDF e importadores.

Actualizar archivos de aplicacion no borra la base de datos. Si una version futura requiere cambios de tablas, aplicarlos mediante script/migracion controlada.
