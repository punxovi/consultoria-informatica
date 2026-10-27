-- SCRUM-145. RPC con JWT del administrador; Auth Admin solo crea identidades.
BEGIN;
CREATE TABLE fge_private.cuentas_coordinadores (
  id_usuario uuid PRIMARY KEY REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  id_pais uuid NOT NULL REFERENCES public.paises(id_pais) ON DELETE RESTRICT,
  id_pais_aplicado uuid NOT NULL REFERENCES public.paises(id_pais) ON DELETE RESTRICT,
  solicitado_por uuid NOT NULL REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT
);
CREATE TABLE fge_private.altas_coordinadores (
  id_solicitud uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  id_pais uuid NOT NULL REFERENCES public.paises(id_pais) ON DELETE RESTRICT,
  solicitado_por uuid NOT NULL REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  id_usuario uuid UNIQUE REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT
);
CREATE TABLE fge_private.intentos_administracion_coordinadores (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_usuario uuid,
  operacion text NOT NULL,
  fecha_hora timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE fge_private.cuentas_coordinadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE fge_private.altas_coordinadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE fge_private.intentos_administracion_coordinadores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fge_private.cuentas_coordinadores, fge_private.altas_coordinadores,
  fge_private.intentos_administracion_coordinadores FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE fge_private.intentos_administracion_coordinadores_id_seq FROM PUBLIC, anon, authenticated;
CREATE TRIGGER auditar AFTER INSERT OR UPDATE ON fge_private.cuentas_coordinadores
  FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_usuario');
CREATE TRIGGER auditar AFTER INSERT OR UPDATE ON fge_private.altas_coordinadores
  FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_solicitud');

CREATE FUNCTION fge_private.es_administrador_cuentas(p_usuario uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.perfiles p
 JOIN public.asignaciones_roles a ON a.id_usuario=p.id_usuario
 JOIN public.roles r ON r.id_rol=a.id_rol
 WHERE p.id_usuario=p_usuario AND p.activo AND p.archived_at IS NULL
 AND a.revocado_at IS NULL AND a.archived_at IS NULL AND a.alcance='global'
 AND r.codigo='ADMIN' AND r.activo AND r.archived_at IS NULL);
$$;

-- Importa cuentas territoriales no ambiguas; no convierte usuarios con otros roles.
INSERT INTO fge_private.cuentas_coordinadores(id_usuario,id_pais,id_pais_aplicado,solicitado_por)
SELECT a.id_usuario, (array_agg(a.id_pais))[1], (array_agg(a.id_pais))[1], a.id_usuario
FROM public.asignaciones_roles a JOIN public.roles r ON r.id_rol=a.id_rol
JOIN public.perfiles p ON p.id_usuario=a.id_usuario
WHERE r.codigo='COORD' AND r.activo AND a.revocado_at IS NULL AND a.archived_at IS NULL
  AND a.alcance='pais' AND p.archived_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.asignaciones_roles x JOIN public.roles y ON y.id_rol=x.id_rol
    WHERE x.id_usuario=a.id_usuario AND x.revocado_at IS NULL AND x.archived_at IS NULL
    AND (y.codigo<>'COORD' OR x.alcance<>'pais'))
GROUP BY a.id_usuario HAVING count(*)=1;

-- Las cuentas previamente inactivas tampoco conservan acceso territorial.
UPDATE auth.users u SET banned_until='9999-12-31'::timestamptz
FROM fge_private.cuentas_coordinadores c JOIN public.perfiles p USING(id_usuario)
WHERE u.id=c.id_usuario AND NOT p.activo;
UPDATE public.asignaciones_roles a SET revocado_at=clock_timestamp(),revocado_por=c.id_usuario
FROM fge_private.cuentas_coordinadores c JOIN public.perfiles p USING(id_usuario)
WHERE a.id_usuario=c.id_usuario AND NOT p.activo AND a.revocado_at IS NULL;
DELETE FROM auth.sessions s USING fge_private.cuentas_coordinadores c,public.perfiles p
WHERE s.user_id=c.id_usuario AND p.id_usuario=c.id_usuario AND NOT p.activo;

