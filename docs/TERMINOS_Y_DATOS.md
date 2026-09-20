# Términos de uso y tratamiento de datos

Borrador del 2026-09-19. **REQUIERE REVISIÓN LEGAL antes de publicarse.**

Antes de llevárselo a un abogado, lee `docs/REVISION_LEGAL.md`: revisa este texto
contra la ley chilena verificada en la fuente y encontró cosas que cambian el
contrato, entre ellas que la mayoría de los clientes son consumidores por ley
aunque sean empresas, y que el sistema guarda datos sensibles de salud que este
borrador no declara.

Este documento existe porque no se puede cobrar por un servicio que maneja datos
contables de terceros sin decir por escrito qué se hace con ellos. Lo que sigue
describe con exactitud cómo funciona el sistema hoy, para que un abogado lo
convierta en texto vinculante sin tener que averiguar nada.

## Qué es el servicio

ServContable PRO es un sistema en línea de contabilidad y remuneraciones para
empresas chilenas. El cliente registra sus operaciones y el sistema produce
libros, balances, informes tributarios y liquidaciones de sueldo.

El servicio es una herramienta. **No presta asesoría contable ni tributaria.**
Las declaraciones ante el Servicio de Impuestos Internos y ante la Dirección del
Trabajo son responsabilidad del cliente y de su contador. El sistema calcula a
partir de lo que el cliente ingresa.

Hay cálculos que dependen de criterio profesional. Los que el sistema aplica
según la práctica habitual, y que conviene que el contador del cliente revise,
están señalados en el código y en `docs/PLAN.md` como **REQUIERE VALIDACIÓN
CONTABLE/TRIBUTARIA**. A la fecha, el más relevante es el tratamiento de las
notas de crédito en el resumen de IVA y en el F29.

## Qué se cobra y cómo

- Precio base mensual por cuenta, con un usuario incluido y empresas ilimitadas.
- Un valor por cada usuario adicional.
- IVA sobre el total.
- Los valores vigentes están en la configuración del sistema y se muestran antes
  de pagar. A la fecha: 29.990 pesos mensuales más 3.990 por usuario adicional,
  más IVA.

**Prueba gratuita.** 30 días, sin medio de pago. Al terminar, el acceso se
bloquea y los datos quedan guardados.

**Vencimiento y días de gracia.** El sistema avisa por correo 10, 5, 2 y 0 días
antes. Vencido el plazo hay 5 días de gracia con acceso normal. Agotados, el
acceso queda bloqueado y solo se puede entrar a la pantalla de pago.

**Los datos no se borran al bloquear.** Pagar restablece el acceso de inmediato,
con todo el historial.

**Pagos.** A través de Flow. El sistema no almacena datos de tarjetas: no pasan
por sus servidores.

**Devoluciones.** Falta definir la política. Es una decisión comercial.

## Qué datos se guardan

Del cliente:

- Nombre, correo, RUT y teléfono de cada usuario.
- Datos de las empresas: RUT, razón social, giro, dirección, representante
  legal.
- Toda la información contable que el cliente ingresa: documentos, asientos,
  pagos, conciliaciones.
- Datos de trabajadores para remuneraciones: RUT, nombre, fecha de nacimiento,
  cargo, sueldo, AFP, salud, cargas familiares, cuenta bancaria.

Generados por el sistema:

- Registro de auditoría de las operaciones: quién hizo qué y cuándo.
- Fecha del último acceso de cada usuario.
- Historial de suscripción, pagos y avisos enviados.

**Los datos de trabajadores son datos personales de terceros.** El cliente los
ingresa y es su responsable ante ellos. El sistema los procesa por encargo del
cliente. Esto conviene que quede explícito en el contrato.

## Dónde están y quién los ve

- Servidores de Render en Oregón, Estados Unidos. La base de datos y la
  aplicación están allí.
- Frontend distribuido por Cloudflare.
- Correos a través del proveedor SMTP configurado.

**Transferencia internacional.** Los datos salen de Chile. Hay que decirlo con
claridad y verificar qué exige la ley chilena de protección de datos personales
al respecto.

Quién puede ver los datos de un cliente:

- Los usuarios que ese cliente autoriza, con el rol que les asigna.
- El administrador del sistema, para soporte. **Falta definir y documentar en
  qué casos y con qué registro.** Hoy técnicamente puede ver todo.

Ningún cliente puede ver los datos de otro. Es la frontera principal del sistema
y está respaldada por pruebas automatizadas.

## Qué se hace para protegerlos

Resumido; el detalle está en `docs/SEGURIDAD.md`.

- Contraseñas guardadas con bcrypt, nunca en claro.
- Conexiones cifradas.
- Aislamiento entre clientes verificado con pruebas.
- Roles por empresa: un usuario de consulta no puede modificar nada.
- Auditoría que el propio sistema no puede alterar.
- Respaldos, con restauración verificada antes de cada despliegue.

Lo que falta también se dice: no hay segundo factor de autenticación.

La base de datos dejó de aceptar conexiones desde cualquier dirección el
19-09-2026. Hoy la lista está restringida al rango desde donde se administra, y
la aplicación no depende de ella porque se conecta por la red interna del
proveedor. La intención es dejarla vacía al cerrar la revisión.

## Derechos del cliente

- **Acceder** a sus datos. Todo lo que ingresó es visible y exportable a Excel y
  PDF desde el sistema.
- **Corregir** lo que esté equivocado, con las limitaciones propias de la
  contabilidad: un ejercicio cerrado no se modifica, se reabre o se corrige con
  una reversa.
- **Llevarse sus datos.** Hoy se exporta por módulo. **Falta un botón de
  exportación completa**, que conviene tener antes de prometerlo.
- **Que se eliminen.** **Falta definir el procedimiento y el plazo**, y hay que
  considerar que la ley obliga a conservar documentación tributaria por varios
  años, así que no todo se puede borrar a pedido.

## Si el servicio se interrumpe

- No hay compromiso de disponibilidad por escrito. **Falta definirlo.**
- La base no tiene alta disponibilidad: una falla del servidor implica una
  interrupción mientras se restablece.
- Existe recuperación punto en el tiempo, así que una pérdida total de datos es
  improbable, pero no imposible.

Conviene ser honesto en el contrato en lugar de prometer disponibilidad que la
infraestructura actual no garantiza.

## Lo que hay que decidir antes de publicar

1. Política de devoluciones.
2. Compromiso de disponibilidad, si se ofrece alguno.
3. Procedimiento y plazo de eliminación de datos, compatible con la obligación
   de conservar documentación tributaria.
4. En qué casos el soporte accede a datos de un cliente, y cómo se registra.
5. Revisión legal del texto completo, incluida la transferencia internacional.
6. Exportación completa de los datos de un cliente, antes de prometerla.

Los puntos 1, 2 y 4 son decisiones del negocio. El 3 y el 5 necesitan abogado.
El 6 es trabajo de desarrollo.
