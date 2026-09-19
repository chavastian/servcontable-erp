# Arquitectura

Actualizado: 2026-09-19.

## Cómo se ve desde arriba

```
Navegador
   │  JWT en sessionStorage, 4 horas, renovable
   ▼
Cloudflare Pages                    Render (Oregon)
  app.servcontablepro.cl  ────────►  api.servcontablepro.cl
  servcontablepro.cl                   Express 5
  demo.servcontablepro.cl                │
                                         ▼
                                  PostgreSQL 18
                                  servcontable_pro

Externos: Flow (pagos), SMTP (correo)
```

Un solo servicio de API, una sola base. No hay colas, ni cache, ni
microservicios, y no hacen falta: el sistema atiende estudios contables, no
tráfico masivo.

## La petición, paso a paso

Este orden importa y es donde se concentran los arreglos de seguridad:

```
1. helmet                    cabeceras
2. límite general            300 por minuto
3. express.json (1 MB)       o multer, según la ruta
4. límite específico         login, registro, pagos, importaciones
5. verificarToken            firma, versión de sesión, suscripción vigente
6. multer                    solo en rutas con archivo
7. exigirEmpresa             membresía. Después de multer: antes req.body está vacío
8. exigirPermiso             rol dentro de la empresa
9. validar (zod)             tipos, formatos y partida doble
10. controlador
11. manejador de errores     traduce, sin filtrar mensajes de PostgreSQL
```

El paso 7 después del 6 no es un detalle de estilo: es la corrección del
hallazgo más grave de la auditoría. En las importaciones, `req.body` está vacío
antes de multer, así que cualquier comprobación de membresía anterior se salta
en silencio y el controlador termina confiando en el `empresa_id` del
formulario.

## Las tres fronteras

**Entre clientes.** Toda tabla de negocio lleva `empresa_id`. El middleware de
empresa resuelve y valida uno solo por petición, y lo normaliza sobre la propia
petición para que no queden dos fuentes de verdad. Las claves foráneas se
validan aparte: `insertarDetallesComprobante` comprueba que cada cuenta
imputada pertenezca a la empresa del comprobante, y lee la empresa del propio
comprobante para que ninguna de las siete rutas que la llaman pueda omitirlo.

**Entre roles.** Cinco roles por empresa con permisos declarados. Las rutas
piden el permiso (`ANULAR`, `CERRAR_EJERCICIO`), no el rol.

**Entre lo que se cobra y lo que se usa.** `validarAccesoSuscripcion` corre en
cada petición autenticada y responde 402 cuando la suscripción no está vigente,
con una lista corta de rutas exentas para poder pagar.

## Decisiones que conviene entender antes de cambiarlas

**El estado vive en `sessionStorage`, no hay router.** El frontend es una
máquina de estados: módulo, empresa, ejercicio, panel. Cerrar la pestaña cierra
la sesión, que para datos contables compartidos en una oficina es lo correcto.
Agregar un router sería un cambio grande sin beneficio evidente.

**El token es un JWT firmado y el servidor no guarda los emitidos.** Para poder
revocar se agregó `usuarios.token_version`, que viaja dentro del token y se
compara en cada petición. Cambiar la contraseña o desactivar la cuenta deja
fuera las sesiones abiertas de inmediato.

**La cobranza corre dentro del servicio.** En el plan Starter está siempre
encendido, así que no hace falta un programador externo. Si algún día hay más de
una instancia, habrá que asegurarse de que corra en una sola.

**Los límites de intentos viven en memoria.** Con un servicio alcanza. Con
varios habría que moverlos a la base o a un cache compartido.

**Las migraciones se aplican durante el despliegue** (`npm install && npm run
migrate`). Un despliegue que no puede migrar no arranca, que es preferible a
arrancar contra un esquema que no corresponde.

## Números que dan la escala

| Cosa | Cuánto |
|---|---|
| Tablas | 37 |
| Controladores | 40 |
| Routers | 41 |
| Módulos del backend | 116 |
| Pantallas del frontend | 39 |
| Pruebas automatizadas | 130 |
| Base de producción | 12 MB |

## Lo que no hay, y está bien que no haya

- Cache. Las consultas van directo a PostgreSQL. Con este volumen sobra.
- Colas. El único trabajo en segundo plano es la cobranza diaria.
- Réplicas de lectura ni alta disponibilidad. La base no tiene HA, y es una
  decisión de costo consciente.
- TypeScript. El proyecto es JavaScript y migrarlo no resolvería ninguno de los
  problemas que la auditoría encontró.
