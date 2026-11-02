# Evidencias: validaciones y API Backend

Las rutas públicas pasan por el gateway (`/api/v1/evidences`) y llegan al servicio de Intervenciones (`/v1/evidences`). Requieren `Authorization: Bearer <JWT de usuario>`; cada operación usa ese JWT con Supabase, por lo que aplican las políticas RLS de la migración `20261013120000_fge_evidencias.sql`. El bucket `fge-evidencias` es privado. Las respuestas JSON usan `{ "ok": true, "code": "...", "message": "...", "data": { ... } }` y los errores el contrato común `{ "ok": false, "error": { "code": "...", "message": "...", "requestId": "..." }, "data": null }`.

| Método y ruta | Operación |
| --- | --- |
| `GET /api/v1/evidences?id_accion=<UUID>` | Listar evidencias activas de la Acción. El filtro es obligatorio. |
| `GET /api/v1/evidences/:id` | Consultar metadatos de una evidencia activa. |
| `POST /api/v1/evidences` | Reservar el registro y sus metadatos. Devuelve `201` y `data.evidence` con `estado_carga=reservado`. |
| `PATCH /api/v1/evidences/:id` | Cambiar origen, descripción, consentimiento o estado de publicación. Exige `version_esperada`. |
| `PUT /api/v1/evidences/:id/file?version_esperada=<entero>` | Cargar el archivo binario sin multipart. `Content-Type` debe coincidir con el MIME registrado; confirma `estado_carga=disponible`. |
| `GET /api/v1/evidences/:id/file` | Descargar el archivo privado. Responde bytes con `Content-Disposition: attachment` y `Cache-Control: private, no-store`. |

Ejemplo de reserva:

```json
{
  "id_accion": "44444444-4444-4444-8444-444444444444",
  "origen": "Visita en terreno",
  "descripcion": "Registro firmado de la intervención",
  "nombre_original": "registro.pdf",
  "mime_type": "application/pdf",
  "tamano_bytes": 12345,
  "consentimiento": {
    "consentimiento_declarado": true,
    "declaracion_consentimiento": "La persona autorizó la publicación."
  }
}
```

La declaración de consentimiento es opcional, pero cuando se informa debe contener el booleano y el texto juntos. El Backend no acepta que el cliente envíe usuario ni fecha de consentimiento: los registra la base de datos a partir del JWT. La actualización usa `{ "version_esperada": 1, "cambios": { "estado_publicacion": "publicada" } }`; los estados son `no_publicada`, `publicada` y `retirada`. La base de datos solo permite publicar una evidencia cargada y con consentimiento afirmativo; revocarlo requiere una declaración nueva con `consentimiento_declarado: false`. El archivo y su Acción son inmutables tras la reserva.

Tipos admitidos: PDF, JPEG, PNG, WebP, MP3, OGG, WAV, MP4 y WebM, hasta 50 MiB. El Backend valida extensión, MIME, tamaño y firma binaria antes de enviar a Storage. Los archivos se guardan bajo `id_accion/id_evidencia` y nunca se sustituyen. Si Storage recibe el archivo pero falla la confirmación en la base de datos, se puede repetir el mismo `PUT` con la versión vigente; un conflicto de objeto existente intenta completar la confirmación, y el trigger verifica el tamaño y MIME del objeto.

Los errores de entrada responden `400` (`DATOS_INVALIDOS`, `ARCHIVO_INVALIDO`); una Acción inexistente o no visible responde `409` (`ACCION_NO_EXISTE`); una evidencia inexistente `404`; falta de sesión `401`; falta de permisos `403`; versión obsoleta `409`; Supabase/Storage no disponibles `503`; fallos de base de datos o Storage `502`. Las políticas de Supabase hacen la comprobación final de permisos.

Para probar localmente: configurar `SUPABASE_URL` y `SUPABASE_ANON_KEY` en el entorno del Backend, iniciar `npm run dev:backend` desde la raíz y llamar las rutas públicas en el gateway. Se necesita un JWT de usuario con permiso de gestión sobre una Acción existente y la migración aplicada. Las pruebas automatizadas con Supabase/Storage simulados se ejecutan con `npm run test --workspace=@fge/interventions-service` y `npm run test --workspace=@fge/api-gateway`.

SCRUM-115 agrega `GET /api/v1/public/evidences/:id/file` para la publicación institucional sin sesión. La ruta requiere la migración `20261016120000_fge_publicacion_evidencias.sql` y `SUPABASE_PUBLICATION_KEY` exclusivamente en Backend. Solo entrega archivos publicados con consentimiento vigente y padres activos. El bucket sigue privado. Ver [preparación, pruebas y límites](PROBAR-SCRUM-115.md).
