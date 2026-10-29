# QA SCRUM-153: autorización territorial y caducidad local

La autorización de escritura queda en RLS/backend mediante:

- `fge_private.usuario_puede_gestionar_pais(uuid)`, que valida sesión, perfil,
  rol, país principal o cobertura vigente.
- `fge_private.usuario_tiene_cobertura_pais(uuid)`, que no concede una
  cobertura no iniciada, revocada o archivada y transforma `fin_at` a la fecha
  local del país. El límite efectivo es la medianoche siguiente, por lo que el
  último día termina a las 23:59:59.999 local.
- Las políticas de `organizaciones` usan la misma regla para INSERT y UPDATE;
  Planes, Acciones y el resto de módulos que delegan en
  `usuario_puede_gestionar_organizacion` heredan la misma validación.

La prueba de regresión está en
`supabase/tests/database/025_scrum153_autorizacion_temporal_local.test.sql`.

## Verificaciones de migración

En local, con Docker iniciado:

```powershell
supabase start
supabase db reset
supabase migration list --local
```

La prueba aislada se puede ejecutar contra el contenedor de base de datos con
`psql`; la suite del repositorio se ejecuta con:

```powershell
.\supabase\test-pgtap-docker.ps1 -Container supabase_db_Consultoria_Informatica
```

El nombre exacto se obtiene con `docker ps --format '{{.Names}}'`. En esta
máquina la verificación no pudo ejecutarse porque Docker Desktop no estaba
disponible.

En remoto, revisar primero el historial y el plan, sin ejecutar migraciones
antiguas a ciegas:

```powershell
supabase migration list --linked
supabase db push --linked --dry-run
```

Comprobar que `20261029100000` figure pendiente antes de aplicar:

```powershell
supabase db push --linked
```

Si el esquema ya contiene la función/políticas porque se ejecutaron desde SQL
Editor, verificar primero el esquema y luego marcar únicamente esa versión
como aplicada:

```sql
SELECT to_regprocedure('fge_private.usuario_puede_gestionar_pais(uuid)'),
       to_regprocedure('fge_private.usuario_tiene_cobertura_pais(uuid)');
SELECT polname, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
FROM pg_policy
WHERE polrelid = 'public.organizaciones'::regclass
  AND polname IN ('organizaciones_gestion_insert','organizaciones_gestion_update');
```

Solo después de comprobar que el resultado coincide con esta migración:

```powershell
supabase migration repair --linked --status applied 20261029100000
```

No volver a ejecutar la migración completa si ya fue aplicada manualmente.

## RNF15

La validación usa índices existentes sobre asignaciones y
`permisos_temporales(id_usuario_beneficiario,id_pais,fin_at)` y no realiza
consultas desde la interfaz. El p95 no se pudo medir en este entorno porque no
había una base local ejecutándose. Para certificarlo, medir 1000 llamadas a la
política/RPC bajo la carga de referencia y registrar p95; el objetivo es ≤500
ms.
