# Contexto de la feature — Administración de cuentas de Coordinadores

## Objetivo

La feature integra la pantalla de administración de cuentas de Coordinadores con
el Backend existente. La interfaz no accede directamente a Supabase: todas las
operaciones pasan por el cliente HTTP compartido y el API Gateway.

Flujo principal:

```text
Frontend
  → frontend/src/lib/api/transporte.ts
  → API Gateway (/api/v1/coordinators)
  → Auth Service (/v1/coordinators)
  → RPC administrar_coordinadores
  → Supabase Auth y datos
```

La autorización permanece en el Backend. El Frontend solo transmite el Bearer
de la sesión actual, interpreta el contrato de respuesta y muestra los errores;
no replica las reglas de roles, alcance territorial ni activación de cuentas.

## Operaciones integradas

El cliente se encuentra en
`frontend/src/lib/coordinadores/cliente.ts` y expone:

| Operación | HTTP | Ruta del Gateway |
|---|---|---|
| Listar cuentas | GET | `/api/v1/coordinators` |
| Consultar cuenta | GET | `/api/v1/coordinators/:id` |
| Crear cuenta | POST | `/api/v1/coordinators` |
| Editar nombre o país | PATCH | `/api/v1/coordinators/:id` |
| Activar cuenta | POST | `/api/v1/coordinators/:id/activate` |
| Desactivar cuenta | POST | `/api/v1/coordinators/:id/deactivate` |

Todas las solicitudes autenticadas obtienen el token mediante la sesión de
Supabase y lo envían como `Authorization: Bearer <token>`.

## Interfaz

Las pantallas y controladores principales son:

- `frontend/src/pages/administracion/coordinadores.astro`: listado, filtros,
  métricas y activación/desactivación.
- `frontend/src/pages/administracion/coordinadores/nuevo.astro`: alta.
- `frontend/src/pages/administracion/coordinadores/[id]/editar.astro`: edición.
- `frontend/src/lib/coordinadores/interfaz-listado.ts`: carga y actualización
  optimista controlada del listado.
- `frontend/src/lib/coordinadores/interfaz-formulario.ts`: carga de catálogos,
  validación y envío de altas/ediciones.
- `frontend/src/lib/coordinadores/modelo.ts`: contrato y validaciones de datos.

Después de una operación exitosa, el listado actualiza la cuenta modificada o
recarga la vista mediante el flujo normal de navegación. Los errores de sesión,
permisos, validación, conflicto de versión, cuenta inexistente y disponibilidad
se muestran mediante `mensajeErrorCoordinadores`.

Los errores de validación que incluyen `error.fields` se muestran junto al
campo correspondiente, especialmente `nombre`, `correo` e `id_pais`.

## Cambio de país principal

El Backend guarda el nuevo `id_pais` y devuelve `cambio_pais_pendiente: true`
cuando todavía no se ha aplicado al alcance territorial de la sesión.

El Frontend conserva ese indicador y muestra:

> El nuevo país y sus permisos se aplicarán en el próximo inicio de sesión.

La aplicación efectiva del nuevo alcance, revocación del país anterior y
creación de la nueva asignación corresponde al trigger de Supabase al insertar
la siguiente sesión. El Frontend no intenta aplicar permisos localmente.

## Autorización y errores

El servicio Auth exige una sesión válida y comprueba en el Backend que el actor
sea un Administrador activo con alcance global. Las respuestas se interpretan
con el contrato común:

```json
{
  "ok": true,
  "code": "COORDINADOR_ACTUALIZADO",
  "message": "Cuenta actualizada.",
  "data": { "coordinator": {} }
}
```

Los errores mantienen el código, estado HTTP y errores por campo:

```json
{
  "ok": false,
  "error": {
    "code": "CONFLICTO_VERSION",
    "message": "La cuenta cambió. Recarga antes de reintentar.",
    "requestId": "...",
    "fields": {}
  },
  "data": null
}
```

La interfaz no decide si una operación está autorizada; muestra el resultado
recibido del Backend. Un `401` solicita volver a iniciar sesión, un `403`
informa que solo un Administrador puede gestionar cuentas y un `409` solicita
recargar por posible concurrencia.

## Persistencia y migración

La implementación de datos y autorización está definida en:

`supabase/migrations/20261027120000_fge_scrum145_coordinadores.sql`

La migración crea las estructuras privadas de cuentas y solicitudes de alta,
la RPC `public.administrar_coordinadores` y los triggers que completan altas y
aplican el país pendiente durante el siguiente inicio de sesión.

La credencial `SUPABASE_SERVICE_ROLE_KEY` solo es necesaria en el Backend para
crear identidades durante el alta. Nunca se expone al Frontend.

## Verificación local

Pruebas específicas ejecutadas:

```powershell
node --experimental-strip-types --test frontend/tests/clientes/coordinadores.test.mjs frontend/tests/validaciones/coordinadores.test.mjs
npm.cmd run build:frontend
npm.cmd run check --workspace=@fge/api-gateway
npm.cmd run check --workspace=@fge/auth-service
```

La suite específica del cliente y validaciones cubre listado, consulta, alta,
edición, activación, desactivación, cuerpos del contrato, Bearer, errores por
campo y conservación de `cambio_pais_pendiente`.

La suite E2E de Coordinadores ejecutó correctamente los flujos de listado,
filtros, alta, edición, activación, desactivación, errores y diseño responsive.
Un caso de navegación quedó afectado por una aserción preexistente del test que
usa un selector no estricto sobre cuatro enlaces ocultos; no corresponde a una
falla del flujo de cuentas.

## Estado de Supabase

La existencia de los objetos siguientes confirma que la migración fue aplicada:

- `fge_private.cuentas_coordinadores`
- `fge_private.altas_coordinadores`
- `public.administrar_coordinadores(text, jsonb)`
- `fge_private.aplicar_pais_coordinador_login()`

Para validar el registro de la migración:

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version = '20261027120000';
```

No se creó una migración adicional para esta feature.
