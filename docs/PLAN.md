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

### Fase 11 — Revisión completa del 19-09-2026  🔄 en curso

Cuatro revisores (backend, contable, frontend, datos) más pruebas de auditor sobre la
copia de producción dejaron 106 hallazgos. El informe completo está publicado como
artefacto y sus bloques se cierran en este orden.

**Bloque 0 — lo que bloqueaba probar la versión nueva  ✅ 19-09-2026**
- [x] C-01 Fuga de lectura entre empresas por cuerpo y consulta en desacuerdo. De paso:
  en Express 5 `req.query` es un getter que se recalcula en cada acceso, así que la
  normalización de `tenant.middleware` tampoco persistía; ambos middlewares la sombrean.
- [x] C-02 Roles migrados en mayúscula: crear empresa y administrar usuarios vuelven a
  funcionar para un administrador de cliente.
- [x] C-03 Dos pantallas en blanco por un estado sin declarar (era mío, fase 6).
- [x] A-01 a A-07 y A-19: trabajador ajeno en haberes y ausencias, trece rutas sin
  permiso, PUT de liquidación que recalcula, cuatro inserciones directas de líneas de
  asiento, eliminar finiquito contabilizado, error de referencia al calcular, sesiones
  al cambiar de rol, ejercicio arrastrado desde el panel.
- [x] **Reabiertos de la auditoría de septiembre**, porque estaban cerrados solo en
  parte: C4 (haberes y ausencias), A2 (contabilizaciones de remuneraciones), A13
  (editar liquidación y finiquitos), A18 (finiquitos). Todos cerrados en este bloque
  salvo finiquitos en el servidor (bloque 4).

**Bloque 1 — lo que declaraba mal  ✅ 19-09-2026**
- [x] C-04 Las notas de crédito generan el asiento inverso y no aparecen como
  documentos por pagar o cobrar ni en el flujo de caja.
- [x] C-05 Retención de honorarios por fecha de emisión (Ley 21.133), no por formulario.
- [x] C-06 Gratificación mensual con tope de 4,75 ingresos mínimos al año.
  **REQUIERE VALIDACIÓN LABORAL:** el tope no se prorratea por días del mes.
- [x] C-07 Las ausencias rebajan los días devengados una sola vez y no se restan
  después de cotizar. La nómina con ausencias vuelve a cuadrar al contabilizar.
- [x] A-08 Tipo de cuenta como dominio cerrado en la base (ocho valores); balance,
  estado de resultados, análisis de cuentas y los dos paneles clasifican por tipo y no
  por palabras del nombre. El panel dejó de mostrar resultado cero.
- [x] A-09 Sin tramos de impuesto único, una base sobre 13,5 UTM no se liquida.
  **REQUIERE VALIDACIÓN TRIBUTARIA:** la UTM por omisión cuando el período no la trae.
- [x] A-10 Una empresa sin cuenta de gasto ya no importa compras a Caja: falla con mensaje.
- [x] A-13 Tope propio del seguro de cesantía y reglas por contrato (plazo fijo, obra o
  faena, indefinido, más de once años). **REQUIERE VALIDACIÓN LABORAL** del 0,8%.
- [x] C-11 Índice único de compras por empresa, RUT, tipo y folio; el alta manual deriva
  el código SII; la reimportación busca con RUT. Cero choques en la copia.
- [x] A-18 El número del comprobante lo asigna siempre el servidor y editar no renumera.
  La unicidad por empresa y número no se pudo agregar: la copia ya tiene números
  repetidos entre tipos en una empresa inactiva.
- [x] A-22 Autoría por disparador desde `app.usuario_id`, que la capa de base fija en
  cada escritura a partir de un AsyncLocalStorage que llena `verificarToken`.
- [x] A-23 Cascadas contables a RESTRICT; pagos de suscripción a SET NULL.
**Bloque 2 — lo que el cliente nota el primer mes  ✅ 19-09-2026**
- [x] C-12 Anular y editar compras y ventas: anulación lógica con motivo, autor y fecha
  que anula el asiento en la misma transacción; edición que anula el asiento anterior
  y genera uno nuevo. Sin pagos vigentes ni ejercicio cerrado.
