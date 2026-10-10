# SCRUM-98 — Diagnóstico de Organización mediante API Gateway

Implementado el 9 de octubre de 2026 en `feature/diagnostico-organizacion-api-sprint-5`.
Alcance: la tarea de integración de Diagnóstico mostrada en la captura.

## Resultado

La ficha de Organización consulta, registra y actualiza su diagnóstico mediante
el cliente HTTP compartido, el Gateway y el servicio de Organizaciones. Se retiró
el servicio de demostración del flujo de la pantalla. La interfaz muestra carga,
confirmación, errores, reintentos y el estado sin diagnóstico solo después de una
consulta correcta. Un error conserva el borrador; un conflicto exige recargar y
pide confirmación antes de descartarlo. Los campos se bloquean durante el envío.

Se alineó el contrato del backend con el formulario y la tabla real: misión,
visión, espacio físico, infraestructura, espacios, recursos, daños, necesidades,
observaciones y raciones/periodicidad. El contrato anterior de título,
descripción y estado no correspondía al diagnóstico institucional.

Se mantiene un diagnóstico por Organización. PostgreSQL asigna la fecha,
autoría, marcas de tiempo y versión. Las actualizaciones filtran por diagnóstico,
organización y versión esperada para impedir que dos sesiones sobrescriban datos.

La migración nueva elimina la política antigua `USING (true)`, establece las
políticas de lectura y gestión por organización y concede únicamente lectura y
escritura de las columnas del formulario. Mantiene la auditoría existente y
restablece la restricción de raciones no negativas.

## Contrato HTTP

Todas las rutas reciben `Authorization: Bearer <access_token>` y pasan del Gateway
al servicio de Organizaciones conservando el token y el identificador de petición.

| Método | Ruta pública | Datos / respuesta |
| --- | --- | --- |
| GET | `/api/v1/organizations/:org/diagnosticos` | `data.diagnosticos`: lista vacía o un diagnóstico |
| POST | `/api/v1/organizations/:org/diagnosticos` | Campos completos; devuelve `data.diagnostico`, HTTP 201 |
| GET | `/api/v1/organizations/:org/diagnosticos/:id` | `data.diagnostico` |
| PATCH | `/api/v1/organizations/:org/diagnosticos/:id` | `{ version_esperada, cambios: { ...camposCompletos } }`; devuelve `data.diagnostico` |

Los ocho textos son obligatorios; admiten 500 caracteres, excepto observaciones
(1000). Espacio físico admite `true`, `false` o `null`. Raciones admite un entero
entre 0 y 2147483647 y debe acompañarse de `diaria`, `semanal` o `mensual`; ambos
campos admiten `null` conjuntamente. IDs, fecha, autoría y versión no se aceptan
como campos del formulario. La versión esperada es obligatoria al actualizar.

Errores: 400 por validación, 401 sin sesión, 403 sin permiso de escritura,
404 por recurso inexistente/no visible, 409 por duplicidad o concurrencia y
503 si no se puede conectar con Supabase. El cliente valida también la respuesta
para evitar presentar datos incompletos o de otra organización.

## Paso manual en Supabase

No se aplicaron cambios a una instancia remota. En el **SQL Editor del mismo
proyecto que usa la aplicación**:

1. Ejecuta `supabase/preflight-scrum-98.sql`. Deben existir las dos funciones de
   permisos; las tres consultas de datos incompatibles deben devolver cero filas.
   Si aparecen diagnósticos incompletos, duplicados o raciones inválidas, hay que
   corregir sus datos reales antes de aplicar las restricciones. No se borran ni
   se rellenan automáticamente con información inventada.
2. Si la tabla todavía tiene `necesidad` y `estado_infraestructura`, aplica una
   sola vez `supabase/migrations/20261008120000_fge_diagnosticos.sql`.
   Si ya tiene `necesidades_prioritarias` y `caracteristicas_infraestructura`,
   esa migración ya debería estar aplicada; no repitas sus renombrados.
