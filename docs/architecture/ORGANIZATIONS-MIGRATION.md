# Migración del dominio de Organizaciones

## Estado

El dominio Organizaciones se ejecuta como servicio independiente detrás del
API Gateway. Las pantallas, rutas y estilos se conservan; el listado, detalle,
creación y edición ahora utilizan HTTP en lugar de Astro Actions.

## Endpoints

| Método | Ruta pública | Resultado |
| --- | --- | --- |
| `GET` | `/api/v1/organizations` | Lista organizaciones y permite filtrar por país o archivadas. |
| `GET` | `/api/v1/organizations/:id` | Consulta una organización activa por UUID. |
| `POST` | `/api/v1/organizations` | Crea una organización validada. |
| `PATCH` | `/api/v1/organizations/:id` | Actualiza con control opcional de versión. |
| `GET` | `/api/v1/organizations/countries` | Entrega los países activos para el formulario. |

Todas las operaciones de datos requieren `Authorization: Bearer`. El servicio
reenvía esa sesión a Supabase y las políticas RLS continúan decidiendo el
acceso efectivo.

## Responsabilidades internas

- `domain`: contratos y validación de campos, UUID, teléfono, correo y versión.
- `application`: casos de uso sin dependencia HTTP o Supabase.
- `infrastructure`: consultas PostgREST y traducción de errores de base de datos.
- `http`: autenticación Bearer, rutas y respuestas estables.

Las Astro Actions anteriores permanecen temporalmente como respaldo durante
la migración, pero las páginas de Organizaciones ya no las consumen.

## Ejecución local

1. Configurar `SUPABASE_URL` y `SUPABASE_ANON_KEY` en `backend/.env`.
2. Mantener `PUBLIC_API_BASE_URL=http://127.0.0.1:4000` en `frontend/.env`.
3. Ejecutar `npm run dev` desde la raíz.
4. Iniciar sesión y abrir `http://127.0.0.1:4321/organizaciones`.

El lanzador inicia Gateway `4000`, Auth `4101`, Organizaciones `4102` y Astro.

## Compatibilidad

- Se mantiene la estructura de datos esperada por las vistas actuales.
- La creación usa UUID reales del catálogo de países y quedó conectada.
- La edición conserva el control de versión para evitar sobrescrituras.
- Los errores internos de PostgREST no se exponen al navegador.
- El catálogo de Programas visible en el filtro seguirá migrándose con su
  propio servicio en el paso correspondiente.
