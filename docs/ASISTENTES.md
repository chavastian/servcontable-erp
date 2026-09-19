# Las seis funciones que sistemacontable.cl no tiene

Ninguna usa inteligencia artificial. Todas leen datos que ya están en el sistema y
los ordenan de una forma que hoy hay que armar a mano. Eso importa por dos
razones: no agregan costo variable por consulta, y lo que muestran se puede
verificar mirando los documentos.

Las seis comparten una regla: **proponen, no aplican**. Lo único que escribe es
aplicar una clasificación de cuenta y confirmar un calce bancario, y en los dos
casos la persona elige qué se aplica.

---

## 1. Panel del estudio contable

`GET /api/panel-estudio?periodo=AAAA-MM` · pantalla **Principal → Panel del
estudio**

Todas las empresas del usuario en una lista, con un semáforo por empresa.

Antes, para saber si a una empresa le faltaba algo había que entrar a ella, elegir
el ejercicio y revisar módulo por módulo. Un contador con veinte clientes no hace
eso cada mañana, así que en la práctica no lo hacía y los problemas aparecían al
declarar.

El color significa siempre lo mismo:

| Color | Qué contiene |
|---|---|
| Rojo | Asientos descuadrados, documentos duplicados o sin cuenta asignada. Cosas que hacen que lo declarado no cuadre. |
| Amarillo | Documentos sin contabilizar, movimientos de banco sin conciliar, liquidaciones faltantes. |
| Verde | Nada pendiente en el período. |

Además muestra por empresa el IVA débito, crédito, determinado, a pagar y
remanente, los documentos del período, el estado del ejercicio y la última
actividad registrada.

**Detalle de implementación que importa:** la consulta es por concepto y no por
empresa. Una consulta trae los documentos sin cuenta de *todas* las empresas, otra
los asientos descuadrados de todas, y así. Con veinte empresas son once consultas,
no ciento noventa.

**El panel corre las mismas nueve revisiones que el cierre mensual, con la misma
gravedad.** La primera versión miraba solo seis, y el resultado fue que el panel
pintaba verde una empresa que el cierre marcaba en rojo: el IVA de los libros
podía no coincidir con lo contabilizado y el panel no lo miraba. Un semáforo que
contradice al detalle no se vuelve a mirar. Hay una prueba que compara los dos
estados y falla si se separan.

## 2. Cierre mensual asistido

`GET /api/cierre-mensual?empresa_id=N&periodo=AAAA-MM` · pantalla **Tributario →
Cierre mensual**

Las nueve comprobaciones que un contador hace de memoria antes de declarar, todas
juntas, y una respuesta clara arriba: se puede declarar o no.

1. Asientos con debe distinto del haber.
2. Documentos sin cuenta asignada.
3. Documentos sin asiento generado.
4. Documentos duplicados (mismo tipo, folio y RUT).
5. IVA del libro contra el IVA contabilizado.
6. Movimientos de banco sin conciliar.
7. Folios faltantes en la serie de ventas.
8. Montos atípicos: más de cinco veces el promedio histórico de ese proveedor.
9. Estado del ejercicio.

Cada revisión devuelve la misma forma (`codigo`, `titulo`, `estado`, `detalle`,
`cantidad`, `afectados`) y `estado` es `ok`, `aviso` o `error`. La diferencia
importa: un aviso conviene mirarlo, un error hace que lo declarado no cuadre.

`GET /api/cierre-mensual/estado` devuelve solo el semáforo, para pintar un
indicador sin traer las listas.

La revisión 5 necesita `cuenta_iva_debito_id` y `cuenta_iva_credito_id`
configuradas; si faltan, lo dice en lugar de callarse. La 8 necesita al menos tres
documentos previos del mismo proveedor para tener un promedio.

## 3. Calce automático del banco

`GET /api/conciliacion-bancaria/sugerencias?empresa_id=N&periodo=AAAA-MM` ·
pantalla **Registros → Calce automático del banco**

Propone a qué documento corresponde cada movimiento pendiente de la cartola.
Conciliar era recorrer la cartola línea por línea comparando montos a ojo.

Reglas, en orden de confianza:

| Confianza | Regla |
|---|---|
| Alta | Monto exacto, RUT presente en la descripción y fecha dentro de 30 días. |
| Media | Monto exacto y fecha dentro de 5 días, si hay un solo candidato. |
| Baja | Monto exacto y fecha dentro de 30 días, si hay un solo candidato. |

Si quedan varios candidatos igual de buenos **no se propone ninguno**: adivinar
entre dos es peor que no proponer. Esos aparecen aparte, con los candidatos
listados, para elegir a mano.

Los RUT se leen de la descripción escritos de cualquier forma: con puntos, sin
puntos, con guion o pegados.

Confirmar un calce marca el movimiento como conciliado por
`PUT /api/conciliacion-bancaria/:id/estado`, que es el único lugar donde se
escribe ese estado, y ahora guarda **contra qué comprobante** se concilió.

## 4. Clasificación por historial

`GET /api/sugerencias-cuenta?empresa_id=N&periodo=AAAA-MM` ·
`POST /api/sugerencias-cuenta/aplicar` ·
`GET /api/sugerencias-cuenta/por-rut?empresa_id=N&rut=...` · pantalla **Registros →
Clasificar documentos**

Cuando se importaban cien facturas del SII, todas quedaban en la cuenta de gasto
por defecto y alguien tenía que cambiarlas una por una. Pero la empresa ya decidió
antes en qué cuenta va cada proveedor: la luz a Suministros, el arriendo a
Arriendos, el contador a Honorarios. Esa decisión está en los documentos
anteriores del mismo RUT.

Se elige la cuenta más usada para ese RUT; si hay empate, la del documento más
reciente. Hacen falta **al menos dos documentos previos**: con uno solo la
"historia" es una casualidad.

