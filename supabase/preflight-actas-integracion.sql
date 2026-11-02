-- Solo lectura. Compatible con los nombres originales y los de Sprint 5.
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('actas','compromisos') ORDER BY table_name,ordinal_position;

SELECT
  to_regprocedure('fge_private.usuario_puede_consultar_organizacion(uuid)') AS consulta,
  to_regprocedure('fge_private.usuario_puede_gestionar_organizacion(uuid)') AS gestion,
  to_regprocedure('public.catalogo_actas(uuid)') AS catalogo_nuevo,
  to_regprocedure('public.crear_acta_completa(jsonb,jsonb)') AS guardado_nuevo;

-- Debe devolver cero filas: vínculos faltantes o incompatibles.
WITH vinculos AS (
  SELECT a.id_acta,a.id_accion,
    coalesce((to_jsonb(a)->>'id_plan')::uuid,x.id_plan) AS plan,
    coalesce((to_jsonb(a)->>'id_organizacion')::uuid,px.id_organizacion) AS organizacion,
    x.id_plan AS plan_accion
  FROM public.actas a LEFT JOIN public.acciones x USING(id_accion)
  LEFT JOIN public.planes px ON px.id_plan=x.id_plan
)
SELECT v.* FROM vinculos v LEFT JOIN public.planes p ON p.id_plan=v.plan
WHERE v.plan IS NULL OR v.organizacion IS NULL OR p.id_organizacion IS DISTINCT FROM v.organizacion
   OR (v.id_accion IS NOT NULL AND v.plan_accion IS DISTINCT FROM v.plan);

-- Debe devolver cero filas antes de preparar/aplicar las restricciones de longitud.
SELECT a.id_acta,c.nombre AS campo_incompatible
FROM public.actas a CROSS JOIN LATERAL (VALUES
  ('objetivo',a.objetivo,1000),
  ('observaciones',coalesce(to_jsonb(a)->>'observaciones',to_jsonb(a)->>'notas'),2000),
  ('asistentes_externos',to_jsonb(a)->>'asistentes_externos',500)
) c(nombre,valor,maximo) WHERE length(c.valor)>c.maximo;

-- Información histórica a completar al editar, no se inventan asistentes.
SELECT a.id_acta FROM public.actas a
WHERE coalesce(to_jsonb(a)->'asistentes','[]'::jsonb)='[]'::jsonb
AND NOT EXISTS(SELECT 1 FROM public.acta_participantes p WHERE p.id_acta=a.id_acta AND p.archived_at IS NULL);

-- Variante incompatible de Compromisos: requiere resolver su esquema antes de continuar.
-- Con la estructura original del repositorio esta consulta devuelve cero filas.
SELECT column_name,is_nullable,column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='compromisos' AND column_name='id_organizacion'
AND is_nullable='NO' AND column_default IS NULL;

SELECT policyname,tablename,cmd,roles,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('actas','compromisos');
