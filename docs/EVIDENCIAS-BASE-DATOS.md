# Evidencias: estructura de base de datos

Implementación sobre `sprint-6`, base `75b65db`. Migración: `supabase/migrations/20261013120000_fge_evidencias.sql`.

## Modelo y decisiones

Cada fila de `public.evidencias` describe **un archivo que respalda una Acción**. La relación es `evidencias.id_accion -> acciones.id_plan -> planes.id_organizacion`. No se introduce una relación polimórfica sin FK ni una entidad ficticia de intervención: en el modelo actual la intervención se organiza mediante Planes y Acciones. Una acción puede tener varias evidencias.

La tabla nueva no sustituye ni modifica `public.archivos`, usada también por imágenes de programas y expedientes legales. Los registros históricos de archivos no se convierten automáticamente: no se puede inventar su procedencia o consentimiento. Una futura importación debe resolver esos datos explícitamente.

| Campos | Significado y restricciones |
| --- | --- |
| `id_evidencia`, `id_accion` | UUID, PK y FK obligatoria con ON DELETE RESTRICT. No se puede reasignar una evidencia a otra acción. |
| `origen` | Procedencia declarada: texto no vacío de hasta 200 caracteres, por ejemplo «Visita a terreno». |
| `descripcion` | Texto obligatorio, hasta 5000 caracteres. |
| `incorporado_at`, `incorporado_por` | Fecha/hora timestamptz y usuario de incorporación. El trigger los obtiene del servidor y `auth.uid()`; son inmutables. |
| `consentimiento_declarado` | NULL: sin declaración; true: consentimiento otorgado; false: denegado o revocado. |
| `declaracion_consentimiento` | Texto de la declaración, obligatorio si se declara true o false; hasta 5000 caracteres. |
| `consentimiento_at`, `consentimiento_por` | Fecha y usuario sellados al declarar o modificar consentimiento. El cliente no puede suplantarlos. |
| `estado_publicacion` | `no_publicada`, `publicada`, `retirada`. |
| `publicado` | Booleano generado a partir del estado. No se escribe directamente. |
| `publicacion_actualizada_at`, `publicacion_actualizada_por` | Último cambio de publicación, sellado por servidor. |
| `bucket_id`, `ruta_objeto` | Bucket privado `fge-evidencias`; clave generada `id_accion/id_evidencia`. Identifican el objeto sin almacenar URLs firmadas. |
| `nombre_original`, `mime_type`, `tamano_bytes` | Nombre (1–255 caracteres), MIME permitido y tamaño entre 1 byte y 50 MiB. Inmutables una vez reservado. |
| `estado_carga` | `reservado`, `disponible`, `fallido`. Solo puede crearse como reservado. |
| `created_at/by`, `updated_at/by`, `version`, `archived_at` | Auditoría estándar. Se preserva creación y se incrementa versión en cada UPDATE. Archivado lógico mediante RPC. |

Se permiten PDF, JPEG, PNG, WebP, MP3 (`audio/mpeg`), Ogg (`audio/ogg`), WAV (`audio/wav`), MP4 y WebM. El límite inicial es configurable por futura migración, manteniendo sincronizados CHECK de tabla y configuración del bucket.

## Consentimiento y publicación

Para publicar se requiere consentimiento explícito true, archivo disponible y evidencia activa. Una fecha o usuario enviados por el cliente no sustituyen a los sellados en BD. El historial privado `fge_private.historial_cambios` registra INSERT/UPDATE/DELETE con valores anteriores y nuevos, incluyendo los cambios de declaración y publicación.

No se borra una declaración previa poniéndola en NULL: se registra false con el motivo correspondiente. Si estaba publicada, debe pasar a retirada en la misma operación o antes de revocar. Una publicación previa no vuelve a `no_publicada`; se conserva como retirada. Puede volver a publicarse si vuelve a cumplir consentimiento y disponibilidad. No se puede retirar algo nunca publicado.

El indicador de publicación es un estado de negocio: **no hace público el bucket ni habilita lectura anónima**. La entrega pública de contenidos corresponde a una futura capa backend que compruebe el estado vigente. Las URLs firmadas son temporales y pueden seguir funcionando hasta su expiración; el retiro no promete revocación de URLs previamente emitidas.

