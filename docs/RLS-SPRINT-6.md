# Políticas de Seguridad (RLS) - Sprint 6

Este documento describe las políticas de *Row Level Security* (RLS) y permisos implementados para los módulos de **Evidencias**, **Indicadores** y **Resultados** correspondientes al Sprint 6.

## Resumen

- **Evidencias**: Definidas en la migración `20261013120000_fge_evidencias.sql`. Protegen metadatos de evidencias y los objetos binarios en el bucket privado `fge-evidencias`.
- **Indicadores y Resultados**: Definidas en la migración `20261015130000_fge_sprint6_rls.sql`. Protegen tanto el catálogo estándar de indicadores como los indicadores y mediciones asociados a Acciones, respetando el alcance territorial.

---

## 1. Evidencias y Almacenamiento Seguro

### Metadatos (`public.evidencias`)
1. **Lectura (`evidencias_lectura`)**:
   - Requiere usuario autenticado.
   - Aplica `fge_private.acceso_evidencia_accion(id_accion, false)`, validando lectura sobre la Organización de la Acción (`acciones` → `planes` → `organizaciones`).
   - Solo registros activos (`archived_at IS NULL`).
2. **Creación y Edición (`evidencias_creacion`, `evidencias_edicion`)**:
   - Requiere permisos de gestión territorial sobre la Organización correspondiente (`fge_private.acceso_evidencia_accion(id_accion, true)`).
   - Valida inmutabilidad de referencias y metadatos del archivo mediante triggers selladores y auditores.
   - La publicación exige consentimiento afirmativo registrado y archivo disponible.
3. **Privacidad y Rutas Públicas**:
   - El bucket `fge-evidencias` es **privado** (`public = false`). Los archivos no son accesibles a personas externas ni anónimas.
   - El estado `publicado = true` no altera las políticas de Storage ni abre acceso anónimo directo. SCRUM-115 agrega la ruta institucional del Backend y su resolver exclusivo para `service_role`; requiere aplicar `20261016120000_fge_publicacion_evidencias.sql` y configurar la credencial privada. Ver [PROBAR-SCRUM-115](PROBAR-SCRUM-115.md).

### Archivos (`storage.objects`)
- **`storage_evidencias_insert`**: Solo se permite cargar en la ruta reservada `id_accion/id_evidencia` si el usuario tiene permiso de gestión sobre la Acción asociada.
- **`storage_evidencias_select`**: Solo usuarios autenticados con permiso de consulta sobre la Acción pueden descargar el archivo una vez disponible.

---

## 2. Indicadores (`public.indicadores`)

La tabla soporta tanto el **catálogo estándar institucional** como **indicadores asociados a Acciones operativas**:

### Catálogo Estándar (`id_accion IS NULL`)
- **Lectura**: Permitida a todos los perfiles activos del sistema (`ADMIN`, `COORD`, `INVIT`) mediante `fge_private.usuario_tiene_rol_activo()`.
- **Escritura / Modificación**: Restringida estrictamente al rol `ADMIN` mediante `fge_private.usuario_es_administrador()`. Usuarios coordinadores o invitados no pueden modificar el catálogo estándar.

### Indicadores asociados a Acciones (`id_accion IS NOT NULL`)
- **Lectura (`indicadores_lectura`)**: Vinculada a `fge_private.usuario_puede_consultar_organizacion(id_organizacion)` a través de `acciones` → `planes` → `organizaciones`.
- **Escritura (`indicadores_insert`, `indicadores_update`)**: Vinculada a `fge_private.usuario_puede_gestionar_organizacion(id_organizacion)`. Conserva el alcance territorial por país para el rol `COORD` (por país asignado o cobertura temporal) y alcance global para `ADMIN`.

---

## 3. Resultados de Medición (`public.resultados`)

- **Lectura (`resultados_lectura`)**: Se valida la visibilidad del indicador padre (`fge_private.acceso_indicador_accion(i.id_accion, false)`).
- **Escritura (`resultados_insert`, `resultados_update`)**: Se exige permiso de gestión sobre la Acción vinculada al indicador (`fge_private.acceso_indicador_accion(i.id_accion, true)`).

---

## 4. Auditoría, Concurrencia y Archivado Seguro

- Todas las tablas implementan triggers `sellar` y `auditar` del esquema `fge_private` (`created_by`, `updated_by`, `version`, historial de cambios).
- Para evitar inconsistencias de RLS al realizar borrados lógicos con `UPDATE ... RETURNING`, se proveen las funciones de seguridad:
  - `public.archivar_evidencia_segura(p_id uuid, p_version bigint)`
  - `public.archivar_indicador_seguro(p_id uuid, p_version bigint)` (archiva indicador y resultados asociados en cascada atómica)
  - `public.archivar_resultado_seguro(p_id uuid, p_version bigint)`

---

## 5. Pruebas y Validación

1. **Pruebas SQL directas en Supabase**:
   - `supabase/tests/database/016_rls_sprint6.test.sql`: Verifica la existencia de todas las políticas RLS y comprueba que el rol `anon` recibe denegación total (`42501`) en `evidencias`, `indicadores` y `resultados`.
2. **Pruebas de persistencia e integración (PGlite)**:
   - `frontend/tests/validaciones/evidencias.persistencia.test.mjs`: Valida el ciclo completo de evidencias, reserva, subida, estados, consentimiento, RLS territorial y anon.
   - `frontend/tests/validaciones/indicadores_resultados.persistencia.test.mjs`: Valida gestión del catálogo estándar por ADMIN, lectura por COORD, bloqueo de modificaciones no autorizadas, alcance territorial por país y soft delete.
