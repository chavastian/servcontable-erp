# Revisión de los términos y del tratamiento de datos

Revisión del 2026-09-19 sobre `docs/TERMINOS_Y_DATOS.md`.

**Esto no es asesoría legal y no la reemplaza.** Es una revisión técnica hecha
contra el texto de las leyes chilenas, verificado en la fuente y con la cita a
mano. Sirve para que un abogado llegue al problema en vez de al inventario, y
para que las decisiones de producto que dependen de la ley se tomen sabiendo qué
dice. Lo que está marcado **verificado** se leyó en la norma; lo que está marcado
**por confirmar** no pudo comprobarse y hay que preguntarlo.

---

## Lo primero, porque cambia el contrato entero

**La mayoría de tus clientes son consumidores ante la ley, aunque sean empresas,
y esa protección no se puede renunciar por contrato.**

El borrador asume una relación entre empresas. No lo es. La Ley 20.416, el
Estatuto PYME, en su artículo noveno pone a las micro y pequeñas empresas en rol
de consumidoras frente a sus proveedores, y les aplica casi todo el régimen de la
Ley 19.496. El texto es explícito en que esa aplicación **«será irrenunciable
anticipadamente»**. Verificado.

El corte está en las ventas anuales: hasta 2.400 UF es microempresa, hasta 25.000
UF es pequeña empresa. Una oficina contable chica y la mayoría de las pymes que
son tus clientes caen dentro.

Qué significa en concreto:

- Una cláusula que diga que la ley del consumidor no aplica es **nula**.
- Te obligan los artículos sobre cláusulas abusivas, contratos de adhesión,
  información, publicidad y retracto.
- Los conflictos van al juzgado de policía local, y el SERNAC **no** participa.
  Eso es a la vez un alivio y una desventaja: no hay demanda colectiva del
  SERNAC, pero tampoco su mediación.
- Hay una vuelta de tuerca en el mismo artículo noveno: cuando lo contratado se
  relaciona con el giro principal del cliente, el tribunal considera que su deber
  de profesionalidad **equivale al del proveedor**. Un software contable es
  exactamente el giro principal de una oficina contable.

Sobre si un cliente más grande queda fuera: la Ley 19.496 excluye los actos que
son mercantiles para las dos partes, y un software comprado como insumo del giro
lo es. **Por confirmar:** no se encontró jurisprudencia chilena sobre software
como servicio vendido entre empresas. La conclusión se apoya en el texto y en la
doctrina del destinatario final, no en un fallo.

---

## Lo que el borrador dice y hay que corregir

### La base ya no acepta conexiones de cualquier dirección

El texto dice que sí. Desde hoy la lista está restringida y la intención es
dejarla vacía al cerrar la revisión. Hay que actualizar la frase antes de
publicar, porque describir una debilidad que ya no existe es tan inexacto como
ocultar una que sí.

### Falta decir quién es el proveedor

El documento no dice la razón social, el RUT ni el domicilio de quien presta el
servicio. Sin eso no hay contrato que obligue a nadie, y la ley del consumidor
exige identificar al proveedor. Es la omisión más básica y la más fácil de
corregir.

### Faltan tres cláusulas que todo contrato de este tipo lleva

1. **Ley aplicable y tribunal competente.** Con la prevención de que, para
   clientes micro y pequeños, la competencia del juzgado de policía local viene
   dada por ley y no se pacta.
2. **Límite de responsabilidad.** Imprescindible en un sistema contable, y con un
   techo: en Chile no se puede excluir la responsabilidad por dolo ni por culpa
   grave, y una cláusula que lo intente es abusiva.
3. **Propiedad de los datos.** Debe decir expresamente que los datos son del
   cliente y que el proveedor solo los trata por encargo.

### Los proveedores que participan son subencargados y hay que nombrarlos

Render, Cloudflare, el proveedor de correo y Flow tratan datos por cuenta tuya. El
borrador los menciona como infraestructura; en un contrato de tratamiento son
subencargados, el cliente tiene que saber quiénes son y hay que comprometerse a
avisar cuando cambien.

---

## Datos personales

### La ley nueva entra en vigencia en poco más de dos meses

La Ley 21.719, que reforma el régimen de datos personales y crea la Agencia, se
publicó el 13 de diciembre de 2024 y **entra en vigencia el 1 de diciembre de
2026**. Hoy, 19 de septiembre de 2026, todavía no rige. Verificado.

Eso significa que un contrato que se publique ahora nace con menos de tres meses
de vida útil si se escribe solo para la ley vigente. Hay que escribirlo para la
ley nueva desde el principio.

### El sistema guarda datos sensibles y el borrador no lo dice

Esto es lo que más me preocupa del documento. El módulo de remuneraciones
registra **licencias médicas** por trabajador, con sus días. Eso es información de
salud de una persona identificada, y los datos de salud son datos sensibles bajo
la ley chilena, con un régimen más estricto que el resto.

El borrador enumera los datos de trabajadores sin distinguir. Hay que:

- Decir expresamente que se tratan datos sensibles y cuáles son.
- Revisar si el acceso a esos datos dentro del sistema está restringido por rol,
  o si cualquier usuario con permiso de remuneraciones los ve.
- Incluirlos en la cláusula de tratamiento por encargo con mención específica.

### Lo que falta del régimen de datos, para preguntarle al abogado

- **Contenido obligatorio del contrato entre responsable y encargado** bajo la ley
  nueva. **Por confirmar.**
- **Transferencia internacional a Estados Unidos.** Los datos están en Oregón. La
  ley nueva regula esto y hay que saber bajo qué mecanismo se ampara.
  **Por confirmar.**
