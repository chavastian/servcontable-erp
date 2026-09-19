# Registro de cambios

Los cambios están agrupados por lo que significan para quien usa el sistema, no
por commit. Los códigos entre paréntesis remiten a los hallazgos de
`docs/AUDIT-2026-09.md`.

## Sin publicar — rama `staging`

Nada de esto está en producción todavía. Se puede revisar en
`servcontablepro-nueva.pages.dev`.

### Datos que ya no se filtran entre clientes

- **Cualquier usuario podía importar documentos a la empresa de otro cliente**
  (C1). La autenticación corría antes de leer el formulario, así que en las
  importaciones el cuerpo llegaba vacío y la comprobación de membresía se saltaba
  en silencio.
- **Se podía leer el asiento de otro cliente** probando números consecutivos
  (C2).
- **Un asiento podía imputar una cuenta de otra empresa** (C4), mezclando los
  saldos de dos clientes sin que ninguna consulta pareciera fuera de lugar.
- **Un pago podía apuntar al documento de otra empresa**, alterando los saldos
  pendientes de ambas.
- Un `empresa_id` no numérico se convertía en `NaN`, que es falso, y saltaba la
  comprobación de membresía completa.

### Privilegios

- **Un administrador de cliente podía resetear la contraseña del
  superadministrador** y quedarse con el sistema entero (C3).
- **El primer usuario registrado se volvía superadministrador** por un endpoint
  público (A17). Ahora el administrador inicial solo se crea por variable de
  entorno.
- **El rol dentro de la empresa no se consultaba en ninguna operación contable**
  (A1). Cinco roles con permisos: un usuario de consulta ya no puede modificar
  nada, y un editor no cierra ejercicios ni anula.
- Cambiar la contraseña o desactivar una cuenta ahora cierra sus sesiones
  abiertas. Antes el token seguía sirviendo hasta vencer (A4).

### Datos que ya no se pierden

- **Las importaciones informaban éxito sin guardar nada** (C6). Si la fila 51
  fallaba, PostgreSQL abortaba la transacción y las 50 anteriores tampoco se
  guardaban, pero la respuesta decía «50 insertadas». Ahora cada fila tiene su
  punto de guardado y la respuesta informa lo que de verdad quedó.
- **Reimportar pisaba las correcciones hechas a mano** y revivía documentos
  anulados (A15).
- **Eliminar la liquidación de un trabajador borraba la contabilidad de la
  nómina entera** del período y desvinculaba en silencio a todos los demás (A18).
- **El plan de cuentas se borraba físicamente** (C9). Ahora «reemplazar»
  desactiva y conserva los asientos.

### Cifras que ahora cuadran

- **Las notas de crédito sumaban en lugar de restar** en el resumen de IVA, el
  F29 y el remanente (A10). Inflaban el débito y el crédito fiscal. En
  producción hay una nota de crédito guardada así, de modo que el efecto sobre lo
  declarado era real. **REQUIERE VALIDACIÓN CONTABLE/TRIBUTARIA.**
- **Un ejercicio cerrado no cerraba nada** (A2): se seguía escribiendo con fecha
  dentro del período firme y los libros dejaban de cuadrar con lo declarado.
- Un asiento ya no se guarda si no cuadra, si es por cero, o si una línea lleva
  debe y haber a la vez.

### Cobranza y suscripciones

- **Un pago podía valer dos meses** (A20). Flow avisa por el webhook y por el
  retorno del navegador a la vez, y ambos extendían la suscripción.
- **Los cobros no quedaban registrados**: no había historial ni con qué emitir un
  recibo.
- **Quien pagaba desde la web sin tener cuenta no recibía acceso.** Ahora se le
  crea y se le invita por correo.
- **Toda suscripción quedaba vigente un día extra** por mezclar medianoche local
  con medianoche UTC, y «vence hoy» nunca ocurría.
- Avisos por correo a los 10, 5, 2 y 0 días, al entrar en gracia y al bloquear,
  sin repetirse aunque el proceso corra dos veces.
- Aviso del estado dentro de la aplicación, y la pantalla de renovación aparece
  cuando la suscripción vence a mitad de sesión.

### Seguridad general

- Límites de intentos donde no había ninguno: login, recuperación, registro,
  contacto, pagos e importaciones (A3).
- Cabeceras de seguridad con `helmet` (A19).
- **Los datos personales de cada interesado estaban accesibles sin
  autenticación** (A7): los identificadores son consecutivos y bastaba
  recorrerlos.
- **El mensaje de PostgreSQL volvía al cliente** en 47 puntos (A16), revelando
  tablas, columnas y restricciones.
- Archivos importados con límite de tamaño y tipo (A5). Antes una carga podía
  agotar la memoria del servicio.
- Dependencias sin vulnerabilidades conocidas (A6).
- Contraseña mínima que de verdad aplica: antes solo la validaba uno de los
  cuatro caminos.
- El correo de contacto ya no inyecta el mensaje del visitante sin escapar.

### Base de datos

- **Una instalación limpia no arrancaba** (C7): 24 de las 37 tablas existían solo
  en producción. Ahora el esquema está versionado y hay migraciones.
- **Se ejecutaba DDL en cada petición autenticada** (C8): 693 líneas eliminadas.
- 40 índices nuevos. Faltaba el de detalle por comprobante, así que cada libro
  recorría la tabla completa.
- Autoría (`creado_por`, `actualizado_por`) en las tablas contables.
- La auditoría es de solo agregado: el sistema ya no puede reescribir su
  historia.

### Interfaz

- Estados de carga, vacío y error. De 39 pantallas, solo diez mostraban algo
  mientras esperaban.
- **87 botones enviaban formularios sin querer** por no declarar su tipo.
- **El selector de módulo no se podía usar con teclado.**

### Operación

- Respaldo verificable, con restauración probada de extremo a extremo.
- Chequeo de salud que de verdad comprueba la base. Antes decía «Activo» con la
  base caída.
- Entorno de revisión en línea, en paralelo a producción.
- 119 pruebas automatizadas donde no había ninguna.
- Documentación: arquitectura, seguridad, despliegue, respaldos, entornos,
  esquema, costos, onboarding y términos.

## Antes de esto

El historial previo está en los commits. Lo relevante: el sistema funcionaba y
cubría contabilidad, tributario y remuneraciones, con SQL parametrizado y
transacciones en las operaciones importantes. Los problemas eran de aislamiento
entre clientes, de integridad y de operación, no de funcionalidad.
