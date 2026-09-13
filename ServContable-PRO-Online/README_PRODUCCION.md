# ServContable PRO - Guia de publicacion

Esta guia es para entregar el sistema a un informatico y publicarlo en una pagina web.

Para la modalidad online actualizada, revisar tambien `README_ONLINE.md`. Esa guia incluye la opcion de publicar en un solo dominio, frontend/API separados y el comando para generar `ServContable-PRO-Online.zip`.

## Carpetas principales

- `frontend`: aplicacion web React/Vite. Se compila y se publica el contenido de `frontend/dist`.
- `backend`: API Node/Express. Se ejecuta como servicio en el servidor.
- `backend/database`: scripts y estructura de base de datos si aplica.
- `backend/uploads`: archivos cargados por usuarios. En produccion debe respaldarse.
- `README_DEMO.md`: instrucciones para levantar una version demo separada.

No entregar ni publicar:

- `node_modules`
- archivos `.env` reales
- respaldos de base de datos con datos sensibles sin autorizacion
- claves, passwords o tokens en texto plano

## Requisitos del servidor

- Node.js 20 o superior
- PostgreSQL
- Nginx, Apache o servicio equivalente para HTTPS y proxy
- Dominio para frontend, por ejemplo `https://app.tu-dominio.cl`
- Dominio o subdominio para API, por ejemplo `https://api.tu-dominio.cl`

## Variables de entorno

Crear estos archivos en produccion usando los ejemplos:

- `backend/.env.example` -> copiar como `backend/.env`
- `frontend/.env.example` -> copiar como `frontend/.env`

Ejemplo backend:

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://usuario:password@host:5432/servcontable_pro
DATABASE_SSL=false
JWT_SECRET=cambiar_por_una_clave_segura_de_minimo_32_caracteres
ADMIN_NOMBRE=Administrador ServContable
ADMIN_EMAIL=admin@tu-dominio.cl
ADMIN_PASSWORD=cambiar_esta_clave_inicial
ALLOW_PUBLIC_REGISTRATION=false
CORS_ORIGIN=https://app.tu-dominio.cl
FLOW_ENV=production
FLOW_API_BASE=https://www.flow.cl/api
FLOW_API_KEY=tu_api_key_flow
FLOW_SECRET_KEY=tu_secret_key_flow
PUBLIC_BASE_URL=https://www.servcontablepro.cl
BACKEND_PUBLIC_URL=https://api.servcontablepro.cl
FLOW_CONFIRMATION_URL=https://api.servcontablepro.cl/api/pagos-flow/webhook
FLOW_RETURN_URL=https://api.servcontablepro.cl/api/pagos-flow/retorno
```

Ejemplo frontend:

```env
VITE_API_URL=https://api.tu-dominio.cl/api
VITE_ALLOW_PUBLIC_REGISTRATION=false
```

Importante: `JWT_SECRET` debe ser privado y no debe repetirse entre clientes.

## Usuarios y acceso comercial

El sistema queda preparado para operar con dos niveles de acceso:

- `superadmin`: administrador general de ServContable. Puede ver todas las empresas, crear empresas y crear usuarios.
- `admin_cliente`: administrador de un cliente. Puede administrar usuarios de las empresas que tenga asignadas.
- `usuario_cliente`: usuario operativo del cliente. Solo ve las empresas asignadas.

Flujo recomendado para vender el sistema:

1. Configurar `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `ADMIN_NOMBRE` en `backend/.env`.
2. Iniciar el backend. El sistema crea o actualiza ese usuario como administrador general.
3. Ingresar con ese correo y clave en la pantalla de login.
4. Crear el acceso del cliente desde `Configuracion > Usuarios y accesos`.
5. Si la empresa ya existe, asignarla al usuario y definir su permiso: `Usuario` o `Administrador`.
6. Si la empresa aun no existe, crear el usuario sin empresa inicial.
7. El cliente ingresa con su correo y clave temporal, crea sus empresas y queda automaticamente como administrador de las empresas que registre.

