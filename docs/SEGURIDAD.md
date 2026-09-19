# Seguridad

Actualizado: 2026-09-19. Lo que aquí se afirma está respaldado por pruebas
automatizadas; se indica cuál en cada caso.

## Cómo se protege cada cosa

### Acceso

- Contraseñas con bcrypt, factor 10.
- Política mínima en un solo lugar: 8 caracteres, no de las evidentes, no puede
  contener el correo. Antes solo la validaba el reseteo por administrador, así
  que el registro, la prueba gratis y el reseteo por correo aceptaban una letra.
- Límites de intentos: login 10 cada 15 minutos contando por IP **y** correo a
  la vez, recuperación 5 por hora, registro 5 por hora. La IP se normaliza con
  el ayudante de la librería, porque con IPv6 un atacante tiene un rango entero
  y contar por dirección exacta no limita nada.
- Sesión de 4 horas, renovable mientras el token siga válido. Un token vencido
  no sirve para revivir la sesión.
- **Revocación real.** `usuarios.token_version` viaja dentro del token y se
  compara en cada petición: cambiar la contraseña o desactivar la cuenta deja
  fuera las sesiones abiertas de inmediato.
- Recuperación de contraseña con token hasheado, vigencia limitada, un solo uso
  e invalidación de los anteriores.

### Aislamiento entre clientes

Es lo que permite vender el sistema a varios clientes a la vez.

- Toda tabla de negocio lleva `empresa_id` y toda consulta lo filtra.
- La empresa de la petición se resuelve y valida en un solo middleware, después
  de multer en las rutas con archivo.
- Las claves foráneas se validan contra la empresa. El punto por donde pasan
  todas las líneas contables comprueba que cada cuenta imputada pertenezca a la
  empresa del comprobante, y lee la empresa del propio comprobante para que
  ninguna ruta pueda omitirlo.
- Un `empresa_id` no numérico se rechaza. Antes se convertía en `NaN`, que es
  falso, y la comprobación de membresía se saltaba entera.

Verificado en `backend/test/aislamiento.test.js`: 12 pruebas con dos empresas y
un usuario cada una, cubriendo lectura, escritura, importación multipart,
límites de archivo, privilegios y validación de entrada.

### Privilegios

- Roles de sistema: administrador del sistema, administrador de cliente,
  usuario.
- Cinco roles por empresa con permisos declarados. Un rol desconocido cae en el
  permiso más bajo y un permiso mal escrito en una ruta no concede nada: falla
  cerrado.
- Un administrador de cliente solo administra usuarios de empresas que
  administra, y nunca a un administrador del sistema.
- El administrador del sistema se crea solo desde `ADMIN_EMAIL` y
  `ADMIN_PASSWORD` al arrancar. El registro público ya no puede crear uno.

Verificado en `backend/test/roles.test.js`: 14 pruebas.

### Entrada

- Esquemas con zod en asientos, login, registro e importaciones. Además de tipos
  y formatos, valida la partida doble.
- SQL siempre parametrizado. La auditoría no encontró inyección y no se
  introdujo ninguna.
- Cuerpo JSON limitado a 1 MB.
- Archivos: 10 MB, uno por petición, con extensiones y tipos permitidos.

Verificado en `backend/test/validacion.test.js`: 13 pruebas.

### Respuestas

- El mensaje de PostgreSQL no vuelve al cliente en ninguno de los 47 puntos que
  lo hacían. El manejador central traduce los códigos conocidos.
- Un registro de otra empresa no se distingue de uno inexistente.
- El HTML de los correos se escapa. El de contacto inyectaba el mensaje del
  visitante sin escapar.

### Cabeceras y red

- `helmet`, con política de contenido cuando el backend sirve el frontend y HSTS
  solo en producción.
- CORS con lista de dominios permitidos.
- `trust proxy` en un solo salto: confiar en toda la cadena permitiría falsear
  la IP del cliente y con eso burlar los límites de intentos.
- Dependencias sin vulnerabilidades conocidas: `npm audit` en cero.

### Dinero

- Un pago activa una sola vez. Flow avisa por dos caminos a la vez y antes ambos
  extendían la suscripción: el cliente recibía dos meses por un pago. Ahora es
  una transacción con la fila bloqueada, más un índice único por proveedor y
  transacción como última red.
- Los cobros quedan registrados con su desglose.
- El estado de una contratación exige el token de la orden. Antes era público y
  los identificadores son consecutivos, así que recorriéndolos se obtenía el
  nombre, el correo y el monto de cada interesado.

Verificado en `backend/test/cobranza.test.js`: 15 pruebas, incluida la de dos
avisos simultáneos.

### Datos contables

- Sin `DELETE` físico: estados y reversas.
- Un ejercicio cerrado no admite escrituras.
- `creado_por` y `actualizado_por` en las tablas contables.
- La auditoría es de solo agregado: un disparador rechaza `UPDATE` y `DELETE`.
  Una auditoría que el sistema puede reescribir no sirve como prueba.

## Lo que falta

- **La base de datos acepta conexiones desde cualquier IP** (`0.0.0.0/0`). Está
  protegida por usuario y contraseña, pero conviene acotarla. Queda pendiente
  porque las herramientas de respaldo y migración se conectan desde fuera, y hay
  que decidir desde qué direcciones.
- Sin segundo factor. La opción natural es Firebase Auth solo para eso, que es
  la decisión ya tomada sobre Firebase.
- Los límites de intentos viven en memoria: con más de una instancia habría que
  compartirlos.
- Sin registro centralizado ni alertas automáticas. Hoy los errores quedan en el
  registro de Render.

## Si aparece una vulnerabilidad

1. Estimar el alcance: ¿se filtran datos entre clientes, o se afecta el dinero?
2. Si hay filtración entre clientes, tratarlo como incidente: revisar la
   auditoría para saber qué se accedió.
3. Corregir en la rama de trabajo, con una prueba que falle antes del arreglo.
4. Verificar en el entorno de revisión.
5. Desplegar según `docs/DESPLIEGUE.md`.
6. Anotar el hallazgo en `docs/AUDIT-2026-09.md` para que no se repita.

El paso 3 importa: una corrección sin prueba vuelve.
