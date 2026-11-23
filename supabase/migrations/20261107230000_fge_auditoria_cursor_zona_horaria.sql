BEGIN;
CREATE OR REPLACE FUNCTION public.consultar_eventos_auditoria(
  p_filtros jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_usuario text;
  v_usuario_id uuid;
  v_pais_id uuid;
  v_uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  v_key text;
  v_pais text;
  v_desde date;
  v_hasta date;
  v_zona text;
  v_operacion text;
  v_entidad text;
  v_limit integer := 50;
  v_cursor_fecha timestamptz;
  v_cursor_id bigint;
  v_resultado jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.perfiles AS perfil
    JOIN public.asignaciones_roles AS asignacion ON asignacion.id_usuario = perfil.id_usuario
    JOIN public.roles AS rol ON rol.id_rol = asignacion.id_rol
    WHERE perfil.id_usuario = v_actor
      AND perfil.activo
      AND perfil.archived_at IS NULL
      AND asignacion.revocado_at IS NULL
      AND asignacion.archived_at IS NULL
      AND asignacion.alcance = 'global'
      AND rol.codigo = 'ADMIN'
      AND rol.activo
      AND rol.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Administrador requerido' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_filtros) IS DISTINCT FROM 'object'
    OR (p_filtros - ARRAY['usuario', 'pais', 'id_usuario', 'id_pais', 'desde', 'hasta', 'operacion', 'entidad', 'zona_horaria', 'limit', 'cursor_fecha', 'cursor_id']) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_filtros) AS campo
    WHERE campo.key <> 'limit' AND campo.value <> 'null'::jsonb AND jsonb_typeof(campo.value) <> 'string'
  ) OR (p_filtros ? 'limit' AND jsonb_typeof(p_filtros -> 'limit') NOT IN ('number', 'null')) THEN
    RAISE EXCEPTION 'Tipos de filtro inválidos' USING ERRCODE = '22023';
  END IF;

  v_usuario := nullif(btrim(p_filtros ->> 'usuario'), '');
  v_pais := nullif(btrim(p_filtros ->> 'pais'), '');
  v_operacion := nullif(btrim(p_filtros ->> 'operacion'), '');
  v_entidad := nullif(btrim(p_filtros ->> 'entidad'), '');
  IF length(v_usuario) > 150 OR length(v_pais) > 100 OR length(v_operacion) > 80 OR length(v_entidad) > 100 THEN
    RAISE EXCEPTION 'Filtro demasiado largo' USING ERRCODE = '22023';
  END IF;

  FOREACH v_key IN ARRAY ARRAY['id_usuario','id_pais'] LOOP
    IF p_filtros->>v_key IS NOT NULL AND p_filtros->>v_key !~* v_uuid_pattern THEN
      RAISE EXCEPTION 'UUID inválido' USING ERRCODE='22023';
    END IF;
  END LOOP;
  FOREACH v_key IN ARRAY ARRAY['desde','hasta'] LOOP
    IF p_filtros->>v_key IS NOT NULL AND (p_filtros->>v_key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR p_filtros->>v_key LIKE '0000-%') THEN
      RAISE EXCEPTION 'Fecha calendario inválida' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF (p_filtros->>'cursor_id' IS NOT NULL AND p_filtros->>'cursor_id' !~ '^[1-9][0-9]{0,18}$')
    OR (p_filtros->>'cursor_fecha' IS NOT NULL AND (p_filtros->>'cursor_fecha' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,6})?(Z|[+-](0[0-9]|1[0-5]):[0-5][0-9])$' OR p_filtros->>'cursor_fecha' LIKE '0000-%'))
    OR (v_operacion IS NOT NULL AND v_operacion !~* '^[a-z][a-z0-9_:]{0,79}$')
    OR (v_entidad IS NOT NULL AND v_entidad !~* '^[a-z][a-z0-9_.]{0,99}$')
    OR coalesce(v_usuario,'') ~ '[[:cntrl:]]' OR coalesce(v_pais,'') ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Filtro o cursor inválido' USING ERRCODE='22023';
  END IF;
  v_zona := coalesce(nullif(btrim(p_filtros ->> 'zona_horaria'), ''), 'UTC');
  IF length(v_zona) > 64 OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_zona) THEN
    RAISE EXCEPTION 'Zona horaria inválida' USING ERRCODE = '22023';
  END IF;
  v_usuario_id := (p_filtros->>'id_usuario')::uuid;
  v_pais_id := (p_filtros->>'id_pais')::uuid;
  BEGIN
    v_desde := nullif(p_filtros ->> 'desde', '')::date;
    v_hasta := nullif(p_filtros ->> 'hasta', '')::date;
    v_cursor_fecha := nullif(p_filtros ->> 'cursor_fecha', '')::timestamptz;
    v_cursor_id := nullif(p_filtros ->> 'cursor_id', '')::bigint;
    IF p_filtros ? 'limit' AND p_filtros -> 'limit' <> 'null'::jsonb THEN
      v_limit := (p_filtros ->> 'limit')::integer;
    END IF;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Filtro con formato inválido' USING ERRCODE = '22023';
  END;
  IF v_desde IS NOT NULL AND v_hasta IS NOT NULL AND v_desde > v_hasta
    OR v_limit NOT BETWEEN 1 AND 100
    OR (v_cursor_fecha IS NULL) <> (v_cursor_id IS NULL)
    OR v_cursor_id IS NOT NULL AND v_cursor_id < 1 THEN
    RAISE EXCEPTION 'Rango o cursor inválido' USING ERRCODE = '22023';
  END IF;

  WITH resultados AS (
    SELECT
      historial.id_historial_cambio::text AS id,
      historial.id_usuario, pais_evento.id_pais,
      coalesce(perfil.nombre, historial.id_usuario::text) AS usuario,
      historial.codigo_rol AS rol,
      historial.tipo_evento,historial.zona_horaria,historial.fecha_hora_local,historial.request_id,historial.fuente_ip,
      historial.fecha_hora,
      pais_evento.nombre AS pais,
      historial.ip_origen::text AS ip,
      historial.tipo_accion AS operacion,
      historial.tabla_afectada AS entidad,
      nullif((
        SELECT string_agg(campo.key || ': ' || campo.value, ', ' ORDER BY campo.key)
        FROM jsonb_each_text(historial.clave_registro || CASE WHEN historial.tabla_afectada='reportes'
          THEN jsonb_build_object('id_reporte',historial.clave_registro->'filtros'->>'reportId') ELSE '{}'::jsonb END) AS campo
        WHERE campo.key ~ '^id_[a-z0-9_]+$'
          AND (campo.value ~* v_uuid_pattern OR campo.value ~ '^[0-9]{1,19}$')
      ), '') AS referencia,
      historial.id_historial_cambio,
      perfil.nombre AS nombre_usuario,
      left(coalesce(
        historial.despues ->> 'nombre', historial.antes ->> 'nombre',
        historial.despues ->> 'titulo', historial.antes ->> 'titulo',
        historial.despues ->> 'nombre_producto', historial.antes ->> 'nombre_producto'
      ), 160) AS nombre_registro,
      CASE WHEN historial.tipo_accion = 'UPDATE' AND historial.antes IS NOT NULL AND historial.despues IS NOT NULL THEN (
        SELECT coalesce(jsonb_agg(campo.key ORDER BY campo.key), '[]'::jsonb)
        FROM jsonb_each(historial.despues) AS campo
        WHERE campo.key <> ALL (ARRAY['updated_at', 'updated_by', 'created_at', 'created_by', 'version', 'archived_at'])
          AND historial.antes -> campo.key IS DISTINCT FROM campo.value
      ) END AS campos_modificados,
      CASE
        WHEN historial.tipo_accion = 'UPDATE' AND historial.antes ->> 'archived_at' IS NULL AND historial.despues ->> 'archived_at' IS NOT NULL THEN 'archivado'
        WHEN historial.tipo_accion = 'UPDATE' AND historial.antes ->> 'archived_at' IS NOT NULL AND historial.despues ->> 'archived_at' IS NULL THEN 'restaurado'
      END AS cambio_estado,
      CASE
        WHEN historial.tabla_afectada = 'autenticacion' THEN
          CASE WHEN historial.tipo_evento IN ('auth:login','auth:login_backend') THEN 'inicio_sesion' WHEN historial.clave_registro->>'exitoso'='false' THEN 'inicio_sesion_fallido' ELSE NULL END
        WHEN historial.antes IS NULL AND historial.despues ->> 'operacion' = 'lectura_documento' THEN 'lectura_documento'
      END AS accion_especial
    FROM fge_private.historial_cambios AS historial
    LEFT JOIN public.perfiles AS perfil ON perfil.id_usuario = historial.id_usuario
    LEFT JOIN auth.users AS cuenta ON cuenta.id = historial.id_usuario
    LEFT JOIN public.asignaciones_roles AS asignacion ON asignacion.id_asignacion = historial.id_asignacion
    LEFT JOIN public.permisos_temporales AS cobertura ON cobertura.id_permiso_temporal = historial.id_permiso_temporal
    LEFT JOIN public.paises AS pais_evento ON pais_evento.id_pais = coalesce(
      historial.id_pais,
      CASE WHEN coalesce(historial.despues->>'id_pais',historial.antes->>'id_pais') ~* v_uuid_pattern
        THEN coalesce(historial.despues->>'id_pais',historial.antes->>'id_pais')::uuid END,
      cobertura.id_pais, asignacion.id_pais)
    WHERE (v_usuario_id IS NULL OR historial.id_usuario = v_usuario_id)
      AND (v_pais_id IS NULL OR historial.id_pais = v_pais_id OR (historial.id_pais IS NULL AND pais_evento.id_pais = v_pais_id))
      AND (v_usuario IS NULL OR strpos(lower(perfil.nombre),lower(v_usuario)) > 0
        OR strpos(lower(cuenta.email),lower(v_usuario)) > 0)
      AND (v_pais IS NULL OR strpos(lower(pais_evento.nombre),lower(v_pais)) > 0
        OR lower(pais_evento.codigo_iso)=lower(v_pais))
      AND (v_operacion IS NULL OR historial.tipo_accion=upper(v_operacion) OR historial.tipo_evento=lower(v_operacion))
      AND (v_entidad IS NULL OR historial.tabla_afectada=lower(v_entidad))
      AND (v_desde IS NULL OR historial.fecha_hora >= (v_desde::timestamp AT TIME ZONE v_zona))
      AND (v_hasta IS NULL OR historial.fecha_hora < ((v_hasta + 1)::timestamp AT TIME ZONE v_zona))
      AND (v_cursor_fecha IS NULL OR (historial.fecha_hora, historial.id_historial_cambio) < (v_cursor_fecha, v_cursor_id))
    ORDER BY historial.fecha_hora DESC, historial.id_historial_cambio DESC
    LIMIT v_limit + 1
  ), pagina AS (
    SELECT * FROM resultados ORDER BY fecha_hora DESC, id_historial_cambio DESC LIMIT v_limit
  ), siguiente AS (
    SELECT fecha_hora, id FROM pagina WHERE (SELECT count(*) FROM resultados)>v_limit
    ORDER BY fecha_hora, id_historial_cambio LIMIT 1
  )
  SELECT jsonb_build_object(
    'events', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pagina.id,
        'id_usuario', pagina.id_usuario, 'id_pais', pagina.id_pais,
        'usuario', pagina.usuario,
        'rol', pagina.rol,
        'fecha_hora', pagina.fecha_hora,
        'pais', pagina.pais,
        'ip', pagina.ip,
        'operacion', pagina.operacion,
        'entidad', pagina.entidad,
        'referencia', pagina.referencia,
        'nombre_usuario', pagina.nombre_usuario,
        'nombre_registro', pagina.nombre_registro,
        'campos_modificados', pagina.campos_modificados,
        'cambio_estado', pagina.cambio_estado,
        'accion_especial', pagina.accion_especial,
        'tipo_evento',pagina.tipo_evento,'zona_horaria',pagina.zona_horaria,'fecha_hora_local',pagina.fecha_hora_local,
        'request_id',pagina.request_id,'fuente_ip',pagina.fuente_ip
      ) ORDER BY pagina.fecha_hora DESC, pagina.id_historial_cambio DESC)
      FROM pagina
    ), '[]'::jsonb),
    'next_cursor', (
      SELECT jsonb_build_object('fecha_hora', siguiente.fecha_hora, 'id', siguiente.id)
      FROM siguiente
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.consultar_eventos_auditoria(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consultar_eventos_auditoria(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
