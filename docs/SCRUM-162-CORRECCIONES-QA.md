# SCRUM-162 — correcciones de QA, 2026-11-09

Base: `origin/sprint-9` / `ee42106`. Rama: `codex/fix-scrum162-qa-productos`.

SCRUM-161 está integrado (`1d9f659`). El commit original de SCRUM-162
(`c0b98bf`) no es antecesor de Sprint 9: su ancestro común es SCRUM-161. La
implementación vigente de productos procede de una integración posterior
(`b87e181`, SCRUM-167), con otro contrato. Se adapta esa implementación para
conservar el catálogo, las imágenes y el cliente existentes, sin reintroducir
la rama antigua ni reemplazar migraciones aplicadas.

## Hallazgos corregidos

| Hallazgo | Corrección | Evidencia |
|---|---|---|
| No existe detalle | `GET /api/v1/products/{id}` con ADMIN y cliente `consultar(id)` | HTTP por Gateway: 200, 401, 403, 404 y UUID inválido 400 |
| PATCH acepta datos inválidos y pierde valores | Validación estricta compartida; no se sustituyen campos ausentes por `x`; material y terminación independientes | Datos inválidos dejan el registro intacto; cambios parciales conservan campos, autoría y Organización |
| Inexistencia se confunde con concurrencia | PATCH atómico con identificador/versión; si no actualiza, consulta existencia | Inexistente/archivado 404; versión antigua 409; edición simultánea: una 200 y otra 409 |
| Filtros públicos se aplican después del límite | Predicados de país/Organización enviados a PostgREST, dentro de la consulta SQL | Dos filas de límite en el proveedor de pruebas y cinco productos ajenos anteriores: devuelve el producto correcto al filtrar |

## Contrato HTTP vigente

Administración requiere `Authorization: Bearer <access_token>` y ADMIN activo.
Respuesta común `{ok,data,error}`; detalle, creación y edición devuelven
`data.product`, listado `data.products`. No se admiten parámetros de consulta en
estas rutas administrativas.

| Operación | Método y ruta |
|---|---|
| Listado | GET `/api/v1/products` |
| Detalle | GET `/api/v1/products/{uuid}` |
| Alta | POST `/api/v1/products` |
| Modificación / publicación | PATCH `/api/v1/products/{uuid}` |
| Imágenes | POST `/api/v1/products/{uuid}/images`, multipart `imagenes` |
| Consulta pública | GET `/api/v1/public/catalog?id_pais={uuid}&id_organizacion={uuid}` |

Alta exige `id_organizacion`, `nombre`, `descripcion`, `unidad_medida`. Admite
`categoria`, `material`, `terminacion`, `tipo_item`, `caracteristicas` e
`informacion_adicional`. Los productos nuevos se crean sin publicar; se admite
`publicado:false` por compatibilidad con el cliente actual. La Organización y su
país deben estar activos.

PATCH recibe `{version_esperada: entero positivo seguro, cambios: objeto}`.
Admite los campos descriptivos anteriores excepto `id_organizacion`, y
`publicado:boolean`. Debe incluir al menos un cambio. Los campos omitidos no se
alteran. `null` se rechaza para nombre, descripción y unidad, y se admite para
limpiar campos descriptivos opcionales. Se rechazan arrays, propiedades
desconocidas, tipos incorrectos y cambios de identidad/Organización. Publicar
vuelve a comprobar la Organización y el país.

Límites: nombre 150, descripción 2000, unidad 50, categoría/material/terminación
80 e información adicional 2000 caracteres. Características: objeto JSON hasta
20000 caracteres; tipo `producto` o `servicio`. No hay stock, precios, compras,
pagos o despacho en el contrato.

Errores principales: 400 `DATOS_INVALIDOS` / `ORGANIZACION_NO_DISPONIBLE`,
401 sesión requerida/inválida, 403 `SIN_PERMISO`, 404
`PRODUCTO_NO_ENCONTRADO`, 409 `CONFLICTO_CONCURRENCIA`, 503
`MIGRACION_PRODUCTOS_PENDIENTE` / `SUPABASE_NO_DISPONIBLE`.

Los filtros públicos son UUID opcionales, se combinan con AND y no se permiten
parámetros desconocidos, vacíos o repetidos. La vista pública sigue entregando
solo productos publicados de Organizaciones activas, sin contactos ni metadatos
internos. El límite configurado en PostgREST se aplica al resultado filtrado;
no se vuelve a filtrar un subconjunto en JavaScript. También se conservan los
filtros si se consulta la vista histórica sin columna de imágenes. Referencia:
[filtros sobre columnas JSON en PostgREST](https://docs.postgrest.org/en/stable/references/api/tables_views.html#json-columns).

## Migración y compatibilidad

Aplicar `supabase/migrations/20261109120000_fge_scrum162_correcciones_qa.sql`.
Después ejecutar `supabase/checks/scrum162-correcciones-qa.sql`: devuelve PASS y
revierte sus datos de prueba. El usuario confirma ambas operaciones en Supabase.

La migración agrega `material` y `terminacion`. El texto combinado histórico se
copia íntegro a material, sin adivinar una separación ni truncarlo; terminación
queda nula para esos registros. La proyección `material_terminacion` se conserva
para clientes antiguos y se sincroniza mediante trigger. Las actualizaciones
de datos históricos pueden incrementar su versión mediante la auditoría
existente: recargar los listados después de migrar.

No cambian UUID, Organización, referencias de cotizaciones ni metadatos de
imágenes. Se conservan las políticas y el mecanismo de auditoría existentes.
La prueba remota es SQL: no sustituye una prueba HTTP con una sesión ADMIN real.

## Pruebas

- Regresión Backend: `npm run test:architecture`, 295 aprobadas antes de agregar
  los dos casos adicionales de `products-qa.test.ts`; estos dos también pasan
  por separado.
- `node --experimental-strip-types --test frontend/tests/validaciones/productos.scrum162.integracion.test.mjs`: 8 aprobadas. SQL/RLS reales en PostgreSQL aislado; Auth y transporte PostgREST simulados, Gateway y servicio HTTP reales.
- El script remoto de persistencia se ejecuta también dentro de la prueba local
  y se comprueba que revierte sus datos. Supabase: PASS confirmado por el usuario.
- `npm run build:frontend`: aprobado tras instalar las dependencias de fuentes
  ya declaradas por Sprint 9. No se alteró el manifiesto de dependencias.
- `npm run test:e2e:productos --workspace=frontend`: 9 aprobadas, incluyendo
  reintento de imágenes sin duplicar el producto, edición, publicación y rol
  Coordinador. Se actualizaron el proveedor SSR de pruebas y las expectativas
  de textos/navegación para reflejar la interfaz vigente.
- Consulta anónima de solo lectura a Supabase PostgREST real con ambos filtros
  JSON: HTTP 200 y resultado vacío esperado para UUID de prueba inexistentes.
- Servicios locales reiniciados con la versión actual; login y catálogo HTTP
  200, Gateway HTTP 200, renovación ficticia vía Gateway HTTP 401
  `SESION_INVALIDA`, verificando conexión real con Supabase Auth.

Las pruebas de interfaz simulan las respuestas de productos y Auth. Su proveedor
SSR de pruebas permite mantener activo el middleware de producción. Las
comprobaciones de autorización del servicio se realizan adicionalmente en la
integración HTTP/SQL, que deniega operaciones de Coordinador.
