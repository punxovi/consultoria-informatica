BEGIN;

CREATE OR REPLACE FUNCTION fge_private.cobertura_administracion_json(
  p_cobertura public.permisos_temporales
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id_permiso_temporal', cobertura.id_permiso_temporal,
    'id_usuario_beneficiario', cobertura.id_usuario_beneficiario,
    'coordinador_nombre', perfil.nombre,
    'id_pais', cobertura.id_pais,
    'pais_nombre', pais.nombre,
    'motivo', cobertura.motivo,
    'inicio_at', cobertura.inicio_at,
    'fin_at', cobertura.fin_at,
    'revocado_at', cobertura.revocado_at,
    'version', cobertura.version,
    'condicion', CASE
      WHEN cobertura.revocado_at IS NOT NULL THEN 'revocada'
      WHEN now() < cobertura.inicio_at THEN 'futura'
      WHEN now() >= (((cobertura.fin_at AT TIME ZONE pais.zona_horaria)::date + 1)::timestamp AT TIME ZONE pais.zona_horaria) THEN 'vencida'
      ELSE 'vigente'
    END,
    'puede_extender', cobertura.revocado_at IS NULL
      AND now() < (((cobertura.fin_at AT TIME ZONE pais.zona_horaria)::date + 1)::timestamp AT TIME ZONE pais.zona_horaria),
    'puede_revocar', cobertura.revocado_at IS NULL
      AND now() < (((cobertura.fin_at AT TIME ZONE pais.zona_horaria)::date + 1)::timestamp AT TIME ZONE pais.zona_horaria)
  )
  FROM public.permisos_temporales AS cobertura
  JOIN public.perfiles AS perfil ON perfil.id_usuario = cobertura.id_usuario_beneficiario
  JOIN public.paises AS pais ON pais.id_pais = cobertura.id_pais
  WHERE cobertura.id_permiso_temporal = p_cobertura.id_permiso_temporal;
$$;

