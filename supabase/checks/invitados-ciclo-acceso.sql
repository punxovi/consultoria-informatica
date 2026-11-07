-- Ejecutar después de 20261106120000_fge_scrum171_ciclo_invitados.sql.
-- No envía correos; usa un usuario sintético y revierte todas las escrituras.
BEGIN;
CREATE TEMP TABLE qa_invitados_resultado(resultado jsonb) ON COMMIT DROP;
DO $qa$
DECLARE
  admin_id uuid; guest_id uuid := gen_random_uuid(); sid uuid := gen_random_uuid();
  email_qa text := 'qa-invitado-'||gen_random_uuid()||'@example.invalid';
  solicitud jsonb; acceso jsonb; n integer;
BEGIN
  SELECT a.id_usuario INTO admin_id FROM public.asignaciones_roles a
    JOIN public.roles r USING(id_rol) JOIN public.perfiles p USING(id_usuario)
    WHERE r.codigo='ADMIN' AND r.activo AND r.archived_at IS NULL
      AND a.revocado_at IS NULL AND a.archived_at IS NULL AND p.activo AND p.archived_at IS NULL LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'Se requiere un ADMIN activo'; END IF;
  INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data)
    VALUES(guest_id,email_qa,now(),'{}','{}');
  -- Compatibilidad con proyectos cuya creación de perfiles utiliza otro trigger.
  INSERT INTO public.perfiles(id_usuario,nombre) VALUES(guest_id,'Invitado QA') ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
  SET LOCAL ROLE anon;
  solicitud := public.gestionar_invitados('create',jsonb_build_object('nombre','Persona Invitada QA','correo',email_qa));
  BEGIN
    PERFORM public.gestionar_invitados('create',jsonb_build_object('nombre','Duplicado','correo',email_qa));
    RAISE EXCEPTION 'Se permitió duplicar solicitud';
  EXCEPTION WHEN SQLSTATE 'G0148' THEN NULL; END;
  BEGIN
    PERFORM public.gestionar_invitados('list','{}');
    RAISE EXCEPTION 'Anónimo pudo consultar solicitudes';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  solicitud := public.gestionar_invitados('approve',jsonb_build_object('id_invitado',solicitud->>'id_invitado','version_esperada',1));
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',guest_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',guest_id,'role','authenticated','session_id',sid,'iat',extract(epoch FROM now())::bigint+10)::text,true);
  SET LOCAL ROLE authenticated;
  acceso := public.gestionar_invitados('consume','{}');
  IF (acceso->>'expira_en')::timestamptz - (acceso->>'utilizado_en')::timestamptz <> interval '24 hours'
    OR NOT public.validar_acceso_invitado() THEN RAISE EXCEPTION 'Primer uso o vigencia incorrectos'; END IF;
  SELECT count(*) INTO n FROM public.get_user_roles() WHERE codigo='INVIT';
  IF n<>1 THEN RAISE EXCEPTION 'Rol Invitado no disponible'; END IF;
  BEGIN
    PERFORM public.gestionar_invitados('consume','{}');
    RAISE EXCEPTION 'Se permitió consumir dos veces';
  EXCEPTION WHEN SQLSTATE 'G0149' THEN NULL; END;
  BEGIN
    PERFORM public.gestionar_invitados('list','{}');
    RAISE EXCEPTION 'Invitado pudo administrar';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  UPDATE public.solicitudes_invitado SET utilizado_en=now()-interval '25 hours',expira_en=now()-interval '1 hour'
    WHERE id_invitado=(acceso->>'id_invitado')::uuid;
  SET LOCAL ROLE authenticated;
  IF public.validar_acceso_invitado() OR EXISTS(SELECT 1 FROM public.get_user_roles()) THEN
    RAISE EXCEPTION 'Se aceptó acceso expirado';
  END IF;
  RESET ROLE;
  UPDATE public.solicitudes_invitado SET utilizado_en=now(),expira_en=now()+interval '24 hours'
    WHERE id_invitado=(acceso->>'id_invitado')::uuid;
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  PERFORM public.gestionar_invitados('revoke',jsonb_build_object('id_invitado',acceso->>'id_invitado','version_esperada',(acceso->>'version')::integer));
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',guest_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',guest_id,'role','authenticated','session_id',sid)::text,true);
  SET LOCAL ROLE authenticated;
  IF public.validar_acceso_invitado() OR EXISTS(SELECT 1 FROM public.get_user_roles()) THEN
    RAISE EXCEPTION 'Se aceptó acceso revocado';
  END IF;
  RESET ROLE;
  INSERT INTO qa_invitados_resultado VALUES(jsonb_build_object('resultado','PASS','datos_prueba','Se revierten al terminar',
    'verificado','Alta, duplicados, permisos, aprobación, uso único, 24 horas, expiración y revocación. Correo real no incluido.'));
END $qa$;
SELECT resultado FROM qa_invitados_resultado;
ROLLBACK;