Para venta, mantener:

```env
ALLOW_PUBLIC_REGISTRATION=false
VITE_ALLOW_PUBLIC_REGISTRATION=false
```

Con esto no existe registro libre desde internet. Cada cliente debe ser habilitado por el administrador.

## Instalacion

Desde la carpeta raiz del proyecto:

```powershell
npm run install:all
```

Si el servidor no usa el `package.json` raiz, instalar por separado:

```powershell
cd backend
npm install
cd ..\frontend
npm install
```

## Base de datos

Crear la base:

```sql
CREATE DATABASE servcontable_pro;
```

Restaurar respaldo si se entrega un dump:

```powershell
psql -U usuario -d servcontable_pro -f respaldo.sql
```

Antes de vender o instalar en un cliente nuevo, usar una base limpia o un respaldo sin datos de otro cliente.

Al iniciar el backend se crea automaticamente la tabla `usuarios_empresas`, usada para asignar empresas a cada usuario.

## Compilar frontend

```powershell
npm run build
```

Publicar en el hosting el contenido generado en:

```text
frontend/dist
```

## Ejecutar backend

En produccion se recomienda usar PM2 o servicio de Windows/Linux.

Con Node directo:

```powershell
cd backend
npm start
```

Con PM2:

```powershell
pm2 start src/server.js --name servcontable-api
pm2 save
```

## Proxy recomendado

El frontend debe quedar por HTTPS.
El backend tambien debe quedar por HTTPS, idealmente detras de Nginx/Apache.

Ejemplo de rutas:

- Frontend: `https://app.tu-dominio.cl`
- Backend/API: `https://api.tu-dominio.cl/api`

## Checklist antes de vender

- Cambiar `JWT_SECRET`.
- Configurar `ADMIN_EMAIL` y `ADMIN_PASSWORD`.
- Mantener `ALLOW_PUBLIC_REGISTRATION=false`.
- Configurar `CORS_ORIGIN` con el dominio real del frontend.
- Configurar `VITE_API_URL` con el dominio real del backend.
- Configurar `FLOW_API_KEY` y `FLOW_SECRET_KEY` con las credenciales privadas de Flow.
- Configurar en Flow la URL de confirmacion `https://api.servcontablepro.cl/api/pagos-flow/webhook` y la URL de retorno `https://api.servcontablepro.cl/api/pagos-flow/retorno`.
- Confirmar que `backend/.env` no se sube a repositorios ni se envia a clientes.
- Activar HTTPS.
- Configurar respaldos automaticos de PostgreSQL.
- Probar login del administrador general.
- Probar creacion de empresa por administrador.
- Probar creacion de empresa por cliente y que quede asignada automaticamente a ese cliente.
- Probar creacion de usuario cliente sin empresa inicial.
- Probar que el cliente solo vea empresas propias o asignadas.
- Probar cambio de empresa, modulo contable, remuneraciones, PDF y Previred.
- Probar que los datos de un ano cerrado no aparezcan en otro ano.
- Cargar plan de cuentas base y parametros iniciales.

## Respaldo diario sugerido

```powershell
pg_dump -U usuario -d servcontable_pro -F c -f respaldo_servcontable_YYYYMMDD.dump
```

Mantener respaldos fuera del servidor principal.

## Notas comerciales

Para venderlo como producto, se recomienda definir:

- Contrato de soporte y mantencion.
- Politica de respaldo y recuperacion.
- Terminos de uso y tratamiento de datos.
- Version demo sin datos reales.
- Procedimiento de instalacion por cliente.

## Version demo

La demo debe publicarse con base de datos separada. Revisar `README_DEMO.md`.

Resumen:

- Backend demo con `DEMO_MODE=true`.
- Frontend demo compilado con `npm run build:demo`.
- Mantener `ALLOW_PUBLIC_REGISTRATION=false`.
- No usar datos reales de clientes en la demo.