Esto también corre **durante la importación de compras del SII**: cada factura
queda en la cuenta que la empresa ya usaba para ese proveedor, y como el
comprobante automático usa la cuenta del documento, el asiento también sale bien.
La respuesta de la importación informa cuántas se clasificaron así.

Aplicar hacia atrás no sobrescribe una cuenta ya asignada, no toca períodos con el
ejercicio cerrado, y comprueba que la cuenta pertenezca a la empresa. Asignar la
cuenta no rehace el asiento ya generado: eso hay que regenerarlo.

## 5. Calendario tributario

`GET /api/calendario-tributario?periodo=AAAA-MM` · pantalla **Tributario →
Calendario tributario**

F29, cotizaciones previsionales, libro de remuneraciones electrónico y, según el
mes, declaraciones juradas y renta anual. Con los días que faltan y un estado
(vencida, urgente, próxima, a tiempo).

El plazo del F29 depende de la empresa: al 20 para quien emite solo documentos
electrónicos y paga por internet, al 12 para el resto. Las cotizaciones, al 13 con
pago electrónico en Previred y al 10 en papel. Las dos son opciones de la consulta.

### REQUIERE VALIDACIÓN TRIBUTARIA

Las fechas legales se mueven. Cuando un vencimiento cae sábado, domingo o festivo
pasa al día hábil siguiente, y los feriados chilenos cambian cada año: algunos son
móviles por la Ley 19.973 y otros dependen de la Pascua. El SII además prorroga
plazos por resolución.

Lo que se calcula: los feriados de fecha fija, más Viernes Santo y Sábado Santo
desde el algoritmo de la Pascua. Lo que **no** se calcula: feriados móviles,
regionales, decretados y prórrogas del SII.

Toda fecha viaja con `requiere_validacion: true` y la respuesta incluye el aviso de
confirmar en `sii.cl` y `previred.com`. Este calendario recuerda, no reemplaza el
aviso oficial.

## 6. Flujo de caja proyectado

`GET /api/flujo-caja?empresa_id=N&plazo_dias=30&semanas=8` · pantalla **Informes →
Flujo de caja**

Dos cosas distintas en una respuesta, y se distinguen a propósito:

**La antigüedad de la cartera es un hecho.** Cuánto te deben y desde cuándo,
repartido en tramos (por vencer, 1 a 30, 31 a 60, 61 a 90, más de 90), tanto por
cobrar como por pagar. El saldo pendiente se calcula igual que en cuentas por
cobrar: total del documento menos los pagos vigentes imputados a él. Si las dos
pantallas calcularan distinto, ninguna sería creíble.

**La proyección es una estimación**, y la respuesta lo dice con
`es_estimacion: true` y la lista de supuestos.

### La limitación, dicha completa

Las tablas de compras y ventas **no guardan fecha de vencimiento**: el sistema
nunca la pidió. Entonces no se puede saber cuándo vence realmente cada factura. Lo
que se hace es aplicar un plazo en días sobre la fecha del documento, y ese plazo
lo define quien consulta (30 por omisión, el plazo comercial más común en Chile).

Lo ya vencido se informa aparte y no se reparte en las semanas: un cliente que no
ha pagado en noventa días probablemente no pague la próxima semana, y diluirlo en
la proyección la volvería optimista sin decirlo.

La proyección no incluye sueldos, cotizaciones, impuestos ni gastos que todavía no
estén registrados como documento.

**Agregar la fecha de vencimiento al documento es el paso siguiente**, y entonces
esto puede dejar de estimar.

---

## Un hueco de aislamiento que apareció al hacer esto

`PUT /api/conciliacion-bancaria/:id/estado` filtraba por el `empresa_id` que venía
en el cuerpo, pero **nunca comprobaba que el usuario fuera miembro de esa
empresa**. Cualquier usuario autenticado podía marcar como conciliado un
movimiento de otro cliente. La ruta ahora pasa por `exigirEmpresa` y
`exigirPermiso("REGISTRAR")`, y el `comprobante_id` que se guarda se valida contra
la misma empresa. Hay tres pruebas que lo cubren.

## Una falla que se descubrió probando

El driver de PostgreSQL entrega las columnas `DATE` como objetos `Date` de
JavaScript, no como texto. Los cálculos que hacían `String(fecha).slice(0, 10)`
obtenían `"Sun Apr 1"`, y de ahí `Date.parse` devolvía `NaN`: el calce no
encontraba ningún candidato y la proyección de caja lanzaba `Invalid time value`.
Las dos fallas eran silenciosas en un caso y ruidosa en el otro, y las dos venían
del mismo supuesto.

`helpers/fecha.helper.js` normaliza toda fecha a `AAAA-MM-DD` antes de cualquier
resta, y para un `Date` usa los componentes locales, no los UTC: el driver
construye la medianoche local del día guardado, así que `toISOString()` puede
correr el día según el huso.

## Cómo probarlo

```
cd backend
DATABASE_URL=<staging> node --test test/asistentesContables.test.js
DATABASE_URL=<staging> npm test          # 165 pruebas
DATABASE_URL=<staging> npm run smoke:api # 47 endpoints
```

## Lo que encontró en datos reales

Corriendo el cierre mensual sobre `servcontable_staging`, que es una copia de los
datos de producción, para ESTRUCTURAS JYJ en enero de 2026:

- **El IVA de los libros no coincide con el IVA contabilizado.** Es un error que
  nadie había visto porque nada comparaba las dos cifras.
- **Falta un folio en la serie de ventas.** Puede ser un documento sin registrar.

Y el flujo de caja informa 4.043.479 pesos por cobrar, **todos con más de noventa
días**. El sistema tenía el dato; no tenía dónde mostrarlo.
