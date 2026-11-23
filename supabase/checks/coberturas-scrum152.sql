BEGIN;
DO $qa$
DECLARE actor uuid; coord uuid; country uuid:=gen_random_uuid(); iso text;
  granted jsonb; extended jsonb; revoked jsonb; events jsonb; previous text;
BEGIN
  SELECT ar.id_usuario INTO actor FROM public.asignaciones_roles ar JOIN public.roles r USING(id_rol) JOIN public.perfiles p USING(id_usuario)
  WHERE r.codigo='ADMIN' AND r.activo AND r.archived_at IS NULL AND ar.alcance='global'
    AND ar.revocado_at IS NULL AND ar.archived_at IS NULL AND p.activo AND p.archived_at IS NULL LIMIT 1;
  SELECT ar.id_usuario INTO coord FROM public.asignaciones_roles ar JOIN public.roles r USING(id_rol) JOIN public.perfiles p USING(id_usuario)
  WHERE r.codigo='COORD' AND r.activo AND r.archived_at IS NULL AND ar.alcance='pais'
    AND ar.revocado_at IS NULL AND ar.archived_at IS NULL AND p.activo AND p.archived_at IS NULL AND ar.id_usuario<>actor
    AND NOT EXISTS(SELECT 1 FROM public.asignaciones_roles ax JOIN public.roles rx USING(id_rol)
      WHERE ax.id_usuario=ar.id_usuario AND rx.codigo='COORD' AND rx.activo AND rx.archived_at IS NULL
        AND ax.alcance='global' AND ax.revocado_at IS NULL AND ax.archived_at IS NULL) LIMIT 1;
  IF actor IS NULL OR coord IS NULL THEN RAISE EXCEPTION 'QA requiere ADMIN global y COORD territorial activos'; END IF;
  SELECT chr(65+n/26)||chr(65+n%26) INTO iso FROM generate_series(0,675) n
    WHERE NOT EXISTS(SELECT 1 FROM public.paises WHERE codigo_iso=chr(65+n/26)||chr(65+n%26)) LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  INSERT INTO public.paises(id_pais,codigo_iso,nombre,codigo_area_telefonica,zona_horaria)
    VALUES(country,iso,'QA SCRUM152 '||country,'+999','UTC');
  SET LOCAL ROLE authenticated;
  granted:=public.administrar_coberturas('create',jsonb_build_object('id_usuario_beneficiario',coord,'id_pais',country,
    'inicio_at',(current_date-1)::text,'fin_at',(current_date+2)::text,'motivo','Prueba transaccional SCRUM152'));
  previous:=granted->>'fin_at';
  extended:=public.administrar_coberturas('extend',jsonb_build_object('id_permiso_temporal',granted->>'id_permiso_temporal',
    'version_esperada',1,'nueva_fin_at',(current_date+4)::text,'motivo','Extensión transaccional QA'));
  events:=public.administrar_coberturas('history',jsonb_build_object('id_permiso_temporal',granted->>'id_permiso_temporal'));
  IF jsonb_array_length(events)<>2 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(events) e
    WHERE e->>'tipo_evento'='EXTENDER' AND e->>'fin_at_anterior'=previous AND e->>'fin_at_nuevo'=extended->>'fin_at')
    THEN RAISE EXCEPTION 'QA: extensión sin antecedente'; END IF;
  PERFORM set_config('request.jwt.claim.sub',coord::text,true);
  IF NOT fge_private.usuario_tiene_cobertura_pais(country) THEN RAISE EXCEPTION 'QA: cobertura sin efecto'; END IF;
  BEGIN PERFORM public.administrar_coberturas('list','{}'); RAISE EXCEPTION 'QA: COORD accedió a administración';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  revoked:=public.administrar_coberturas('revoke',jsonb_build_object('id_permiso_temporal',granted->>'id_permiso_temporal',
    'version_esperada',2,'motivo_revocacion','Revocación transaccional QA'));
  events:=public.administrar_coberturas('history',jsonb_build_object('id_permiso_temporal',granted->>'id_permiso_temporal'));
  IF revoked->>'condicion'<>'revocada' OR jsonb_array_length(events)<>3 THEN RAISE EXCEPTION 'QA: revocación incompleta'; END IF;
  PERFORM set_config('request.jwt.claim.sub',coord::text,true);
  IF fge_private.usuario_tiene_cobertura_pais(country) THEN RAISE EXCEPTION 'QA: revocación sin efecto inmediato'; END IF;
  PERFORM set_config('qa.scrum152','OK',true);
END $qa$;
RESET ROLE;
SELECT 'SCRUM152_CICLO_REAL_OK' AS resultado,current_setting('qa.scrum152') AS validacion;
ROLLBACK;
