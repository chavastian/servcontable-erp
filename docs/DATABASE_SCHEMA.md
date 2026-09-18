# Esquema de base de datos — ServContable PRO

Generado el 2026-09-18 por introspección de la base de producción (Render, PostgreSQL 18.4).

**37 tablas · 76 claves foráneas · 77 índices** antes de la migración de índices;
la migración `1758200100000_indices-e-integridad` agrega 40 índices más y cuatro restricciones únicas.

## Cómo se cambia el esquema

Con migraciones, nunca desde el código de la aplicación.

```bash
cd backend
npm run migrate            # aplica lo pendiente
npm run migrate:create -- agregar-campo-x
npm run schema:dump        # regenera database/schema.sql
```

`database/schema.sql` es la foto del esquema y el punto de partida de una instalación limpia.
`database/migrations/` es el mecanismo de cambio. Hasta septiembre de 2026 el backend creaba
tablas y columnas en tiempo de ejecución, en cada petición autenticada; eso se eliminó.

## Convenciones del esquema heredado

- Toda tabla de negocio lleva `empresa_id`: es la frontera entre clientes. Ninguna consulta debe omitirlo.
- Claves primarias `SERIAL` (enteros consecutivos y por lo tanto predecibles desde fuera).
- Baja lógica con `estado` (`vigente`, `anulado`, `eliminado`), no `DELETE` físico.
- Períodos como texto `AAAA-MM`; fechas como `DATE`; marcas de tiempo sin zona.
- Montos en `NUMERIC`, con dos precisiones mezcladas: `NUMERIC(14,2)` y `NUMERIC(18,2)`.
  Los precios de suscripción sí son `INTEGER` en pesos, que es lo correcto para CLP.
- Nombres de tablas y columnas en español, salvo el módulo de suscripciones, que está en inglés.

## Tablas por dominio

### Identidad y acceso

| Tabla | Columnas | Filas en producción | Referencias a |
|---|---|---|---|
| `usuarios` | 24 | 15 | — |
| `usuarios_empresas` | 7 | 17 | `empresas`, `usuarios` |
| `password_reset_tokens` | 8 | 4 | `usuarios` |
| `empresas` | 17 | 15 | — |

### Contabilidad

| Tabla | Columnas | Filas en producción | Referencias a |
|---|---|---|---|
| `plan_cuentas` | 10 | 1619 | `empresas` |
| `configuracion_contable` | 15 | 3 | `empresas`, `plan_cuentas` |
| `ejercicios_contables` | 10 | 14 | `empresas` |
| `comprobantes` | 11 | 115 | `empresas` |
| `comprobante_detalle` | 9 | 421 | `comprobantes`, `plan_cuentas` |

### Documentos tributarios

| Tabla | Columnas | Filas en producción | Referencias a |
|---|---|---|---|
| `ventas` | 17 | 17 | `comprobantes`, `empresas`, `plan_cuentas` |
| `compras` | 21 | 36 | `comprobantes`, `empresas`, `plan_cuentas` |
| `honorarios` | 18 | 2 | `comprobantes`, `empresas` |
| `remanente_iva` | 13 | 1 | `empresas` |
| `pagos_cobros` | 18 | 27 | `comprobantes`, `empresas`, `plan_cuentas` |
| `conciliacion_bancaria_movimientos` | 14 | 98 | — |

### Remuneraciones

| Tabla | Columnas | Filas en producción | Referencias a |
|---|---|---|---|
| `trabajadores` | 36 | 7 | `empresas` |
| `liquidaciones` | 56 | 10 | `comprobantes`, `empresas`, `impuesto_unico_tramos`, `trabajadores` |
| `liquidacion_detalle` | 8 | 0 | `conceptos_remuneracion`, `liquidaciones` |
| `configuracion_remuneraciones` | 35 | 9 | `empresas`, `plan_cuentas` |
| `afp_parametros` | 13 | 127 | `empresas` |
| `impuesto_unico_tramos` | 9 | 14 | `empresas` |
| `conceptos_remuneracion` | 10 | 0 | `empresas` |
| `haberes_descuentos_remuneraciones` | 14 | 22 | `empresas`, `trabajadores` |
| `pagos_remuneraciones` | 13 | 5 | `comprobantes`, `empresas`, `plan_cuentas` |
| `finiquitos` | 49 | 3 | `comprobantes`, `empresas`, `trabajadores` |
| `vacaciones_ausencias` | 17 | 0 | `empresas`, `trabajadores` |

### Suscripciones y cobranza

| Tabla | Columnas | Filas en producción | Referencias a |
|---|---|---|---|
| `subscription_plans` | 14 | 5 | — |
| `subscriptions` | 21 | 1 | `subscription_plans`, `usuarios` |
| `subscription_payments` | 25 | 0 | `subscriptions`, `usuarios` |
| `subscription_history` | 11 | 2 | `subscriptions`, `usuarios` |
| `subscription_notifications` | 13 | 0 | `subscriptions`, `usuarios` |
| `subscription_settings` | 4 | 13 | — |
| `contrataciones_web` | 22 | 6 | — |
| `pagos_mercadopago` | 26 | 7 | — |

### Auditoría y contacto

| Tabla | Columnas | Filas en producción | Referencias a |
|---|---|---|---|
| `auditoria_movimientos` | 11 | 101 | — |
| `admin_audit_logs` | 10 | 4 | `usuarios` |
| `solicitudes_contacto` | 25 | 16 | — |

## Restricciones únicas relevantes

Ya existían en producción:

- `comprobantes` único en (empresa_id, tipo, numero)
- `configuracion_contable` único en (empresa_id)
- `ejercicios_contables` único en (empresa_id, anio)
- `pagos_mercadopago` único en (external_reference)
- `password_reset_tokens` único en (token_hash)
- `plan_cuentas` único en (empresa_id, codigo)
- `remanente_iva` único en (empresa_id, periodo)
- `subscription_plans` único en (code)
- `usuarios` único en (email)
- `usuarios_empresas` único en (usuario_id, empresa_id)

Agregadas por la migración de índices:

- `empresas` RUT único, normalizado sin puntos ni espacios. Antes se podía crear la misma empresa dos veces.
- `contrataciones_web` una orden de Flow no puede activar dos suscripciones.
- `subscription_payments` un pago por proveedor y número de transacción.
- `subscription_notifications` un aviso por usuario, tipo de evento y día.

## Pendientes conocidos

- Dos precisiones distintas para montos. Unificar exige revisar cálculos y se aborda en la fase de integridad contable.
- `plan_cuentas.tipo` mezcla ocho vocabularios (`Activo`, `Pasivo`, `Pérdida`, `Ganancia`, `Gasto`, `Ingreso`, `Costo`, `Patrimonio`).
  Los reportes clasifican por nombre de cuenta, lo que es frágil.
- `usuarios` arrastra columnas de suscripción y de demo que hoy duplican lo que vive en `subscriptions`.
- Faltan `creado_por` y `actualizado_por` en las tablas contables.
