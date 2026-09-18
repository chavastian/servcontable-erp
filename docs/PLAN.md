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

### Fase 1 — Base de datos reproducible
- `pg_dump --schema-only` de producción → `database/schema.sql` versionado.
- Migraciones con `node-pg-migrate`; mover todo DDL de runtime a migraciones; `npm run migrate`.
- Índices compuestos `(empresa_id, fecha)`, `(empresa_id, periodo)`, `(comprobante_id)`, único `(empresa_id, tipo, numero)`.
- `docs/DATABASE_SCHEMA.md`.

### Fase 2 — Aislamiento entre empresas y privilegios
- Middleware de tenant que resuelva `empresa_id` después de multer y valide membresía y rol por operación.
- Corregir C1, C2, C3, C4, C5, C9.
- Helper `assertPerteneceAEmpresa(tabla, id, empresaId)` para FKs.
- Tests automáticos de aislamiento: usuario de empresa A contra cada endpoint con datos de empresa B.

### Fase 3 — Seguridad backend
- Rate limiting (login, registro, trial, contacto, checkout, recuperación), helmet, validación por endpoint (zod), handler de errores central, límites y filtro de uploads, `npm audit fix`, contraseñas mínimas coherentes, bootstrap de superadmin solo por variable de entorno, proteger `/contratacion/:id`, JWT más corto con renovación, `trust proxy` explícito.

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