3. Aplica una sola vez
   **`supabase/migrations/20261009120000_fge_diagnosticos_api.sql`**.
   Este archivo contiene su propia transacción y notifica la recarga de PostgREST.
   Sus políticas no dependen de aplicar las migraciones de Actas o Compromisos.
4. Comprueba los permisos con la consulta siguiente. Debe devolver
   `lectura=true`, `crear=true`, `editar=true`, `cambiar_organizacion=false`,
   `borrar=false`, y no debe existir la política antigua de acceso general.

```sql
select
  has_table_privilege('authenticated','public.diagnosticos','SELECT') as lectura,
  has_column_privilege('authenticated','public.diagnosticos','mision','INSERT') as crear,
  has_column_privilege('authenticated','public.diagnosticos','mision','UPDATE') as editar,
  has_column_privilege('authenticated','public.diagnosticos','id_organizacion','UPDATE') as cambiar_organizacion,
  has_table_privilege('authenticated','public.diagnosticos','DELETE') as borrar;

select policyname, cmd from pg_policies
where schemaname='public' and tablename='diagnosticos';
```

La base debe contener las migraciones anteriores de Organizaciones y permisos,
en particular `20261002120000_fge_reforzar_rls_planes_acciones.sql`. Si el preflight
devuelve funciones nulas, falta esa base; no continúes con la migración nueva.

Estas instrucciones aplican los archivos del módulo de forma explícita. No se
verificó un `db push` global: hay una incompatibilidad previa en
`20261008000000_fge_tabla_compromisos.sql`, que intenta indexar
`compromisos.id_organizacion` aunque la tabla inicial no tiene esa columna.
Esa migración pertenece a Compromisos y no es necesaria para Diagnóstico.

## Configuración y comprobación manual

- En `backend/.env`, configura `SUPABASE_URL` y `SUPABASE_ANON_KEY` para el proyecto.
- En `frontend/.env`, usa el mismo proyecto en `PUBLIC_SUPABASE_URL` y
  `PUBLIC_SUPABASE_ANON_KEY`, y `PUBLIC_API_BASE_URL=http://127.0.0.1:4000`.
- Desde la raíz ejecuta `npm.cmd run dev`. Inicia Frontend, Gateway y servicios.
- Inicia sesión con ADMIN o un COORD autorizado para gestionar la organización.
  Abre Organizaciones → una ficha → Diagnóstico. Registra todos los campos,
  guarda, recarga la página, edita y recarga de nuevo. Confirma la persistencia
  en `public.diagnosticos` y la auditoría en `fge_private.historial_cambios`.
- En Network, las operaciones deben ir al Gateway en `/api/v1/organizations/.../diagnosticos`.
  La lectura de sesión/roles de Supabase pertenece a la autenticación existente.

No se requiere una clave `service_role`, crear un bucket ni desplegar una Edge
Function para esta tarea.

## Verificación ejecutada

- `npm.cmd test`: aprobada la suite de arquitectura/backend y **55 pruebas del frontend**.
- `npm.cmd run test:e2e:diagnostico --workspace=frontend`: **6/6 aprobadas**.
- `npm.cmd exec --workspace=frontend -- astro check --minimumSeverity error`: **0 errores**.
- `npm.cmd run build:frontend`: correcto.

Las pruebas de integración usan el cliente, Gateway, servicio y repositorio
reales; ejecutan las migraciones de Diagnóstico y las políticas RLS en PostgreSQL
embebido (PGlite). Comprueban creación/edición, consulta posterior, validación,
autoría/auditoría, duplicados, usuarios sin rol, límites territoriales del COORD,
IDs cruzados y escrituras simultáneas. Las pruebas de navegador recorren el mismo
backend local y comprueban la interfaz, errores, carga, doble envío y conflictos.
Auth y el adaptador HTTP de PostgREST son simulados; falta la comprobación final
con el Auth y PostgREST del proyecto real después de aplicar la migración.

También se corrigió el soporte de `min/max/step` en Input, la posibilidad de
retirar la periodicidad opcional y una importación de tipos obsoleta de Acciones
que impedía aprobar el chequeo global.
