# Validaciones y endpoints de Actas de Reunión

Las Actas pertenecen al servicio de Intervenciones porque están relacionadas con una Organización, un Plan y, opcionalmente, una Acción. Todas las rutas requieren una sesión válida y pasan el token del usuario a Supabase para que las políticas RLS apliquen su alcance territorial.

## Endpoints

| Método | Ruta | Operación |
|---|---|---|
| `GET` | `/api/v1/meeting-minutes` | Listar actas visibles para la sesión. |
| `GET` | `/api/v1/meeting-minutes/:id` | Consultar un acta por ID. |
| `POST` | `/api/v1/meeting-minutes` | Registrar un acta. |
| `PATCH` | `/api/v1/meeting-minutes/:id` | Actualizar un acta con control de versión. |

El listado acepta los filtros opcionales `id_organizacion`, `id_plan`, `id_accion` e `incluir_archivadas`.

## Creación

```json
{
  "id_organizacion": "11111111-1111-4111-8111-111111111111",
  "id_plan": "33333333-3333-4333-8333-333333333333",
  "id_accion": null,
  "objetivo": "Revisar los avances del plan",
  "fecha_reunion": "2026-10-08",
  "asistentes": ["Coordinador", "Representante"],
  "asistentes_externos": "Invitado externo",
  "observaciones": "Se definieron los próximos pasos."
}
```

La Organización debe existir y el Plan debe pertenecer a ella. Cuando se envía una Acción, debe pertenecer al Plan indicado.
Los asistentes externos son opcionales; cuando se informan deben contener entre 3 y 500 caracteres.

## Actualización

```json
{
  "version_esperada": 1,
  "cambios": {
    "objetivo": "Objetivo actualizado"
  }
}
```

La versión evita sobrescribir cambios de otra sesión. Las respuestas siguen el contrato común `{ ok, code, message, data }`; los errores incluyen códigos estables para validación, permisos, relaciones, concurrencia, conexión y base de datos.
