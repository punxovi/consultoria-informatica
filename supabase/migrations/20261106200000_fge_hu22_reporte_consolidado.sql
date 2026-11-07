-- HU22: lectura completa y consistente bajo el JWT/RLS del solicitante.
BEGIN;
CREATE OR REPLACE FUNCTION public.consultar_reporte_consolidado(p_filtros jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_inicio date; v_termino date; v_pais uuid; v_org uuid; v_programa uuid;
  v_indicadores uuid[]; v_resultados uuid[]; v_key text;
  v_reporte jsonb; v_filas bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión requerida' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_filtros) IS DISTINCT FROM 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_filtros) k
    WHERE k <> ALL(ARRAY['startDate','endDate','countryId','organizationId','programId','indicatorIds','resultIds'])
  ) THEN RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE='22023'; END IF;
  FOREACH v_key IN ARRAY ARRAY['startDate','endDate'] LOOP
    IF jsonb_typeof(p_filtros->v_key) IS DISTINCT FROM 'string'
       OR p_filtros->>v_key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       OR p_filtros->>v_key LIKE '0000-%' THEN
      RAISE EXCEPTION 'Las fechas son obligatorias y deben ser fechas calendario' USING ERRCODE='22023';
    END IF;
  END LOOP;
  v_inicio := (p_filtros->>'startDate')::date;
  v_termino := (p_filtros->>'endDate')::date;
  IF v_inicio > v_termino THEN RAISE EXCEPTION 'Rango invertido' USING ERRCODE='22023'; END IF;
  FOREACH v_key IN ARRAY ARRAY['countryId','organizationId','programId'] LOOP
    IF p_filtros ? v_key AND jsonb_typeof(p_filtros->v_key) IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Identificador inválido' USING ERRCODE='22023';
    END IF;
  END LOOP;
  v_pais := (p_filtros->>'countryId')::uuid;
  v_org := (p_filtros->>'organizationId')::uuid;
  v_programa := (p_filtros->>'programId')::uuid;
  FOREACH v_key IN ARRAY ARRAY['indicatorIds','resultIds'] LOOP
    IF p_filtros ? v_key THEN
      IF jsonb_typeof(p_filtros->v_key) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Lista de identificadores inválida' USING ERRCODE='22023';
      END IF;
      IF jsonb_array_length(p_filtros->v_key) NOT BETWEEN 1 AND 100
         OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_filtros->v_key) x WHERE jsonb_typeof(x) <> 'string') THEN
        RAISE EXCEPTION 'Lista de identificadores inválida' USING ERRCODE='22023';
      END IF;
    END IF;
  END LOOP;
  IF p_filtros ? 'indicatorIds' THEN
    v_indicadores := ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_filtros->'indicatorIds'));
  END IF;
  IF p_filtros ? 'resultIds' THEN
    v_resultados := ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_filtros->'resultIds'));
  END IF;

  -- Las subconsultas EXISTS evitan multiplicar organizaciones y beneficiarios.
  WITH orgs AS MATERIALIZED (
    SELECT o.id_organizacion,o.nombre,o.numero_beneficiarios,p.nombre AS pais
    FROM public.organizaciones o JOIN public.paises p ON p.id_pais=o.id_pais
    WHERE o.archived_at IS NULL AND p.archived_at IS NULL
      AND fge_private.usuario_puede_consultar_organizacion(o.id_organizacion)
      AND (v_pais IS NULL OR o.id_pais=v_pais) AND (v_org IS NULL OR o.id_organizacion=v_org)
      AND (v_programa IS NULL OR EXISTS(SELECT 1 FROM public.planes pl
        WHERE pl.id_organizacion=o.id_organizacion AND pl.id_programa=v_programa AND pl.archived_at IS NULL)
        OR EXISTS(SELECT 1 FROM public.donaciones d WHERE d.id_organizacion=o.id_organizacion
          AND d.id_programa=v_programa AND d.archived_at IS NULL))
  ), planes AS MATERIALIZED (
    SELECT p.id_plan,p.nombre,p.id_organizacion,o.nombre AS organizacion,
      coalesce(pr.nombre,'No disponible') AS programa,p.fecha_inicio,p.fecha_termino
    FROM public.planes p JOIN orgs o USING(id_organizacion)
    LEFT JOIN public.programas pr ON pr.id_programa=p.id_programa
    WHERE p.archived_at IS NULL AND p.fecha_inicio<=v_termino AND p.fecha_termino>=v_inicio
      AND (v_programa IS NULL OR p.id_programa=v_programa)
  ), acciones AS MATERIALIZED (
    SELECT a.id_accion,a.nombre,a.estado,a.fecha_inicio,a.fecha_termino,p.nombre AS plan,p.id_organizacion
    FROM public.acciones a JOIN planes p USING(id_plan)
    WHERE a.archived_at IS NULL AND a.fecha_inicio<=v_termino AND a.fecha_termino>=v_inicio
  ), compromisos AS MATERIALIZED (
    SELECT c.id_compromiso,c.descripcion AS acuerdo,c.estado,c.cumplido_at AS fecha_cumplimiento,o.nombre AS organizacion
    FROM public.compromisos c JOIN public.actas a USING(id_acta) JOIN orgs o USING(id_organizacion)
    WHERE c.archived_at IS NULL AND a.archived_at IS NULL
      AND (v_programa IS NULL OR EXISTS(SELECT 1 FROM public.planes p
        WHERE p.id_plan=a.id_plan AND p.id_programa=v_programa AND p.archived_at IS NULL))
      AND ((c.estado='cumplido' AND c.cumplido_at >= (v_inicio::timestamp AT TIME ZONE 'UTC')
        AND c.cumplido_at < ((v_termino+1)::timestamp AT TIME ZONE 'UTC'))
        OR (c.estado<>'cumplido' AND c.fecha_limite BETWEEN v_inicio AND v_termino))
  ), donaciones AS MATERIALIZED (
    SELECT d.id_donacion,d.fecha,d.tipo_aporte,d.monto,d.cantidad,o.nombre AS organizacion
    FROM public.donaciones d JOIN orgs o USING(id_organizacion)
    WHERE d.archived_at IS NULL AND d.fecha BETWEEN v_inicio AND v_termino
      AND (v_programa IS NULL OR d.id_programa=v_programa)
  ), candidatos_indicador AS MATERIALIZED (
    SELECT i.id_indicador,i.nombre,o.nombre AS organizacion
    FROM public.indicadores i JOIN acciones a USING(id_accion) JOIN orgs o USING(id_organizacion)
    WHERE i.archived_at IS NULL AND (v_indicadores IS NULL OR i.id_indicador=ANY(v_indicadores))
  ), resultados AS MATERIALIZED (
    SELECT r.id_resultado,r.id_indicador,r.valor_medido,r.fecha_medicion,r.created_at,
      coalesce(r.observaciones,'Resultado de '||i.nombre) AS descripcion,i.organizacion
    FROM public.resultados r JOIN candidatos_indicador i USING(id_indicador)
    WHERE r.archived_at IS NULL AND r.fecha_medicion BETWEEN v_inicio AND v_termino
      AND (v_resultados IS NULL OR r.id_resultado=ANY(v_resultados))
  ), ultima_medicion AS (
    SELECT DISTINCT ON(id_indicador) id_indicador,valor_medido FROM resultados
    ORDER BY id_indicador,fecha_medicion DESC,created_at DESC,id_resultado DESC
  ), indicadores AS MATERIALIZED (
    SELECT i.id_indicador,i.nombre,u.valor_medido AS valor_obtenido,i.organizacion
    FROM candidatos_indicador i LEFT JOIN ultima_medicion u USING(id_indicador)
    WHERE v_resultados IS NULL OR u.id_indicador IS NOT NULL
  ), conteos AS (
    SELECT (SELECT count(*) FROM orgs)+(SELECT count(*) FROM planes)+(SELECT count(*) FROM acciones)
      +(SELECT count(*) FROM compromisos)+(SELECT count(*) FROM donaciones)
      +(SELECT count(*) FROM indicadores)+(SELECT count(*) FROM resultados) AS total
  )
  SELECT total,CASE WHEN total<=20000 THEN jsonb_build_object(
    'generatedAt',statement_timestamp(),'period',jsonb_build_object('start',v_inicio,'end',v_termino),'filters',p_filtros,
    'sections',jsonb_build_object(
      'organizations',coalesce((SELECT jsonb_agg(jsonb_build_object('id_organizacion',id_organizacion,'nombre',nombre,
        'numero_beneficiarios',coalesce(numero_beneficiarios,0),'pais',pais) ORDER BY id_organizacion) FROM orgs),'[]'),
      'plans',coalesce((SELECT jsonb_agg(to_jsonb(p)-'id_organizacion' ORDER BY id_plan) FROM planes p),'[]'),
      'actions',coalesce((SELECT jsonb_agg(to_jsonb(a)-'id_organizacion' ORDER BY id_accion) FROM acciones a),'[]'),
      'commitments',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY id_compromiso) FROM compromisos c),'[]'),
      'donations',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY id_donacion) FROM donaciones d),'[]'),
      'indicators',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY id_indicador) FROM indicadores i),'[]'),
      'results',coalesce((SELECT jsonb_agg(jsonb_build_object('id_resultado',id_resultado,'descripcion',descripcion,
        'fecha_obtencion',fecha_medicion,'organizacion',organizacion) ORDER BY id_resultado) FROM resultados),'[]')),
    'summary',jsonb_build_object('totalBeneficiaries',coalesce((SELECT sum(coalesce(numero_beneficiarios,0)) FROM orgs),0),
      'totalDonationsAmount',coalesce((SELECT sum(monto) FROM donaciones),0),
      'completedActions',(SELECT count(*) FROM acciones WHERE estado='cumplida'))
  ) END INTO v_filas,v_reporte FROM conteos;
  IF v_filas>20000 OR octet_length(v_reporte::text)>4194304 THEN
    RAISE EXCEPTION 'Reduce el rango o los filtros: reporte demasiado grande' USING ERRCODE='54000';
  END IF;
  RETURN v_reporte;
END;
$$;
REVOKE ALL ON FUNCTION public.consultar_reporte_consolidado(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_reporte_consolidado(jsonb) TO authenticated;
COMMENT ON FUNCTION public.consultar_reporte_consolidado(jsonb) IS
  'HU22: una instantánea por sentencia, sin truncamiento por max_rows y respetando RLS. Máximo 20000 filas y 4 MiB.';
NOTIFY pgrst,'reload schema';
COMMIT;
