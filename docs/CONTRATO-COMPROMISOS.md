# Contrato implementado — Compromisos

La integración está implementada en el servicio de Organizaciones y se enruta
por el API Gateway.

Todas las rutas reciben `Authorization: Bearer <token>` y usan el sobre
`{ok:true,data:...}`. Base: `/api/v1/organizations/:org/commitments`.

| Método | Sufijo | Respuesta |
| --- | --- | --- |
| GET | vacío | `{compromisos:[...]}`; filtro opcional `id_acta=UUID` |
| GET | `/origins` | `{puede_gestionar:boolean,actas:[{id_acta,nombre,id_plan,id_accion}]}` |
| GET | `/:id` | `{compromiso:{...}}` |
| POST | vacío | `{compromiso:{...}}`, HTTP 201 |
| PATCH | `/:id` | `{compromiso:{...}}` |

POST recibe `id_acta`, `descripcion`, `responsable_nombre`,
`responsable_contacto`, `fecha_limite` (AAAA-MM-DD), `observaciones` y estado
opcional `pendiente`. PATCH recibe `{version_esperada,cambios:{...}}`; el acta
es inmutable y no se envía dentro de cambios. Los IDs son UUID reales.

La respuesta agrega `id_compromiso`, `id_organizacion` derivada del acta,
`version` positiva, `created_at`, `updated_at` y `cumplido_at` (ISO o null).
Los estados son `pendiente` y `cumplido`. Vencido se calcula por fecha local.
El servidor asigna auditoría, versión y fecha de cumplimiento; conserva esa fecha
si se edita un compromiso ya cumplido y la limpia al reabrirlo.

Errores: 400 por datos inválidos, 401 sin sesión, 403 sin gestión,
404 por recurso inexistente/no visible, 409 por concurrencia o acta de otra
organización, 503 por falta de conexión con Supabase. Un error nunca se presenta
como lista vacía ni activa datos de demostración.

La tabla conserva `id_contacto_responsable` y añade `responsable_contacto` mediante
la migración de Actas. Los históricos sin contacto pueden consultarse y deben
completar el dato al editar. Los compromisos creados dentro de Actas se guardan
atómicamente, se consultan en ambos módulos y enlazan al detalle del acta real.
