# Actas mediante API Gateway y Backend — Sprint 5

La sección Actas consulta y guarda información real mediante el cliente HTTP,
el Gateway y el servicio de Intervenciones. Los planes, acciones y asistentes
se cargan desde la base; las acciones se filtran por el plan. Los nombres de
asistentes se conservan como fotografía de la reunión, según el esquema existente.

Hay historial, detalle, creación, edición, estados de carga/vacío/error,
confirmaciones, reintento y bloqueo de envíos duplicados. Un fallo conserva el
borrador; un conflicto entre sesiones exige recargar antes de guardar. La
actualización no permite cambiar la organización y utiliza la versión esperada.

Los compromisos opcionales del formulario se insertan junto al acta en una
transacción: si uno falla, no queda guardado ninguno ni el acta. Se consultan en
su detalle después de recargar. La edición del acta conserva sus compromisos;
su gestión independiente corresponde al módulo Compromisos.

## Paso manual en Supabase

**No se modificó la instancia remota.** Ejecuta lo siguiente en el SQL Editor
del proyecto que utiliza la aplicación:

1. Ejecuta `supabase/preflight-actas-integracion.sql`. Las funciones `consulta`
   y `gestion` deben existir; las consultas de vínculos incompatibles, textos
   demasiado largos y variante incompatible de Compromisos deben devolver cero
   filas. Corrige los datos reales que aparezcan antes de continuar.
2. Si Actas todavía tiene `fecha`/`notas` o le faltan `id_organizacion`, `id_plan`
   o `asistentes`, ejecuta `supabase/preparar-actas-legacy.sql`. Este archivo
   reemplaza, para esta preparación manual, a `20261008121000_fge_actas_reunion.sql`:
   no ejecutes ambos renombrados. Conserva IDs y fechas, obtiene los vínculos
   desde la acción original y copia los nombres existentes de `acta_participantes`.
   Si faltan vínculos, se revierte la transacción. Si la estructura de Actas ya
   está actualizada, omite este paso. Las actas históricas sin asistentes pueden
   consultarse y deben completarse al editar; no se inventan nombres.
3. Aplica **una sola vez**
   `supabase/migrations/20261010120000_fge_actas_integracion.sql`.
   Incluye transacción, claves compuestas para organización/plan/acción,
   validaciones, permisos RLS, contacto del responsable, catálogo y guardado
   atómico. También notifica la recarga del esquema de PostgREST.
4. Reinicia la aplicación y realiza la comprobación de abajo con tu sesión real.

La base debe tener las migraciones anteriores de Planes, Acciones, Organizaciones,
auditoría y permisos, en particular
`20261002120000_fge_reforzar_rls_planes_acciones.sql`. Si las funciones de permisos
no existen, falta esa base. La migración nueva incorpora sus propias políticas de
Actas/Compromisos: no requiere ejecutar la migración global de políticas del sprint.

No hagas un `db push` global como sustituto de estos pasos: la migración previa
`20261008000000_fge_tabla_compromisos.sql` intenta indexar una columna que no existe
en la tabla original. Esta integración utiliza la tabla original vinculada por
`id_acta`. El preflight identifica la otra variante si fue creada manualmente.
Aplicar SQL en el editor no registra versiones automáticamente en el historial
de Supabase CLI; hay que conciliar ese historial antes de futuros pushes.

Para comprobar los permisos después de aplicar:

```sql
select
  has_table_privilege('authenticated','public.actas','SELECT') as lectura,
  has_column_privilege('authenticated','public.actas','objetivo','INSERT') as crear,
  has_column_privilege('authenticated','public.actas','objetivo','UPDATE') as editar,
  has_column_privilege('authenticated','public.actas','id_organizacion','UPDATE') as cambiar_organizacion,
  has_table_privilege('authenticated','public.actas','DELETE') as borrar;
-- Esperado: true, true, true, false, false.

select policyname,tablename,cmd from pg_policies
where schemaname='public' and tablename in ('actas','compromisos');
-- Actas: actas_lectura, actas_insert, actas_update.
-- Compromisos: compromisos_lectura, compromisos_insert, compromisos_update.
-- No debe existir la antigua política general de Compromisos USING (true).
```

