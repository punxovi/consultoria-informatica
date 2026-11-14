# SCRUM-161: estructura del catálogo de productos de cotización

Base: `origin/sprint-9`, commit `e2cc3f5`.
Rama: `feature/SCRUM-161-estructura-catalogo-productos-cotizacion`.

## Modelo

La migración `20261103150000_fge_scrum161_catalogo_productos.sql` amplía
`public.productos` y reutiliza `public.archivos` y el bucket privado `fge-archivos`.
Conserva los productos, UUID, autoría, versiones, imágenes y referencias de
cotizaciones anteriores. No crea un segundo catálogo ni incorpora stock,
inventario, compras o despacho.

| Campo de producto | Tipo y regla |
| --- | --- |
| `id_producto` | UUID estable, generado por PostgreSQL |
| `id_organizacion` | UUID obligatorio, FK existente; no se reasigna |
| `nombre`, `descripcion`, `unidad_medida` | Textos obligatorios no vacíos, ya existentes |
| `tipo_item` | `producto` o `servicio`; predeterminado `producto` |
| `categoria` | Texto opcional, no vacío si se informa; no se inventa un catálogo de categorías |
| `material_terminacion` | Texto opcional no vacío |
| `caracteristicas` | Objeto JSONB, predeterminado `{}`; rechaza arrays y JSON null |
| `informacion_adicional` | Texto opcional no vacío |
| `publicado` | Booleano existente; nuevos registros comienzan sin publicar |
| `archived_at` | Archivado lógico; se conserva la fila y su historial |

El país se obtiene por `producto.id_organizacion → organizaciones.id_pais`.
No se almacena otra copia de `id_pais`. La vista `productos_por_territorio`
incorpora este identificador y utiliza `security_invoker`, por lo que aplica los
permisos del usuario. Devuelve una fila por producto vigente aunque tenga varias
imágenes. Una modificación del país de la Organización se refleja directamente.

La identidad del producto y su Organización son inmutables. La regla sustituye
el trigger anterior que consultaba detalles privados de cotización; así una
edición del catálogo no necesita acceso a datos de solicitudes.

## Imágenes y almacenamiento

Cada imagen usa `archivos.id_producto`, categoría `imagen_producto`, y conserva
el mecanismo existente de reserva, carga, disponibilidad y archivado.
Un producto admite varias imágenes, con UUID de archivo y objeto distintos.

Nuevas rutas: `productos/{id_producto}/{uuid_objeto}.jpg|png|webp`.
Se validan destino, MIME coincidente con la extensión y tamaño entre 1 byte y
5 MiB. Los registros históricos siguen legibles y archivables. No se cambian los
límites globales del bucket ni los permisos de otros módulos.

Flujo preparado para la integración del Backend:

1. Registrar metadatos en estado `reservado` con tamaño conocido.
2. Subir el objeto a la ruta exacta registrada. Storage exige autorización de
   gestión del producto y una reserva vigente.
3. Comprobar la carga y validar los bytes, MIME y tamaño en el Backend; marcar
   `disponible` solamente después de esa comprobación.
4. Consultar metadatos disponibles y descargar o generar URL firmada usando la
   sesión autorizada. Archivar la imagen retira su acceso por estas políticas.

No se sobrescribe el objeto ni se reasignan los metadatos de una imagen: una
sustitución registra otro objeto y archiva el anterior. El bucket permanece
privado. Los endpoints, validación binaria y entrega pública de archivos pertenecen
a la integración del catálogo; esta tarea implementa su soporte de Base de Datos.

## Permisos y consultas

Se reutilizan las funciones territoriales vigentes: ADMIN gestiona; COORD
gestiona su ámbito o una cobertura vigente y conserva la consulta transversal
acordada en sprint 9; INVIT consulta según su asignación, sin escribir. Un perfil
inactivo, una Organización archivada o un país archivado no obtiene acceso.
Las tablas conservan RLS y auditoría; no se concede borrado físico ni acceso
anónimo al catálogo. El control de versión existente continúa incrementándose
con las modificaciones; el futuro Backend debe filtrar por versión esperada.

La lectura interna de `productos` permite conservar acceso autorizado al historial.
La vista excluye productos archivados. `publicado` habilita la futura proyección
web: el servicio público deberá exigirlo y exponer solamente campos destinados
al catálogo. Esta migración no publica datos ni abre el bucket al visitante.

```sql
-- Productos vigentes de una Organización (parámetro UUID).
SELECT * FROM public.productos_por_territorio
WHERE id_organizacion = :id_organizacion
ORDER BY nombre, id_producto;

-- Productos publicados de un país, sin duplicación por imágenes.
SELECT * FROM public.productos_por_territorio
WHERE id_pais = :id_pais AND publicado
ORDER BY nombre, id_producto;

-- Imágenes disponibles de un producto. La ruta es interna, no una URL pública.
SELECT id_archivo, bucket_id, ruta_objeto, nombre_original, mime_type,
       tamano_bytes, descripcion
FROM public.archivos
WHERE id_producto = :id_producto AND categoria = 'imagen_producto'
  AND estado_carga = 'disponible' AND archived_at IS NULL
ORDER BY created_at, id_archivo;
```

Los parámetros `:id_*` son marcadores para el consumidor, no valores literales
que pegar directamente en SQL Editor. Hay índices para Organización, categoría
publicada e imágenes disponibles, además de las relaciones territoriales existentes.

## Aplicación y evidencia

Aplicar únicamente la nueva migración sobre la base actualizada de sprint 9.
Después ejecutar `supabase/tests/database/040_scrum161_verificacion_remota.sql`
en SQL Editor. Requiere una Organización activa existente, devuelve `resultado:
OK` y termina en `ROLLBACK`, incluyendo los registros de auditoría de la prueba.
Comprueba persistencia transaccional, relaciones, dos imágenes como metadatos,
modificación, publicación y archivado. No sube archivos ni prueba una sesión de
usuario autenticado desde Storage.

El usuario confirmó en esta sesión que aplicó la migración y obtuvo `OK` en la
verificación de Supabase real. Esa ejecución fue realizada por el usuario en SQL
Editor, no por el agente mediante una conexión administrativa.

Verificación local reproducible desde la raíz, sin credenciales ni red:

```powershell
node scripts/verificar-productos-db.mjs
```

Resultado: **56 comprobaciones aprobadas** en PostgreSQL/PGlite. Se ejecutan
migraciones reales y las funciones territoriales vigentes con soporte mínimo de
Auth y Storage. Incluye datos anteriores a la migración, referencias históricas
de cotizaciones, filtros, coherencia territorial, múltiples imágenes, errores de
tipos/formatos, permisos por rol, acceso a objetos, perfil inactivo, archivado y
ejecución del mismo script de verificación remota con reversión de datos.

Se actualizó la prueba pgTAP histórica `002_fge_cotizaciones.test.sql` para el nuevo
formato de rutas y acceso autenticado sujeto a RLS. Su ejecución pgTAP completa
no forma parte de la suite PGlite.

Tras cambiar de rama se reiniciaron los servicios: Frontend `/login` HTTP 200,
Gateway `/health` HTTP 200 y renovación de token ficticio por Gateway HTTP 401
`SESION_INVALIDA`, confirmando conectividad real de Auth con Supabase.
