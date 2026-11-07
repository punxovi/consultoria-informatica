-- SCRUM-152: validación en la frontera SQL, serialización del ciclo e historial protegido.
BEGIN;
CREATE OR REPLACE FUNCTION fge_private.cobertura_fecha(valor text) RETURNS date
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
  IF valor IS NULL OR valor !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR valor LIKE '0000-%' THEN
    RAISE EXCEPTION 'Fecha calendario AAAA-MM-DD requerida' USING ERRCODE='22023'; END IF;
  RETURN valor::date;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RAISE EXCEPTION 'Fecha calendario inválida' USING ERRCODE='22023';
END; $$;
REVOKE ALL ON FUNCTION fge_private.cobertura_fecha(text) FROM PUBLIC,anon,authenticated;

-- La Data API no puede saltarse la RPC ni crear un cambio sin su evento.
REVOKE ALL ON public.permisos_temporales,public.permisos_temporales_historial FROM PUBLIC,anon,authenticated;
ALTER TABLE public.permisos_temporales_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permisos_temporales_historial
  ADD CONSTRAINT cobertura_historial_permiso_fk FOREIGN KEY(id_permiso_temporal)
    REFERENCES public.permisos_temporales(id_permiso_temporal) ON DELETE RESTRICT,
  ADD CONSTRAINT cobertura_historial_actor_fk FOREIGN KEY(accion_por)
    REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  ADD CONSTRAINT cobertura_historial_evento_check CHECK(tipo_evento IN ('OTORGAR','EXTENDER','REVOCAR'));
CREATE OR REPLACE FUNCTION fge_private.proteger_historial_coberturas() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'El historial de coberturas es inmutable' USING ERRCODE='42501'; END; $$;
REVOKE ALL ON FUNCTION fge_private.proteger_historial_coberturas() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER cobertura_historial_inmutable BEFORE UPDATE OR DELETE ON public.permisos_temporales_historial
  FOR EACH ROW EXECUTE FUNCTION fge_private.proteger_historial_coberturas();
