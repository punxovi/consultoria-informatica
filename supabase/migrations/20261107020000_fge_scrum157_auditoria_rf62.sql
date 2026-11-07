-- SCRUM-157: anexado inmutable y metadatos comunes para RF62.
BEGIN;
ALTER TABLE fge_private.historial_cambios
 ADD COLUMN IF NOT EXISTS tipo_evento text,
 ADD COLUMN IF NOT EXISTS zona_horaria text NOT NULL DEFAULT 'UTC',
 ADD COLUMN IF NOT EXISTS fecha_hora_local timestamp,
 ADD COLUMN IF NOT EXISTS request_id text,
 ADD COLUMN IF NOT EXISTS ip_conexion_bd inet;
REVOKE ALL ON fge_private.historial_cambios FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA fge_private FROM PUBLIC,anon,authenticated;
ALTER TABLE fge_private.historial_cambios ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='fge_private.historial_cambios'::regclass
  AND contype='c' AND pg_get_constraintdef(oid) LIKE '%fuente_ip%' LOOP
  EXECUTE format('ALTER TABLE fge_private.historial_cambios DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE fge_private.historial_cambios ADD CONSTRAINT auditoria_fuente_ip_check
 CHECK(fuente_ip IN ('aplicacion','conexion_bd','proveedor_auth'));
-- Garantiza que también se ejecuten ante session_replication_role=replica.
ALTER TABLE fge_private.historial_cambios ENABLE ALWAYS TRIGGER historial_inmutable;
ALTER TABLE fge_private.historial_cambios ENABLE ALWAYS TRIGGER historial_no_truncate;
CREATE OR REPLACE FUNCTION fge_private.completar_contexto_auditoria() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE headers jsonb; pais uuid; role_code text; assignment uuid; country_zone text;
BEGIN
 NEW.ip_conexion_bd:=inet_client_addr();
 BEGIN headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 EXCEPTION WHEN invalid_text_representation THEN headers:='{}'; END;
 IF NEW.actor_sql='supabase_auth' THEN headers:='{}'::jsonb; END IF;
 NEW.request_id:=coalesce(NEW.request_id,left(coalesce(headers->>'x-fge-request-id',headers->>'x-request-id'),128));
 IF NEW.codigo_rol IS NULL THEN
   SELECT a.id_asignacion,r.codigo,a.id_pais INTO assignment,role_code,pais
   FROM public.asignaciones_roles a JOIN public.roles r USING(id_rol)
   WHERE a.id_usuario=NEW.id_usuario AND a.revocado_at IS NULL AND a.archived_at IS NULL AND r.activo AND r.archived_at IS NULL
   ORDER BY CASE r.codigo WHEN 'ADMIN' THEN 0 WHEN 'COORD' THEN 1 ELSE 2 END,a.id_asignacion LIMIT 1;
   IF role_code IS NULL AND NEW.tabla_afectada='asignaciones_roles' AND NEW.antes->>'id_usuario'=NEW.id_usuario::text THEN
     SELECT r.codigo INTO role_code FROM public.roles r WHERE r.id_rol=(NEW.antes->>'id_rol')::uuid;
     assignment:=(NEW.antes->>'id_asignacion')::uuid;
   END IF;
   NEW.id_asignacion:=coalesce(NEW.id_asignacion,assignment);
   NEW.codigo_rol:=coalesce(role_code,CASE WHEN NEW.id_usuario IS NULL THEN 'SISTEMA' ELSE 'SIN_ROL' END);
 END IF;
 BEGIN
   NEW.id_pais:=coalesce(NEW.id_pais,(NEW.clave_registro->'filtros'->>'countryId')::uuid,(coalesce(NEW.despues->>'id_pais',NEW.antes->>'id_pais'))::uuid);
   IF NEW.id_pais IS NULL AND coalesce(NEW.despues->>'id_organizacion',NEW.antes->>'id_organizacion') IS NOT NULL THEN
     SELECT o.id_pais INTO NEW.id_pais FROM public.organizaciones o
     WHERE o.id_organizacion=coalesce(NEW.despues->>'id_organizacion',NEW.antes->>'id_organizacion')::uuid;
   END IF;
   IF NEW.id_pais IS NULL AND NEW.tabla_afectada='paises' THEN NEW.id_pais:=(NEW.clave_registro->>'id_pais')::uuid; END IF;
 EXCEPTION WHEN invalid_text_representation THEN NULL; END;
 IF NEW.id_pais IS NULL THEN
   SELECT a.id_pais INTO pais FROM public.asignaciones_roles a WHERE a.id_asignacion=NEW.id_asignacion;
 ELSE pais:=NEW.id_pais; END IF;
 SELECT p.zona_horaria INTO country_zone FROM public.paises p WHERE p.id_pais=pais;
 NEW.zona_horaria:=coalesce(country_zone,'UTC');
 NEW.fecha_hora_local:=NEW.fecha_hora AT TIME ZONE NEW.zona_horaria;
 IF NEW.ip_origen IS NULL THEN
   BEGIN NEW.ip_origen:=nullif(headers->>'x-fge-ip-origen','')::inet;
   EXCEPTION WHEN invalid_text_representation THEN NEW.ip_origen:=NULL; END;
   IF NEW.ip_origen IS NOT NULL THEN NEW.fuente_ip:='aplicacion'; END IF;
 END IF;
 IF NEW.ip_origen IS NULL THEN NEW.ip_origen:=NEW.ip_conexion_bd;
   IF NEW.ip_origen IS NOT NULL THEN NEW.fuente_ip:='conexion_bd'; END IF;
 END IF;
 NEW.tipo_evento:=coalesce(NEW.tipo_evento,CASE
   WHEN NEW.despues->>'operacion'='lectura_documento' THEN 'documento_consultado'
   WHEN NEW.despues->>'operacion'='exportacion' THEN 'reporte_exportado'
   WHEN NEW.tabla_afectada='perfiles' THEN CASE WHEN NEW.tipo_accion='INSERT' THEN 'cuenta_creada'
     WHEN NEW.antes->>'activo'='true' AND NEW.despues->>'activo'='false' THEN 'cuenta_desactivada' ELSE 'cuenta_modificada' END
   WHEN NEW.tabla_afectada='asignaciones_roles' THEN CASE WHEN NEW.tipo_accion='INSERT' THEN 'rol_otorgado'
     WHEN NEW.antes->>'revocado_at' IS NULL AND NEW.despues->>'revocado_at' IS NOT NULL THEN 'rol_revocado' ELSE 'rol_modificado' END
   WHEN NEW.tabla_afectada='paises' THEN CASE WHEN NEW.tipo_accion='INSERT' THEN 'pais_creado'
     WHEN NEW.antes->>'archived_at' IS NULL AND NEW.despues->>'archived_at' IS NOT NULL THEN 'pais_desactivado' ELSE 'pais_modificado' END
   WHEN NEW.tabla_afectada='permisos_temporales' THEN CASE WHEN NEW.tipo_accion='INSERT' THEN 'cobertura_otorgada'
     WHEN NEW.antes->>'revocado_at' IS NULL AND NEW.despues->>'revocado_at' IS NOT NULL THEN 'cobertura_revocada'
     WHEN NEW.antes->>'fin_at' IS DISTINCT FROM NEW.despues->>'fin_at' THEN 'cobertura_extendida' ELSE 'cobertura_modificada' END
   ELSE lower(NEW.tabla_afectada||':'||NEW.tipo_accion) END);
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION fge_private.completar_contexto_auditoria() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='fge_private.historial_cambios'::regclass
   AND tgfoid='fge_private.completar_contexto_auditoria()'::regprocedure AND NOT tgisinternal) THEN
  CREATE TRIGGER zz_contexto_rf62 BEFORE INSERT ON fge_private.historial_cambios
   FOR EACH ROW EXECUTE FUNCTION fge_private.completar_contexto_auditoria();
 END IF;
