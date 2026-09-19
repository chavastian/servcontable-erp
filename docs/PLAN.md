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
- [x] `CLAUDE.md` con las reglas que este proyecto aprendió a la fuerza, cada una con el motivo.

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
- [x] **A11** El análisis de cuentas y el panel financiero sumaban asientos anulados y de otros períodos: los filtros viven en el `ON` del comprobante, pero el detalle se unía sin filtro, así que una línea cuyo comprobante no calzaba igual sumaba. También afectaba al `HAVING`, de modo que una cuenta con todos sus movimientos anulados aparecía con saldo cero. Cinco pruebas lo fijan. El balance de ocho columnas ya estaba correcto.
- [x] **A13** Las liquidaciones se calculan en el servidor. Antes `guardarLiquidacion` recibía del cliente todos los montos ya calculados, incluidos AFP, salud, impuesto único y líquido a pagar, y los guardaba tal cual: una liquidación con cero de cotización quedaba registrada como correcta, y eso es un problema del empleador ante la Dirección del Trabajo. El cálculo se extrajo a `calcularLiquidacionCompleta`, que ahora usan los dos endpoints. Seis pruebas, incluida una que envía montos falsos y comprueba que se ignoran. **Finiquitos queda pendiente: mismo patrón, menos frecuente.**
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

### Fase 7 — Multiempresa comercial  ✅ 2026-09-19 (con dos puntos aplazados)
- [x] **A1** El rol dentro de la empresa no se consultaba en **ninguna** operación contable: quien tenía acceso podía crear asientos, anularlos y cerrar ejercicios por igual. Un estudio que da acceso a un asistente solo para consultar no podía hacerlo.
- [x] Cinco roles con jerarquía y permisos declarados en `helpers/roles.helper.js`: OWNER, ADMIN, CONTADOR, EDITOR y CONSULTA. Las rutas declaran el permiso que necesitan (`REGISTRAR`, `ANULAR`, `CERRAR_EJERCICIO`, `CONFIGURAR`, `REMUNERACIONES`), no el rol, así que agregar un rol no obliga a repasar las rutas.
- [x] `exigirPermiso` aplicado en 31 rutas de escritura. En las importaciones va después de multer, porque antes la empresa todavía no está resuelta.
- [x] Migración que traduce los valores heredados (`admin`, `usuario`) y agrega una restricción en la base: un rol inválido ya no entra. Antes era texto libre y un valor inesperado caía en cualquier lado según la comparación que tocara.
- [x] Un rol desconocido cae en el permiso más bajo, y un permiso mal escrito en una ruta no concede nada: falla cerrado.
- [x] Invitaciones por correo: ya existían. Se crea el usuario con una clave aleatoria que nadie conoce y se invita a definirla por enlace.
- [x] 14 pruebas, incluidas las que comprueban que un editor no anula ni cierra ejercicios y que la base rechaza un rol inventado.
- [ ] **Aplazado:** proveedores y clientes como entidades propias. Hoy viven como texto en cada documento, lo que funciona pero duplica datos. Es una función nueva que cambia el modelo y varias pantallas, no una corrección: conviene decidirla como producto.
- [ ] **Aplazado:** adjuntos por documento. Requiere un servicio de almacenamiento (Cloudflare R2 u otro) y por lo tanto una decisión de costo, que según los principios de este plan no se toma sin aprobación.

### Fase 8 — Operación  ✅ 2026-09-19
- [x] **Respaldos verificados de verdad.** `scripts/probar-restauracion.js` toma el respaldo, crea una base descartable, lleva el esquema al punto del respaldo, restaura, compara tabla por tabla contra el manifiesto, aplica las migraciones pendientes **sobre los datos reales**, levanta la API, recorre los endpoints y borra la base.
- [x] **Hallazgo de esa prueba:** un respaldo tomado antes de una migración no se podía restaurar en una base que ya la tenía. Los roles antiguos chocaban con la nueva restricción y una recuperación real habría fallado justo cuando más se necesita. El manifiesto ahora registra hasta qué migración estaba la base de origen, y la restauración lleva el esquema a ese punto antes de cargar los datos.
- [x] **Chequeo de salud** en `/api/salud`, que comprueba la base, mide su latencia e informa la última migración. Responde 503 si algo esencial falta, para que un vigilante externo lo detecte. Antes `/api/estado` decía «Activo» con la base caída.
- [x] El endpoint privado ya no devuelve el token decodificado completo.
- [x] Documentación: `docs/ARQUITECTURA.md`, `docs/SEGURIDAD.md`, `docs/DESPLIEGUE.md`, `docs/RESPALDOS.md`, `docs/COSTOS.md`, `CHANGELOG.md` y `CLAUDE.md`.
- [x] Lista de pasos antes de desplegar, con la vuelta atrás en tres niveles.
- [ ] **Falta:** programar el respaldo automático y guardarlo fuera de la máquina. Hoy se toma a mano y vive donde se tomó. Necesita decidir dónde guardarlo; cualquier servicio con costo requiere aprobación.
- [ ] **Falta:** registro centralizado y alertas. Hoy los errores quedan en el registro de Render y hay que ir a mirarlos.