- [x] Migración: anulado_por, anulado_en y motivo en ocho tablas; fecha_vencimiento y
  referencia de nota de crédito en compras y ventas; fecha_recepcion en compras; CHECK de
  estado en las cinco tablas de documentos. El flujo de caja usa el vencimiento real.
- [x] A-20 responsive, A-21 doble envío en veinte formularios, seis pantallas nuevas
  (respuestas fuera de orden, errores de acción sin borrar la tabla, elección de
  candidato en el calce, selector de cuenta sin historial, IVA junto al F29 en el
  calendario), 217 tildes, nombres de menú, siete archivos muertos, lint en cero.

**Bloque 3 — F29 completo y parámetros nacionales  ✅ 19-09-2026**
- [x] Módulo 1: `parametros_nacionales` por período (UF, UTM, UTA, ingreso mínimo, topes,
  SIS, tasa de la reforma). La configuración por empresa manda; lo nacional rellena.
  Sembrada desde lo que las empresas ya cargaron. **REQUIERE VALIDACIÓN TRIBUTARIA** de
  cada escalón de la Ley 21.735.
- [x] Módulo 2: `helpers/f29.helper.js`, un solo cálculo para resumen, control de remanente
  y cierre. Remanente en UTM encadenado (C-08), PPM sobre ingresos brutos con tasa
  guardada por empresa, retenciones por mes de pago con aviso para las boletas sin fecha,
  IVA retenido de facturas de compra, crédito proporcional del IVA de uso común con factor
  acumulado anual, activo fijo informado (C-09).
- [x] Registro del F29 presentado (`declaraciones_f29`): folio, fecha, monto,
  rectificatorias. Al registrar se fija el remanente del período.
- [x] Cierre mensual y panel con cuatro revisiones más, en ambos: compras fuera del plazo
  del artículo 24 (error), F29 sin registrar o con diferencia, documentos modificados
  después de presentar, boletas sin fecha de pago, facturas de compra tipo 46.
- [x] Impuesto único por la tabla legal en UTM cuando la empresa no cargó tramos (A-09);
  tasa de la reforma desde el parámetro nacional (A-14).
- [x] C-10 Importación del RCV lee tipo de compra, código de IVA no recuperable, uso común,
  activo fijo, IVA no retenido, otros impuestos y fecha de recepción.
- [x] Pantallas: Resumen F29 rehecho con las líneas nuevas y el registro del presentado;
  control de remanente encadenado; configuración contable con tasa de PPM y las dos
  condiciones de plazo.

**Bloque 4 — Cierre de ejercicio y remuneraciones completas  ✅ 19-09-2026**
- [x] A-11 Cerrar el año genera el asiento de cierre de resultados (31-12) contra la
  cuenta de Resultado del Ejercicio configurada, y el de apertura del año siguiente
  (01-01) con los saldos de balance. Crea el año siguiente si no existe. Reabrir exige
  motivo, guarda quién y cuándo, y anula ambos asientos. No se cierra con el anterior
  abierto ni se reabre con el siguiente cerrado (`helpers/ejercicio.helper.js`).
- [x] Libro mayor con saldo inicial por cuenta anterior a `fecha_desde`; el acumulado se
  reinicia por cuenta y las cuentas con saldo previo sin movimiento también aparecen.
- [x] A-12 Isapre con plan en UF (`trabajadores.plan_salud_uf`): se descuenta el mayor
  entre el 7% y el plan; el adicional se guarda aparte
  (`liquidaciones.descuento_salud_adicional`) y no rebaja la base tributable.
- [x] A-15 Finiquito calculado en el servidor (`helpers/finiquito.helper.js`,
  `POST /api/finiquitos/calcular`; el guardado recalcula desde los supuestos): base del
  artículo 172 sin horas extra y con tope de 90 UF, sustitutiva del aviso previo cuando
  no hubo 30 días, años reconocidos con fracción y tope 11, obra o faena 2,5 días por mes,
  descuento del aporte del empleador a la AFC (estimado en 1,6% si no se informa),
  impuesto único sobre la indemnización voluntaria. **REQUIERE VALIDACIÓN LABORAL Y
  TRIBUTARIA**: estimación del aporte AFC y ausencia del promedio de 24 meses.