CREATE FUNCTION fge_private.coordinador_json(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT jsonb_build_object('id_usuario',p.id_usuario,'nombre',p.nombre,'correo',u.email,
 'activo',p.activo,'version',p.version,'created_at',p.created_at,'updated_at',p.updated_at,
 'id_pais',c.id_pais,'cambio_pais_pendiente',c.id_pais<>c.id_pais_aplicado,
 'pais',jsonb_build_object('id_pais',pais.id_pais,'nombre',pais.nombre,'codigo_iso',pais.codigo_iso))
 FROM fge_private.cuentas_coordinadores c JOIN public.perfiles p USING(id_usuario)
 JOIN auth.users u ON u.id=p.id_usuario JOIN public.paises pais ON pais.id_pais=c.id_pais
 WHERE c.id_usuario=p_id AND p.archived_at IS NULL;
$$;

CREATE FUNCTION public.administrar_coordinadores(p_operacion text, p_datos jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 actor uuid := auth.uid(); target uuid; country uuid; expected bigint;
 profile public.perfiles; account fge_private.cuentas_coordinadores;
 reservation fge_private.altas_coordinadores; result jsonb; mail text; nombre text;
BEGIN
 IF NOT fge_private.es_administrador_cuentas(actor) THEN
   INSERT INTO fge_private.intentos_administracion_coordinadores(id_usuario,operacion)
   VALUES(actor,left(coalesce(p_operacion,''),40));
   RETURN jsonb_build_object('denied',true); -- devolver permite conservar auditoría
 END IF;
 PERFORM 1 FROM public.perfiles WHERE id_usuario=actor FOR SHARE;
 IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Objeto requerido' USING ERRCODE='22023'; END IF;
 IF p_operacion='authorize' THEN RETURN jsonb_build_object('authorized',true); END IF;
 IF p_operacion='list' THEN
   SELECT coalesce(jsonb_agg(fge_private.coordinador_json(c.id_usuario) ORDER BY p.nombre,c.id_usuario),'[]'::jsonb)
   INTO result FROM fge_private.cuentas_coordinadores c JOIN public.perfiles p USING(id_usuario)
   WHERE p.archived_at IS NULL;
   RETURN result;
 END IF;
 IF p_operacion='prepare' THEN
   IF (p_datos - ARRAY['nombre','correo','id_pais']) <> '{}'::jsonb OR
     jsonb_typeof(p_datos->'nombre') IS DISTINCT FROM 'string' OR
     jsonb_typeof(p_datos->'correo') IS DISTINCT FROM 'string' THEN
     RAISE EXCEPTION 'Datos inválidos' USING ERRCODE='22023';
   END IF;
   nombre := btrim(p_datos->>'nombre'); mail := lower(btrim(p_datos->>'correo'));
   IF length(nombre) NOT BETWEEN 1 AND 120 OR nombre ~ '[[:cntrl:]]' OR length(mail)>254
      OR mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
     RAISE EXCEPTION 'Datos inválidos' USING ERRCODE='22023';
   END IF;
   BEGIN country := (p_datos->>'id_pais')::uuid;
   EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'País inválido' USING ERRCODE='P0145'; END;
   IF country IS NULL OR NOT EXISTS(SELECT 1 FROM public.paises WHERE id_pais=country AND archived_at IS NULL) THEN
     RAISE EXCEPTION 'País inválido' USING ERRCODE='P0145';
   END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(mail,145));
   SELECT * INTO reservation FROM fge_private.altas_coordinadores WHERE correo=mail FOR UPDATE;
   IF FOUND THEN
     IF reservation.solicitado_por<>actor OR reservation.nombre<>nombre OR reservation.id_pais<>country THEN
       RAISE EXCEPTION 'Correo registrado' USING ERRCODE='P0148';
     END IF;
     -- Reintentar exactamente el alta recupera una identidad ya creada, nunca la duplica.
     RETURN jsonb_build_object('id_solicitud',reservation.id_solicitud,'id_usuario',reservation.id_usuario);
   END IF;
   IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=mail) THEN RAISE EXCEPTION 'Correo registrado' USING ERRCODE='P0148'; END IF;
   INSERT INTO fge_private.altas_coordinadores(correo,nombre,id_pais,solicitado_por)
   VALUES(mail,nombre,country,actor) RETURNING * INTO reservation;
   RETURN jsonb_build_object('id_solicitud',reservation.id_solicitud,'id_usuario',NULL);
 END IF;
 IF p_operacion NOT IN ('get','edit','activate','deactivate') THEN RAISE EXCEPTION 'Operación inválida' USING ERRCODE='22023'; END IF;
 IF (p_datos - ARRAY['id_usuario','version_esperada','cambios']) <> '{}'::jsonb THEN RAISE EXCEPTION 'Campos inválidos' USING ERRCODE='22023'; END IF;
 BEGIN target := (p_datos->>'id_usuario')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Identificador inválido' USING ERRCODE='22023'; END;
 SELECT * INTO profile FROM public.perfiles WHERE id_usuario=target AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta inexistente' USING ERRCODE='P0146'; END IF;
 SELECT * INTO account FROM fge_private.cuentas_coordinadores WHERE id_usuario=target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta inexistente' USING ERRCODE='P0146'; END IF;
 IF p_operacion='get' THEN RETURN fge_private.coordinador_json(target); END IF;
 IF EXISTS(SELECT 1 FROM public.asignaciones_roles a JOIN public.roles r USING(id_rol)
   WHERE a.id_usuario=target AND a.revocado_at IS NULL AND a.archived_at IS NULL
   AND (r.codigo<>'COORD' OR a.alcance<>'pais' OR a.id_pais<>account.id_pais_aplicado)) THEN
   RAISE EXCEPTION 'Otras asignaciones' USING ERRCODE='P0149';
 END IF;
 IF jsonb_typeof(p_datos->'version_esperada') IS DISTINCT FROM 'number'
 OR (p_datos->>'version_esperada') !~ '^[1-9][0-9]{0,15}$' THEN RAISE EXCEPTION 'Versión inválida' USING ERRCODE='22023'; END IF;
 expected := (p_datos->>'version_esperada')::bigint;
 IF expected<>profile.version THEN RAISE EXCEPTION 'Versión obsoleta' USING ERRCODE='P0147'; END IF;
 IF p_operacion='edit' THEN
   IF jsonb_typeof(p_datos->'cambios') IS DISTINCT FROM 'object' OR p_datos->'cambios'='{}'::jsonb
      OR ((p_datos->'cambios') - ARRAY['nombre','id_pais'])<>'{}'::jsonb THEN
     RAISE EXCEPTION 'Cambios inválidos' USING ERRCODE='22023';
   END IF;
   nombre := profile.nombre;
   IF (p_datos->'cambios') ? 'nombre' THEN
     nombre := btrim(p_datos->'cambios'->>'nombre');
     IF jsonb_typeof(p_datos->'cambios'->'nombre') IS DISTINCT FROM 'string'
       OR length(nombre) NOT BETWEEN 1 AND 120 OR nombre ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Nombre inválido' USING ERRCODE='22023'; END IF;
   END IF;
   IF (p_datos->'cambios') ? 'id_pais' THEN
     BEGIN country := (p_datos->'cambios'->>'id_pais')::uuid;
     EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'País inválido' USING ERRCODE='P0145'; END;
     IF country IS NULL OR NOT EXISTS(SELECT 1 FROM public.paises WHERE id_pais=country AND archived_at IS NULL) THEN
       RAISE EXCEPTION 'País inválido' USING ERRCODE='P0145';
     END IF;
     UPDATE fge_private.cuentas_coordinadores SET id_pais=country,solicitado_por=actor WHERE id_usuario=target;
   END IF;
   UPDATE public.perfiles SET nombre=btrim(coalesce(p_datos->'cambios'->>'nombre',profile.nombre)) WHERE id_usuario=target;
 ELSE
   IF p_datos ? 'cambios' THEN RAISE EXCEPTION 'Campos inválidos' USING ERRCODE='22023'; END IF;
   UPDATE public.perfiles SET activo=(p_operacion='activate') WHERE id_usuario=target;
   UPDATE auth.users SET banned_until=CASE WHEN p_operacion='deactivate' THEN '9999-12-31'::timestamptz ELSE NULL END WHERE id=target;
   IF p_operacion='deactivate' THEN
     UPDATE public.asignaciones_roles a SET revocado_at=clock_timestamp(),revocado_por=actor
     FROM public.roles r WHERE a.id_usuario=target AND a.id_rol=r.id_rol AND r.codigo='COORD' AND a.revocado_at IS NULL;
     DELETE FROM auth.sessions WHERE user_id=target; -- solo sesiones; nunca usuarios ni datos de negocio
   ELSE
     IF NOT EXISTS(SELECT 1 FROM public.paises WHERE id_pais=account.id_pais_aplicado AND archived_at IS NULL) THEN
       RAISE EXCEPTION 'País inválido' USING ERRCODE='P0145';
     END IF;
     INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,id_pais,otorgado_por)
     SELECT target,r.id_rol,'pais',account.id_pais_aplicado,actor FROM public.roles r
     WHERE r.codigo='COORD' AND r.activo AND NOT EXISTS(SELECT 1 FROM public.asignaciones_roles a
       WHERE a.id_usuario=target AND a.id_rol=r.id_rol AND a.revocado_at IS NULL);
     IF NOT EXISTS(SELECT 1 FROM public.asignaciones_roles a JOIN public.roles r USING(id_rol)
       WHERE a.id_usuario=target AND r.codigo='COORD' AND r.activo AND a.revocado_at IS NULL) THEN
       RAISE EXCEPTION 'Rol COORD no disponible';
     END IF;
   END IF;
 END IF;
 RETURN fge_private.coordinador_json(target);
