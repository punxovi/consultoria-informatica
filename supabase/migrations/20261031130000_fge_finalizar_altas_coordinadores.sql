BEGIN;

CREATE OR REPLACE FUNCTION fge_private.finalizar_alta_coordinador(
  p_id_solicitud uuid,
  p_id_usuario uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reserva fge_private.altas_coordinadores;
  v_cuenta fge_private.cuentas_coordinadores;
  v_claim_sub_anterior text;
  v_resultado jsonb;
BEGIN
  SELECT * INTO v_reserva
  FROM fge_private.altas_coordinadores
  WHERE id_solicitud = p_id_solicitud
  FOR UPDATE;

  IF NOT FOUND
    OR (v_reserva.id_usuario IS NOT NULL AND v_reserva.id_usuario <> p_id_usuario)
    OR NOT fge_private.es_administrador_cuentas(v_reserva.solicitado_por) THEN
    RAISE EXCEPTION 'Alta no autorizada' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users AS usuario
    WHERE usuario.id = p_id_usuario
      AND lower(usuario.email) = v_reserva.correo
      AND usuario.raw_app_meta_data ->> 'fge_coordinator_request' = p_id_solicitud::text
  ) THEN
    RAISE EXCEPTION 'La identidad no corresponde a la solicitud' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.perfiles WHERE id_usuario = p_id_usuario) THEN
    RAISE EXCEPTION 'El perfil de la identidad no está disponible' USING ERRCODE = 'P0146';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.paises
    WHERE id_pais = v_reserva.id_pais AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'País inválido' USING ERRCODE = 'P0145';
  END IF;

  v_claim_sub_anterior := current_setting('request.jwt.claim.sub', true);
  PERFORM set_config('request.jwt.claim.sub', v_reserva.solicitado_por::text, true);

  UPDATE public.perfiles
  SET nombre = v_reserva.nombre
  WHERE id_usuario = p_id_usuario;

  SELECT * INTO v_cuenta
  FROM fge_private.cuentas_coordinadores
  WHERE id_usuario = p_id_usuario
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO fge_private.cuentas_coordinadores(
      id_usuario, id_pais, id_pais_aplicado, solicitado_por
    ) VALUES (
      p_id_usuario, v_reserva.id_pais, v_reserva.id_pais, v_reserva.solicitado_por
    );
  ELSIF v_cuenta.id_pais <> v_reserva.id_pais
    OR v_cuenta.id_pais_aplicado <> v_reserva.id_pais
    OR v_cuenta.solicitado_por <> v_reserva.solicitado_por THEN
    RAISE EXCEPTION 'La cuenta no coincide con la solicitud' USING ERRCODE = 'P0148';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.asignaciones_roles AS asignacion
    JOIN public.roles AS rol ON rol.id_rol = asignacion.id_rol
    WHERE asignacion.id_usuario = p_id_usuario
      AND asignacion.revocado_at IS NULL
      AND asignacion.archived_at IS NULL
      AND rol.codigo = 'COORD'
      AND rol.activo
      AND asignacion.alcance = 'pais'
      AND asignacion.id_pais = v_reserva.id_pais
  ) THEN
    INSERT INTO public.asignaciones_roles(
      id_usuario, id_rol, alcance, id_pais, otorgado_por
    )
    SELECT p_id_usuario, rol.id_rol, 'pais', v_reserva.id_pais, v_reserva.solicitado_por
    FROM public.roles AS rol
    WHERE rol.codigo = 'COORD' AND rol.activo;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rol COORD no disponible'; END IF;
  END IF;

  UPDATE fge_private.altas_coordinadores
  SET id_usuario = p_id_usuario
  WHERE id_solicitud = p_id_solicitud;

  SELECT fge_private.coordinador_json(p_id_usuario) INTO v_resultado;
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_claim_sub_anterior, ''), true);
  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_claim_sub_anterior, ''), true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.completar_alta_coordinador(p_id_solicitud uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reserva fge_private.altas_coordinadores;
  v_usuario uuid;
BEGIN
  IF NOT fge_private.es_administrador_cuentas(v_actor) THEN
    INSERT INTO fge_private.intentos_administracion_coordinadores(id_usuario, operacion)
    VALUES(v_actor, 'complete');
    RETURN jsonb_build_object('denied', true);
  END IF;

  SELECT * INTO v_reserva
  FROM fge_private.altas_coordinadores
  WHERE id_solicitud = p_id_solicitud
  FOR UPDATE;
  IF NOT FOUND OR v_reserva.solicitado_por <> v_actor THEN
    RAISE EXCEPTION 'Solicitud inexistente' USING ERRCODE = 'P0146';
  END IF;

  SELECT usuario.id INTO v_usuario
  FROM auth.users AS usuario
  WHERE lower(usuario.email) = v_reserva.correo
    AND usuario.raw_app_meta_data ->> 'fge_coordinator_request' = p_id_solicitud::text;

  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN fge_private.finalizar_alta_coordinador(p_id_solicitud, v_usuario);
END;
$$;

CREATE OR REPLACE FUNCTION fge_private.completar_alta_coordinador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(NEW.raw_app_meta_data ? 'fge_coordinator_request', false) THEN
    PERFORM fge_private.finalizar_alta_coordinador(
      (NEW.raw_app_meta_data ->> 'fge_coordinator_request')::uuid,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_reserva record;
  v_usuario uuid;
BEGIN
  FOR v_reserva IN
    SELECT id_solicitud, correo
    FROM fge_private.altas_coordinadores
    WHERE id_usuario IS NULL
  LOOP
    SELECT usuario.id INTO v_usuario
    FROM auth.users AS usuario
    WHERE lower(usuario.email) = v_reserva.correo
      AND usuario.raw_app_meta_data ->> 'fge_coordinator_request' = v_reserva.id_solicitud::text;
    IF FOUND THEN
      PERFORM fge_private.finalizar_alta_coordinador(v_reserva.id_solicitud, v_usuario);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION fge_private.finalizar_alta_coordinador(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.completar_alta_coordinador(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.completar_alta_coordinador(uuid) TO authenticated;
COMMIT;