- [x] A-16 Vacaciones en días hábiles con feriados del calendario, feriado progresivo con
  `trabajadores.anios_cotizados_previos`, valor día con remuneración íntegra (sueldo más
  gratificación; **REQUIERE VALIDACIÓN LABORAL** para haberes variables). Un solo devengo
  para saldo y finiquito; el saldo ya no usa `${periodo}-31`.
- [x] Módulo 6: archivo de carga del Libro de Remuneraciones Electrónico
  (`GET /api/liquidaciones/lre`, CSV con códigos DT). **REQUIERE VALIDACIÓN** de cada
  código contra el formato vigente de la DT antes de cargarlo.
- [x] Pantallas: trabajadores con plan UF y años previos; finiquitos calcula en el
  servidor con los avisos a la vista; selector de año muestra quién cerró o reabrió y
  los comprobantes; configuración contable con la cuenta de resultado; libro mayor con
  saldo inicial; libro de remuneraciones con el botón del LRE.
- [x] Asignación familiar por tramo en la liquidación (bloque 5).

**Bloque 5 — Deuda técnica  ✅ 19-09-2026**
- [x] Base: lista cerrada de estados en ocho tablas, formato AAAA-MM del período en
  quince, cinco claves foráneas de la configuración al plan, trece índices (calce por
  monto, finiquitos y conciliación por período, plan por tipo). La migración solo agrega
  cada restricción si los datos la cumplen; si no, avisa y sigue.
- [x] Anular un comprobante descontabiliza liquidaciones, finiquitos, pagos de
  remuneraciones y conciliación. Boletas y cartola importan con punto de guardado por
  fila y sin filtrar el mensaje de PostgreSQL. Calce bancario en una consulta por sentido.
  Importar indicadores pasa por la subida común y valida la empresa después del archivo.
  Libros de compra y venta restan las notas de crédito en totales y resumen. Calendario
  con solsticio (Ley 21.357), traslados al lunes y al viernes (Leyes 19.668 y 20.299) y
  17/20 de septiembre (Ley 20.215). Licencia médica con y sin tilde. Nómina centralizada
  a fin de mes. Un finiquito deja al trabajador fuera de la nómina. Asignación familiar
  por tramo y cargas (**REQUIERE VALIDACIÓN LABORAL** del tramo). Plan base con nueve
  cuentas que faltaban. Errores de negocio con código en honorarios y liquidaciones.
- [x] Validación por esquema (zod) en 15 routers más: 24 esquemas permisivos con lo
  desconocido y estrictos con identificadores, fechas, períodos y montos.
- [x] Paginación opcional (`limite`, `pagina`, `hay_mas`) en compras, ventas,
  comprobantes, honorarios, liquidaciones, pagos y auditoría. Sin parámetros, todo sigue
  igual.
- [x] Frontend: `services/http.js` es el único camino a la API (40 servicios migrados,
  115 fetch menos; un 502 ya muestra un mensaje legible). Las 34 páginas del panel se
  cargan bajo demanda: el paquete inicial bajó de 1,59 MB a 277 KB. La vista viaja en el
  hash de la URL (F5 y botón atrás). 993 colores literales pasaron a tokens `--sc-*`.
- [x] Los cuatro puntos que quedaban se cerraron en el bloque 9.

**Bloque 6 — Catálogos: proveedores, clientes y centros de costo  ✅ 19-09-2026**
- [x] Módulo 12: tabla `terceros` por empresa, con las dos banderas (un RUT puede ser
  proveedor y cliente), condición de pago, cuenta habitual de gasto e ingreso, giro y
  contacto. `compras`, `ventas` y `honorarios` quedaron enlazados; las columnas de texto
  del documento se conservan porque una factura registra el nombre con que fue emitida.
  Registrar o importar resuelve el tercero y lo crea si no existe.
- [x] El vencimiento sale de la condición de pago cuando el documento no lo trae; en
  blanco no se inventa nada y el flujo de caja sigue usando su plazo convencional. La
  cuenta del catálogo manda sobre el historial por RUT y sobre la cuenta por defecto.