## Acceso e integridad

- SELECT de metadatos activos sigue `usuario_puede_consultar_organizacion`; hereda exactamente el alcance de lectura del proyecto (incluida la lectura amplia de COORD).
- INSERT/UPDATE y cargas requieren `usuario_puede_gestionar_organizacion`: ADMIN o COORD con gestión sobre el país/cobertura correspondientes, con Acción, Plan y Organización activos.
- Los usuarios anónimos y sin roles no acceden. No hay DELETE de evidencias para authenticated.
- Storage permite INSERT únicamente en una ruta ya reservada y autorizada. No se conceden políticas de UPDATE/DELETE: no se usa upsert ni se reemplaza un respaldo ya registrado.
- Los gestores pueden consultar objetos reservados para completar la carga; el resto de lectores autorizados solo objetos disponibles. Los objetos archivados o cuyos padres están archivados no son accesibles con esas políticas.
- La referencia de archivo es lógica, mediante bucket/ruta; no se agrega FK ni trigger al esquema administrado `storage`. La transición a disponible consulta el catálogo y exige existencia, tamaño y MIME coincidentes. No verifica el contenido binario ni reemplaza un análisis antivirus.
- Antes de cambiar un archivo se crea otra evidencia. La limpieza administrativa de objetos debe coordinarse con los metadatos, fuera de este flujo; usuarios service_role/administradores conservan sus capacidades elevadas.

## Operaciones

El backend futuro debe llamar a Supabase con el JWT del usuario, no con service_role para las operaciones ordinarias. Los ejemplos SQL asumen una sesión autenticada. Ejecutarlos como postgres sin contexto de usuario no reproduce las reglas de la aplicación.

1. Reservar metadatos; el trigger completa incorporación y auditoría:

```sql
INSERT INTO public.evidencias
  (id_accion,origen,descripcion,nombre_original,mime_type,tamano_bytes)
VALUES
  (:id_accion,'Visita a terreno','Actividad realizada','actividad.png','image/png',:bytes)
RETURNING id_evidencia,bucket_id,ruta_objeto,version;
```

2. Subir con `supabase.storage.from(bucket_id).upload(ruta_objeto, archivo, {contentType: mime_type, upsert:false})`. La API de Storage administra el objeto; **no se insertan filas SQL en storage.objects**. El tamaño declarado debe ser el del archivo real.
3. Confirmar carga:

```sql
UPDATE public.evidencias SET estado_carga='disponible'
WHERE id_evidencia=:id AND version=:version_esperada
RETURNING *;
```

Si la carga falla, marcar `fallido`; se puede volver a reservado para reintentar. Si el objeto ya existe, no sobrescribir: comprobarlo y confirmar, o crear otra evidencia. BD y almacenamiento de objetos no comparten una transacción; reserva y confirmación modelan esa separación. Una reserva abandonada puede archivarse.

4. Consultar por ID o por Acción:

```sql
SELECT * FROM public.evidencias WHERE id_evidencia=:id;
SELECT * FROM public.evidencias WHERE id_accion=:id_accion
ORDER BY incorporado_at DESC;

SELECT e.* FROM public.evidencias e
JOIN public.acciones a USING(id_accion)
JOIN public.planes p USING(id_plan)
WHERE p.id_organizacion=:id_organizacion;
```

5. Declarar consentimiento/publicar con control de versión:

```sql
UPDATE public.evidencias
SET consentimiento_declarado=true,
    declaracion_consentimiento=:declaracion,
    estado_publicacion='publicada'
WHERE id_evidencia=:id AND version=:version_esperada
RETURNING *;
```

Cero filas modificadas exige tratar falta de acceso, ausencia o conflicto en el backend. La versión se incrementa automáticamente: usar la devuelta para la siguiente edición.

6. Retirar y revocar:

```sql
UPDATE public.evidencias
SET estado_publicacion='retirada', consentimiento_declarado=false,
    declaracion_consentimiento=:motivo
WHERE id_evidencia=:id AND version=:version_esperada
RETURNING *;
```

