BEGIN;
DO $qa$
DECLARE actor uuid; country uuid; before_count bigint; log_id uuid:=gen_random_uuid(); row_id bigint; captured fge_private.historial_cambios; object_id uuid:=gen_random_uuid(); org uuid;
BEGIN
 SELECT a.id_usuario INTO actor FROM public.asignaciones_roles a JOIN public.roles r USING(id_rol) JOIN public.perfiles p USING(id_usuario)
 WHERE r.codigo='ADMIN' AND r.activo AND r.archived_at IS NULL AND a.alcance='global'
  AND a.archived_at IS NULL AND a.revocado_at IS NULL AND p.activo AND p.archived_at IS NULL LIMIT 1;
 SELECT id_pais INTO country FROM public.paises WHERE archived_at IS NULL AND zona_horaria IS NOT NULL LIMIT 1;
 IF actor IS NULL OR country IS NULL THEN RAISE EXCEPTION 'QA requiere ADMIN y país activos'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.headers','{"x-fge-ip-origen":"203.0.113.157","x-fge-request-id":"QA-SCRUM157"}',true);
 UPDATE public.paises SET nombre=nombre WHERE id_pais=country;
 SELECT * INTO captured FROM fge_private.historial_cambios WHERE request_id='QA-SCRUM157' ORDER BY id_historial_cambio DESC LIMIT 1;
 IF captured.id_usuario IS DISTINCT FROM actor OR captured.codigo_rol IS DISTINCT FROM 'ADMIN'
  OR captured.tipo_evento IS DISTINCT FROM 'pais_modificado' OR captured.ip_origen IS DISTINCT FROM '203.0.113.157'::inet
  OR captured.id_pais IS DISTINCT FROM country THEN RAISE EXCEPTION 'QA: metadatos incompletos'; END IF;
 row_id:=captured.id_historial_cambio;
 SELECT count(*) INTO before_count FROM fge_private.historial_cambios;
 SET LOCAL ROLE authenticated;
 PERFORM public.consultar_eventos_auditoria('{}');
 RESET ROLE;
 IF (SELECT count(*) FROM fge_private.historial_cambios)<>before_count THEN RAISE EXCEPTION 'QA: consulta genera ruido'; END IF;
 INSERT INTO auth.audit_log_entries(id,payload,ip_address,created_at)
 VALUES(log_id,jsonb_build_object('action','login','actor_id',actor),'198.51.100.157',clock_timestamp());
 SET LOCAL ROLE service_role;
 PERFORM public.sincronizar_eventos_autenticacion();
 RESET ROLE;
 IF NOT EXISTS(SELECT 1 FROM fge_private.historial_cambios WHERE clave_registro->>'id_evento_auth'=log_id::text
  AND tipo_evento='auth:login' AND id_usuario=actor AND fuente_ip='proveedor_auth') THEN RAISE EXCEPTION 'QA: falta evento Auth'; END IF;
 SET LOCAL ROLE service_role;
 PERFORM public.registrar_intento_autenticacion('QA-SCRUM157-failed','198.51.100.158',400);
 RESET ROLE;
 IF NOT EXISTS(SELECT 1 FROM fge_private.historial_cambios WHERE request_id='QA-SCRUM157-failed' AND tipo_evento='auth:login_fallido')
 THEN RAISE EXCEPTION 'QA: falta intento fallido'; END IF;
 BEGIN UPDATE fge_private.historial_cambios SET actor_sql='alterado' WHERE id_historial_cambio=row_id;
   RAISE EXCEPTION 'QA: UPDATE permitido'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM fge_private.historial_cambios WHERE id_historial_cambio=row_id;
   RAISE EXCEPTION 'QA: DELETE permitido'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN TRUNCATE fge_private.historial_cambios;
   RAISE EXCEPTION 'QA: TRUNCATE permitido'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT id_organizacion INTO org FROM public.organizaciones WHERE archived_at IS NULL LIMIT 1;
 IF org IS NOT NULL THEN
  INSERT INTO storage.objects(id,bucket_id,name) VALUES(object_id,'fge-expedientes-legales','expedientes/'||org||'/qa-'||object_id||'.pdf');
  PERFORM set_config('storage.operation','storage.object.list',true);
  SET LOCAL ROLE authenticated;
  PERFORM id FROM storage.objects WHERE id=object_id;
  RESET ROLE;
  IF EXISTS(SELECT 1 FROM fge_private.historial_cambios WHERE clave_registro->>'id_storage_object'=object_id::text) THEN
   RAISE EXCEPTION 'QA: listado Storage genera ruido'; END IF;
  PERFORM set_config('storage.operation','storage.object.get_authenticated',true);
  SET LOCAL ROLE authenticated;
  PERFORM id FROM storage.objects WHERE id=object_id;
  RESET ROLE;
  IF NOT EXISTS(SELECT 1 FROM fge_private.historial_cambios WHERE clave_registro->>'id_storage_object'=object_id::text
   AND tipo_evento='documento_acceso_storage') THEN RAISE EXCEPTION 'QA: acceso Storage no registrado'; END IF;
 END IF;
 PERFORM set_config('qa.scrum157','OK',true);
END $qa$;
SELECT 'SCRUM157_RF62_OK' AS resultado,current_setting('qa.scrum157') AS validacion;
ROLLBACK;