- [x] Módulo 14: tabla `centros_costo` con código único por empresa; las líneas de
  asiento y la ficha del trabajador se enlazan por id (y por nombre, para lo que ya
  estaba escrito). Un centro de otra empresa se rechaza con 400.
- [x] Informe de resultado por centro de costo (`GET /api/centros-costo/informe`): solo
  cuentas de resultado, y lo que quedó sin centro se informa aparte en lugar de
  repartirse, porque repartir un gasto común es criterio del contador.
- [x] Pantallas: proveedores y clientes con búsqueda insensible a tildes y ficha con lo
  comprado, vendido y honorarios; centros de costo con el informe y exportación a Excel;
  selector de centro en comprobantes y en la ficha del trabajador.
- [x] Migración `1758201000000_bloque6-catalogos`, con traspaso de los datos que ya
  existían: 234 terceros y los 431 documentos de compra, 158 de venta y 29 honorarios
  enlazados sin quedar ninguno huérfano.


**Bloque 7 — Activo fijo y depreciación  ✅ 19-09-2026**
- [x] Módulo 7: tablas `activos_fijos` y `depreciaciones`. Registro del bien con valor,
  vida útil, cuentas propias y centro de costo; enlace opcional a la compra que lo
  originó.
- [x] Dos depreciaciones para el mismo bien, que es la parte que importa: la **normal**
  es la financiera y es la que se contabiliza; la **acelerada** del artículo 31 N°5
  reduce la vida útil a un tercio, no toca el balance y queda guardada para la renta
  líquida imponible. La diferencia entre ambas se informa como el ajuste que corresponde.
- [x] Lineal, mensual, y la cuota del último mes absorbe el redondeo: el bien termina
  exactamente en su valor residual y no con pesos sueltos.
- [x] Contabilización del mes en un asiento agrupado por cuenta y centro, fechado al
  último día. Un bien se deprecia una sola vez por período (índice único además del
  control en el código), y si falta una cuenta no se contabiliza nada a medias.
- [x] Un bien con depreciación contabilizada no cambia de valor ni de vida útil. Un PUT
  parcial ya no apaga la depreciación acelerada ni borra las cuentas del bien.
- [x] Baja y venta con motivo obligatorio: deja de depreciar desde el mes siguiente y
  entrega el valor libro y el resultado de la venta **sin generar el asiento**, porque
  las cuentas del resultado son criterio contable.
- [x] Libro de activo fijo por categoría, con columna tributaria y exportación a Excel.
  Dice que está a costo histórico, sin corrección monetaria (módulo 8).
- [x] Tabla de vidas útiles sugeridas (Resolución Exenta SII N°43 de 2002) marcada como
  **REQUIERE VALIDACIÓN TRIBUTARIA**: la vida útil la fija el contador, el sistema no la
  deduce.
- [x] Plan de cuentas base: las nueve cuentas de depreciación acumulada estaban
  tipificadas como pasivo contra lo que decían su propio código (15xxxxx) y su
  clasificación; quedaron como activo con saldo acreedor. **No se tocaron los planes ya
  cargados en las empresas existentes**: ese cambio es decisión del contador (el balance
  de ocho columnas las presenta igual, porque clasifica por el signo del saldo).
- [x] Migración `1758201100000_bloque7-activo-fijo`. 11 pruebas nuevas.


**Bloque 8 — Declaraciones juradas y certificados  ✅ 19-09-2026**
- [x] Módulo 10: declaración jurada **1879** (retenciones del artículo 42 N°2) por
  prestador, **por fecha de pago** y no de emisión (artículo 74 N°2). Las boletas sin
  fecha de pago se cuentan por su emisión y se avisa, igual que en el F29. Las anuladas
  no se declaran.
- [x] Declaración jurada **1887** (rentas del artículo 42 N°1) por trabajador, sumando
  las liquidaciones emitidas del año, con el detalle mes a mes y separando las rentas no
  gravadas de la renta imponible.
- [x] Archivo de carga en CSV para las dos, y exportación a Excel del resumen. Un año sin
  datos responde 404 en lugar de entregar un archivo vacío que parezca válido.
- [x] Certificados en PDF para el prestador y para el trabajador, con la identidad visual
  del resto de los documentos. Salen del mismo cálculo que la declaración, así que no
  pueden diferir; los avisos de validación van impresos en el certificado.
