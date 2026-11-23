BEGIN;
CREATE TABLE fge_private.historial_cambios (
 id_historial_cambio bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tabla_afectada text NOT NULL,
 clave_registro jsonb NOT NULL,
 tipo_accion text NOT NULL CHECK (tipo_accion IN ('INSERT','UPDATE','DELETE')),
 fecha_hora timestamptz NOT NULL DEFAULT clock_timestamp(),
 id_usuario uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
 id_permiso_temporal uuid REFERENCES public.permisos_temporales(id_permiso_temporal) ON DELETE RESTRICT,
 id_asignacion uuid REFERENCES public.asignaciones_roles(id_asignacion) ON DELETE RESTRICT,
 permiso_ejercido text,
 actor_sql text NOT NULL,
 antes jsonb,
 despues jsonb
);
ALTER TABLE fge_private.historial_cambios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fge_private.historial_cambios FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA fge_private FROM PUBLIC, anon, authenticated;

CREATE FUNCTION fge_private.sellar_registro() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
   NEW.created_at := clock_timestamp();
   NEW.created_by := auth.uid();
   NEW.version := 1;
 ELSE
   NEW.created_at := OLD.created_at;
   NEW.created_by := OLD.created_by;
   NEW.version := OLD.version + 1;
 END IF;
 NEW.updated_at := clock_timestamp();
 NEW.updated_by := auth.uid();
 RETURN NEW;
END;
$$;

CREATE FUNCTION fge_private.auditar_registro() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 anterior jsonb;
 posterior jsonb;
 fila jsonb;
 clave jsonb := '{}'::jsonb;
 nombre_columna text;
BEGIN
 IF TG_OP <> 'INSERT' THEN anterior := to_jsonb(OLD); END IF;
 IF TG_OP <> 'DELETE' THEN posterior := to_jsonb(NEW); END IF;
 fila := coalesce(posterior,anterior);
 FOREACH nombre_columna IN ARRAY TG_ARGV LOOP
   clave := clave || jsonb_build_object(nombre_columna, fila -> nombre_columna);
 END LOOP;
 INSERT INTO fge_private.historial_cambios
 (tabla_afectada,clave_registro,tipo_accion,id_usuario,actor_sql,antes,despues)
 VALUES (TG_TABLE_NAME,clave,TG_OP,auth.uid(),current_user,anterior,posterior);
 RETURN NULL;
END;
$$;

CREATE FUNCTION fge_private.impedir_cambio_historial() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 RAISE EXCEPTION 'El historial es de solo anexado' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER historial_inmutable BEFORE UPDATE OR DELETE
 ON fge_private.historial_cambios FOR EACH ROW
 EXECUTE FUNCTION fge_private.impedir_cambio_historial();
CREATE TRIGGER historial_no_truncate BEFORE TRUNCATE
 ON fge_private.historial_cambios FOR EACH STATEMENT
 EXECUTE FUNCTION fge_private.impedir_cambio_historial();

CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.paises
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.paises
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_pais');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.perfiles
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.perfiles
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_usuario');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.roles
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.roles
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_rol');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.permisos
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.permisos
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_permiso');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.roles_permisos
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.roles_permisos
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_rol','id_permiso');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.asignaciones_roles
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.asignaciones_roles
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_asignacion');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.permisos_temporales
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.permisos_temporales
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_permiso_temporal');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.permiso_temporal_detalles
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.permiso_temporal_detalles
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_permiso_temporal','id_permiso');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.organizaciones
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.organizaciones
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_organizacion');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.organizacion_redes
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.organizacion_redes
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_red');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.contactos
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.contactos
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_contacto');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.informacion_legal
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.informacion_legal
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_informacion_legal');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.diagnosticos
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.diagnosticos
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_diagnostico');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.programas
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.programas
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_programa');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.planes
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.planes
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_plan');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.acciones
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.acciones
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_accion');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.actas
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.actas
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_acta');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.acta_participantes
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.acta_participantes
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_participante');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.compromisos
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.compromisos
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_compromiso');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.indicadores
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.indicadores
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_indicador');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.resultados
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.resultados
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_resultado');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.donaciones
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.donaciones
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_donacion');
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.archivos
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.archivos
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_archivo');

DO $$
DECLARE r record;
BEGIN
 FOR r IN
 SELECT c.relname AS tabla, a.attname AS columna
 FROM pg_constraint k
 JOIN pg_class c ON c.oid=k.conrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum = ANY(k.conkey)
 WHERE k.contype='f' AND n.nspname='public'
   AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indisvalid AND i.indpred IS NULL AND i.indkey[0]=a.attnum)
   AND c.relname IN ('paises','perfiles','roles','permisos','roles_permisos','asignaciones_roles','permisos_temporales','permiso_temporal_detalles','organizaciones','organizacion_redes','contactos','informacion_legal','diagnosticos','programas','planes','acciones','actas','acta_participantes','compromisos','indicadores','resultados','donaciones','archivos')
 LOOP
   EXECUTE format('CREATE INDEX %I ON public.%I (%I)',
     r.tabla || '_' || r.columna || '_fk_idx',r.tabla,r.columna);
 END LOOP;
END;
$$;
CREATE INDEX acciones_vencimiento_idx ON public.acciones(fecha_termino)
 WHERE archived_at IS NULL AND estado NOT IN ('cumplida','cancelada');
CREATE INDEX compromisos_pendientes_idx ON public.compromisos(fecha_limite)
 WHERE archived_at IS NULL AND estado='pendiente';
CREATE INDEX resultados_medicion_idx ON public.resultados(id_indicador,fecha_medicion);
CREATE INDEX diagnosticos_fecha_idx ON public.diagnosticos(id_organizacion,fecha_diagnostico);
CREATE INDEX actas_fecha_idx ON public.actas(id_accion,fecha);
CREATE INDEX contactos_pais_empresa_idx ON public.contactos(id_pais,empresa_organizacion);
CREATE INDEX donaciones_fecha_idx ON public.donaciones(id_organizacion,fecha);
CREATE INDEX permisos_temporales_vigencia_idx ON public.permisos_temporales
 (id_usuario_beneficiario,id_pais,fin_at) WHERE revocado_at IS NULL;
CREATE INDEX historial_fecha_idx ON fge_private.historial_cambios(fecha_hora);
CREATE INDEX historial_registro_idx ON fge_private.historial_cambios(tabla_afectada,fecha_hora);
CREATE INDEX historial_actor_idx ON fge_private.historial_cambios(id_usuario,fecha_hora);

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA fge_private FROM PUBLIC, anon, authenticated;
COMMIT;
