BEGIN;
CREATE TABLE public.solicitudes_invitado (
  id_invitado uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 120 AND nombre !~ '[[:cntrl:]]'),
  correo text NOT NULL CHECK (length(correo) <= 254 AND correo = lower(btrim(correo)) AND correo ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  institucion text CHECK (length(institucion) <= 150 AND institucion !~ '[[:cntrl:]]'),
  motivo text CHECK (length(motivo) <= 255 AND motivo !~ '[[:cntrl:]]'),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado','revocado')),
  id_usuario uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  id_asignacion uuid REFERENCES public.asignaciones_roles(id_asignacion) ON DELETE RESTRICT,
  sesion_id text,
  aprobado_por uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  aprobado_en timestamptz,
  utilizado_en timestamptz,
  expira_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK ((utilizado_en IS NULL AND expira_en IS NULL AND sesion_id IS NULL AND id_usuario IS NULL AND id_asignacion IS NULL)
    OR (utilizado_en IS NOT NULL AND expira_en IS NOT NULL AND expira_en = utilizado_en + interval '24 hours'
      AND sesion_id IS NOT NULL AND id_usuario IS NOT NULL AND id_asignacion IS NOT NULL))
);
CREATE UNIQUE INDEX solicitudes_invitado_correo_abierto ON public.solicitudes_invitado(correo)
  WHERE estado IN ('pendiente','aprobado');
CREATE INDEX solicitudes_invitado_usuario ON public.solicitudes_invitado(id_usuario);
ALTER TABLE public.solicitudes_invitado ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.solicitudes_invitado FROM PUBLIC, anon, authenticated;
CREATE TRIGGER auditar AFTER INSERT OR UPDATE ON public.solicitudes_invitado
  FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_invitado');

CREATE FUNCTION fge_private.acceso_invitado_vigente() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.solicitudes_invitado s WHERE s.id_usuario = auth.uid())
    OR EXISTS (SELECT 1 FROM public.solicitudes_invitado s
      WHERE s.id_usuario = auth.uid() AND s.estado = 'aprobado' AND s.utilizado_en IS NOT NULL
        AND s.expira_en > statement_timestamp()
        AND s.sesion_id = auth.jwt()->>'session_id');
$$;
CREATE FUNCTION public.validar_acceso_invitado() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND fge_private.acceso_invitado_vigente();
$$;
REVOKE ALL ON FUNCTION fge_private.acceso_invitado_vigente(), public.validar_acceso_invitado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fge_private.acceso_invitado_vigente(), public.validar_acceso_invitado() TO authenticated;

