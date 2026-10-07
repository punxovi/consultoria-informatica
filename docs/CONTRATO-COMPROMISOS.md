# Contrato propuesto — SCRUM-105

El backend de Compromisos aún no existe en la base `bd5e3c5` de sprint-5. Estas rutas son la interfaz esperada por `frontend/src/lib/compromisos/cliente.ts`, no rutas ya desplegadas.

Todas reciben `Authorization: Bearer <token>` y devuelven el sobre HTTP habitual `{ ok: true, data: ... }`. El gateway debe derivarlas al servicio de organizaciones.

| Método y ruta | data de respuesta |
| --- | --- |
| GET `/api/v1/organizations/:org/commitments` | `{ compromisos: [...] }` (lista vacía válida) |
| GET `/api/v1/organizations/:org/commitments/origins` | `{ actas: [{ id_acta, nombre, id_plan?, id_accion? }] }` |
| GET `/api/v1/organizations/:org/commitments/:id` | `{ compromiso: {...} }` |
| POST `/api/v1/organizations/:org/commitments` | `{ compromiso: {...} }` |
| PATCH `/api/v1/organizations/:org/commitments/:id` | `{ compromiso: {...} }` |

POST/PATCH reciben JSON con `id_acta`, `descripcion`, `responsable_nombre`, `responsable_contacto`, `fecha_limite` (YYYY-MM-DD), `observaciones` (texto, puede estar vacío) y `estado`. POST debe imponer `pendiente`. PATCH agrega `version_esperada`. El formulario mantiene el acta de origen al editar.

El registro completo de respuesta agrega `id_compromiso`, `id_organizacion`, `version` entera positiva, `created_at`, `updated_at` (fechas ISO con zona) y `cumplido_at` (ISO o null). `cumplido_at` solo tiene valor si el estado es `cumplido`. Los únicos estados persistidos son `pendiente` y `cumplido`; Vencido se calcula en la interfaz con la fecha local.

Errores: `{ ok: false, error: { code, message } }` y su estado HTTP. 409 significa versión antigua y obliga a recargar; 403 no debe vaciar el formulario; 404 con código `RUTA_NO_ENCONTRADA` indica servicio pendiente, no lista vacía.

## Integración y datos

- Reutilizar autenticación y permisos por organización/país. Validar en el servidor que acta y compromiso pertenecen a esa organización. La visibilidad actual de la página para ADMIN/COORD no sustituye autorización backend.
- La tabla actual tiene `id_contacto_responsable`, pero no `responsable_contacto`. Definir si se resuelve mediante contacto relacionado o una migración. El contacto es obligatorio según HU17; no descartarlo al guardar.
- Validar longitudes del modelo y fechas; conservar el acta al editar. Auditar quién cambió el estado, cuándo y sus valores anterior/nuevo. Al volver a Pendiente, limpiar `cumplido_at`.
- La creación de Actas ahora admite `GuardarActa.compromisos?: CamposCompromiso[]`. Al implementar su servicio real, enviar los borradores junto con el acta y guardarlos en una transacción. Si uno falla, no crear un acta parcial ni duplicarla al reintentar.
- `en-actas.ts` conecta el formulario con la demo existente de Actas. Sustituir esa conexión de demostración por el servicio real para consultar los compromisos embebidos; habilitar la extensión en producción al conectar Actas. El enlace al acta usa `?acta=<id>#tab-actas`: el servicio de Actas definitivo debe resolver ese registro y abrir su detalle.
- Los mapas de demostración viven únicamente en memoria. No son un repositorio ni una migración. No mezclar actas temporales con compromisos reales.

## Comprobación

```sh
npm run test --workspace=frontend
npm run test:e2e:compromisos --workspace=frontend
npm run build --workspace=frontend
```

Las pruebas de navegador usan Edge en Windows y simulan HTTP. Tras conectar backend, probar sin activar la demo: registro, recarga y persistencia, edición, permisos, conflictos de versión, auditoría y creación conjunta con Actas.
