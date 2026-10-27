# Cuentas de Coordinadores — contrato para el Backend (SCRUM-147)

La interfaz de SCRUM-147 (`/administracion/coordinadores`) usa el cliente
`frontend/src/lib/coordinadores/cliente.ts`. SCRUM-145 implementa estas rutas en
el servicio Auth y las publica a través del API Gateway. Requiere aplicar
`20261027120000_fge_scrum145_coordinadores.sql`. Fuente funcional: HU01, RF03 y RF68.

Todas las rutas exigen `Authorization: Bearer <sesión>` y solo el rol `ADMIN`
puede usarlas (403 para cualquier otro rol; HU01 pide registrar el intento en la
auditoría). Respuestas con el envoltorio común `{ ok, code, message, data }`.

## Recurso `coordinator`

```json
{
  "id_usuario": "uuid de auth.users / perfiles",
  "nombre": "María Castillo",
  "correo": "maria@fundacion.org",
  "id_pais": "uuid del país principal (asignaciones_roles COORD, alcance pais)",
  "pais": { "id_pais": "uuid", "nombre": "Chile", "codigo_iso": "CL" },
  "activo": true,
  "cambio_pais_pendiente": false,
  "version": 1,
  "created_at": "2026-10-26T12:00:00.000Z",
  "updated_at": "2026-10-26T12:00:00.000Z"
}
```

`nombre`, `activo` y `version` vienen de `perfiles`; `correo` de `auth.users`;
`id_pais` es el país principal configurado (puede estar pendiente de aplicar a
la asignación COORD). `pais` es opcional: si falta,
la interfaz usa el catálogo `/api/v1/organizations/countries`.

## Rutas

| Método y ruta | Cuerpo | `data` |
|---|---|---|
| GET `/api/v1/coordinators` | — | `{ coordinators: coordinator[] }` (activas e inactivas) |
| GET `/api/v1/coordinators/:id` | — | `{ coordinator }` |
| POST `/api/v1/coordinators` | `{ nombre, correo, id_pais }` | `{ coordinator }` |
| PATCH `/api/v1/coordinators/:id` | `{ version_esperada, cambios: { nombre?, id_pais? } }` | `{ coordinator }` |
| POST `/api/v1/coordinators/:id/deactivate` | `{ version_esperada }` | `{ coordinator }` con `activo: false` |
| POST `/api/v1/coordinators/:id/activate` | `{ version_esperada }` | `{ coordinator }` con `activo: true` |

- **Creación:** nombre (1–120), correo válido (se envía en minúsculas, máx. 254) y
  país principal obligatorios. La cuenta debe quedar habilitada para iniciar
  sesión con ese correo (HU01). Correo repetido: 409 con
  `error.fields.correo = ["…"]`.
- **Edición:** el correo no se modifica. Cambiar `id_pais` guarda el país nuevo
  con `cambio_pais_pendiente: true`. En el siguiente inicio de sesión se revoca
  la asignación anterior y se crea la nueva; una renovación no aplica el cambio.
- **Desactivar:** la cuenta deja de poder iniciar sesión y sus registros se
  conservan con su autoría original. Nunca se borra.
- **Errores por campo:** 400 con `error.fields` usando las claves `nombre`,
  `correo` e `id_pais`; la interfaz los muestra junto al campo.
- **Concurrencia:** una `version_esperada` antigua devuelve 409; la interfaz pide
  recargar antes de reintentar.

## Implementación y puesta en marcha (SCRUM-145)

Base: `origin/sprint-8` en `ce52112`. Rama:
`feature/SCRUM-145-administracion-cuentas-coordinadores`.

El servicio necesita `SUPABASE_URL`, `SUPABASE_ANON_KEY` y, **solo para el alta**,
`SUPABASE_SERVICE_ROLE_KEY` en `backend/.env`. La credencial privada nunca se
expone en Frontend ni se utiliza en las consultas/RPC: estas llevan el JWT del
Administrador y la clave pública. No agregar prefijos `PUBLIC_` a la credencial
privada. `PASSWORD_RESET_REDIRECT_URL` debe apuntar a `/cambiar-contrasena` y
estar admitida en las URLs de redirección de Supabase.

La migración crea un registro privado de cuentas y solicitudes de alta, una RPC
autorizada y triggers en `auth.users`/`auth.sessions`. No cambia las columnas
del esquema Auth ni inserta identidades mediante SQL. El despliegue requiere
privilegios para crear esos triggers. Validar estos puntos con la versión de
Supabase Auth del proyecto antes de desplegar en producción.

### Alta y acceso

1. La RPC comprueba Administrador activo con alcance global, país no archivado,
   campos y correo único, y reserva la solicitud en un esquema privado.
2. El Backend crea la identidad mediante Auth Admin, con contraseña aleatoria
   de 48 bytes que nunca devuelve ni registra. Una referencia en `app_metadata`
   (no modificable por el usuario) enlaza la solicitud autorizada.
3. Un trigger completa perfil, cuenta y asignación territorial en la misma
   transacción que la identidad. Si falla, no queda un usuario parcialmente
   provisionado. La solicitud queda disponible para reintentar.
4. Se solicita un enlace de recuperación para que el destinatario establezca
   su contraseña. `data` devuelve `{ coordinator, acceso: "enlace_enviado" }`.
   Si falla el correo, devuelve igualmente 201 y
   `acceso: "recuperacion_pendiente"`: la cuenta ya existe y puede utilizar
   «Recuperar contraseña» en el login. No se devuelve el enlace ni el token.

Reintentar exactamente el alta por el mismo Administrador recupera la identidad
reservada, sin duplicarla. El mismo correo con datos distintos u otro actor da
409 `CORREO_EN_USO`. Una cuenta previamente existente en Auth también da 409;
no se cambia su rol ni se adopta automáticamente. Un timeout de red puede tener
resultado incierto: recargar el listado o reintentar exactamente la solicitud.