CREATE OR REPLACE FUNCTION public.gestionar_invitados(p_operacion text, p_datos jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  registro public.solicitudes_invitado;
  correo_ingresado text;
  rol_invitado uuid;
  asignacion uuid;
  es_admin boolean;
BEGIN
  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'Datos inválidos' USING ERRCODE='G0145';
  END IF;
  IF p_operacion = 'create' THEN
    IF p_datos - ARRAY['nombre','correo','institucion','motivo'] <> '{}'::jsonb
      OR jsonb_typeof(p_datos->'nombre') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_datos->'correo') IS DISTINCT FROM 'string'
      OR (p_datos ? 'institucion' AND jsonb_typeof(p_datos->'institucion') NOT IN ('string','null'))
      OR (p_datos ? 'motivo' AND jsonb_typeof(p_datos->'motivo') NOT IN ('string','null')) THEN
      RAISE EXCEPTION 'Datos inválidos' USING ERRCODE='G0145';
    END IF;
    correo_ingresado := lower(btrim(p_datos->>'correo'));
    PERFORM pg_advisory_xact_lock(hashtextextended(correo_ingresado, 171));
    UPDATE public.asignaciones_roles a SET revocado_at=now(),revocado_por=s.aprobado_por
      FROM public.solicitudes_invitado s WHERE a.id_asignacion=s.id_asignacion
        AND s.correo=correo_ingresado AND s.estado='aprobado' AND s.expira_en <= statement_timestamp();
    UPDATE public.solicitudes_invitado SET estado='revocado', updated_at=now(), version=version+1
      WHERE correo=correo_ingresado AND estado='aprobado' AND expira_en <= statement_timestamp();
    IF EXISTS (SELECT 1 FROM public.solicitudes_invitado WHERE correo=correo_ingresado AND estado IN ('pendiente','aprobado'))
      OR EXISTS (SELECT 1 FROM auth.users u JOIN public.asignaciones_roles a ON a.id_usuario=u.id
        WHERE lower(u.email)=correo_ingresado AND a.revocado_at IS NULL AND a.archived_at IS NULL) THEN
      RAISE EXCEPTION 'Correo en uso' USING ERRCODE='G0148';
    END IF;
    INSERT INTO public.solicitudes_invitado(nombre,correo,institucion,motivo)
      VALUES(btrim(p_datos->>'nombre'),correo_ingresado,nullif(btrim(p_datos->>'institucion'),''),nullif(btrim(p_datos->>'motivo'),''))
      RETURNING * INTO registro;
    RETURN jsonb_build_object('id_invitado',registro.id_invitado,'estado',registro.estado,'created_at',registro.created_at);
  END IF;

  IF p_operacion='consume' THEN
    IF actor IS NULL THEN RAISE EXCEPTION 'Sesión requerida' USING ERRCODE='G0149'; END IF;
    IF p_datos <> '{}'::jsonb THEN RAISE EXCEPTION 'Datos inválidos' USING ERRCODE='G0145'; END IF;
    SELECT s.* INTO registro FROM public.solicitudes_invitado s JOIN auth.users u ON lower(u.email)=s.correo
      WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL AND s.estado='aprobado'
      ORDER BY s.created_at DESC LIMIT 1 FOR UPDATE OF s;
    IF NOT FOUND OR registro.utilizado_en IS NOT NULL OR nullif(auth.jwt()->>'session_id','') IS NULL THEN
      RAISE EXCEPTION 'Enlace usado o no autorizado' USING ERRCODE='G0149';
    END IF;
    IF EXISTS (SELECT 1 FROM public.asignaciones_roles a JOIN public.roles r USING(id_rol)
      WHERE a.id_usuario=actor AND a.revocado_at IS NULL AND a.archived_at IS NULL AND r.codigo <> 'INVIT')
      OR to_timestamp(coalesce((auth.jwt()->>'iat')::double precision,0)) < date_trunc('second',registro.aprobado_en) THEN
      RAISE EXCEPTION 'Acceso no autorizado' USING ERRCODE='G0149';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.perfiles WHERE id_usuario=actor AND activo AND archived_at IS NULL) THEN
      RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='G0149';
    END IF;
    SELECT id_rol INTO rol_invitado FROM public.roles WHERE codigo='INVIT' AND activo AND archived_at IS NULL;
    IF rol_invitado IS NULL THEN RAISE EXCEPTION 'Rol Invitado no configurado' USING ERRCODE='G0149'; END IF;
    INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,otorgado_por,created_by)
      VALUES(actor,rol_invitado,'global',registro.aprobado_por,registro.aprobado_por) RETURNING id_asignacion INTO asignacion;
    UPDATE public.perfiles SET nombre=registro.nombre WHERE id_usuario=actor;
    UPDATE public.solicitudes_invitado SET id_usuario=actor,id_asignacion=asignacion,sesion_id=auth.jwt()->>'session_id',
      utilizado_en=now(),expira_en=now()+interval '24 hours',updated_at=now(),updated_by=actor,version=version+1
      WHERE id_invitado=registro.id_invitado RETURNING * INTO registro;
    RETURN to_jsonb(registro)-'sesion_id';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.asignaciones_roles a JOIN public.roles r USING(id_rol)
    JOIN public.perfiles p USING(id_usuario) WHERE a.id_usuario=actor AND a.revocado_at IS NULL AND a.archived_at IS NULL
    AND r.codigo='ADMIN' AND r.activo AND r.archived_at IS NULL AND p.activo AND p.archived_at IS NULL) INTO es_admin;
  IF NOT es_admin THEN RAISE EXCEPTION 'Solo Administrador' USING ERRCODE='42501'; END IF;
  IF p_operacion='authorize' THEN RETURN '{}'::jsonb; END IF;
  IF p_operacion='list' THEN
    IF p_datos <> '{}'::jsonb THEN RAISE EXCEPTION 'Datos inválidos' USING ERRCODE='G0145'; END IF;
    RETURN (SELECT coalesce(jsonb_agg(to_jsonb(s)-'sesion_id'),'[]'::jsonb)
      FROM (SELECT * FROM public.solicitudes_invitado ORDER BY created_at DESC,id_invitado LIMIT 200) s);
  END IF;
  IF p_operacion NOT IN ('get','approve','reject','revoke') OR
    p_datos - ARRAY['id_invitado','version_esperada'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Operación inválida' USING ERRCODE='G0145';
  END IF;
  SELECT * INTO registro FROM public.solicitudes_invitado WHERE id_invitado=(p_datos->>'id_invitado')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud inexistente' USING ERRCODE='G0146'; END IF;
  IF p_operacion='get' THEN RETURN to_jsonb(registro)-'sesion_id'; END IF;
  IF jsonb_typeof(p_datos->'version_esperada') IS DISTINCT FROM 'number'
    OR (p_datos->>'version_esperada')::numeric <> registro.version THEN
    RAISE EXCEPTION 'Conflicto de versión' USING ERRCODE='G0147';
  END IF;
  IF p_operacion='approve' THEN
    IF registro.estado NOT IN ('pendiente','aprobado') OR registro.utilizado_en IS NOT NULL THEN
      RAISE EXCEPTION 'Transición inválida' USING ERRCODE='G0150';
    END IF;
    IF EXISTS (SELECT 1 FROM auth.users u JOIN public.asignaciones_roles a ON a.id_usuario=u.id
      WHERE lower(u.email)=registro.correo AND a.revocado_at IS NULL AND a.archived_at IS NULL) THEN
      RAISE EXCEPTION 'Correo en uso' USING ERRCODE='G0148';
    END IF;
    UPDATE public.solicitudes_invitado SET estado='aprobado',aprobado_por=actor,aprobado_en=now(),
      updated_by=actor,updated_at=now(),version=version+1 WHERE id_invitado=registro.id_invitado RETURNING * INTO registro;
  ELSIF p_operacion='reject' THEN
    IF registro.estado <> 'pendiente' THEN RAISE EXCEPTION 'Transición inválida' USING ERRCODE='G0150'; END IF;
    UPDATE public.solicitudes_invitado SET estado='rechazado',updated_by=actor,updated_at=now(),version=version+1
      WHERE id_invitado=registro.id_invitado RETURNING * INTO registro;
  ELSE
    IF registro.estado <> 'aprobado' THEN RAISE EXCEPTION 'Transición inválida' USING ERRCODE='G0150'; END IF;
    UPDATE public.asignaciones_roles SET revocado_at=now(),revocado_por=actor WHERE id_asignacion=registro.id_asignacion;
    UPDATE public.solicitudes_invitado SET estado='revocado',updated_by=actor,updated_at=now(),version=version+1
      WHERE id_invitado=registro.id_invitado RETURNING * INTO registro;
  END IF;
  RETURN to_jsonb(registro)-'sesion_id';
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'Correo en uso' USING ERRCODE='G0148';
  WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Datos inválidos' USING ERRCODE='G0145';
END;
$$;
REVOKE ALL ON FUNCTION public.gestionar_invitados(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gestionar_invitados(text,jsonb) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_user_roles() RETURNS TABLE(codigo text,alcance text,id_pais uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.codigo,a.alcance,a.id_pais FROM public.asignaciones_roles a
    JOIN public.roles r USING(id_rol) JOIN public.perfiles p USING(id_usuario)
    WHERE a.id_usuario=auth.uid() AND a.revocado_at IS NULL AND a.archived_at IS NULL
      AND r.activo AND r.archived_at IS NULL AND p.activo AND p.archived_at IS NULL
      AND fge_private.acceso_invitado_vigente();
$$;
REVOKE ALL ON FUNCTION public.get_user_roles() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_user_roles() TO authenticated;

DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname='public' OR (n.nspname='storage' AND c.relname='objects'))
      AND c.relkind='r' AND c.relrowsecurity LOOP
    EXECUTE format('CREATE POLICY acceso_invitado_vigente ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING (fge_private.acceso_invitado_vigente()) WITH CHECK (fge_private.acceso_invitado_vigente())',t.nspname,t.relname);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION fge_private.usuario_tiene_rol(codigos text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.get_user_roles() r WHERE r.codigo=ANY(codigos));
$$;
CREATE OR REPLACE FUNCTION fge_private.usuario_tiene_rol_activo() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT fge_private.usuario_tiene_rol(ARRAY['ADMIN','COORD','INVIT']);
$$;
CREATE OR REPLACE FUNCTION fge_private.usuario_puede_consultar_organizacion(p_id_organizacion uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.organizaciones o CROSS JOIN public.get_user_roles() r
    WHERE o.id_organizacion=p_id_organizacion AND o.archived_at IS NULL
      AND (r.codigo IN ('ADMIN','COORD') OR (r.codigo='INVIT' AND (r.alcance='global' OR r.id_pais=o.id_pais))));
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
