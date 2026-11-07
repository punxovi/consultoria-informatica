-- Ejecutar después de la migración. Los fixtures se revierten.
BEGIN;
DO $qa$
DECLARE actor uuid; country uuid; ref uuid:=gen_random_uuid(); filters jsonb;
 p jsonb; ids text[]:='{}'; before_count bigint; observed text;
BEGIN
 SELECT a.id_usuario INTO actor FROM public.asignaciones_roles a JOIN public.roles r USING(id_rol)
 JOIN public.perfiles u USING(id_usuario) WHERE r.codigo='ADMIN' AND r.activo AND r.archived_at IS NULL
 AND a.alcance='global' AND a.revocado_at IS NULL AND a.archived_at IS NULL AND u.activo AND u.archived_at IS NULL LIMIT 1;
 SELECT id_pais INTO country FROM public.paises WHERE archived_at IS NULL LIMIT 1;
 IF actor IS NULL OR country IS NULL THEN RAISE EXCEPTION 'Se requiere ADMIN y país activos'; END IF;
 INSERT INTO fge_private.historial_cambios(tabla_afectada,clave_registro,tipo_accion,fecha_hora,id_usuario,id_pais,actor_sql)
 SELECT 'qa_consulta_auditoria',jsonb_build_object('id_qa',ref,'privado','NO_EXPONER'),'UPDATE',
 '2026-10-31T12:00:00.123456Z',actor,country,'qa' FROM generate_series(1,5);
 SELECT count(*) INTO before_count FROM fge_private.historial_cambios;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 SET LOCAL ROLE authenticated;
 filters:=jsonb_build_object('id_usuario',actor,'id_pais',country,'operacion','UPDATE',
 'entidad','qa_consulta_auditoria','desde','2026-10-31','hasta','2026-10-31','limit',2);
 FOR i IN 1..3 LOOP
  p:=public.consultar_eventos_auditoria(filters);
  IF jsonb_array_length(p->'events')<>(CASE WHEN i=3 THEN 1 ELSE 2 END) THEN RAISE EXCEPTION 'Paginación incorrecta'; END IF;
  IF p::text LIKE '%NO_EXPONER%' OR p->'events'->0 ? 'correo' THEN RAISE EXCEPTION 'Proyección excesiva'; END IF;
  FOR observed IN SELECT e->>'id' FROM jsonb_array_elements(p->'events') e LOOP
   IF observed=ANY(ids) THEN RAISE EXCEPTION 'Evento repetido'; END IF;
   ids:=array_append(ids,observed);
  END LOOP;
  IF i<3 THEN
   IF p->'next_cursor'->>'id' IS DISTINCT FROM p->'events'->1->>'id' THEN RAISE EXCEPTION 'Cursor incorrecto'; END IF;
   filters:=filters||jsonb_build_object('cursor_id',p->'next_cursor'->>'id','cursor_fecha',p->'next_cursor'->>'fecha_hora');
  ELSIF p->'next_cursor'<>'null'::jsonb THEN RAISE EXCEPTION 'Cursor final incorrecto'; END IF;
 END LOOP;
 BEGIN PERFORM public.consultar_eventos_auditoria('{"desde":"infinity"}'); RAISE EXCEPTION 'Fecha inválida aceptada';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 BEGIN PERFORM public.consultar_eventos_auditoria('{}'); RAISE EXCEPTION 'Acceso sin rol permitido';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
 IF (SELECT count(*) FROM fge_private.historial_cambios)<>before_count THEN RAISE EXCEPTION 'La consulta generó eventos'; END IF;
END $qa$;
SELECT 'CONSULTA_AUDITORIA_OK' AS resultado;
ROLLBACK;