END $$;

-- Ya no se aceptan afirmaciones de login emitidas por usuarios de la aplicación.
REVOKE ALL ON FUNCTION public.registrar_evento_autenticacion(boolean,jsonb) FROM PUBLIC,anon,authenticated;
-- Atestación del proceso Auth tras respuesta verificada del proveedor.
CREATE OR REPLACE FUNCTION public.registrar_evento_autenticacion(p_exitoso boolean,p_detalles jsonb DEFAULT '{}') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid; actor uuid; op text:=p_detalles->>'operacion';
BEGIN
 IF p_exitoso IS DISTINCT FROM true OR jsonb_typeof(p_detalles) IS DISTINCT FROM 'object'
  OR (p_detalles-ARRAY['id_usuario','operacion'])<>'{}'::jsonb
  OR op IS NULL OR op NOT IN ('login_backend','password_backend','refresh_backend','logout_backend','recuperacion_solicitada') THEN
  RAISE EXCEPTION 'Evento de autenticación inválido' USING ERRCODE='22023'; END IF;
 BEGIN target:=(p_detalles->>'id_usuario')::uuid; EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION 'Actor inválido' USING ERRCODE='22023'; END;
 IF target IS NULL AND op<>'recuperacion_solicitada' THEN RAISE EXCEPTION 'Actor requerido' USING ERRCODE='22023'; END IF;
 IF target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=target) THEN
  RAISE EXCEPTION 'Actor no disponible' USING ERRCODE='22023'; END IF;
 SELECT p.id_usuario INTO actor FROM public.perfiles p WHERE p.id_usuario=target;
 INSERT INTO fge_private.historial_cambios(tabla_afectada,clave_registro,tipo_accion,id_usuario,actor_sql,despues,tipo_evento,codigo_rol)
 VALUES('autenticacion',jsonb_build_object('id_usuario_auth',target,'exitoso',true),'INSERT',actor,'auth_service',
  jsonb_build_object('operacion',op,'origen','respuesta_auth_verificada'),'auth:'||op,CASE WHEN target IS NULL THEN 'ANON' END);
