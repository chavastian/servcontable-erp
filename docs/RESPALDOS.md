# Respaldos

Actualizado: 2026-09-19.

## Qué hay hoy

| Mecanismo | Quién lo mantiene | Alcance |
|---|---|---|
| Recuperación punto en el tiempo | Render | Desde el 2026-09-15. Permite volver a un instante concreto. |
| Respaldo lógico propio | `backend/scripts/respaldo.js` | Esquema y datos completos en un archivo, con manifiesto verificable. |

La API de exportación manual de Render responde error 500, así que el respaldo
propio es el mecanismo explícito y el que se puede verificar.

## Tomar un respaldo

```bash
cd backend
DATABASE_URL=<origen> node scripts/respaldo.js
```

Escribe dos archivos en `respaldos/`:

- `respaldo-<marca>.sql` con el esquema y los datos.
- `respaldo-<marca>.manifest.json` con el número de filas y una huella MD5 por
  tabla.

El manifiesto es lo que convierte el archivo en algo verificable. Un respaldo
que no se puede comprobar no sirve de nada.

## Verificar que sirve

Esto es lo que de verdad importa y hay que correrlo antes de cada despliegue a
producción:

```bash
cd backend
ORIGEN_DATABASE_URL=<produccion> node scripts/probar-restauracion.js
```

Toma el respaldo, crea una base descartable, aplica las migraciones, restaura,
compara tabla por tabla contra el manifiesto, levanta la API sobre esa base,
recorre los endpoints y borra la base de prueba. Termina con error si algo no
coincide.

## Restaurar

```bash
cd backend
DATABASE_URL=<destino> node scripts/restaurar.js <archivo.sql> --vaciar
```

Compara contra el manifiesto al terminar y falla si alguna tabla no coincide.

Se niega a correr contra una base cuyo nombre no contenga `test` o `staging`.
Para producción hay que pasar `--forzar`, justamente para que no ocurra por
descuido.

## Detalles que costaron encontrar

Los dos aparecieron al verificar el respaldo, no al leer el código, y son la
razón por la que la verificación no es opcional:

- **Las marcas de tiempo se desplazaban cuatro horas.** El driver `pg` convierte
  `timestamp without time zone` a un `Date` interpretado en la zona de la
  máquina; al volver a escribirlo como ISO se sumaba el desfase de Chile. Ahora
  las fechas y horas se leen como texto crudo, tal como las guarda PostgreSQL.

- **Dividir el archivo por punto y coma rompía 32 sentencias.** Un texto con
  saltos de línea partía la sentencia en dos. Ahora cada `INSERT` ocupa
  exactamente una línea, con los saltos escapados, y la restauración lee por
  líneas en lotes de 250.

## Qué falta

- **Programar el respaldo.** Hoy se toma a mano. Lo natural es que el propio
  servicio lo haga a diario, como ya hace con los avisos de cobranza, y suba el
  archivo a un almacenamiento externo. Eso requiere decidir dónde guardarlo, y
  cualquier servicio con costo necesita aprobación.

- **Guardar los respaldos fuera de la máquina.** `respaldos/` está fuera de Git
  a propósito, porque contiene datos reales de clientes, pero eso significa que
  hoy viven solo en el equipo donde se tomaron.

- **Probar la restauración de forma periódica**, no solo antes de desplegar.

## Lo que un respaldo no cubre

El archivo trae el esquema y los datos. No trae las variables de entorno ni las
claves de Flow y de correo, que viven en el panel de Render. Una reconstrucción
desde cero necesita las dos cosas: el respaldo y esas variables.
