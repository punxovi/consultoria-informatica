# Solicitudes y acceso de Invitados — SCRUM-171

## Instalación

Aplicar `supabase/migrations/20261106120000_fge_scrum171_ciclo_invitados.sql`
después de las migraciones anteriores, incluida la matriz de visibilidad de
Invitados `20261104110000`. Ejecutar luego
`supabase/checks/invitados-ciclo-acceso.sql`: debe devolver PASS y revierte sus
datos de prueba. No envía correos.

Backend usa `SUPABASE_URL` y `SUPABASE_ANON_KEY`; nunca necesita una service role
para este flujo. Configurar `FRONTEND_URL`, o bien `GUEST_ACCESS_REDIRECT_URL`
con la URL completa `/invitado/acceso`. En Supabase Auth, habilitar acceso por
correo, creación de usuarios externos y proveedor SMTP del proyecto. Añadir la
URL exacta de retorno a Authentication → URL Configuration → Redirect URLs.
Localmente: `http://127.0.0.1:4321/invitado/acceso`.

Se utiliza `/auth/v1/otp`, que crea la identidad externa y envía un enlace de
acceso; no recuperación de contraseña. Mantener la plantilla de correo con el
enlace de confirmación estándar, no sustituirlo por un código que la pantalla
no solicita. Supabase valida el enlace de un solo uso y su caducidad previa al
primer acceso, configurada en Auth. La autorización institucional dura **24
horas desde el primer uso**, independientemente de la duración del JWT.

Referencia del proveedor: [acceso por correo sin contraseña](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## Operaciones HTTP

Gateway `/api/v1/guests`; servicio Auth `/v1/guests`.
Respuestas JSON estándar `{ok,code,message,data,error}` según el contrato común.
No se admiten campos adicionales en los cuerpos de creación/revisión.

| Método y ruta | Permiso | Cuerpo / respuesta `data` |
|---|---|---|
| POST `/request` | Público | `{nombre:string,correo:string,institucion?:string,motivo?:string}` → `{guest:{id_invitado,estado,created_at}}`, HTTP 201 |
| GET `/` | ADMIN activo | Sin parámetros; `{guests:Guest[]}`, últimas 200 solicitudes, orden recepción descendente e identificador |
| GET `/{id}` | ADMIN activo | UUID; `{guest:Guest}` |
| POST `/{id}/approve` | ADMIN activo | `{version_esperada:number}` → `{guest:Guest}`; envía enlace |
| POST `/{id}/reject` | ADMIN activo | `{version_esperada:number}` → `{guest:Guest}` |
| POST `/{id}/revoke` | ADMIN activo | `{version_esperada:number}` → `{guest:Guest}` |
| POST `/consume` | JWT Auth de la persona aprobada | `{}` → `{guest:Guest}` con `utilizado_en` y `expira_en` |

Operaciones autenticadas usan `Authorization: Bearer <access_token>`.
`Guest` contiene UUID `id_invitado`, nombre, correo, institución/motivo opcionales,
estado, versión positiva, fechas de recepción y modificación; al aprobar incluye
responsable/fecha de aprobación y al consumir, usuario, asignación, primer uso y
expiración. Fechas ISO 8601 con zona horaria. La sesión interna no se devuelve y
no se genera ni expone un token propio del sistema.

Nombre: 1–120 caracteres sin controles; correo normalizado a minúsculas, máximo
254, formato válido. Institución máximo 150 y motivo 255; ambos opcionales, sin
controles. Versión entera positiva. SQL vuelve a validar las entradas y permisos,
incluidas llamadas directas a PostgREST.

## Ciclo y errores

`pendiente → aprobado → revocado`, o `pendiente → rechazado`. Una aprobación sin
uso puede repetirse con su versión actual para reenviar el correo. Si el envío
falla, responde HTTP 502 `ENVIO_ENLACE_FALLIDO`: la aprobación queda persistida,
pero no se informa éxito de entrega; consultar de nuevo para obtener la versión
y reintentar. Un HTTP exitoso del proveedor confirma aceptación del envío, no la
recepción en la bandeja del destinatario.

El primer consumo verifica la identidad de Auth con correo confirmado, perfil
activo, aprobación, sesión emitida desde la aprobación y ausencia de roles
internos. Bloquea el registro para impedir dos primeros usos simultáneos.
Asocia el nombre declarado, usuario y sesión verificados; otorga INVIT y fija
`expira_en = utilizado_en + 24 horas`. Un segundo consumo se rechaza. Renovar el
JWT no extiende esa fecha ni habilita otra sesión.

Revocar conserva la solicitud y la auditoría, revoca la asignación y deniega
inmediatamente la autorización del JWT anterior. Los JWT pueden seguir siendo
criptográficamente válidos para Supabase Auth; la sesión **no conserva acceso
institucional**: RLS, Storage, roles, consulta de sesión, login y renovación
comprueban la vigencia. No se confía en que el navegador cierre sesión para
aplicar la revocación. La matriz HU23 sigue limitando los datos visibles.

Un acceso expirado puede solicitarse nuevamente: se conserva y revoca el
antecedente y se abre una solicitud nueva. No se permite reutilizar correos con
solicitud pendiente/aprobada sin expirar ni cuentas con asignaciones activas.

| HTTP / código | Situación |
|---|---|
| 400 `DATOS_INVALIDOS` | Formatos, campos o identificadores inválidos |
| 401 `SESION_REQUERIDA` / `ENLACE_INVALIDO` / `SESION_INVALIDA` | Ausencia de sesión, uso repetido, expiración o revocación |
| 403 `SIN_PERMISO` | Operación administrativa sin ADMIN activo |
| 404 `INVITADO_NO_ENCONTRADO` | Solicitud inexistente |
| 409 `CORREO_EN_USO` / `CONFLICTO_VERSION` / `TRANSICION_INVALIDA` | Duplicado o cambio no admitido |
| 502 `ENVIO_ENLACE_FALLIDO` | Correo no aceptado por el proveedor |
| 503 `MIGRACION_INVITADOS_PENDIENTE` / `SERVICIO_NO_DISPONIBLE` | Falta SQL o conexión |

RPC `gestionar_invitados(text,jsonb)` expone las mismas operaciones por SQL con
verificación de permisos dentro de la función. `validar_acceso_invitado()` indica
vigencia de la sesión autenticada; para usuarios internos sin solicitudes de
Invitado no añade restricciones. `get_user_roles()` excluye accesos vencidos,
revocados o de otra sesión.

Las políticas restrictivas se agregan a las tablas con RLS existentes de public
y a `storage.objects` al aplicar la migración. Las tablas internas administradas
por Supabase Storage (como `buckets_vectors`) no se modifican.
Las futuras tablas y funciones definer que
incorporen lectura para Invitados deben mantener esta comprobación de vigencia.

## Verificación

- `npm run test:architecture`: 280 pruebas aprobadas.
- `node --experimental-strip-types --test frontend/tests/validaciones/invitados.persistencia.test.mjs`: 7 aprobadas; SQL real en PostgreSQL aislado, incluyendo el script remoto y rollback.
- La primera aplicación remota encontró una RPC anterior creada fuera de Git.
  La migración reemplaza su implementación manteniendo la firma y excluye las
  tablas internas administradas de Storage. El usuario confirmó la aplicación
  final y aportó captura de la comprobación PASS en Supabase.
- Pruebas automatizadas de envío usan un proveedor simulado; entrega real del
  correo y recorrido del enlace en una bandeja real pendientes de comprobación.
