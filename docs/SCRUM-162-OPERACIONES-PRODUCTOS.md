# SCRUM-162: operaciones Backend de productos de cotización

Rama: `feature/SCRUM-162-backend-administracion-productos-cotizacion`.
Base de sprint 9: `e2cc3f5`, más la dependencia SCRUM-161 (`1d9f659`). Mientras
el PR de SCRUM-161 no esté integrado, esta rama contiene también su estructura.

## Operaciones HTTP

Todas las rutas pasan por el API Gateway y el servicio de Organizaciones.
Las operaciones de administración requieren `Authorization: Bearer <sesión>` de
un ADMIN activo, verificado en Supabase en cada RPC. No se confía en roles,
identificadores ni permisos declarados por el navegador.

| Método y ruta `/api/v1` | Resultado |
| --- | --- |
| `GET /products` | Lista administrativa paginada |
| `GET /products/:id` | Detalle administrativo |
| `POST /products` | Crea sin publicar, HTTP 201 |
| `PATCH /products/:id` | Modifica los campos descriptivos |
| `POST /products/:id/activate` | Habilita publicación |
| `POST /products/:id/deactivate` | Deshabilita publicación, conserva registro e historial |
| `GET /public/products` | Lista pública sin sesión |
| `GET /public/products/:id` | Detalle público, solo si está habilitado |

Los listados aceptan filtros opcionales `id_pais` e `id_organizacion` (UUID),
combinables mediante AND. Ejemplo: `GET /api/v1/public/products?id_organizacion=UUID`.
Se validan existencia y vigencia de los filtros. Una combinación válida sin
coincidencias responde HTTP 200 con lista vacía. No se admiten filtros duplicados,
vacíos o desconocidos. `limit` es entero de 1 a 100 (50 predeterminado), `offset`
entero de 0 a 100000 (0 predeterminado). El orden es nombre y UUID para resolver
empates; la paginación por offset refleja el catálogo actual, no una instantánea
estable frente a modificaciones concurrentes.

## Solicitudes y reglas

Las escrituras utilizan `Content-Type: application/json`. Alta mínima:

```json
{
  "id_organizacion": "UUID de una Organización existente y activa",
  "nombre": "Bolso comunitario",
  "descripcion": "Elaborado con tela reciclada",
  "unidad_medida": "unidad"
}
```

Campos opcionales: `tipo_item` (`producto` o `servicio`, predeterminado `producto`),
`categoria` (texto, hasta 200), `material_terminacion` (texto, hasta 500),
`caracteristicas` (objeto JSON, predeterminado `{}`), `informacion_adicional`
(texto, hasta 10000). Los tres textos opcionales permiten `null` para limpiarlos.
Nombre: 1–200 caracteres; descripción: 1–10000; unidad: 1–100. No se aceptan textos
vacíos, tipos incorrectos, campos internos ni campos de inventario.

Los nuevos productos se crean con `publicado=false`. Activar o desactivar se
realiza mediante las operaciones dedicadas, no mediante un campo arbitrario en
alta o edición. La Organización es obligatoria y conserva la identidad estable
acordada en SCRUM-161; la edición no permite reasignar el producto.

Edición:

```json
{"version_esperada": 1, "cambios": {"nombre": "Bolso actualizado", "categoria": "Artesanía"}}
```

Activación o desactivación:

```json
{"version_esperada": 2}
```

La versión debe ser un entero positivo seguro. Cada escritura devuelve la nueva
versión. Una versión anterior produce HTTP 409. La base bloquea la fila del
producto y verifica la versión antes de modificarla. Al crear, editar o activar
también verifica y bloquea la Organización y su país para evitar una publicación
concurrente con su archivado. Una Organización activa es aquella cuyo
`archived_at IS NULL`, conforme al modelo vigente. Su país debe estar vigente.
Desactivar sigue permitido aunque el padre haya sido archivado.

## Respuestas

Se conserva el contrato estándar del servicio:

```json
{"ok": true, "code": "PRODUCTO_CONSULTADO", "message": "Catálogo consultado.", "data": {"product": {}}}
```

En listados, `data` contiene `products` (array), `limit`, `offset` y `hasMore`.
Los detalles administrativos incluyen identificadores, campos descriptivos,
`id_pais`, publicación, versión y metadatos de auditoría.

La proyección pública incluye exclusivamente:

- `id_producto`, `nombre`, `descripcion`, `unidad_medida`, `tipo_item`, `categoria`,
  `material_terminacion`, `caracteristicas` e `informacion_adicional`.