END; $$;
REVOKE ALL ON FUNCTION public.registrar_evento_autenticacion(boolean,jsonb) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT EXECUTE ON FUNCTION public.registrar_evento_autenticacion(boolean,jsonb) TO service_role;
END IF; END $$;

-- Auth es un esquema administrado: copiar por lectura, sin triggers sobre sus tablas.
CREATE TABLE fge_private.auditoria_fuentes(fuente text PRIMARY KEY,desde timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE fge_private.auditoria_fuentes ENABLE ROW LEVEL SECURITY;
INSERT INTO fge_private.auditoria_fuentes(fuente) VALUES('auth.audit_log_entries');
REVOKE ALL ON fge_private.auditoria_fuentes FROM PUBLIC,anon,authenticated;
CREATE UNIQUE INDEX auditoria_auth_evento_unico ON fge_private.historial_cambios((clave_registro->>'id_evento_auth'))
 WHERE tabla_afectada='autenticacion' AND clave_registro ? 'id_evento_auth';
CREATE FUNCTION fge_private.ip_auditoria(valor text) RETURNS inet LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN RETURN nullif(valor,'')::inet; EXCEPTION WHEN invalid_text_representation THEN RETURN NULL; END; $$;
REVOKE ALL ON FUNCTION fge_private.ip_auditoria(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.sincronizar_eventos_autenticacion(p_limite integer DEFAULT 500,p_usuario uuid DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inserted integer;
BEGIN
 IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Límite inválido' USING ERRCODE='22023'; END IF;
 WITH source AS (
  SELECT l.*,CASE WHEN l.payload->>'actor_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (l.payload->>'actor_id')::uuid END AS actor
  FROM auth.audit_log_entries l
  WHERE l.created_at >= (SELECT desde FROM fge_private.auditoria_fuentes WHERE fuente='auth.audit_log_entries')
    AND l.payload->>'action' IS NOT NULL AND (p_usuario IS NULL OR l.payload->>'actor_id'=p_usuario::text)
    AND NOT EXISTS(SELECT 1 FROM fge_private.historial_cambios h WHERE h.tabla_afectada='autenticacion'
      AND h.clave_registro ? 'id_evento_auth' AND h.clave_registro->>'id_evento_auth'=l.id::text)
  ORDER BY l.created_at,l.id LIMIT p_limite
 )
 INSERT INTO fge_private.historial_cambios(tabla_afectada,clave_registro,tipo_accion,id_usuario,actor_sql,fecha_hora,despues,
  ip_origen,fuente_ip,tipo_evento,codigo_rol,id_asignacion,id_pais)
 SELECT 'autenticacion',jsonb_build_object('id_evento_auth',l.id,'id_usuario_auth',l.actor,'exitoso',l.payload->>'action' NOT LIKE '%failed%'),
  'INSERT',p.id_usuario,'supabase_auth',l.created_at,jsonb_build_object('operacion',l.payload->>'action','origen','auth.audit_log_entries'),
  fge_private.ip_auditoria(l.ip_address),CASE WHEN fge_private.ip_auditoria(l.ip_address) IS NOT NULL THEN 'proveedor_auth' END,
  'auth:'||(l.payload->>'action'),coalesce(r.codigo,CASE WHEN p.id_usuario IS NULL THEN 'SISTEMA' ELSE 'SIN_ROL' END),r.id_asignacion,r.id_pais
 FROM source l LEFT JOIN public.perfiles p ON p.id_usuario=l.actor
 LEFT JOIN LATERAL (
  SELECT ar.id_asignacion,ar.id_pais,rol.codigo FROM public.asignaciones_roles ar JOIN public.roles rol USING(id_rol)
  WHERE ar.id_usuario=l.actor AND ar.created_at<=l.created_at
   AND (ar.revocado_at IS NULL OR ar.revocado_at>l.created_at) AND (ar.archived_at IS NULL OR ar.archived_at>l.created_at)
  ORDER BY CASE rol.codigo WHEN 'ADMIN' THEN 0 WHEN 'COORD' THEN 1 ELSE 2 END,ar.id_asignacion LIMIT 1
 ) r ON true
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 RETURN inserted;
END; $$;
REVOKE ALL ON FUNCTION public.sincronizar_eventos_autenticacion(integer,uuid) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT EXECUTE ON FUNCTION public.sincronizar_eventos_autenticacion(integer,uuid) TO service_role;
 REVOKE ALL ON fge_private.auditoria_fuentes FROM service_role;
END IF; END $$;

-- Solo el proceso Auth puede atestiguar el rechazo de credenciales sin sesión.
CREATE FUNCTION public.registrar_intento_autenticacion(p_request_id text,p_ip inet,p_codigo integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_codigo NOT BETWEEN 400 AND 499 OR p_codigo IS NULL OR length(p_request_id)>128 THEN
   RAISE EXCEPTION 'Contexto de autenticación inválido' USING ERRCODE='22023'; END IF;
 INSERT INTO fge_private.historial_cambios(tabla_afectada,clave_registro,tipo_accion,actor_sql,despues,ip_origen,fuente_ip,codigo_rol,tipo_evento,request_id)
 VALUES('autenticacion',jsonb_build_object('request_id',p_request_id,'exitoso',false),'INSERT','auth_service',
   jsonb_build_object('operacion','login_fallido','estado_auth',p_codigo),p_ip,CASE WHEN p_ip IS NOT NULL THEN 'aplicacion' END,
   'ANON','auth:login_fallido',p_request_id);
END; $$;
REVOKE ALL ON FUNCTION public.registrar_intento_autenticacion(text,inet,integer) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT EXECUTE ON FUNCTION public.registrar_intento_autenticacion(text,inet,integer) TO service_role;
 REVOKE ALL ON fge_private.historial_cambios FROM service_role;
END IF; END $$;

CREATE OR REPLACE FUNCTION public.registrar_acceso_documento(p_id_documento uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión requerida' USING ERRCODE='42501'; END IF;
 SELECT l.id_organizacion INTO org FROM public.informacion_legal l WHERE l.id_informacion_legal=p_id_documento
   AND l.archived_at IS NULL AND fge_private.usuario_puede_consultar_organizacion(l.id_organizacion);
 IF org IS NULL THEN RAISE EXCEPTION 'Documento no disponible' USING ERRCODE='42501'; END IF;
 INSERT INTO fge_private.historial_cambios(tabla_afectada,clave_registro,tipo_accion,id_usuario,actor_sql,despues)
 VALUES('informacion_legal',jsonb_build_object('id_informacion_legal',p_id_documento),'INSERT',auth.uid(),current_user,
   jsonb_build_object('operacion','lectura_documento','id_organizacion',org));
END; $$;
REVOKE ALL ON FUNCTION public.registrar_acceso_documento(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registrar_acceso_documento(uuid) TO authenticated;

CREATE FUNCTION public.registrar_acceso_archivo(p_tipo text,p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed boolean:=false; entity text; key_name text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión requerida' USING ERRCODE='42501'; END IF;
 IF p_tipo='donacion' THEN
   SELECT true INTO allowed FROM public.archivos f WHERE f.id_archivo=p_id AND f.archived_at IS NULL
    AND f.estado_carga='disponible' AND fge_private.acceso_archivo_donacion(f.id_donacion,false);
   entity:='archivos'; key_name:='id_archivo';
 ELSIF p_tipo='evidencia' THEN
   SELECT true INTO allowed FROM public.evidencias e WHERE e.id_evidencia=p_id AND e.archived_at IS NULL
    AND e.estado_carga='disponible' AND fge_private.acceso_objeto_evidencia(e.bucket_id,e.ruta_objeto,false);
   entity:='evidencias'; key_name:='id_evidencia';
 ELSIF p_tipo='adjunto_acta' THEN
   SELECT true INTO allowed FROM public.adjuntos_acta a WHERE a.id_adjunto=p_id AND a.archived_at IS NULL
    AND a.estado_carga='disponible' AND fge_private.acceso_objeto_adjunto_acta(a.bucket_id,a.ruta_objeto,false);
   entity:='adjuntos_acta'; key_name:='id_adjunto';
 ELSE RAISE EXCEPTION 'Tipo de recurso inválido' USING ERRCODE='22023'; END IF;
 IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Archivo no disponible' USING ERRCODE='42501'; END IF;
 INSERT INTO fge_private.historial_cambios(tabla_afectada,clave_registro,tipo_accion,id_usuario,actor_sql,despues)
 VALUES(entity,jsonb_build_object(key_name,p_id),'INSERT',auth.uid(),current_user,jsonb_build_object('operacion','lectura_documento'));
END; $$;
REVOKE ALL ON FUNCTION public.registrar_acceso_archivo(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registrar_acceso_archivo(text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_exportacion_reporte(
  p_destino text,
  p_filtros jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  usuario uuid := auth.uid();
  filtros jsonb := COALESCE(p_filtros, '{}'::jsonb);
  actor text := COALESCE(
    NULLIF(NULLIF(current_setting('role', true), 'none'), ''),
    session_user
  );
BEGIN
  IF usuario IS NULL OR NOT EXISTS(SELECT 1 FROM public.perfiles p WHERE p.id_usuario=usuario AND p.activo AND p.archived_at IS NULL) THEN
    RAISE EXCEPTION 'Sesión requerida.' USING ERRCODE = '42501';
  END IF;
  IF p_destino IS NULL OR p_destino NOT IN ('interno', 'donante', 'externo') THEN
    RAISE EXCEPTION 'Destino de reporte no válido.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(filtros) <> 'object' THEN
    RAISE EXCEPTION 'Los filtros del reporte deben ser un objeto JSON.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO fge_private.historial_cambios (
    tabla_afectada,
    clave_registro,
    tipo_accion,
    id_usuario,
    permiso_ejercido,
    actor_sql,
    despues
  ) VALUES (
    'reportes',
    jsonb_build_object('destino', p_destino, 'filtros', filtros),
    'INSERT',
    usuario,
    'reportes.exportar',
    actor,
    jsonb_build_object('operacion', 'exportacion', 'destino', p_destino, 'filtros', filtros)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_exportacion_reporte(text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_exportacion_reporte(text, jsonb)
  TO authenticated;


-- Intercepción adicional en Storage: incluye accesos que no pasan por Node.js.
-- Una política RESTRICTIVE nunca concede permisos: conserva las RLS existentes.
CREATE FUNCTION fge_private.auditar_acceso_storage(p_id uuid,p_bucket text,p_ruta text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE personal boolean:=false; actor uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT storage.allow_any_operation(ARRAY[
  'object.get_authenticated','object.sign','object.sign_many','object.get_signed','render.image_authenticated','render.image_sign','s3.object.get'
 ]) THEN RETURN true; END IF;
 personal:=p_bucket IN ('fge-expedientes-legales','fge-evidencias');
 IF p_bucket='fge-archivos' THEN
  SELECT EXISTS(SELECT 1 FROM public.archivos f WHERE f.bucket_id=p_bucket AND f.ruta_objeto=p_ruta
    AND (f.id_donacion IS NOT NULL OR f.id_informacion_legal IS NOT NULL OR f.categoria='identidad_representante')) INTO personal;
 END IF;
 IF personal THEN
  SELECT p.id_usuario INTO actor FROM public.perfiles p WHERE p.id_usuario=auth.uid();
  INSERT INTO fge_private.historial_cambios(tabla_afectada,clave_registro,tipo_accion,id_usuario,actor_sql,despues,tipo_evento)
  VALUES('storage.objects',jsonb_build_object('id_storage_object',p_id,'bucket_id',p_bucket,'id_usuario_auth',auth.uid()),'INSERT',actor,current_user,
   jsonb_build_object('operacion','solicitud_lectura_documento','origen','storage_rls'),'documento_acceso_storage');
 END IF;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION fge_private.auditar_acceso_storage(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION fge_private.auditar_acceso_storage(uuid,text,text) TO authenticated;
CREATE POLICY rf62_registrar_acceso_documental ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
 USING(fge_private.auditar_acceso_storage(id,bucket_id,name));

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
      historial.tipo_evento,historial.zona_horaria,historial.fecha_hora_local,historial.request_id,historial.fuente_ip,
      historial.fecha_hora,
      coalesce(pais_directo.nombre, pais_asignacion.nombre, pais_cobertura.nombre) AS pais,
      historial.ip_origen::text AS ip,
      historial.tipo_accion AS operacion,
      historial.tabla_afectada AS entidad,
      nullif((
        SELECT string_agg(campo.key || ': ' || campo.value, ', ' ORDER BY campo.key)
        FROM jsonb_each_text(historial.clave_registro) AS campo
      ), '') AS referencia,
      historial.id_historial_cambio,
      cuenta.email::text AS correo,
      perfil.nombre AS nombre_usuario,
      -- Nombre legible del registro afectado, si la fila lo tiene.
      left(coalesce(
        historial.despues ->> 'nombre', historial.antes ->> 'nombre',
        historial.despues ->> 'titulo', historial.antes ->> 'titulo',
        historial.despues ->> 'nombre_producto', historial.antes ->> 'nombre_producto',
        historial.despues ->> 'nombre_solicitante', historial.antes ->> 'nombre_solicitante',
        historial.despues ->> 'nombre_original', historial.antes ->> 'nombre_original'
      ), 160) AS nombre_registro,
      -- Campos que cambiaron en una modificación, sin columnas técnicas.
      CASE WHEN historial.tipo_accion = 'UPDATE' AND historial.antes IS NOT NULL AND historial.despues IS NOT NULL THEN (
        SELECT coalesce(jsonb_agg(campo.key ORDER BY campo.key), '[]'::jsonb)
        FROM jsonb_each(historial.despues) AS campo
        WHERE campo.key <> ALL (ARRAY['updated_at', 'updated_by', 'created_at', 'created_by', 'version', 'archived_at'])
          AND historial.antes -> campo.key IS DISTINCT FROM campo.value
      ) END AS campos_modificados,
      CASE
        WHEN historial.tipo_accion = 'UPDATE' AND historial.antes ->> 'archived_at' IS NULL AND historial.despues ->> 'archived_at' IS NOT NULL THEN 'archivado'
        WHEN historial.tipo_accion = 'UPDATE' AND historial.antes ->> 'archived_at' IS NOT NULL AND historial.despues ->> 'archived_at' IS NULL THEN 'restaurado'
      END AS cambio_estado,
      -- Eventos que no son cambios de una fila: inicio de sesión y consulta de documentos.
      CASE
        WHEN historial.tabla_afectada = 'autenticacion' THEN
          CASE WHEN historial.tipo_evento IN ('auth:login','auth:login_backend') THEN 'inicio_sesion' WHEN historial.clave_registro->>'exitoso'='false' THEN 'inicio_sesion_fallido' ELSE NULL END
        WHEN historial.antes IS NULL AND historial.despues ->> 'operacion' = 'lectura_documento' THEN 'lectura_documento'
      END AS accion_especial
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
      AND (v_operacion IS NULL OR historial.tipo_accion ILIKE '%' || v_operacion || '%' OR historial.tipo_evento ILIKE '%' || v_operacion || '%')
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
        'referencia', pagina.referencia,
        'correo', pagina.correo,
        'nombre_usuario', pagina.nombre_usuario,
        'nombre_registro', pagina.nombre_registro,
        'campos_modificados', pagina.campos_modificados,
        'cambio_estado', pagina.cambio_estado,
        'accion_especial', pagina.accion_especial,
        'tipo_evento',pagina.tipo_evento,'zona_horaria',pagina.zona_horaria,'fecha_hora_local',pagina.fecha_hora_local,
        'request_id',pagina.request_id,'fuente_ip',pagina.fuente_ip
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
NOTIFY pgrst, 'reload schema';
COMMIT;
;
