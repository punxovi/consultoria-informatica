# Expediente Legal de Organizaciones

## Alcance implementado

La migración `20261007120000_fge_expediente_legal.sql` completa el modelo de expediente legal que ya comenzaba en `informacion_legal`. Mantiene un expediente por Organización y agrega el control de los tres documentos que usa la interfaz:

- identidad del representante legal;
- identificación legal de la Organización;
- estatutos de la Organización.

Cada documento puede estar `pendiente`, `no_aplica` o `cargado`. El estado `cargado` exige una fila válida de `archivos`; los otros estados prohíben asociar un archivo. Los PDF se almacenan en el bucket privado e independiente `fge-expedientes-legales`, bajo `expedientes/<id-organizacion>/...`, con un máximo de 10 MB. De esta forma no se amplía el límite de las imágenes del sistema.

## Estructuras y relaciones

- `informacion_legal.id_organizacion` referencia `organizaciones.id_organizacion`. Su restricción única garantiza un expediente por Organización.
- `documentos_informacion_legal.id_informacion_legal` referencia al expediente.
- `documentos_informacion_legal.id_archivo` referencia opcionalmente a `archivos`.
- Las claves foráneas usan `ON DELETE RESTRICT` para impedir que se eliminen registros todavía relacionados.
- Se validan estados, tipos, tamaños, MIME, fechas y longitudes en PostgreSQL.
- Las dos estructuras legales y los archivos conservan `created_at`, `updated_at`, `created_by`, `updated_by`, `archived_at` y `version`. Los triggers comunes completan esos campos y escriben en `fge_private.historial_cambios`.

## Seguridad

RLS permite consultar expedientes cuando el usuario puede consultar la Organización. Crear o modificar exige permiso de gestión sobre esa Organización, incluyendo el alcance territorial de Coordinadores. `anon` no recibe privilegios. El servicio utiliza el JWT del usuario y la clave pública; no utiliza `service_role`.

El bucket continúa siendo privado. Sus políticas aplican el mismo permiso territorial a la carpeta de cada Organización.

## Operaciones disponibles

El servicio de Organizaciones publica:

| Método | Ruta | Operación |
| --- | --- | --- |
| `GET` | `/api/v1/organizations/:id/legal-record` | Consulta el expediente y sus documentos. Devuelve `null` si la Organización existe y todavía no posee expediente. |
| `POST` | `/api/v1/organizations/:id/legal-record` | Registra el expediente. |
| `PATCH` | `/api/v1/organizations/:id/legal-record` | Modifica el expediente con `version_esperada`. |

POST y PATCH reciben `multipart/form-data`. `datos` contiene el JSON legal y los PDF opcionales usan los nombres `identidad_representante`, `identificacion_legal` y `estatutos`. El servidor comprueba extensión, MIME, tamaño y la firma `%PDF-` antes de guardar.

La función PostgreSQL `guardar_expediente_legal(uuid,jsonb,bigint)` guarda los campos, estados y metadatos en una transacción. Un conflicto de versión devuelve HTTP 409. Si falla la operación de base de datos, el repositorio intenta retirar los archivos recién cargados para no dejarlos huérfanos.

## Verificación local

Con Docker Desktop en ejecución:

```powershell
npx --yes supabase@latest start
npx --yes supabase@latest db reset
npx --yes supabase@latest test db --local
node supabase/verificar-archivos.mjs
npm run test --workspace=@fge/organizations-service
npm run test --workspace=frontend
npm run test:e2e:expediente --workspace=frontend
npm run build:frontend
```

La prueba `frontend/tests/validaciones/expediente-legal.persistencia.test.mjs` ejecuta la migración real sobre PostgreSQL embebido y comprueba registro, consulta, actualización, RLS, auditoría, control de versión y creación del bucket. La prueba `supabase/tests/database/011_expediente_legal.test.sql` repite las operaciones directamente con pgTAP para Supabase local o remoto. Todas sus inserciones se revierten al terminar.

## Verificación manual

1. Aplicar las migraciones y ejecutar `npm run dev`.
2. Iniciar sesión como Administrador o Coordinador con cobertura sobre el país de la Organización.
3. Abrir una Organización y entrar a **Expediente Legal** sin el parámetro de demostración.
4. Guardar un expediente sin PDF usando estados Pendiente/No aplica.
5. Volver a abrirlo, editar un dato y verificar que la versión aumente.
6. Adjuntar un PDF real menor o igual a 10 MB y comprobar que se muestre su nombre.
7. Intentar un archivo renombrado a `.pdf`, un PDF mayor a 10 MB y una edición desde dos pestañas; deben rechazarse sin perder los valores del formulario.
8. Revisar en Supabase `informacion_legal`, `documentos_informacion_legal`, `archivos` y el bucket privado `fge-expedientes-legales`.
