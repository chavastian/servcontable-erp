# Plan de trabajo — ServContable PRO hacia SaaS comercial

Actualizado: 2026-09-18. Base: `docs/AUDIT-2026-09.md`.

## Principios

- Preservar → corregir → reforzar → optimizar → escalar. No reescribir, no cambiar framework ni base de datos.
- Mantener la identidad visual (`--sc-*`, componentes `sc-*`).
- Seguridad en backend, nunca solo en la UI. Toda consulta filtra por `empresa_id`; toda FK se valida contra la empresa.
- Sin `DELETE` físico en tablas contables; estados, reversas y auditoría.
- Nada tributario se inventa: se marca `REQUIERE VALIDACIÓN CONTABLE/TRIBUTARIA`.
- Sin secretos en Git. Sin servicios pagos nuevos sin aprobación.

## Infraestructura

Verificado el 2026-09-18 vía API de GitHub, Render y Cloudflare.

- Código: `github.com/chavastian/servcontable-erp` (`origin`, trabajo y PRs). `github.com/contacto983/servcontable-pro` (`upstream`; su `main` despliega producción en Render y Cloudflare). Las versiones aprobadas se empujan a ambos.
- Render (Oregon): `servcontablepro-api` (Starter, `rootDir: backend`, `npm install` / `npm start`, autodeploy desde `upstream/main`), `servcontablepro-db` (Basic-256mb, PostgreSQL 18, sin HA). Point-in-time recovery disponible desde 2026-09-15; sin exports manuales. Red de la base abierta a `0.0.0.0/0` (pendiente cerrar). Staging pendiente de decisión.
- Cloudflare Pages (cuenta `30c0847bb32483c33851997d6689e0ed`), los tres proyectos construyen desde `upstream/main` con previews en cualquier rama:
  - `servcontablepro-web` → `servcontablepro.cl`, `www.servcontablepro.cl`. Landing estática desde la raíz del repo (sin comando de build).
  - `servcontablepro` → `app.servcontablepro.cl`. `frontend/`, `npm run build`, `VITE_API_URL=https://api.servcontablepro.cl/api`, registro público desactivado.
  - `ervcontablepro-demo` → `demo.servcontablepro.cl`. `frontend/`, `npm run build:demo`, `VITE_DEMO_MODE=true`.
  - API pública en `api.servcontablepro.cl` (Render).
- Dominios `servcontablepro.cl` y `servcontable.cl` tienen correos y cuentas en uso: no se tocan registros DNS de correo ni cuentas. El token de Cloudflare solo tiene permiso sobre Pages.
- Firebase: decisión 2026-09-18. Render se mantiene como hosting de API y base de datos. Firebase solo para autenticación y similares (MFA, login con Google) o lo que no sea posible en Render. Se creará un proyecto de Firebase nuevo bajo la misma cuenta de los proyectos Kryva, nunca reutilizar los existentes.

## Fases

### Fase 0 — Sincronizar y proteger
- [x] Repositorio nuevo con historial completo.
- [x] Limpieza: ZIP, copia `ServContable-PRO-Online/`, `.wrangler/` fuera de Git.
- [x] `docs/AUDIT-2026-09.md`, `docs/PLAN.md`.
- [x] Credenciales de Render y Cloudflare en variables de entorno de usuario (no en el repo).
- [ ] Cerrar red de la base de datos en Render (solo IP del administrador). Hoy: `0.0.0.0/0`.
- [x] Verificar respaldos en Render: PITR disponible desde 2026-09-15, sin exports. Falta programar export periódico y prueba de restauración (Fase 8).
- [ ] Staging en Render (se mantiene Render, decidido 2026-09-18).
- [ ] `CLAUDE.md` y skills de Claude Code.