### Edición, sesiones e historial

`version_esperada` es un entero positivo seguro; no se admite `null`, texto,
decimales, cambio de correo, roles, identificadores ni campos adicionales.
`cambios` contiene al menos `nombre` (1–120 caracteres) o `id_pais` (UUID).
Los identificadores de ruta deben ser UUID. Las rutas no admiten query params.

El país configurado se guarda separado del país aplicado. Insertar una nueva
fila en `auth.sessions` aplica el cambio y conserva la asignación anterior
revocada; actualizar la sesión durante una renovación no lo aplica. Como las
políticas actuales consultan asignaciones en vivo, tras ese nuevo login el
nuevo alcance es común a las sesiones de esa cuenta que sigan abiertas.

Desactivar actualiza `perfiles.activo`, establece `auth.users.banned_until`,
revoca COORD y elimina únicamente las sesiones Auth para impedir su renovación.
Activar quita el bloqueo y restituye la asignación territorial aplicada. Los JWT
ya emitidos pueden seguir identificando al usuario hasta expirar, pero sus
asignaciones COORD quedan revocadas. Nunca se eliminan usuarios, perfiles,
asignaciones ni registros de negocio. Los triggers existentes conservan
`created_at`/`created_by`, incrementan versión y anexan auditoría.

Solo se administran cuentas COORD territoriales sin otras asignaciones activas.
La migración incorpora las existentes con una única asignación territorial no
ambigua. Cuentas globales, con varios países u otros roles requieren revisión
explícita; no se convierten automáticamente. Si una cuenta administrada adquiere
otras asignaciones, sus modificaciones devuelven 409 `CUENTA_NO_ADMINISTRABLE`.

### Respuestas y errores

GET/PATCH/cambios de estado: 200. Alta: 201. Todas las respuestas usan el contrato
común. Ejemplo de error:

```json
{"ok":false,"error":{"code":"PAIS_PRINCIPAL_INVALIDO","message":"Selecciona un país principal existente y activo.","requestId":"uuid","fields":{"id_pais":["Selecciona un país principal existente y activo."]}},"data":null}
```

| HTTP | Código | Situación |
|---|---|---|
| 400 | `PAIS_PRINCIPAL_INVALIDO` | País obligatorio, inválido, inexistente o archivado |
| 400 | `DATOS_INVALIDOS` / `JSON_INVALIDO` | Tipos, formato, versión o campos no admitidos |
| 401 | `SESION_REQUERIDA` / `SESION_INVALIDA` | Sesión ausente o rechazada |
| 403 | `SIN_PERMISO` | No es Administrador activo global |
| 404 | `COORDINADOR_NO_ENCONTRADO` | Identificador inexistente o no administrable como COORD |
| 409 | `CORREO_EN_USO` / `CONFLICTO_VERSION` | Duplicado o edición concurrente |
| 409 | `CUENTA_NO_ADMINISTRABLE` | Cuenta con otras asignaciones |
| 413 | `SOLICITUD_DEMASIADO_GRANDE` | JSON mayor que 32 KiB |
| 429 | `DEMASIADAS_SOLICITUDES` | Límite del proveedor |
| 503 | `CONFIGURACION_CUENTAS` / `MIGRACION_COORDINADORES_PENDIENTE` | Falta clave privada o SQL |
| 502/503 | `RESPUESTA_CUENTAS_INVALIDA` / `CUENTAS_NO_DISPONIBLES` | Persistencia, timeout o red |

Las respuestas llevan `Cache-Control: no-store`. Los intentos con JWT válido y
rol insuficiente se registran en una tabla privada; la RPC devuelve la denegación
para conservar ese registro antes de que HTTP responda 403. Un token rechazado
por PostgREST no llega a la RPC. No se registran tokens, contraseñas ni errores
crudos del proveedor.

### Pruebas locales

```powershell
npm.cmd run test --workspace=@fge/auth-service
node --experimental-strip-types --test frontend/tests/clientes/coordinadores.test.mjs frontend/tests/validaciones/coordinadores.test.mjs
node scripts/verificar-coordinadores-db.mjs <directorio-node_modules-con-pglite>
```

El script SQL ejecuta PostgreSQL embebido con `@electric-sql/pglite`, las
migraciones base reales y un esquema Auth mínimo de prueba. Comprueba las
operaciones, auditoría, historial, país pendiente frente a renovación/login,
rollback completo del alta, conflictos y permisos. No sustituye una prueba
integrada con GoTrue/SMTP de Supabase; no crea cuentas ni envía correos reales.

Referencias oficiales de integración:
[Auth Admin](https://supabase.com/docs/reference/javascript/admin-api),
[sesiones y renovación](https://supabase.com/docs/guides/auth/sessions).

Verificación local del 27 de octubre de 2026: 204 pruebas de backend/arquitectura,
13 pruebas de cliente/validaciones de Coordinadores y compilación del Frontend
aprobadas. El script PostgreSQL pasó 42 comprobaciones. Frontend `/login` y
`/administracion/coordinadores`: 200; Gateway `/health`: 200; renovación con token
ficticio por Gateway: 401 `SESION_INVALIDA`, comprobando la conexión real de Auth
con Supabase. Coordinadores sin sesión: 401 `SESION_REQUERIDA`.

La migración no se aplicó al Supabase remoto. El entorno local no tenía
`SUPABASE_SERVICE_ROLE_KEY`: el alta real queda pendiente de esa configuración,
la migración y una prueba integrada con Auth/SMTP. No se crearon cuentas reales,
no se enviaron correos ni se modificaron los archivos locales del usuario.