7. Archivar un registro no publicado con `supabase.rpc('archivar_evidencia_segura',{p_id:id,p_version:version})`. La RPC bloquea la fila, verifica permiso y versión, y deja de exponer el objeto sin borrarlo. SQLSTATE 40001 indica conflicto; 42501 indica falta de acceso. Retirar previamente si está publicada. El archivado no usa UPDATE RETURNING porque la fila resultante deja de ser visible por RLS.

## Migración y pruebas

La migración nueva está envuelta en BEGIN/COMMIT y no modifica datos históricos. Se ejecutó en PostgreSQL embebido (PGlite), sobre el subconjunto de migraciones que carga el helper del repositorio más la migración de permisos territoriales. No se certificó la cadena completa de sprint-6 ni se aplicó a una instancia Supabase remota.

```powershell
node --experimental-strip-types --test frontend/tests/validaciones/evidencias.persistencia.test.mjs
```

Las pruebas ejecutan SQL real y roles/RLS; el catálogo Auth/Storage es un soporte mínimo simulado. Cubren creación, consultas, edición, FK, inmutabilidad, permisos por país, ausencia de roles, rutas reservadas, tamaño/MIME, consentimiento, publicación/retiro, auditoría, versión y archivo lógico. Los INSERT a storage.objects del test existen exclusivamente dentro de esa base temporal.

Resultado del 2026-10-13: **20 pruebas aprobadas, 0 fallos**, ejecutando la suite de Evidencias junto con `planes-acciones.persistencia.test.mjs` como regresión. El script de verificación real también pasó `node --check`; eso confirma sintaxis, no ejecución contra Supabase.

Para aplicar en un Supabase **local de pruebas** con CLI y Docker disponibles, usar `supabase migration up --local`. Para un entorno remoto, revisar primero `supabase migration list --linked` y `supabase db push --linked --dry-run`; el despliegue remoto y cualquier migración anterior pendiente deben revisarse antes de ejecutar `supabase db push --linked`.

En este proyecto, el SQL de `20261013120000` se ejecutó manualmente desde el SQL Editor el 2026-10-13. Antes de un `db push` futuro, comprobar `supabase migration list --linked`: el SQL Editor no suele registrar la versión en `supabase_migrations.schema_migrations`. Si figura pendiente y el esquema ya coincide, reparar el historial con `supabase migration repair --status applied 20261013120000` en vez de ejecutar la migración dos veces. Hacerlo solo después de verificar el esquema aplicado.

Evidencia remota recibida: el rol `authenticated` tiene SELECT, INSERT y UPDATE en `public.evidencias`; `storage.buckets` muestra `fge-evidencias` con `public=false` y límite `52428800`. La consulta anónima REST a `evidencias` devuelve `42501`, coherente con la denegación de acceso anónimo. No se verificó todavía una carga real con JWT de usuario.

Después de aplicar, se incluye una prueba real mediante REST y Storage API:

```powershell
# SUPABASE_URL y SUPABASE_ANON_KEY se leen de backend/.env.
# Para ejecutar la prueba se requieren también QA_ACCESS_TOKEN y QA_ACTION_ID
# en ese archivo o como variables de entorno. Nunca guardar el JWT en Git.
node scripts/verificar-evidencias-supabase.mjs
```

Requiere un JWT vigente de usuario con permiso y el ID de una Acción de pruebas. Crea un PNG sintético, verifica descarga idéntica, declara consentimiento, publica, retira y archiva. Conserva la fila, el archivo privado y la auditoría; imprime el ID para seguimiento. No se ejecutó contra Supabase en esta sesión: Docker no tiene motor activo y no hay CLI Supabase instalada en PATH. La prueba real de Storage y despliegue queda pendiente de ese entorno.

El verificador histórico `supabase/verificar-archivos.mjs` ya estaba desactualizado en `sprint-6`: exige 32 migraciones aunque esa rama contiene 37 antes de esta entrega. Su fallo no es una prueba de ejecución SQL; la migración nueva se comprobó con PostgreSQL embebido. El verificador requiere una actualización independiente para cubrir todas las migraciones actuales.

Referencias: [esquema administrado de Storage](https://supabase.com/docs/guides/storage/schema/design), [control de acceso](https://supabase.com/docs/guides/storage/security/access-control), [buckets privados](https://supabase.com/docs/guides/storage/buckets/fundamentals).