### Fase 1 — Base de datos reproducible  ✅ 2026-09-18
- [x] `database/schema.sql` versionado, generado por introspección de producción (37 tablas, 76 claves foráneas). Verificado: construye el esquema completo desde una base vacía.
- [x] `backend/scripts/dump-schema.js` para regenerarlo (`npm run schema:dump`).
- [x] Migraciones con `node-pg-migrate`: base idempotente + índices e integridad. `npm run migrate`.
- [x] 40 índices nuevos, entre ellos `comprobante_detalle(comprobante_id)`, que no existía y era recorrido completo en cada libro.
- [x] Únicos nuevos: RUT de empresa normalizado, orden de Flow, pago por proveedor y transacción, aviso por usuario/evento/día. El único `(empresa_id, tipo, numero)` de comprobantes ya existía.
- [x] DDL en tiempo de ejecución eliminado: 16 funciones y ~50 llamadas, 693 líneas. `validarAccesoSuscripcion` disparaba 6 sentencias DDL en cada petición autenticada.
- [x] `docs/DATABASE_SCHEMA.md`.
- [x] Base `servcontable_test` en la misma instancia de Render para validar migraciones.
- [ ] Aplicar las migraciones a producción (requiere aprobación: es el primer cambio en la base).

### Fase 2 — Aislamiento entre empresas y privilegios  ✅ 2026-09-18
- [x] `middleware/tenant.middleware.js`: resuelve y valida la empresa **después** de multer, normaliza el valor sobre la petición y ofrece `exigirRolEmpresa`.
- [x] **C1** Importaciones: la autenticación corría antes de multer, así que el cuerpo estaba vacío, la membresía no se comprobaba y el controlador confiaba en el `empresa_id` del formulario. Cualquier usuario podía importar a la empresa de otro cliente. Corregido en las cuatro rutas de importación.
- [x] **C2** `GET /api/comprobantes/:id` leía solo por id. Ahora el acceso se decide por la membresía del usuario, porque el frontend no envía la empresa.
- [x] **C3** Un `admin_cliente` podía resetear la contraseña del superadministrador y quedarse con el sistema. Nuevo `puedeAdministrarUsuarioObjetivo`, aplicado en cambio de estado, reseteo de contraseña y actualización de usuario.
- [x] **C4** `insertarDetallesComprobante` valida que toda cuenta imputada pertenezca a la empresa del comprobante. La empresa se lee del propio comprobante, así que ninguna de las siete rutas que llaman puede omitirlo. Pagos y cobros rechazan un documento de otra empresa en lugar de guardar la referencia cruzada.
- [x] **C5** Resuelto en la Fase 1: el `UPDATE` global sin empresa vivía dentro del DDL en tiempo de ejecución.
- [x] **C9** El plan de cuentas ya no se borra físicamente. «Reemplazar» desactiva lo que no está en el plan base y conserva los asientos.
- [x] `helpers/empresa.helper.js` con `exigirDeEmpresa` y `exigirTodosDeEmpresa`.
- [x] Adelantado de la Fase 3: **A5** subidas con límite de 10 MB, un archivo, tipos permitidos y errores claros en lugar de 500.
- [x] Corregido de paso: un `empresa_id` no numérico se convertía en `NaN`, que es falso, y saltaba la comprobación de membresía completa.
- [x] `test/aislamiento.test.js`: 12 pruebas, dos empresas con un usuario cada una. Todas pasan.

### Fase 3 — Seguridad backend  ✅ 2026-09-18
- [x] Limitación de intentos por IP y correo: login (10 cada 15 min), recuperación (5 por hora), registro y prueba gratis (5 por hora), contacto (10 por hora), pagos (20 cada 15 min), importaciones (30 cada 10 min), y un techo general de 300 por minuto.
- [x] `helmet` con política de contenido solo cuando el backend sirve el frontend, y HSTS solo en producción.
- [x] Manejador central de errores: los mensajes de PostgreSQL ya no llegan al cliente. Traduce los códigos conocidos a 400, 409, 413 y 504 con texto entendible.
- [x] **A17** El primer usuario registrado ya no se vuelve superadministrador. El administrador inicial se crea solo desde `ADMIN_EMAIL` y `ADMIN_PASSWORD` al arrancar.
- [x] **A7** `/contratacion/:id` exige el token de la orden de Flow y ya no devuelve el nombre. Antes se podían recorrer los identificadores consecutivos y sacar nombre, correo, empresa y monto de cada persona que inició una compra.
- [x] **A4** Token de 4 horas en lugar de 8, con `POST /api/auth/renovar-sesion`, y versión de sesión por usuario: cambiar la contraseña o desactivar la cuenta invalida al instante los tokens ya emitidos.
- [x] **A3** `trust proxy` explícito en un salto: confiar en toda la cadena permitiría falsear la IP y burlar los límites.
- [x] **A6** `npm audit` en cero. `csv-parse` a la 7 y `nodemailer` a la 10, ambos cambios de versión mayor, respaldados por 10 pruebas nuevas del análisis de los libros del SII.
- [x] Contraseña mínima coherente en un solo lugar: antes solo la validaba el reseteo por administrador, así que el registro público, la prueba gratis y el reseteo por correo aceptaban una sola letra.
- [x] Límite de 1 MB al cuerpo JSON.
- [ ] Validación por esquema con `zod` en cada endpoint. `zod` ya está instalado; se aplica junto con la Fase 4, donde se tocan los mismos controladores.