END;
$$;
REVOKE ALL ON FUNCTION public.administrar_coordinadores(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.administrar_coordinadores(text,jsonb) TO authenticated;

-- AFTER on_auth_user_created: el perfil existe antes de asociar país y rol.
CREATE FUNCTION fge_private.completar_alta_coordinador() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE reservation fge_private.altas_coordinadores; prior_sub text;
BEGIN
 IF NOT coalesce(NEW.raw_app_meta_data ? 'fge_coordinator_request',false) THEN RETURN NEW; END IF;
 SELECT * INTO reservation FROM fge_private.altas_coordinadores
 WHERE id_solicitud=(NEW.raw_app_meta_data->>'fge_coordinator_request')::uuid FOR UPDATE;
 IF NOT FOUND OR reservation.id_usuario IS NOT NULL OR lower(NEW.email)<>reservation.correo
 OR NOT fge_private.es_administrador_cuentas(reservation.solicitado_por) THEN
   RAISE EXCEPTION 'Alta no autorizada' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.paises WHERE id_pais=reservation.id_pais AND archived_at IS NULL) THEN
   RAISE EXCEPTION 'País inválido' USING ERRCODE='P0145';
 END IF;
 prior_sub := current_setting('request.jwt.claim.sub',true);
 PERFORM set_config('request.jwt.claim.sub',reservation.solicitado_por::text,true);
 UPDATE public.perfiles SET nombre=reservation.nombre WHERE id_usuario=NEW.id;
 INSERT INTO fge_private.cuentas_coordinadores VALUES(NEW.id,reservation.id_pais,reservation.id_pais,reservation.solicitado_por);
 INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,id_pais,otorgado_por)
 SELECT NEW.id,id_rol,'pais',reservation.id_pais,reservation.solicitado_por FROM public.roles WHERE codigo='COORD' AND activo;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rol COORD no disponible'; END IF;
 UPDATE fge_private.altas_coordinadores SET id_usuario=NEW.id WHERE id_solicitud=reservation.id_solicitud;
 PERFORM set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);
 RETURN NEW;
