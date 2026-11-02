-- Consulta paginada y de solo lectura del historial institucional.
BEGIN;

CREATE OR REPLACE FUNCTION public.consultar_eventos_auditoria(
  p_filtros jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_usuario text;
  v_pais text;
  v_desde date;
  v_hasta date;
  v_operacion text;
  v_entidad text;
  v_limit integer := 50;
  v_cursor_fecha timestamptz;
  v_cursor_id bigint;
  v_resultado jsonb;
BEGIN
  IF jsonb_typeof(p_filtros) IS DISTINCT FROM 'object'
    OR (p_filtros - ARRAY['usuario', 'pais', 'desde', 'hasta', 'operacion', 'entidad', 'limit', 'cursor_fecha', 'cursor_id']) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE = '22023';
  END IF;

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

  BEGIN
    v_desde := nullif(p_filtros ->> 'desde', '')::date;
    v_hasta := nullif(p_filtros ->> 'hasta', '')::date;
    v_cursor_fecha := nullif(p_filtros ->> 'cursor_fecha', '')::timestamptz;
    v_cursor_id := nullif(p_filtros ->> 'cursor_id', '')::bigint;
    IF p_filtros ? 'limit' AND p_filtros -> 'limit' <> 'null'::jsonb THEN
      v_limit := (p_filtros ->> 'limit')::integer;
    END IF;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
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
      coalesce(perfil.nombre, cuenta.email, historial.id_usuario::text) AS usuario,
      historial.codigo_rol AS rol,
      historial.fecha_hora,
      coalesce(pais_directo.nombre, pais_asignacion.nombre, pais_cobertura.nombre) AS pais,
      historial.ip_origen::text AS ip,
      historial.tipo_accion AS operacion,
      historial.tabla_afectada AS entidad,
      nullif((
        SELECT string_agg(campo.key || ': ' || campo.value, ', ' ORDER BY campo.key)
        FROM jsonb_each_text(historial.clave_registro) AS campo
      ), '') AS referencia,
      historial.id_historial_cambio
    FROM fge_private.historial_cambios AS historial
    LEFT JOIN public.perfiles AS perfil ON perfil.id_usuario = historial.id_usuario
    LEFT JOIN auth.users AS cuenta ON cuenta.id = historial.id_usuario
    LEFT JOIN public.asignaciones_roles AS asignacion ON asignacion.id_asignacion = historial.id_asignacion
    LEFT JOIN public.paises AS pais_asignacion ON pais_asignacion.id_pais = asignacion.id_pais
    LEFT JOIN public.permisos_temporales AS cobertura ON cobertura.id_permiso_temporal = historial.id_permiso_temporal
    LEFT JOIN public.paises AS pais_cobertura ON pais_cobertura.id_pais = cobertura.id_pais
    LEFT JOIN public.paises AS pais_directo ON pais_directo.id_pais::text = coalesce(
      historial.despues ->> 'id_pais', historial.antes ->> 'id_pais'
    )
    WHERE (v_usuario IS NULL OR perfil.nombre ILIKE '%' || v_usuario || '%'
      OR cuenta.email ILIKE '%' || v_usuario || '%'
      OR historial.id_usuario::text ILIKE '%' || v_usuario || '%')
      AND (v_pais IS NULL OR pais_directo.nombre ILIKE '%' || v_pais || '%'
        OR pais_directo.codigo_iso ILIKE '%' || v_pais || '%'
        OR pais_asignacion.nombre ILIKE '%' || v_pais || '%'
        OR pais_asignacion.codigo_iso ILIKE '%' || v_pais || '%'
        OR pais_cobertura.nombre ILIKE '%' || v_pais || '%'
        OR pais_cobertura.codigo_iso ILIKE '%' || v_pais || '%')
      AND (v_operacion IS NULL OR historial.tipo_accion ILIKE '%' || v_operacion || '%')
      AND (v_entidad IS NULL OR historial.tabla_afectada ILIKE '%' || v_entidad || '%')
      AND (v_desde IS NULL OR historial.fecha_hora >= v_desde::timestamp AT TIME ZONE 'UTC')
      AND (v_hasta IS NULL OR historial.fecha_hora < (v_hasta + 1)::timestamp AT TIME ZONE 'UTC')
      AND (v_cursor_fecha IS NULL OR (historial.fecha_hora, historial.id_historial_cambio) < (v_cursor_fecha, v_cursor_id))
    ORDER BY historial.fecha_hora DESC, historial.id_historial_cambio DESC
    LIMIT v_limit + 1
  ), pagina AS (
    SELECT * FROM resultados ORDER BY fecha_hora DESC, id_historial_cambio DESC LIMIT v_limit
  ), siguiente AS (
    SELECT fecha_hora, id FROM resultados ORDER BY fecha_hora DESC, id_historial_cambio DESC OFFSET v_limit LIMIT 1
  )
  SELECT jsonb_build_object(
    'events', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pagina.id,
        'usuario', pagina.usuario,
        'rol', pagina.rol,
        'fecha_hora', pagina.fecha_hora,
        'pais', pagina.pais,
        'ip', pagina.ip,
        'operacion', pagina.operacion,
        'entidad', pagina.entidad,
        'referencia', pagina.referencia
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
COMMIT;
