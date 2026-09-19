# Registro de cambios

Los cambios están agrupados por lo que significan para quien usa el sistema, no
por commit. Los códigos entre paréntesis remiten a los hallazgos de
`docs/AUDIT-2026-09.md`.

## Sin publicar — rama `staging`

Nada de esto está en producción todavía. Se puede revisar en
`servcontablepro-nueva.pages.dev`.

### Revisión del 19-09-2026: bloque 8

- **Declaraciones juradas 1879 y 1887 armadas por el sistema.** Los datos ya estaban ahí y
  había que sacarlos a mano cada marzo. La 1879 va por fecha de pago, como corresponde, y
  avisa de las boletas que no tienen fecha registrada.
- **Certificados en PDF para el prestador y para el trabajador,** con el detalle mes a mes
  en el de sueldos. Salen del mismo cálculo que la declaración, así que el certificado y
  la jurada no pueden decir cifras distintas.
- **Archivo de carga en CSV** para subir al SII, y exportación a Excel del resumen.
- Dos advertencias van a la vista y también impresas en el certificado: el formato del SII
  cambia casi todos los años, y las cifras no están reajustadas al 31 de diciembre.

### Revisión del 19-09-2026: bloque 7

- **Activo fijo con depreciación automática.** Se registra el bien una vez —valor, vida
  útil, cuentas— y cada mes el sistema calcula la depreciación y genera el asiento.
- **La depreciación acelerada se calcula aparte y no se contabiliza.** Es solo tributaria
  (artículo 31 N°5): el balance lleva la normal, y la diferencia entre las dos queda
  guardada para la renta anual. Las dos se ven en la misma pantalla, en columnas
  separadas.
- **El bien termina exactamente en su valor residual:** la cuota del último mes cierra la
  diferencia del redondeo, sin dejar pesos sueltos arrastrándose para siempre.
- **Correr la depreciación dos veces no duplica el gasto,** y si falta una cuenta no se
  contabiliza nada a medias.
- **Dar de baja o vender un bien** pide motivo, detiene la depreciación y muestra el valor
  libro y el resultado de la venta. El asiento no se genera solo: esas cuentas las decide
  el contador.
- **Libro de activo fijo** por categoría, con la columna tributaria y exportación a Excel.
- La vida útil se propone según la tabla del SII, pero la fija el contador.

### Revisión del 19-09-2026: bloque 6

- **Proveedores y clientes son una ficha, no un texto repetido en cada factura.** Guardan
  la condición de pago, la cuenta en que se imputan habitualmente, el giro y con quién
  hablar. Un mismo RUT puede ser proveedor y cliente.
- **El vencimiento de una factura sale de la condición de pago pactada.** Si no hay
  condición registrada, no se inventa una fecha.
- **Al importar el registro del SII, cada factura cae en la cuenta del proveedor,** si el
  proveedor tiene una definida; antes solo se usaba el historial o la cuenta por defecto.
- **Buscar "ferreteria" encuentra "Ferretería":** el buscador ignora las tildes.
- **Centros de costo con código, y resultado por centro.** Es lo que pide una empresa con
  más de un local: cada línea de asiento y cada trabajador se asignan a un centro, y el
  informe muestra ingresos, costos, gastos y resultado de cada uno. Lo que quedó sin
  centro se muestra aparte, no repartido.

### Revisión del 19-09-2026: bloque 5

- **La aplicación carga en una fracción del tiempo:** cada pantalla se descarga cuando se
  abre. Y la pantalla queda en la dirección: F5 vuelve al mismo lugar y el botón atrás
  funciona.
- **Los errores del servidor se leen:** un corte del proxy ya no muestra "Unexpected
  token"; dice que el servidor no respondió y que se intente de nuevo.
- **Anular un asiento de nómina, finiquito o pago de remuneraciones** deja el documento
  listo para volver a contabilizar; antes quedaba "contabilizado" contra un asiento anulado.
