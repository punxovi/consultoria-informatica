# Compromisos mediante API Gateway y Backend — Sprint 5

La sección consulta, crea y actualiza compromisos reales. Se retiró el acceso a
la demostración de la pantalla. Utiliza el Gateway y el módulo de Compromisos
del servicio de Organizaciones, donde estaban sus endpoints, con el token de
la sesión y RLS de Supabase. No requiere un microservicio nuevo.

Se corrigieron la ruta de actas de origen, los nombres de las respuestas y los
campos del contrato. La organización se obtiene del acta: no se depende de una
columna `compromisos.id_organizacion` inexistente en la tabla original. El acta
de origen no se puede cambiar al editar. Los compromisos guardados desde el
formulario de Actas aparecen también en este módulo.

Los estados son **Pendiente** y **Cumplido**, como en la tabla original y en la
interfaz. Vencido es una condición calculada por fecha, no un estado persistido.
PostgreSQL asigna versión, auditoría y fecha de cumplimiento. Si se edita un
compromiso ya cumplido, conserva la fecha original; al volver a Pendiente la
limpia. Una versión antigua produce un conflicto sin sobrescribir los datos.

La interfaz muestra carga, confirmaciones, errores, vacío, falta de actas y
permisos de solo lectura. Conserva el borrador ante un fallo y bloquea los envíos
duplicados. Para resolver un conflicto exige recargar, con confirmación antes de
descartar el formulario.

## Paso manual en Supabase

**No se modificó el proyecto remoto.** En el SQL Editor del mismo proyecto que
usa la aplicación:

1. Si aún no aplicaste los SQL de Actas de la tarea anterior, sigue primero
   `docs/ENTREGA-ACTAS-API.md`. Debe estar aplicada
   `20261010120000_fge_actas_integracion.sql`; esa migración agrega el contacto
   del responsable y establece la estructura de Actas requerida.
2. Ejecuta `supabase/preflight-compromisos-integracion.sql`. Deben existir las
   funciones de consulta, gestión y Actas integradas. Las consultas de vínculos,
   datos incompatibles y variante incompatible deben devolver cero filas.
   Los compromisos históricos sin contacto se pueden conservar: la interfaz
   permite consultarlos y exige completar el dato real antes de editarlos.
3. Ejecuta **una sola vez**
   `supabase/migrations/20261010140000_fge_compromisos_integracion.sql`.
   Incluye transacción, permisos por columna, RLS, validación, fecha de
   cumplimiento y las funciones de consulta/guardado; recarga PostgREST al terminar.
4. Reinicia la aplicación y realiza la comprobación con tu sesión descrita abajo.

No ejecutes la migración antigua `20261008000000_fge_tabla_compromisos.sql` como
requisito: contiene una variante de tabla incompatible y una política general
`USING (true)`. Las migraciones nuevas utilizan la tabla original del repositorio
y eliminan esa política si existe. Tampoco se verificó un `db push` global; si
aplicas SQL desde el editor, concilia el historial de migraciones antes de futuros
pushes de Supabase CLI. No se borran compromisos ni se convierten estados o
contactos históricos automáticamente.

Comprobación de permisos después de aplicar:

```sql
select
  has_table_privilege('authenticated','public.compromisos','SELECT') as lectura,
  has_column_privilege('authenticated','public.compromisos','descripcion','INSERT') as crear,
  has_column_privilege('authenticated','public.compromisos','estado','UPDATE') as cambiar_estado,
  has_column_privilege('authenticated','public.compromisos','id_acta','UPDATE') as cambiar_acta,
  has_column_privilege('authenticated','public.compromisos','version','UPDATE') as cambiar_version,
  has_column_privilege('authenticated','public.compromisos','cumplido_at','UPDATE') as cambiar_fecha_cumplimiento,
  has_table_privilege('authenticated','public.compromisos','DELETE') as borrar;
-- Esperado: true, true, true, false, false, false, false.

select policyname,cmd from pg_policies
where schemaname='public' and tablename='compromisos';
-- compromisos_lectura, compromisos_insert, compromisos_update; sin política general.
```

## Comprobación con el proyecto real

Usa el mismo proyecto Supabase en `backend/.env` (`SUPABASE_URL`,
`SUPABASE_ANON_KEY`) y `frontend/.env` (`PUBLIC_SUPABASE_URL`,
`PUBLIC_SUPABASE_ANON_KEY`). El frontend debe tener
`PUBLIC_API_BASE_URL=http://127.0.0.1:4000`. Ejecuta `npm.cmd run dev` desde la raíz.
No se necesita `service_role`, bucket ni Edge Function.

1. Con ADMIN o un COORD autorizado, abre una Organización con actas → Compromisos.
2. Registra acuerdo, responsable, contacto, fecha límite y acta de origen.
3. Recarga y verifica el detalle; marca Cumplido, guarda y recarga de nuevo.
4. Edita la descripción manteniendo Cumplido: la fecha de cumplimiento debe
   conservarse. Al volver a Pendiente debe quedar `cumplido_at=null`.
5. Sigue el enlace al acta y verifica que el mismo compromiso aparece allí.
6. Comprueba el registro en `public.compromisos` y su auditoría privada. Una
   sesión sin gestión debe poder consultar únicamente cuando RLS lo permita;
   no debe poder crear o editar. Dos pestañas editando la misma versión deben
   producir un éxito y un conflicto.

## Contrato HTTP

Todas las rutas están bajo `/api/v1/organizations/:org/commitments` y requieren
`Authorization: Bearer <access_token>`.

| Método | Sufijo | Respuesta / entrada |
| --- | --- | --- |
| GET | vacío | `data.compromisos`; filtro opcional `?id_acta=UUID` |
| GET | `/origins` | `data.actas` y `data.puede_gestionar` |
| GET | `/:id` | `data.compromiso`; 404 si no existe/no está disponible |
| POST | vacío | `id_acta`, campos y estado inicial Pendiente; HTTP 201 |
| PATCH | `/:id` | `{version_esperada,cambios:{...}}`; `data.compromiso` |

Campos: descripción hasta 2000, responsable hasta 150, contacto hasta 300,
fecha válida `AAAA-MM-DD`, observaciones hasta 2000. Acta, descripción,
responsable, contacto y fecha son obligatorios al crear. La actualización
requiere una versión positiva; no acepta cambiar acta, organización, auditoría
ni fecha de cumplimiento. La escritura y el control de versión se ejecutan en
una transacción de PostgreSQL con las políticas del usuario.

## Pruebas

El entorno de integración utiliza cliente, Gateway, servicio y repositorio reales
con PostgreSQL embebido (PGlite), migraciones y RLS. Auth y el adaptador HTTP de
PostgREST se simulan. Falta la comprobación con el Auth/PostgREST del proyecto
remoto después de aplicar el SQL.

- `npm.cmd test`: backend aprobado y **61/61 pruebas de frontend**, incluyendo
  clientes, validaciones e integración SQL.
- `npm.cmd run test:e2e:compromisos --workspace=frontend`: **8/8 aprobadas**.
- `npm.cmd run test:e2e:actas --workspace=frontend`: **7/7 aprobadas**.
- `npm.cmd exec --workspace=frontend -- astro check --minimumSeverity error`: **0 errores**.
- `npm.cmd run check:architecture` y `npm.cmd run build:frontend`: correctos.