### Fase 4 — Integridad contable
- Contador de numeración por empresa y tipo con bloqueo.
- Bloqueo de período cerrado en todos los write paths.
- Reversas en lugar de anulación en cascada; conservar vínculo documento-asiento.
- Línea de exento en asientos automáticos; signo de notas de crédito (REQUIERE VALIDACIÓN CONTABLE/TRIBUTARIA).
- Importaciones idempotentes con savepoints y clave natural (empresa, tipo SII, folio, RUT).
- Enteros para CLP; `createdBy/updatedBy`; auditoría append-only.

### Fase 5 — Suscripciones, cobranza y bloqueo
Diseño sobre lo existente (`subscriptions`, `subscription_settings`, middleware 402):
- Estados: `TRIAL` → `ACTIVE` → `PAST_DUE` (gracia `grace_days`, acceso operativo) → `EXPIRED` (bloqueo, solo pantalla de renovación) → `SUSPENDED`/`CANCELLED` (admin). Trials sin gracia salvo configuración.
- Proceso diario en el propio servicio (Starter siempre encendido): transiciona por fecha, encola y envía avisos, registra en `subscription_history` y `subscription_notifications` con deduplicación por (usuario, tipo, fecha).
- Avisos por correo según `expiry_notice_days` (10, 5, 2, 0), al entrar en gracia, al bloquear, al reactivar, al iniciar trial y como recibo de pago. Plantillas sin HTML inyectable.
- Frontend: banner de días restantes y gracia; manejo global del `402` que lleva a la pantalla de renovación a mitad de sesión.
- Flow: activación idempotente (transacción + único por `flow_order`), registro en `subscription_payments`, ruta de alta para cliente nuevo que paga desde la web, `usuarios.activo=true` al reactivar.
- Superadmin: listado con estado y vencimiento, historial de avisos, acciones existentes; validación de entradas.

### Fase 6 — Frontend
- `VITE_API_URL` por entorno, estados de carga, vacío y error, validaciones, responsive, accesibilidad básica. Sin rediseño.

### Fase 7 — Multiempresa comercial
- Roles OWNER/ADMIN/ACCOUNTANT/EDITOR/VIEWER por empresa, invitaciones por correo, proveedores y clientes como entidades, adjuntos (Cloudflare R2 u otro con capa gratuita).

### Fase 8 — Operación
- Respaldos verificados con prueba de restauración en staging; monitoreo de disponibilidad; health check; checklist de deploy; `README`, `ARCHITECTURE`, `SECURITY`, `DEPLOYMENT`, `BACKUP_STRATEGY`, `COST_MODEL`, `CHANGELOG`.

### Fase 9 — Lanzamiento
- Términos de uso y política de datos, flujo de contratación probado de punta a punta, onboarding, soporte.

## Flujo de trabajo

- Ramas `feat/*`, `fix/*`, `security/*`, `chore/*` → PR a `main` de `chavastian/servcontable-erp` → revisión → merge.
- Release: `git push upstream main` solo con aprobación explícita (despliega producción).
- Commits pequeños con prefijo convencional.
