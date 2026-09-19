# Primeros pasos de un cliente nuevo

Actualizado: 2026-09-19.

Este documento describe lo que un cliente vive desde que llega a la web hasta
que tiene su contabilidad funcionando, y señala dónde el sistema lo acompaña y
dónde lo deja solo.

## El camino

### 1. Llega a la web

En `servcontablepro.cl` ve el precio y dos caminos: probar gratis o contratar.

### 2. Prueba gratuita

Deja nombre, correo, RUT y teléfono, y define su contraseña. El sistema:

- Crea el usuario y una suscripción en prueba por 30 días.
- Devuelve la sesión iniciada, así que entra directo sin volver a autenticarse.

No pide medio de pago. Es deliberado: pedirlo antes de que vea el sistema
espanta a la mitad de los interesados.

### 3. Contratación pagada

Elige mensual o anual, indica cuántos usuarios necesita y paga por Flow. Al
volver:

- Si ya tenía cuenta, su suscripción se extiende.
- Si no tenía, el sistema le crea una y le envía un correo para definir su
  contraseña. Antes este caso no activaba nada: la persona pagaba y no recibía
  acceso.

### 4. Primera vez dentro

Al entrar elige módulo, empresa y ejercicio. Si es nuevo, no tiene empresa
todavía, así que lo primero es crearla: RUT, razón social, giro y representante
legal.

### 5. Poner la contabilidad en marcha

Aquí es donde el cliente necesita más ayuda, y donde el sistema hoy lo acompaña
menos. El orden que funciona:

1. **Cargar el plan de cuentas.** Hay un plan base chileno de unas 450 cuentas
   que se carga con un botón. El cliente puede agregar las suyas.
2. **Configurar las cuentas contables.** Es el paso que más se olvida y el que
   hace fallar todo lo siguiente: el sistema necesita saber qué cuenta usar para
   clientes, proveedores, IVA débito, IVA crédito, caja y banco. Sin esto, los
   asientos automáticos de compras y ventas no se generan.
3. **Crear el ejercicio contable** del año en curso.
4. **Importar los libros del SII** de compras y ventas, que generan los asientos
   automáticamente.
5. **Si usa remuneraciones**: configurar los parámetros del período (UF, AFP,
   tope imponible), cargar los trabajadores y recién entonces liquidar.

### 6. Trabajo habitual

Importar los libros del mes, revisar, conciliar el banco, emitir informes,
liquidar sueldos.

## Dónde el sistema deja solo al cliente

Vale la pena tenerlo escrito, porque es donde se pierden clientes en silencio:

- **No hay guía de primeros pasos dentro de la aplicación.** El cliente entra y
  ve el selector de módulos. Nada le dice que lo primero es el plan de cuentas y
  la configuración contable.
- **El error por configuración contable faltante aparece tarde.** Se descubre al
  importar, cuando el mensaje dice que falta configurar, en lugar de avisarlo al
  entrar.
- **Sin datos de ejemplo.** No hay forma de ver cómo se ve un balance lleno antes
  de cargar la propia contabilidad.
- **Sin ayuda contextual.** Campos como «tramo de asignación familiar» o
  «tipo de cálculo de horas extras» suponen que quien los llena sabe de
  remuneraciones.

Lo que más rendiría, en orden: una lista de primeros pasos con el avance a la
vista, y adelantar el aviso de configuración faltante al momento de entrar.

## Soporte

- Correo de contacto, con el formulario de la web guardando cada solicitud.
- El panel de administración permite ver el estado de cada cliente, su
  suscripción y su historial de pagos y avisos.
- **Falta definir:** horario de atención, tiempo de respuesta comprometido y
  quién atiende.

## Lo que el equipo debería saber responder

- Cómo se carga el plan de cuentas, y que se puede reemplazar sin perder
  asientos: las cuentas con movimientos se desactivan, no se borran.
- Que un ejercicio cerrado no acepta cambios, y cómo reabrirlo.
- Que reimportar un libro del SII no duplica documentos ni pisa las correcciones
  hechas a mano.
- Que al vencer la suscripción los datos no se borran, y que pagar restablece el
  acceso de inmediato.
- Cómo invitar a un usuario y qué puede hacer cada rol.