CREATE OR REPLACE FUNCTION public.administrar_coberturas(
  p_operacion text,
  p_datos jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
  v_beneficiario uuid;
  v_pais uuid;
  v_inicio_date date;
  v_fin_date date;
  v_inicio_at timestamptz;
  v_fin_at timestamptz;
  v_fin_anterior timestamptz;
  v_motivo text;
  v_version bigint;
  v_cobertura public.permisos_temporales;
  v_resultado jsonb;
  v_es_admin boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Se requiere un objeto de datos' USING ERRCODE = '22023';
  END IF;

  IF p_operacion = 'mine' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id_permiso_temporal', cobertura.id_permiso_temporal,
      'id_pais', cobertura.id_pais,
      'inicio_at', cobertura.inicio_at,
      'fin_at', cobertura.fin_at
    ) ORDER BY cobertura.fin_at, cobertura.id_permiso_temporal), '[]'::jsonb)
    INTO v_resultado
    FROM public.permisos_temporales AS cobertura
    JOIN public.perfiles AS perfil ON perfil.id_usuario = cobertura.id_usuario_beneficiario
    JOIN public.paises AS pais ON pais.id_pais = cobertura.id_pais
    WHERE cobertura.id_usuario_beneficiario = v_actor
      AND perfil.activo
      AND perfil.archived_at IS NULL
      AND cobertura.archived_at IS NULL
      AND cobertura.revocado_at IS NULL
      AND now() >= cobertura.inicio_at
      AND now() < (((cobertura.fin_at AT TIME ZONE pais.zona_horaria)::date + 1)::timestamp AT TIME ZONE pais.zona_horaria);
    RETURN v_resultado;
  END IF;

  SELECT EXISTS (
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
  ) INTO v_es_admin;
  IF NOT v_es_admin THEN
    RAISE EXCEPTION 'Administrador requerido' USING ERRCODE = '42501';
  END IF;

  IF p_operacion = 'list' THEN
    IF p_datos <> '{}'::jsonb THEN
      RAISE EXCEPTION 'La consulta no admite datos adicionales' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(jsonb_agg(fge_private.cobertura_administracion_json(cobertura)
      ORDER BY cobertura.created_at DESC, cobertura.id_permiso_temporal), '[]'::jsonb)
    INTO v_resultado
    FROM public.permisos_temporales AS cobertura
    WHERE cobertura.archived_at IS NULL;
    RETURN v_resultado;
  END IF;

  IF p_operacion = 'create' THEN
    IF (p_datos - ARRAY['id_usuario_beneficiario', 'id_pais', 'inicio_at', 'fin_at', 'motivo']) <> '{}'::jsonb
      OR NOT (p_datos ?& ARRAY['id_usuario_beneficiario', 'id_pais', 'inicio_at', 'fin_at', 'motivo'])
      OR EXISTS (SELECT 1 FROM jsonb_each(p_datos) AS campo WHERE jsonb_typeof(campo.value) <> 'string') THEN
      RAISE EXCEPTION 'Campos de cobertura inválidos' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_beneficiario := (p_datos ->> 'id_usuario_beneficiario')::uuid;
      v_pais := (p_datos ->> 'id_pais')::uuid;
      v_inicio_date := (p_datos ->> 'inicio_at')::date;
      v_fin_date := (p_datos ->> 'fin_at')::date;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Identificador o fecha inválidos' USING ERRCODE = '22023';
    END;
    v_motivo := btrim(p_datos ->> 'motivo');
    IF v_fin_date <= v_inicio_date OR length(v_motivo) NOT BETWEEN 5 AND 1000 THEN
      RAISE EXCEPTION 'Fechas o motivo inválidos' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.perfiles AS perfil
      JOIN public.asignaciones_roles AS asignacion ON asignacion.id_usuario = perfil.id_usuario
      JOIN public.roles AS rol ON rol.id_rol = asignacion.id_rol
      WHERE perfil.id_usuario = v_beneficiario
        AND perfil.activo
        AND perfil.archived_at IS NULL
        AND asignacion.revocado_at IS NULL
        AND asignacion.archived_at IS NULL
        AND rol.codigo = 'COORD'
        AND rol.activo
        AND rol.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'El beneficiario debe ser un Coordinador activo' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.paises WHERE id_pais = v_pais AND archived_at IS NULL AND zona_horaria IS NOT NULL) THEN
      RAISE EXCEPTION 'El país no está disponible' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.asignaciones_roles AS asignacion
      JOIN public.roles AS rol ON rol.id_rol = asignacion.id_rol
      WHERE asignacion.id_usuario = v_beneficiario
        AND asignacion.revocado_at IS NULL
        AND asignacion.archived_at IS NULL
        AND rol.codigo = 'COORD'
        AND rol.activo
        AND rol.archived_at IS NULL
        AND (asignacion.alcance = 'global' OR asignacion.id_pais = v_pais)
    ) THEN
      RAISE EXCEPTION 'El Coordinador ya tiene acceso permanente a ese país' USING ERRCODE = 'P0163';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.permisos_temporales AS cobertura
      WHERE cobertura.id_usuario_beneficiario = v_beneficiario
        AND cobertura.id_pais = v_pais
        AND cobertura.archived_at IS NULL
        AND cobertura.revocado_at IS NULL
        AND cobertura.inicio_at::date <= v_fin_date
        AND cobertura.fin_at::date >= v_inicio_date
    ) THEN
      RAISE EXCEPTION 'La cobertura se superpone con otra autorización activa' USING ERRCODE = 'P0164';
    END IF;

    SELECT (v_inicio_date::timestamp AT TIME ZONE pais.zona_horaria),
      (v_fin_date::timestamp AT TIME ZONE pais.zona_horaria)
    INTO v_inicio_at, v_fin_at
    FROM public.paises AS pais WHERE pais.id_pais = v_pais;
    INSERT INTO public.permisos_temporales (
      id_usuario_beneficiario, id_usuario_otorga, id_pais, inicio_at, fin_at, motivo
    ) VALUES (v_beneficiario, v_actor, v_pais, v_inicio_at, v_fin_at, v_motivo)
    RETURNING * INTO v_cobertura;
    INSERT INTO public.permisos_temporales_historial (
      id_permiso_temporal, tipo_evento, fin_at_anterior, fin_at_nuevo, motivo, accion_por
    ) VALUES (v_cobertura.id_permiso_temporal, 'OTORGAR', NULL, v_cobertura.fin_at, v_motivo, v_actor);
    RETURN fge_private.cobertura_administracion_json(v_cobertura);
  END IF;

  IF p_operacion IN ('extend', 'revoke') THEN
    IF NOT (p_datos ? 'id_permiso_temporal') THEN
      RAISE EXCEPTION 'Identificador requerido' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_id := (p_datos ->> 'id_permiso_temporal')::uuid;
      v_version := (p_datos ->> 'version_esperada')::bigint;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Identificador o versión inválidos' USING ERRCODE = '22023';
    END;
    SELECT * INTO v_cobertura FROM public.permisos_temporales
    WHERE id_permiso_temporal = v_id AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cobertura inexistente' USING ERRCODE = 'P0160'; END IF;
    IF v_cobertura.version <> v_version THEN RAISE EXCEPTION 'Versión obsoleta' USING ERRCODE = 'P0161'; END IF;
    IF v_cobertura.revocado_at IS NOT NULL OR now() >= (
      ((v_cobertura.fin_at AT TIME ZONE (SELECT zona_horaria FROM public.paises WHERE id_pais = v_cobertura.id_pais))::date + 1)::timestamp
      AT TIME ZONE (SELECT zona_horaria FROM public.paises WHERE id_pais = v_cobertura.id_pais)
    ) THEN RAISE EXCEPTION 'Cobertura no editable' USING ERRCODE = 'P0162'; END IF;
  END IF;

  IF p_operacion = 'extend' THEN
    IF (p_datos - ARRAY['id_permiso_temporal', 'version_esperada', 'nueva_fin_at', 'motivo']) <> '{}'::jsonb
      OR NOT (p_datos ?& ARRAY['id_permiso_temporal', 'version_esperada', 'nueva_fin_at'])
      OR jsonb_typeof(p_datos -> 'nueva_fin_at') <> 'string'
      OR (p_datos ? 'motivo' AND jsonb_typeof(p_datos -> 'motivo') <> 'string') THEN
      RAISE EXCEPTION 'Campos de extensión inválidos' USING ERRCODE = '22023';
    END IF;
    BEGIN v_fin_date := (p_datos ->> 'nueva_fin_at')::date;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Fecha inválida' USING ERRCODE = '22023'; END;
    IF v_fin_date <= v_cobertura.fin_at::date THEN RAISE EXCEPTION 'La fecha debe extender la cobertura' USING ERRCODE = '22023'; END IF;
    SELECT v_fin_date::timestamp AT TIME ZONE pais.zona_horaria INTO v_fin_at
    FROM public.paises AS pais WHERE pais.id_pais = v_cobertura.id_pais;
    v_motivo := coalesce(nullif(btrim(p_datos ->> 'motivo'), ''), 'Extensión de cobertura temporal');
    v_fin_anterior := v_cobertura.fin_at;
    UPDATE public.permisos_temporales SET fin_at = v_fin_at
    WHERE id_permiso_temporal = v_id RETURNING * INTO v_cobertura;
    INSERT INTO public.permisos_temporales_historial (
      id_permiso_temporal, tipo_evento, fin_at_anterior, fin_at_nuevo, motivo, accion_por
    ) VALUES (v_id, 'EXTENDER', v_fin_anterior, v_fin_at, v_motivo, v_actor);
    RETURN fge_private.cobertura_administracion_json(v_cobertura);
  END IF;

  IF p_operacion = 'revoke' THEN
    IF (p_datos - ARRAY['id_permiso_temporal', 'version_esperada', 'motivo_revocacion']) <> '{}'::jsonb
      OR NOT (p_datos ?& ARRAY['id_permiso_temporal', 'version_esperada', 'motivo_revocacion'])
      OR jsonb_typeof(p_datos -> 'motivo_revocacion') <> 'string' THEN
      RAISE EXCEPTION 'Campos de revocación inválidos' USING ERRCODE = '22023';
    END IF;
    v_motivo := btrim(p_datos ->> 'motivo_revocacion');
    IF length(v_motivo) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Motivo inválido' USING ERRCODE = '22023'; END IF;
    UPDATE public.permisos_temporales
    SET revocado_at = clock_timestamp(), revocado_por = v_actor, motivo_revocacion = v_motivo
    WHERE id_permiso_temporal = v_id RETURNING * INTO v_cobertura;
    INSERT INTO public.permisos_temporales_historial (
      id_permiso_temporal, tipo_evento, fin_at_anterior, fin_at_nuevo, motivo, accion_por
    ) VALUES (v_id, 'REVOCAR', v_cobertura.fin_at, v_cobertura.fin_at, v_motivo, v_actor);
    RETURN fge_private.cobertura_administracion_json(v_cobertura);
  END IF;

  RAISE EXCEPTION 'Operación de cobertura inválida' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.administrar_coberturas(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.administrar_coberturas(text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION fge_private.cobertura_administracion_json(public.permisos_temporales)
  FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