- `organizacion`: `id_organizacion` y `nombre`.
- `pais`: `id_pais`, `nombre` y `codigo_iso`.
- `imagenes`: identificador de archivo, descripción y MIME de cada imagen
  disponible y no archivada. No contiene rutas de Storage, nombres originales,
  claves ni URLs privadas.

Los campos descriptivos están destinados al catálogo y deben contener información
publicable. Se excluyen borradores, productos archivados y registros con
Organización o país archivados. Las imágenes se agregan sin duplicar productos.
El repositorio vuelve a aplicar una lista explícita de campos al recibir la
respuesta de Supabase, incluso si el proveedor devolviera propiedades adicionales.

No se agregan datos de contacto, direcciones, representantes, autores, versión ni
marcas internas a la proyección pública. La consulta pública ignora cualquier JWT
enviado por el visitante y utiliza la clave pública del proyecto sin elevar sus
permisos. La carga binaria y entrega pública de imágenes no son operaciones de
esta tarea; el bucket permanece privado.

Errores: `DATOS_INVALIDOS` 400; `SESION_REQUERIDA`/`SESION_INVALIDA` 401;
`SIN_PERMISO` 403; `PRODUCTO_NO_ENCONTRADO`, `ORGANIZACION_NO_ENCONTRADA` o
`FILTRO_NO_ENCONTRADO` 404; `ORGANIZACION_INACTIVA` o `CONFLICTO_VERSION` 409;
formato 415; cuerpo mayor a 32 KiB 413; configuración, migración pendiente o
conexión no disponible 503. Un producto deshabilitado y un UUID inexistente
devuelven el mismo error público. Los errores incluyen `requestId` y no mensajes
privados del proveedor.

## Migración, permisos y verificación

Aplicar `20261103160000_fge_scrum162_operaciones_productos.sql` después de SCRUM-161.
Instala `administrar_productos_cotizacion` y `consultar_productos_publicos`.
Ambas tienen `search_path` explícito; las funciones auxiliares no son públicas.
La RPC pública solo tiene operaciones de lectura con proyección acotada. Las
tablas base siguen inaccesibles a `anon`. La administración se limita también
mediante RLS y las funciones de acceso al producto: COORD e INVIT no pueden
escribir ni consultar datos administrativos directamente en Data API. Se
conservan auditoría, UUID e historial sin agregar eliminaciones físicas.

Verificación reproducible:

```powershell
node scripts/verificar-productos-db.mjs --scrum162
npm.cmd run test --workspace=@fge/organizations-service
npm.cmd run test --workspace=@fge/api-gateway
npm.cmd run check:architecture
```

Resultados: 56 comprobaciones de la estructura SCRUM-161 y 102 adicionales de
SCRUM-162 en PostgreSQL/PGlite; 128 pruebas de Organizaciones y 16 de Gateway
aprobadas, además de comprobación de arquitectura. Las pruebas HTTP usan los
servidores reales de Gateway y Organizaciones con respuestas simuladas de
Supabase; la suite PostgreSQL ejecuta las migraciones y permisos reales con
soporte mínimo de Auth/Storage.

El usuario confirmó que ejecutó sin errores las migraciones de SCRUM-161 y
SCRUM-162, en ese orden, en Supabase. El script
`041_scrum162_verificacion_remota.sql` permite comprobar alta, edición,
activación/desactivación, proyección pública y denegación sin ADMIN, utilizando
un contexto SQL de identidad existente y revirtiendo los datos. Se verificó ese
script en la suite local; no equivale a iniciar sesión con credenciales reales
mediante HTTP. No se realizó una prueba HTTP de escritura con una sesión ADMIN real.

Después del reinicio se verificaron Frontend HTTP 200, Gateway HTTP 200 y
renovación ficticia de Auth HTTP 401 `SESION_INVALIDA` contra Supabase real.
Después de aplicar ambas migraciones en el proyecto configurado, las solicitudes
reales a través del Gateway confirmaron:

- `GET /api/v1/public/products`: HTTP 200 `PRODUCTOS_LISTADOS`, con lista vacía
  porque no hay productos publicados disponibles.
- Detalle público de UUID inexistente: HTTP 404 `PRODUCTO_NO_ENCONTRADO`.
- Administración sin sesión: HTTP 401 `SESION_REQUERIDA`.
- Filtro público inválido: HTTP 400 `DATOS_INVALIDOS`.

El error `PGRST202` quedó resuelto al aplicar primero la estructura de SCRUM-161
y después las operaciones de SCRUM-162. El bucket conserva su privacidad.
