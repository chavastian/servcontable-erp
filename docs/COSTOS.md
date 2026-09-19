# Costos e infraestructura

Actualizado: 2026-09-19. Valores de lista; conviene confirmarlos en la factura.

## Lo que se paga hoy

| Servicio | Para qué | Costo mensual |
|---|---|---|
| Render, servicio web Starter | API de producción | 7 dólares |
| Render, PostgreSQL Basic 256 MB | Base de datos | 6 dólares |
| Cloudflare Pages | Los tres frontend | 0 |
| Dominio `servcontablepro.cl` | | anual, no mensual |
| Flow | Pagos | comisión por transacción |
| SMTP | Correo | según el proveedor |

**Alrededor de 13 dólares al mes** de infraestructura fija, sin contar dominio,
comisiones ni correo.

El entorno de revisión no agrega costo: la API está en plan gratuito y su base
comparte la instancia de producción.

## Cuándo va a doler

**La base de 256 MB.** Producción pesa 12 MB con 15 empresas y unos 2.800
registros. Extrapolando, cada empresa activa con contabilidad real ocupará entre
5 y 20 MB al año. Con 20 clientes activos el espacio empieza a apretar. El
siguiente plan de Render son 1 GB.

**El servicio web Starter** tiene 512 MB de memoria. Suficiente hoy: las
importaciones leen archivos en memoria y el límite de 10 MB por archivo evita
que una carga grande lo tumbe. Con muchos clientes importando a la vez habrá que
subir.

**Almacenar adjuntos.** Es una función pendiente y necesita un servicio nuevo.
Cloudflare R2 tiene 10 GB gratis al mes, que para documentos escaneados alcanza
un buen rato. Es la opción más razonable, y por eso figura en el plan.

## Cuánto deja cada cliente

Precio actual: 29.990 pesos mensuales más IVA, con un usuario incluido, y 3.990
por usuario adicional.

Al cambio aproximado, 29.990 pesos son unos 31 dólares. Es decir: **el primer
cliente ya cubre toda la infraestructura fija con holgura.** Del segundo en
adelante, el costo marginal por cliente es el espacio en la base, que son
centavos.

Esto importa para decidir: subir a un plan mejor de base de datos cuesta lo
mismo que la mitad de un cliente al mes. No es una decisión que haya que
postergar por costo.

## Lo que conviene gastar y aún no se gasta

En orden de lo que más protege por lo que cuesta:

1. **Guardar los respaldos fuera de la máquina.** Hoy viven en el equipo donde
   se tomaron. Un almacenamiento de objetos cuesta prácticamente nada y elimina
   un punto único de falla. Es el gasto más urgente.

2. **Alta disponibilidad de la base.** Duplica el costo de la base. Se justifica
   cuando una interrupción de una hora empiece a significar llamadas de clientes
   enojados, no antes.

3. **Un entorno de revisión siempre encendido.** Siete dólares para que la
   versión nueva no tarde un minuto en despertar. Es comodidad, no necesidad.

4. **Registro centralizado y alertas.** Hoy los errores quedan en el registro de
   Render y hay que ir a mirarlos. Un servicio que avise cuando algo falla vale
   la pena cuando haya clientes que dependan del sistema a diario.

## Lo que no conviene gastar

- **Migrar a otro proveedor.** Render cuesta poco y funciona. Cambiar tiene
  costo de trabajo y ningún beneficio a esta escala.
- **Réplicas de lectura.** No hay problema de carga de lectura que las
  justifique.
- **Firebase para todo.** Ya se decidió: Firebase solo para autenticación, si
  algún día se necesita segundo factor.