CREATE TRIGGER cobertura_historial_no_truncar BEFORE TRUNCATE ON public.permisos_temporales_historial
  FOR EACH STATEMENT EXECUTE FUNCTION fge_private.proteger_historial_coberturas();

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
  v_zona text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Se requiere un objeto de datos' USING ERRCODE = '22023';
  END IF;

  IF p_operacion = 'mine' THEN
    IF p_datos <> '{}'::jsonb THEN RAISE EXCEPTION 'La consulta propia no admite filtros' USING ERRCODE='22023'; END IF;
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
      AND pais.archived_at IS NULL
      AND EXISTS (SELECT 1 FROM public.asignaciones_roles ar JOIN public.roles r USING(id_rol)
        WHERE ar.id_usuario=v_actor AND ar.revocado_at IS NULL AND ar.archived_at IS NULL
          AND r.codigo='COORD' AND r.activo AND r.archived_at IS NULL)
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
    -- DISTINCT ON evita tarjetas duplicadas por coberturas revocadas y luego
    -- reemplazadas. No elimina filas: el historial sigue ligado a cada ID.
    SELECT coalesce(jsonb_agg(fge_private.cobertura_administracion_json(actuales.cobertura)
      ORDER BY (actuales.cobertura).created_at DESC, (actuales.cobertura).id_permiso_temporal), '[]'::jsonb)
    INTO v_resultado
    FROM (
      SELECT DISTINCT ON (cobertura.id_usuario_beneficiario, cobertura.id_pais)
        cobertura
      FROM public.permisos_temporales AS cobertura
      WHERE cobertura.archived_at IS NULL
      ORDER BY cobertura.id_usuario_beneficiario, cobertura.id_pais,
        cobertura.created_at DESC, cobertura.id_permiso_temporal DESC
    ) AS actuales;
    RETURN v_resultado;
  END IF;

  IF p_operacion = 'history' THEN
    IF (p_datos - ARRAY['id_permiso_temporal']) <> '{}'::jsonb
      OR NOT (p_datos ? 'id_permiso_temporal') OR jsonb_typeof(p_datos->'id_permiso_temporal') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Identificador de cobertura requerido' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_id := (p_datos ->> 'id_permiso_temporal')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Identificador de cobertura inválido' USING ERRCODE = '22023';
    END;
    IF NOT EXISTS (
      SELECT 1 FROM public.permisos_temporales
      WHERE id_permiso_temporal = v_id
    ) THEN
      RAISE EXCEPTION 'Cobertura inexistente' USING ERRCODE = 'P0160';
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id_historial', coalesce(to_jsonb(historial)->>'id_historial',to_jsonb(historial)->>'id'),
      'id_permiso_temporal', historial.id_permiso_temporal,
      'tipo_evento', historial.tipo_evento,
      'fin_at_anterior', historial.fin_at_anterior,
      'fin_at_nuevo', historial.fin_at_nuevo,
      'motivo', historial.motivo,
      'accion_por', historial.accion_por,
      'accion_por_nombre', coalesce(perfil.nombre, cuenta.email, historial.accion_por::text),
      'accion_at', coalesce(to_jsonb(historial)->>'accion_at',to_jsonb(historial)->>'created_at')
    ) ORDER BY coalesce(to_jsonb(historial)->>'accion_at',to_jsonb(historial)->>'created_at')::timestamptz DESC, coalesce(to_jsonb(historial)->>'id_historial',to_jsonb(historial)->>'id') DESC), '[]'::jsonb)
    INTO v_resultado
    FROM public.permisos_temporales_historial AS historial
    LEFT JOIN public.perfiles AS perfil ON perfil.id_usuario = historial.accion_por
    LEFT JOIN auth.users AS cuenta ON cuenta.id = historial.accion_por
    WHERE historial.id_permiso_temporal = v_id;
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
      v_inicio_date := fge_private.cobertura_fecha(p_datos->>'inicio_at');
      v_fin_date := fge_private.cobertura_fecha(p_datos->>'fin_at');
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Identificador o fecha inválidos' USING ERRCODE = '22023';
    END;
    v_motivo := btrim(p_datos ->> 'motivo');
    IF v_fin_date <= v_inicio_date OR length(v_motivo) NOT BETWEEN 5 AND 1000 THEN
      RAISE EXCEPTION 'Fechas o motivo inválidos' USING ERRCODE = '22023';
    END IF;
    IF v_beneficiario = v_actor THEN RAISE EXCEPTION 'No se permite autoasignación' USING ERRCODE='42501'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.perfiles AS perfil
      JOIN public.asignaciones_roles AS asignacion ON asignacion.id_usuario = perfil.id_usuario
      JOIN public.roles AS rol ON rol.id_rol = asignacion.id_rol
      WHERE perfil.id_usuario = v_beneficiario AND perfil.activo AND perfil.archived_at IS NULL
        AND asignacion.revocado_at IS NULL AND asignacion.archived_at IS NULL
        AND rol.codigo = 'COORD' AND rol.activo AND rol.archived_at IS NULL
    ) THEN RAISE EXCEPTION 'El beneficiario debe ser un Coordinador activo' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.paises WHERE id_pais = v_pais AND archived_at IS NULL AND zona_horaria IS NOT NULL) THEN
      RAISE EXCEPTION 'El país no está disponible' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.asignaciones_roles AS asignacion JOIN public.roles AS rol ON rol.id_rol = asignacion.id_rol
      WHERE asignacion.id_usuario = v_beneficiario AND asignacion.revocado_at IS NULL AND asignacion.archived_at IS NULL
        AND rol.codigo = 'COORD' AND rol.activo AND rol.archived_at IS NULL
        AND (asignacion.alcance = 'global' OR asignacion.id_pais = v_pais)
    ) THEN RAISE EXCEPTION 'El Coordinador ya tiene acceso permanente a ese país' USING ERRCODE = 'P0163'; END IF;
    SELECT zona_horaria INTO v_zona FROM public.paises WHERE id_pais=v_pais;
    v_inicio_at := v_inicio_date::timestamp AT TIME ZONE v_zona;
    v_fin_at := v_fin_date::timestamp AT TIME ZONE v_zona;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_beneficiario::text||':'||v_pais::text,152));
    IF EXISTS (SELECT 1 FROM public.permisos_temporales c
      WHERE c.id_usuario_beneficiario=v_beneficiario AND c.id_pais=v_pais
        AND c.archived_at IS NULL AND c.revocado_at IS NULL
        AND tstzrange(c.inicio_at,((c.fin_at AT TIME ZONE v_zona)::date+1)::timestamp AT TIME ZONE v_zona,'[)')
          && tstzrange(v_inicio_at,(v_fin_date+1)::timestamp AT TIME ZONE v_zona,'[)')) THEN
      RAISE EXCEPTION 'Cobertura solapada' USING ERRCODE='P0164';
    END IF;
    INSERT INTO public.permisos_temporales (id_usuario_beneficiario, id_usuario_otorga, id_pais, inicio_at, fin_at, motivo)
      VALUES (v_beneficiario, v_actor, v_pais, v_inicio_at, v_fin_at, v_motivo) RETURNING * INTO v_cobertura;
    INSERT INTO public.permisos_temporales_historial (id_permiso_temporal, tipo_evento, fin_at_anterior, fin_at_nuevo, motivo, accion_por)
      VALUES (v_cobertura.id_permiso_temporal, 'OTORGAR', NULL, v_cobertura.fin_at, v_motivo, v_actor);
    RETURN fge_private.cobertura_administracion_json(v_cobertura);
  END IF;

  IF p_operacion IN ('extend', 'revoke') THEN
    IF jsonb_typeof(p_datos->'id_permiso_temporal') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_datos->'version_esperada') IS DISTINCT FROM 'number'
       OR p_datos->>'version_esperada' !~ '^[1-9][0-9]*$'
       OR (p_datos->>'version_esperada')::numeric > 9007199254740991 THEN
      RAISE EXCEPTION 'Identificador y versión entera positiva requeridos' USING ERRCODE='22023';
    END IF;
    BEGIN
      v_id := (p_datos->>'id_permiso_temporal')::uuid;
      v_version := (p_datos->>'version_esperada')::bigint;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Identificador o versión inválidos' USING ERRCODE='22023';
    END;
    SELECT id_usuario_beneficiario,id_pais INTO v_beneficiario,v_pais
      FROM public.permisos_temporales WHERE id_permiso_temporal=v_id AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cobertura inexistente' USING ERRCODE='P0160'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_beneficiario::text||':'||v_pais::text,152));
    SELECT * INTO v_cobertura FROM public.permisos_temporales WHERE id_permiso_temporal = v_id AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cobertura inexistente' USING ERRCODE = 'P0160'; END IF;
    IF v_cobertura.version <> v_version THEN RAISE EXCEPTION 'Versión obsoleta' USING ERRCODE = 'P0161'; END IF;
    IF v_cobertura.revocado_at IS NOT NULL OR now() >= (((v_cobertura.fin_at AT TIME ZONE (SELECT zona_horaria FROM public.paises WHERE id_pais = v_cobertura.id_pais))::date + 1)::timestamp AT TIME ZONE (SELECT zona_horaria FROM public.paises WHERE id_pais = v_cobertura.id_pais)) THEN
      RAISE EXCEPTION 'Cobertura no editable' USING ERRCODE = 'P0162';
    END IF;
  END IF;

  IF p_operacion = 'extend' THEN
    IF (p_datos - ARRAY['id_permiso_temporal', 'version_esperada', 'nueva_fin_at', 'motivo']) <> '{}'::jsonb
      OR NOT (p_datos ?& ARRAY['id_permiso_temporal', 'version_esperada', 'nueva_fin_at'])
      OR jsonb_typeof(p_datos -> 'nueva_fin_at') <> 'string'
      OR (p_datos ? 'motivo' AND jsonb_typeof(p_datos -> 'motivo') <> 'string') THEN
      RAISE EXCEPTION 'Campos de extensión inválidos' USING ERRCODE = '22023';
    END IF;
    BEGIN v_fin_date := fge_private.cobertura_fecha(p_datos->>'nueva_fin_at');
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN RAISE EXCEPTION 'Fecha inválida' USING ERRCODE = '22023'; END;
    SELECT zona_horaria INTO v_zona FROM public.paises WHERE id_pais=v_cobertura.id_pais AND archived_at IS NULL;
    IF v_zona IS NULL THEN RAISE EXCEPTION 'País no disponible' USING ERRCODE='22023'; END IF;
    IF v_fin_date <= (v_cobertura.fin_at AT TIME ZONE v_zona)::date THEN RAISE EXCEPTION 'La fecha debe extender la cobertura' USING ERRCODE = '22023'; END IF;
    SELECT v_fin_date::timestamp AT TIME ZONE pais.zona_horaria INTO v_fin_at FROM public.paises AS pais WHERE pais.id_pais = v_cobertura.id_pais;
    v_motivo := CASE WHEN p_datos ? 'motivo' THEN btrim(p_datos->>'motivo') ELSE 'Extensión de cobertura temporal' END;
    IF length(v_motivo) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Motivo inválido' USING ERRCODE='22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.perfiles p JOIN public.asignaciones_roles ar USING(id_usuario) JOIN public.roles r USING(id_rol)
      WHERE p.id_usuario=v_beneficiario AND p.activo AND p.archived_at IS NULL AND ar.revocado_at IS NULL
        AND ar.archived_at IS NULL AND r.codigo='COORD' AND r.activo AND r.archived_at IS NULL) THEN
      RAISE EXCEPTION 'Coordinador no disponible' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.permisos_temporales c
      WHERE c.id_usuario_beneficiario=v_beneficiario AND c.id_pais=v_pais AND c.id_permiso_temporal<>v_id
        AND c.archived_at IS NULL AND c.revocado_at IS NULL
        AND tstzrange(c.inicio_at,((c.fin_at AT TIME ZONE v_zona)::date+1)::timestamp AT TIME ZONE v_zona,'[)')
          && tstzrange(v_cobertura.inicio_at,(v_fin_date+1)::timestamp AT TIME ZONE v_zona,'[)')) THEN
      RAISE EXCEPTION 'La extensión se superpone con otra cobertura' USING ERRCODE='P0164'; END IF;
    v_fin_anterior := v_cobertura.fin_at;
    UPDATE public.permisos_temporales SET fin_at = v_fin_at WHERE id_permiso_temporal = v_id RETURNING * INTO v_cobertura;
    INSERT INTO public.permisos_temporales_historial (id_permiso_temporal, tipo_evento, fin_at_anterior, fin_at_nuevo, motivo, accion_por)
      VALUES (v_id, 'EXTENDER', v_fin_anterior, v_fin_at, v_motivo, v_actor);
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
    UPDATE public.permisos_temporales SET revocado_at = clock_timestamp(), revocado_por = v_actor, motivo_revocacion = v_motivo WHERE id_permiso_temporal = v_id RETURNING * INTO v_cobertura;
    INSERT INTO public.permisos_temporales_historial (id_permiso_temporal, tipo_evento, fin_at_anterior, fin_at_nuevo, motivo, accion_por)
      VALUES (v_id, 'REVOCAR', v_cobertura.fin_at, v_cobertura.fin_at, v_motivo, v_actor);
    RETURN fge_private.cobertura_administracion_json(v_cobertura);
  END IF;

  RAISE EXCEPTION 'Operación de cobertura inválida' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.administrar_coberturas(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.administrar_coberturas(text, jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