- **Notificación de brechas de seguridad.** El borrador no la menciona en
  absoluto, y la ley nueva la exige. Hay que definir a quién se avisa, en qué
  plazo y con qué contenido, y escribirlo en el contrato y en el procedimiento
  interno. **Por confirmar el plazo exacto.**

---

## Suscripción, renovación y término

Acá el borrador es más conservador de lo que la ley exige, y conviene saberlo
antes de gastar desarrollo.

**Chile no obliga a avisar antes de renovar ni a tener un botón de cancelación de
un clic.** Se revisó la Ley 19.496 y la Ley 21.398 «Pro Consumidor», y ninguna
impone eso. Verificado, con una prevención: la consolidación oficial en línea de
la Ley 19.496 resultó inaccesible y el hallazgo negativo se apoya en fuentes
cruzadas, no en una sola versión autorizada al día.

Lo que sí obliga:

- **El silencio no es aceptación** en los actos de consumo. Es el artículo 3
  letra a), y es el ancla contra la renovación tácita. Una renovación automática
  tiene que estar pactada de forma clara, no darse por aceptada por no decir nada.
- **Hay que informar, en términos simples, por qué canales se ejercen los derechos
  y cómo se termina el contrato.** Artículo 17 A.
- **No se pueden limitar los canales** por los que el consumidor ejerce sus
  derechos. Es la letra h) del artículo 16, agregada por la Ley Pro Consumidor, y
  hace nula la cláusula que lo intente. En la práctica: si se contrata por la web,
  no se puede exigir que la baja sea por teléfono o por carta.
- **Las cláusulas ambiguas se interpretan a favor del consumidor**, y entre
  cláusulas contradictorias gana la más favorable.

**Recomendación:** no hace falta construir un botón de cancelación inmediata para
cumplir la ley, pero sí decir con claridad cómo se da de baja y no poner
obstáculos. Y dado que el sistema tiene renovación automática, el consentimiento a
esa renovación tiene que ser explícito en la contratación.

**Sobre el derecho de retracto de diez días:** aplica a los contratos celebrados
por medios electrónicos, pero la propia ley permite que en la contratación de
servicios el proveedor disponga lo contrario. Si se quiere excluir, hay un
reglamento de 2024, vigente desde febrero de 2025, que exige comunicarlo antes de
contratar, en el mismo lugar donde se informa el precio, de forma destacada y en
un tamaño no menor al del precio. Verificado.

---

## Conservación y eliminación de datos

El borrador dice que falta definir el plazo. Acá está lo que la ley obliga, que
es más largo y más complicado de lo que suele suponerse.

| Norma | Qué exige |
|---|---|
| Código Tributario, artículos 17 y 200 | Conservar mientras el SII pueda revisar: 3 años, o 6 si la declaración no se presentó o es maliciosamente falsa |
| Ley del IVA, artículo 58 | Seis años, en número fijo, para duplicados de facturas y originales de boletas |
| Código de Comercio, artículo 44 | Conservar los libros **hasta que termine por completo la liquidación del negocio**, y la obligación pasa a los herederos |

Todo verificado en la fuente.

Tres consecuencias prácticas:

1. **Un cliente no puede pedir que se borre todo.** La ley obliga a conservar, y
   eso hay que decírselo en el contrato en lugar de prometer una eliminación que
   no se puede cumplir.
2. **No debe haber borrado automático** de registros que alimentan determinaciones
   todavía revisables: pérdidas de arrastre, remanentes de crédito fiscal,
   depreciaciones. El propio SII lo dice: esos hay que conservarlos más tiempo.
3. **Perder los libros no termina la exposición, la congela.** El artículo 97
   número 16 del Código Tributario dice que la pérdida o inutilización de los
   libros **suspende la prescripción** hasta que queden reconstituidos. Eso
   convierte el respaldo automático, que en el plan figura como decisión de
   costo, en un asunto de cumplimiento.

**Recomendación de plazo:** diez años como regla, que es lo que sugiere la
práctica profesional considerando además la prescripción penal, con seis años como
mínimo legal y sin purga automática de lo que alimente períodos no prescritos.

---

## Lo que sigue siendo decisión del negocio

El borrador ya los identificaba y siguen abiertos, pero ahora con contexto legal:

1. **Política de devoluciones.** Decisión comercial, con el límite de que para
   clientes micro y pequeños rigen las reglas del consumidor.
2. **Compromiso de disponibilidad.** La infraestructura actual no tiene alta
   disponibilidad. Prometer lo que no se puede cumplir es peor que no prometer.
3. **Acceso de soporte a datos de un cliente.** Hoy el administrador del sistema
   puede ver todo. Hay que definir en qué casos, con qué registro y avisando al
   cliente. Con datos sensibles de por medio, esto sube de prioridad.
4. **Exportación completa de los datos.** Hoy se exporta por módulo. Conviene
   tenerla antes de prometerla, y la ley nueva de datos refuerza ese derecho.

---

## Resumen para el abogado

Si solo se leen cinco líneas de este documento, que sean estas:

1. Los clientes micro y pequeños son consumidores por ley y no pueden renunciar a
   esa protección.
2. El sistema trata datos sensibles de salud de trabajadores y el borrador no lo
   declara.
3. La ley nueva de datos personales entra en vigencia el 1 de diciembre de 2026.
4. Los datos salen de Chile hacia Estados Unidos y falta definir bajo qué amparo.
5. Falta identificar al proveedor, la ley aplicable, el límite de responsabilidad
   y la propiedad de los datos.