## Configuración y prueba con el proyecto real

- Backend: `SUPABASE_URL` y `SUPABASE_ANON_KEY` en `backend/.env`.
- Frontend: mismo proyecto en `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY`;
  `PUBLIC_API_BASE_URL=http://127.0.0.1:4000` en `frontend/.env`.
- Desde la raíz: `npm.cmd run dev`. El Gateway utiliza el servicio Intervenciones
  en el puerto 4104. No se necesita `service_role`, bucket ni Edge Function nueva.
- Inicia sesión como ADMIN o COORD con permiso para gestionar la organización.
  Abre Organizaciones → ficha → Actas de Reunión. Debe haber un plan activo
  y perfiles activos con roles vigentes para elegir asistentes.
- Crea un acta con uno o más compromisos; recarga, abre el detalle y comprueba los
  datos. Edita el objetivo o la acción, guarda y recarga de nuevo. Comprueba las
  filas en `public.actas`, `public.compromisos` y la auditoría privada.
- Prueba otra sesión sin permiso de gestión: puede consultar cuando su rol lo
  permita; no debe poder guardar. Dos ediciones sobre la misma versión deben
  producir un éxito y un conflicto, conservando el borrador de la segunda.
- Network debe mostrar las solicitudes de Actas al Gateway, con Bearer de la
  sesión. Las llamadas de autenticación existentes a Supabase son independientes.

## Contrato

| Método | Ruta en Gateway | Resultado |
| --- | --- | --- |
| GET | `/api/v1/meeting-minutes?id_organizacion=:org` | `data.meetingMinutes` |
| GET | `/api/v1/meeting-minutes/catalog?id_organizacion=:org` | `data.catalog`: permisos, planes, acciones, asistentes |
| GET | `/api/v1/meeting-minutes/:id` | `data.meetingMinute` |
| POST | `/api/v1/meeting-minutes` | Campos, organización y compromisos opcionales; HTTP 201 |
| PATCH | `/api/v1/meeting-minutes/:id` | `{version_esperada,cambios}`; acta actualizada |

El Gateway ya tenía el enrutamiento; se reutiliza. Intervenciones llama a
PostgREST con la clave pública y el token del usuario, respetando RLS. Se exige
objetivo, plan, fecha no futura y entre 1 y 100 asistentes sin duplicados; la
acción es opcional. Se admiten hasta 50 compromisos nuevos con responsable,
contacto y fecha límite. El contrato usa `AAAA-MM-DD` y preserva la columna
histórica `timestamptz` sin eliminar sus horas anteriores.

## Verificación local

- `npm.cmd test`: suites de backend aprobadas y **59/59 pruebas de frontend**,
  incluyendo clientes, validaciones e integración SQL.
- `npm.cmd run test:e2e:actas --workspace=frontend`: **7/7 aprobadas**.
- `npm.cmd run test:e2e:compromisos --workspace=frontend`: **5/5 aprobadas**.
- `npm.cmd run check:architecture`: correcto.
- `npm.cmd exec --workspace=frontend -- astro check --minimumSeverity error`: **0 errores**.
- `npm.cmd run build:frontend`: correcto.

Las pruebas recorren el cliente, Gateway, servicio y repositorio reales, y usan
PostgreSQL embebido (PGlite) para ejecutar migraciones, RLS y auditoría. Cubren
persistencia, asociaciones inválidas, permisos territoriales, concurrencia,
atomicidad y preparación de actas históricas. En navegador también se verifica
recarga, carga/error/vacío, validación, doble envío, conflictos y tamaño móvil.
Auth y el adaptador HTTP de PostgREST son simulados; queda la comprobación con
Auth/PostgREST del proyecto real después de aplicar el SQL.
