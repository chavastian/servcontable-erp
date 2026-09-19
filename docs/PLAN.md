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
- [x] Entorno paralelo en línea (2026-09-18): API `servcontablepro-api-staging.onrender.com` en plan gratuito, aplicación `servcontablepro-nueva.pages.dev`, y página de acceso `servcontablepro-acceso.pages.dev` con un botón por versión. Producción no se toca.
- [x] Repositorio de trabajo público para que Render pueda clonarlo. Verificado antes: ningún secreto versionado, ni en el árbol ni en los 54 commits del historial.
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

### Fase 4 — Integridad contable  ✅ 2026-09-18
- [x] **C6** Importaciones con punto de guardado por fila. Antes, si la fila 51 fallaba, PostgreSQL abortaba la transacción, el `COMMIT` final se volvía un `ROLLBACK` y la respuesta informaba 50 filas insertadas que nunca existieron. Seis pruebas nuevas contra base real.
- [x] La respuesta de una importación ahora informa lo que de verdad quedó guardado, con resultado `completa`, `parcial` o `sin_cambios`.
- [x] **A15** Reimportar no pisa correcciones manuales ni reconstruye el asiento si los montos no cambiaron, y un documento anulado no revive ni recibe un asiento nuevo.
- [x] **A2** Ejercicio cerrado bloquea escrituras. El control vive en el punto por donde pasan todas las líneas contables, más la modificación y la anulación de comprobantes. Seis pruebas.
- [x] **A8** Ya resuelto: una sola implementación de numeración, con bloqueo por transacción.
- [x] **A9** Ya resuelto: el asiento de venta abona el exento.
- [x] **A16** 47 puntos donde el mensaje crudo de PostgreSQL volvía al cliente. Ahora los errores de validación conservan su código y mensaje, y el resto responde un texto genérico.
- [x] **A10** Signo tributario de las notas de crédito en resumen de IVA, F29 y remanente. Antes sumaban en positivo, así que una nota de crédito **aumentaba** el débito fiscal en lugar de rebajarlo. En producción hay una nota de crédito de compra guardada así, de modo que el efecto sobre lo declarado era real. El resumen informa aparte cuánto rebajaron. **REQUIERE VALIDACIÓN CONTABLE/TRIBUTARIA**: el tratamiento aplicado es el estándar (código 61 y 112 restan, 56 suma), pero debe revisarlo un contador antes de darlo por firme. Siete pruebas lo fijan.
- [x] **A18** Eliminar una liquidación contabilizada marcaba como eliminado el comprobante completo del período y desvinculaba en silencio a todos los demás trabajadores: desaparecía la contabilidad de la nómina entera. Ahora se rechaza con explicación si el asiento cubre a varias liquidaciones, y si cubre solo a una queda anulado (visible) en lugar de eliminado.
- [x] `creado_por`, `actualizado_por` y `actualizado_en` en las doce tablas contables, poblados al escribir.
- [x] Auditoría solo de agregado: un disparador rechaza `UPDATE` y `DELETE` sobre `auditoria_movimientos`. Una auditoría que se puede editar no sirve como prueba.
- [x] Validación por esquema con `zod` en asientos, login, registro e importaciones, con mensajes por campo en español. Incluye partida doble: el asiento tiene que cuadrar, no puede ser por cero y una línea no puede llevar debe y haber a la vez. Trece pruebas.
- [ ] Unificar montos a enteros en pesos. Requiere revisar cada cálculo y se aborda como trabajo aparte: hoy conviven `NUMERIC(14,2)` y `NUMERIC(18,2)`.

### Fase 5 — Suscripciones, cobranza y bloqueo  ✅ 2026-09-19
Sobre lo existente (`subscriptions`, `subscription_settings`, middleware 402), que ya traía la máquina de estados bien hecha.

- [x] **A20** La activación por pago no era idempotente. Flow avisa por dos caminos, el webhook y el retorno del navegador, y ambos leían la marca de activación ausente: el cliente recibía **dos meses por un pago**. Ahora todo ocurre en una transacción con la contratación bloqueada, y el único por proveedor y transacción es la última red. Probado con dos avisos simultáneos de verdad.
- [x] Los pagos quedan registrados en `subscription_payments`, que estaba vacía: no había historial de cobros ni con qué emitir un recibo.
- [x] Un cliente nuevo que paga desde la web sin tener cuenta ahora recibe una, con invitación por correo para definir su contraseña. Antes pagaba y no recibía acceso.
- [x] Pagar reactiva una cuenta desactivada por impago.
- [x] **Error de zona horaria encontrado al probar**: el cálculo de días mezclaba medianoche local con medianoche UTC. En Chile eso daba un día de más, así que toda suscripción quedaba vigente un día extra, «vence hoy» nunca ocurría y los avisos salían desfasados.
- [x] Proceso diario dentro del propio servicio: transiciona estados por fecha, encola y envía avisos, y registra en `subscription_history` y `subscription_notifications`. Se apaga con `COBRANZA_AUTOMATICA=false`.
- [x] Avisos a los 10, 5, 2 y 0 días, al entrar en gracia, al bloquear y al terminar la prueba, con textos distintos para prueba e impago. Deduplicados por usuario, evento y día con un índice único: correr el proceso dos veces no manda dos correos.
- [x] Plantillas de correo de cobranza y de recibo de pago, con el texto escapado. De paso se corrigió el correo de contacto, que inyectaba el mensaje del visitante sin escapar.
- [x] Frontend: aviso del estado sobre todas las pantallas, con tono urgente en los últimos tres días, y un interceptor global que reacciona al `402` a mitad de sesión y al cierre de sesión por token revocado. Antes cada pantalla mostraba su propio error.
- [x] **Otro error encontrado al probar**: un dato de días ausente se leía como cero y el aviso anunciaba falsamente que la suscripción vencía hoy.
- [x] 27 pruebas nuevas: 15 de cobranza y activación contra base real, 12 de la lógica del aviso.

### Fase 6 — Frontend  ✅ 2026-09-19
Sin rediseño: se usan los mismos tokens `--sc-*` y componentes `sc-*`.

- [x] `VITE_API_URL` por entorno, ya en uso para la versión paralela.
- [x] Estados de carga, vacío y error en `components/EstadoPantalla.jsx`, con barras que laten y respeto por `prefers-reduced-motion`. De las 39 pantallas solo diez mostraban algo mientras esperaban; el resto dejaba la tabla en blanco, que es indistinguible de «no hay datos» y de «se cayó la conexión».
- [x] Aviso de carga conectado en 19 pantallas.
- [x] **87 botones sin `type`**: dentro de un formulario un botón sin tipo vale como envío, así que pulsar «cancelar» o «ver detalle» guardaba datos sin que nadie lo pidiera.
- [x] **El selector de módulo no se podía usar con teclado**: el clic estaba en el contenedor y el botón no tenía manejador, de modo que enfocarlo y pulsar Enter no hacía nada. El manejador pasó al botón, que el navegador ya sabe activar.
- [x] Las dos tablas que arrastraban la página en un teléfono quedaron con desplazamiento propio. Las otras 39 ya lo tenían.
- [x] Interceptor global de respuestas, de la fase anterior, que resuelve el `402` a mitad de sesión.

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