END;
$$;
CREATE TRIGGER zz_fge_completar_alta_coordinador AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION fge_private.completar_alta_coordinador();

-- Una renovación actualiza una sesión existente; solo un inicio nuevo aplica país.
CREATE FUNCTION fge_private.aplicar_pais_coordinador_login() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account fge_private.cuentas_coordinadores; prior_sub text;
BEGIN
 -- El mismo orden de bloqueo que la RPC evita actualizaciones concurrentes perdidas.
 PERFORM 1 FROM public.perfiles WHERE id_usuario=NEW.user_id FOR UPDATE;
 SELECT * INTO account FROM fge_private.cuentas_coordinadores WHERE id_usuario=NEW.user_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.perfiles WHERE id_usuario=NEW.user_id AND activo AND archived_at IS NULL) THEN
   RAISE EXCEPTION 'Cuenta desactivada' USING ERRCODE='42501';
 END IF;
 IF account.id_pais=account.id_pais_aplicado THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.paises WHERE id_pais=account.id_pais AND archived_at IS NULL) THEN
   RAISE EXCEPTION 'País no disponible' USING ERRCODE='P0145';
 END IF;
 prior_sub := current_setting('request.jwt.claim.sub',true);
 PERFORM set_config('request.jwt.claim.sub',account.solicitado_por::text,true);
 UPDATE public.asignaciones_roles a SET revocado_at=clock_timestamp(),revocado_por=account.solicitado_por
 FROM public.roles r WHERE a.id_usuario=NEW.user_id AND a.id_rol=r.id_rol AND r.codigo='COORD' AND a.revocado_at IS NULL;
 INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,id_pais,otorgado_por)
 SELECT NEW.user_id,id_rol,'pais',account.id_pais,account.solicitado_por FROM public.roles WHERE codigo='COORD' AND activo;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rol COORD no disponible'; END IF;
 UPDATE fge_private.cuentas_coordinadores SET id_pais_aplicado=id_pais WHERE id_usuario=NEW.user_id;
 PERFORM set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);
 RETURN NEW;
END;
$$;
CREATE TRIGGER fge_pais_coordinador_login BEFORE INSERT ON auth.sessions
FOR EACH ROW EXECUTE FUNCTION fge_private.aplicar_pais_coordinador_login();

REVOKE ALL ON FUNCTION fge_private.es_administrador_cuentas(uuid), fge_private.coordinador_json(uuid),
 fge_private.completar_alta_coordinador(), fge_private.aplicar_pais_coordinador_login() FROM PUBLIC,anon,authenticated;
COMMIT;