### Fase 9 — Lanzamiento  🔄 lo técnico listo, faltan decisiones del negocio
- [x] `docs/TERMINOS_Y_DATOS.md`: borrador que describe con exactitud qué hace el sistema con los datos, para que un abogado lo convierta en texto vinculante. **REQUIERE REVISIÓN LEGAL.**
- [x] `docs/ONBOARDING.md`: el camino del cliente nuevo, y dónde el sistema lo deja solo.
- [x] Flujo de contratación probado de punta a punta con pruebas automatizadas: prueba gratuita, pago, activación idempotente, alta de cliente sin cuenta, reactivación por pago, avisos y bloqueo.
- [ ] **Decisiones del negocio, antes de publicar:** política de devoluciones, compromiso de disponibilidad, procedimiento y plazo de eliminación de datos, y en qué casos el soporte accede a datos de un cliente.
- [ ] **Revisión legal** de los términos, incluida la transferencia internacional de datos: los servidores están en Estados Unidos.
- [ ] **Revisión contable** del tratamiento de las notas de crédito.
- [ ] Exportación completa de los datos de un cliente, antes de prometerla en los términos.
- [ ] Soporte: horario, tiempo de respuesta y quién atiende.

### Fase 10 — Ventaja competitiva sin IA  ✅ 2026-09-19

Seis funciones que sistemacontable.cl no tiene. Ninguna usa inteligencia
artificial: todas leen datos que ya están en el sistema. El detalle completo, con
las reglas de cada una y sus límites, está en `docs/ASISTENTES.md`.

- [x] **Panel del estudio contable.** Todas las empresas del usuario con un
  semáforo por cada una. Antes había que entrar a cada empresa, elegir el
  ejercicio y revisar módulo por módulo; con veinte clientes eso no se hace, y los
  problemas aparecían al declarar. Las consultas son por concepto y no por
  empresa: ocho consultas para veinte empresas, no ciento sesenta.
- [x] **Cierre mensual asistido.** Las nueve comprobaciones previas a declarar,
  juntas, con una respuesta clara: se puede declarar o no. Antes cada una vivía en
  otro lugar y nadie las juntaba, así que un error se descubría después de
  presentar el F29.
- [x] **Calce automático del banco.** Propone a qué documento corresponde cada
  movimiento pendiente de la cartola, por monto, fecha y RUT leído de la
  descripción. Cuando hay varios candidatos igual de buenos no propone ninguno.
  Nada se concilia sin confirmación.
- [x] **Clasificación por historial.** La cuenta que esta empresa ya usaba para el
  mismo RUT, aplicada durante la importación del SII y ofrecida hacia atrás para
  los documentos sin clasificar. Antes cien facturas importadas eran cien
  ediciones a mano.
- [x] **Calendario tributario.** F29, cotizaciones y libro de remuneraciones con
  sus plazos, corriendo los que caen en día no hábil. **REQUIERE VALIDACIÓN
  TRIBUTARIA:** los feriados móviles y las prórrogas del SII no están incluidos y
  toda fecha viaja marcada para confirmar.
- [x] **Flujo de caja proyectado.** Antigüedad de la cartera, que es un hecho, más
  una proyección semana a semana declarada como estimación. El sistema **no guarda
  fecha de vencimiento**, así que el plazo lo define quien consulta.
- [x] **Hueco de aislamiento cerrado de paso:** `PUT /api/conciliacion-bancaria/:id/estado`
  filtraba por el `empresa_id` del cuerpo sin comprobar la membresía. Cualquier
  usuario autenticado podía marcar como conciliado un movimiento de otro cliente.
- [x] **Falla encontrada probando:** el driver de PostgreSQL entrega las columnas
  `DATE` como objetos `Date`, no como texto. Los cálculos que las trataban como
  texto dejaban el calce sin candidatos y rompían la proyección de caja.
  `helpers/fecha.helper.js` normaliza antes de cualquier resta.
- [x] **Incoherencia corregida en lo recién construido:** el panel miraba seis de
  las nueve revisiones, así que pintaba verde una empresa que el cierre marcaba en
  rojo por el IVA descuadrado. Ahora corre las nueve con la misma gravedad, y una
  prueba compara los dos estados y falla si se separan.
- [x] **Falso positivo corregido, encontrado probando sobre datos reales:** la
  revisión de IVA comparaba los libros contra todo el movimiento del mes en las
  cuentas de IVA, así que en una empresa que contabiliza el pago del F29 (que debita
  la cuenta de IVA débito para dejarla en cero) denunciaba un descuadre inexistente.
  Ahora compara el IVA de los documentos que tienen asiento contra el IVA de esos
  asientos, y hay una prueba que contabiliza un pago de F29 para fijarlo.
- [x] 36 pruebas nuevas (166 en total) y 9 endpoints agregados al chequeo de humo
  (47 en total).
- [x] **Hallazgo real sobre la copia de producción.** En ESTRUCTURAS JYJ, enero de
  2026, la factura 79386404 de ADMIN. DE SUPERMERCADOS HIPER LIMITADA está en el
  libro de compras con neto, IVA y total en cero, pero su asiento registra 149.138
  de gasto, 28.110 de IVA crédito y 177.248 al proveedor. Las dos cifras no pueden
  ser correctas a la vez. **REQUIERE REVISIÓN CONTABLE:** hay que decidir cuál vale
  y corregir la otra, porque si el asiento tiene razón el F29 declara 28.110 menos
  de crédito fiscal. También apareció un folio de venta faltante, y el flujo de caja
  mostró 4.043.479 pesos por cobrar con más de noventa días.
- [ ] **Paso siguiente natural:** agregar fecha de vencimiento a compras y ventas,
  para que el flujo de caja deje de estimar.

## Flujo de trabajo

- Ramas `feat/*`, `fix/*`, `security/*`, `chore/*` → PR a `main` de `chavastian/servcontable-erp` → revisión → merge.
- Release: `git push upstream main` solo con aprobación explícita (despliega producción).
- Commits pequeños con prefijo convencional.
