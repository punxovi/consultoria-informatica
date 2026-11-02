SELECT
  to_regprocedure('fge_private.usuario_puede_consultar_organizacion(uuid)') AS consulta,
  to_regprocedure('fge_private.usuario_puede_gestionar_organizacion(uuid)') AS gestion,
  to_regprocedure('public.crear_acta_completa(jsonb,jsonb)') AS actas_integradas,
  to_regprocedure('public.guardar_compromiso(uuid,jsonb,uuid,bigint)') AS guardado_nuevo;

SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='compromisos' ORDER BY ordinal_position;

-- Debe devolver cero filas. La organización se deriva del acta, no se recibe del formulario.
SELECT c.id_compromiso,c.id_acta FROM public.compromisos c LEFT JOIN public.actas a USING(id_acta)
WHERE a.id_acta IS NULL OR to_jsonb(a)->>'id_organizacion' IS NULL
OR (to_jsonb(c)->>'id_organizacion' IS NOT NULL AND to_jsonb(c)->>'id_organizacion' IS DISTINCT FROM to_jsonb(a)->>'id_organizacion');

-- Debe devolver cero filas antes de aplicar restricciones; corregir con información real.
SELECT id_compromiso,estado FROM public.compromisos c
WHERE nullif(btrim(descripcion),'') IS NULL OR length(descripcion)>2000
OR nullif(btrim(responsable_nombre),'') IS NULL OR length(responsable_nombre)>150
OR length(observaciones)>2000 OR fecha_limite IS NULL
OR estado NOT IN ('pendiente','cumplido') OR (estado='cumplido')<>(cumplido_at IS NOT NULL)
OR (to_jsonb(c)->>'responsable_contacto' IS NOT NULL AND (btrim(to_jsonb(c)->>'responsable_contacto')='' OR length(to_jsonb(c)->>'responsable_contacto')>300));

-- Históricos sin contacto: pueden consultarse y se debe completar su contacto al editar.
SELECT id_compromiso,id_contacto_responsable FROM public.compromisos c WHERE to_jsonb(c)->>'responsable_contacto' IS NULL;

-- Debe devolver cero filas: detecta una variante incompatible con la estructura original.
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='compromisos' AND column_name='id_organizacion'
AND is_nullable='NO' AND column_default IS NULL;

SELECT policyname,cmd,roles,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='compromisos';