- [x] **REQUIERE VALIDACIÓN TRIBUTARIA** en dos puntos que quedan dichos en pantalla y en
  el PDF: el SII cambia el formato y los códigos de columna casi todos los años por
  resolución, y las cifras no están reajustadas al 31 de diciembre.
- [x] 6 pruebas nuevas. Sin migración: se arma con lo ya registrado.

- [ ] Módulo 11 (boletas de honorarios electrónicas desde el SII). **Necesito un archivo
  real de ejemplo**: las columnas del CSV de BHE recibidas no se pueden adivinar sin
  inventar nombres, y eso es justo lo que este proyecto no hace.
- [ ] Módulo 13: quedó cubierto en lo esencial por el bloque 3 (el factor acumulado anual
  ya se aplica y la parte no recuperable se informa en el F29). Falta contabilizar esa
  parte como gasto, que es una decisión de criterio.

**Bloque 9 — IVA de uso común contabilizado y deuda de pantalla  ✅ 19-09-2026**
- [x] **Defecto latente encontrado y corregido:** `construirAsientoCompra` no miraba
  `iva_uso_comun`, la columna que el bloque 3 agregó al registro de compras. El total del
  documento sí la incluye, así que la primera importación real con uso común habría
  generado un asiento descuadrado por ese monto. No llegó a pasar —ninguna compra con uso
  común tenía comprobante y no había ningún comprobante descuadrado en la base— pero
  habría pasado. Además la importación escribía esas columnas **después** de armar el
  asiento, así que ni siquiera las veía: ahora van antes, en las dos ramas.
- [x] Módulo 13 completado: el IVA de uso común entra completo como crédito fiscal y la
  parte que la proporcionalidad deja sin recuperar se lleva a gasto con un ajuste propio
  (`GET /api/iva-uso-comun`, `POST /api/iva-uso-comun/contabilizar`). No es automático: se
  calcula, se muestra y alguien lo confirma, porque el momento del ajuste es criterio
  contable. Un período se ajusta una sola vez, y anular el asiento libera el período.
- [x] Exportación a Excel y PDF en las pantallas que no la tenían (resumen IVA, compras,
  ventas, pagos y cobros), con un componente compartido que carga las librerías recién
  cuando alguien exporta. De 7 pantallas con exportación a 17.
- [x] **Un solo modelo de período.** Ya no queda ningún campo de mes libre: el selector
  es uno y tiene dos modos, porque las dos conductas eran legítimas. Lo normal queda
  atado al año del ejercicio; las pantallas que cruzan el año a propósito (F29 de enero
  que declara diciembre, remanente que se arrastra, panel del estudio) lo hacen con
  `permitirOtroAnio`, y el selector dice por qué.
- [x] Etiquetas asociadas a su campo en los diez ayudantes de formulario, con `useId` de
  React: no puede haber un id repetido ni una etiqueta que no apunte a nada.
- [x] Cinco de las páginas más grandes se partieron: los estilos se fueron a su propio
  módulo (`<Página>.estilos.js`). CartolaRut 1143→874, NuevoComprobante 1261→921,
  ConfiguracionRemuneraciones 2042→1762, PagosCobros 1015→811, LibrosCompraVenta 980→833.
  Dos se omitieron a propósito: su cola no era solo estilos y no vale el riesgo.
- [x] Migración `1758201200000_bloque9-iva-uso-comun`. 7 pruebas nuevas.

- [ ] Módulo 11 (boletas de honorarios electrónicas desde el SII). **Necesito un archivo
  real de ejemplo.**
- [ ] Módulos 8 y 9 del informe (corrección monetaria y capital propio tributario; renta
  anual, RLI y F22). **Son los dos que el informe marca como imposibles de escribir sin
  definir criterio tributario antes**: esperan decisión.

## Flujo de trabajo

- Ramas `feat/*`, `fix/*`, `security/*`, `chore/*` → PR a `main` de `chavastian/servcontable-erp` → revisión → merge.
- Release: `git push upstream main` solo con aprobación explícita (despliega producción).
- Commits pequeños con prefijo convencional.