- **Importar boletas o una cartola con una fila mala** guarda las demás y dice cuál falló.
- **Los libros de compra y venta restan las notas de crédito** en totales y por tipo.
- **Calendario con los feriados reales:** solsticio de junio, San Pedro y San Pablo y
  12 de octubre al lunes, 31 de octubre al viernes, 17 o 20 de septiembre.
- **Asignación familiar** en la liquidación según tramo y cargas del trabajador.
- **Un finiquito saca al trabajador de la nómina.** Las licencias médicas se cuentan.
- **La base rechaza estados y períodos mal escritos,** y los listados largos pueden
  pedirse por página.

### Revisión del 19-09-2026: bloque 4

- **Cerrar el año ahora cierra de verdad:** genera el asiento de cierre de resultados y
  el de apertura del año siguiente, y deja registrado quién cerró. Reabrir pide motivo,
  queda auditado y anula los dos asientos. Hay que configurar la cuenta de Resultado del
  Ejercicio en Configuración Contable.
- **El libro mayor parte del saldo anterior** al rango consultado, cuenta por cuenta.
- **Isapre con plan en UF:** el trabajador guarda su plan y la liquidación descuenta el
  mayor entre el 7% y el plan; el adicional se informa aparte y no rebaja el impuesto.
- **El finiquito lo calcula el servidor:** tope de 90 UF, sustitutiva del aviso, años con
  fracción y tope 11, obra o faena, descuento del aporte AFC del empleador e impuesto sobre
  la indemnización voluntaria. La pantalla muestra los avisos de lo que requiere
  validación.
- **Vacaciones en días hábiles** con feriados, feriado progresivo con los años previos del
  trabajador, y el mismo devengo en el saldo y en el finiquito.
- **Archivo LRE para la Dirección del Trabajo,** primera versión; los códigos deben
  cotejarse con el formato vigente antes de cargarlo.

### Revisión del 19-09-2026: bloques 2 y 3

- **Ahora se pueden anular y editar compras y ventas.** Anular pide motivo, deja quién y
  cuándo, y anula el asiento en la misma operación. Editar regenera el asiento. Con pagos
  vigentes o ejercicio cerrado no se permite.
- **Compras y ventas tienen fecha de vencimiento** y referencia de la nota de crédito. El
  flujo de caja usa la fecha real cuando existe.
- **F29 completo:** remanente en UTM que se arrastra solo desde el mes anterior, PPM sobre
  ingresos brutos con la tasa guardada en la empresa, IVA retenido de facturas de compra,
  crédito proporcional del IVA de uso común, activo fijo. Y se puede registrar el F29
  presentado (folio, fecha, monto) para que el cierre mensual lo cruce.
- **Parámetros nacionales por período:** UF, UTM, ingreso mínimo y topes una sola vez para
  todas las empresas. Sin tramos cargados, el impuesto único se calcula por la tabla legal.
- **En el teléfono la aplicación se puede usar:** el menú se superpone en vez de dejar
  140 píxeles de contenido.
- **Los formularios ya no registran dos veces** con doble clic.
- **217 textos visibles recuperaron sus tildes.**

### Revisión del 19-09-2026: bloques 0 y 1

- **Fuga de lectura entre empresas cerrada.** Una petición con la empresa propia en el
  cuerpo y otra en la consulta leía datos de cualquier cliente. Dos valores distintos
  ahora responden 400.
- **Crear empresa y administrar usuarios vuelven a funcionar** para un administrador de
  cliente tras la migración de roles.
- **Comprobantes contables y Liquidaciones** ya no quedan en blanco al abrirse.
- **Las notas de crédito se contabilizan al revés de la factura**, como corresponde, y
  dejan de aparecer como documentos por pagar o cobrar.
- **La retención de honorarios sale de la fecha de emisión:** 15,25% en 2026, 16% en
  2027, 17% desde 2028. Si el formulario manda otra tasa, se reemplaza y se avisa.
- **Gratificación con tope legal, ausencias que no se descuentan dos veces, seguro de
  cesantía con tope propio y reglas por tipo de contrato.** Una base tributable sobre
  el mínimo exento sin tramos cargados ya no se liquida con impuesto cero.
