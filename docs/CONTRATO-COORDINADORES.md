# Cuentas de Coordinadores — contrato para el Backend (SCRUM-147)

La interfaz de SCRUM-147 (`/administracion/coordinadores`) usa el cliente
`frontend/src/lib/coordinadores/cliente.ts`. Estas rutas **aún no existen** en el
API Gateway: mientras tanto la interfaz muestra «El servicio de cuentas de
Coordinadores todavía no está disponible» (respuesta `RUTA_NO_ENCONTRADA`), sin
datos simulados. Fuente funcional: HU01, RF03 y RF68.

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
  "version": 1,
  "created_at": "2026-10-26T12:00:00.000Z",
  "updated_at": "2026-10-26T12:00:00.000Z"
}
```

`nombre`, `activo` y `version` vienen de `perfiles`; `correo` de `auth.users`;
`id_pais` de la asignación vigente con rol `COORD`. `pais` es opcional: si falta,
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
- **Edición:** el correo no se modifica desde esta interfaz. Cambiar `id_pais`
  debe revocar la asignación anterior y crear la nueva, para que el siguiente
  inicio de sesión aplique el país nuevo (HU01).
- **Desactivar:** la cuenta deja de poder iniciar sesión y sus registros se
  conservan con su autoría original. Nunca se borra.
- **Errores por campo:** 400 con `error.fields` usando las claves `nombre`,
  `correo` e `id_pais`; la interfaz los muestra junto al campo.
- **Concurrencia:** una `version_esperada` antigua devuelve 409; la interfaz pide
  recargar antes de reintentar.