- **Los paneles muestran el resultado real:** clasificaban por valores que el plan base
  no usa. El tipo de cuenta es ahora un dominio cerrado en la base.
- **Dos proveedores con el mismo folio ya no se pisan al importar**, y la misma factura
  manual no entra dos veces.
- **El número de asiento lo asigna el servidor.** Editar no renumera.
- **Autoría en las doce tablas contables**, fijada por la base en cada escritura.
- **Borrar una empresa a mano ya no borra su contabilidad en cascada.**

### Seis funciones nuevas, ninguna con inteligencia artificial

Todas leen datos que ya están en el sistema y los ordenan de una forma que hoy hay
que armar a mano. Proponen; no aplican nada por su cuenta. El detalle de cada una,
con sus reglas y sus límites, en `docs/ASISTENTES.md`.

- **Panel del estudio contable.** Todas las empresas en una pantalla, con un
  semáforo por cada una: rojo si algo hace que lo declarado no cuadre, amarillo si
  conviene mirarlo, verde si no hay nada pendiente. Antes, para saber si a una
  empresa le faltaba algo había que entrar a ella y revisar módulo por módulo.
- **Cierre mensual asistido.** Nueve comprobaciones antes de declarar y una
  respuesta clara arriba. Antes cada revisión vivía en otro lugar y nadie las
  juntaba, así que un error se descubría después de presentar el F29.
- **Calce automático del banco.** Propone a qué documento corresponde cada
  movimiento de la cartola. Cuando hay más de un candidato igual de bueno no
  propone ninguno: adivinar entre dos es peor que no proponer.
- **Clasificación por historial.** La cuenta que la empresa ya usaba para el mismo
  proveedor, aplicada al importar del SII y ofrecida hacia atrás. Antes cien
  facturas importadas quedaban todas en la cuenta por defecto.
- **Calendario tributario.** F29, cotizaciones y libro de remuneraciones con sus
  plazos. **Requiere validación tributaria:** los feriados móviles y las prórrogas
  del SII no están incluidos, y cada fecha lo dice.
- **Flujo de caja.** Antigüedad de lo que te deben y debes, más una proyección
  marcada como estimación: el sistema no guarda fecha de vencimiento, así que el
  plazo lo pone quien consulta.

Probando el cierre mensual sobre la copia de los datos reales apareció una
diferencia que conviene revisar: en ESTRUCTURAS JYJ, enero de 2026, una factura está
en el libro de compras con los montos en cero mientras su asiento registra 177.248,
con 28.110 de IVA crédito. El detalle está en `docs/ASISTENTES.md`.

### Datos que ya no se filtran entre clientes

- **Cualquier usuario podía marcar como conciliado un movimiento bancario de otro
  cliente.** La ruta que cambia el estado filtraba por el `empresa_id` del cuerpo
  pero nunca comprobaba la membresía. Apareció al construir el calce automático.

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
- **El análisis de cuentas y el panel financiero sumaban asientos anulados y de
  otros períodos** (A11). Una cuenta con todos sus movimientos anulados
  aparecía además con saldo cero en lugar de no aparecer.
- **Las liquidaciones de sueldo aceptaban los montos que enviara el navegador**
  (A13), incluidos AFP, salud, impuesto único y líquido a pagar. Una liquidación
  con cero de cotización previsional quedaba guardada como correcta. Ahora los
  montos los calcula el servidor y del cliente se aceptan solo las entradas.

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
- 130 pruebas automatizadas donde no había ninguna.
- Documentación: arquitectura, seguridad, despliegue, respaldos, entornos,
  esquema, costos, onboarding y términos.

## Antes de esto

El historial previo está en los commits. Lo relevante: el sistema funcionaba y
cubría contabilidad, tributario y remuneraciones, con SQL parametrizado y
transacciones en las operaciones importantes. Los problemas eran de aislamiento
entre clientes, de integridad y de operación, no de funcionalidad.
