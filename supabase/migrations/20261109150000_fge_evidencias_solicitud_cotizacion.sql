BEGIN;

CREATE TABLE public.evidencias_solicitud_cotizacion (
  id_evidencia uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_solicitud uuid NOT NULL REFERENCES public.solicitudes_cotizacion(id_solicitud) ON DELETE RESTRICT,
  bucket_id text NOT NULL DEFAULT 'fge-cotizaciones' CHECK (bucket_id = 'fge-cotizaciones'),
  ruta_objeto text NOT NULL UNIQUE,
  nombre_original text NOT NULL CHECK (length(btrim(nombre_original)) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK (mime_type IN (
    'image/jpeg','image/png','image/webp','application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  tamano_bytes bigint NOT NULL CHECK (tamano_bytes BETWEEN 1 AND 20971520),
  estado_carga text NOT NULL DEFAULT 'reservado' CHECK (estado_carga IN ('reservado','disponible')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT evidencia_solicitud_ruta_correcta CHECK (ruta_objeto = id_solicitud::text || '/' || id_evidencia::text)
);
CREATE INDEX evidencias_solicitud_cotizacion_solicitud_idx
  ON public.evidencias_solicitud_cotizacion(id_solicitud,created_at) WHERE estado_carga='disponible';

ALTER TABLE public.evidencias_solicitud_cotizacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.evidencias_solicitud_cotizacion FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.evidencias_solicitud_cotizacion TO authenticated;
CREATE POLICY evidencias_solicitud_cotizacion_select ON public.evidencias_solicitud_cotizacion
  FOR SELECT TO authenticated USING (fge_private.acceso_solicitud_cotizacion(id_solicitud,false));
CREATE POLICY evidencias_solicitud_cotizacion_insert ON public.evidencias_solicitud_cotizacion
  FOR INSERT TO authenticated WITH CHECK (estado_carga='reservado' AND fge_private.acceso_solicitud_cotizacion(id_solicitud,true));
CREATE POLICY evidencias_solicitud_cotizacion_update ON public.evidencias_solicitud_cotizacion
  FOR UPDATE TO authenticated USING (estado_carga='reservado' AND fge_private.acceso_solicitud_cotizacion(id_solicitud,true))
  WITH CHECK (estado_carga='disponible' AND fge_private.acceso_solicitud_cotizacion(id_solicitud,true));
CREATE FUNCTION fge_private.validar_estado_evidencia_solicitud()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.id_evidencia IS DISTINCT FROM OLD.id_evidencia OR NEW.id_solicitud IS DISTINCT FROM OLD.id_solicitud
    OR NEW.bucket_id IS DISTINCT FROM OLD.bucket_id OR NEW.ruta_objeto IS DISTINCT FROM OLD.ruta_objeto
    OR NEW.nombre_original IS DISTINCT FROM OLD.nombre_original OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
    OR NEW.tamano_bytes IS DISTINCT FROM OLD.tamano_bytes OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR OLD.estado_carga <> 'reservado' OR NEW.estado_carga <> 'disponible' THEN
    RAISE EXCEPTION 'Solo se permite completar la carga de una evidencia reservada.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fge_private.validar_estado_evidencia_solicitud() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER evidencias_solicitud_cotizacion_guardar_estado BEFORE UPDATE ON public.evidencias_solicitud_cotizacion
  FOR EACH ROW EXECUTE FUNCTION fge_private.validar_estado_evidencia_solicitud();

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('fge-cotizaciones','fge-cotizaciones',false,20971520,ARRAY[
  'image/jpeg','image/png','image/webp','application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]) ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE FUNCTION fge_private.acceso_objeto_evidencia_cotizacion(p_bucket text,p_ruta text,p_carga boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.evidencias_solicitud_cotizacion e
    WHERE e.bucket_id=p_bucket AND e.ruta_objeto=p_ruta
      AND ((p_carga AND e.estado_carga='reservado' AND fge_private.acceso_solicitud_cotizacion(e.id_solicitud,true))
        OR (NOT p_carga AND e.estado_carga='disponible' AND fge_private.acceso_solicitud_cotizacion(e.id_solicitud,false)))
  );
$$;
REVOKE ALL ON FUNCTION fge_private.acceso_objeto_evidencia_cotizacion(text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION fge_private.acceso_objeto_evidencia_cotizacion(text,text,boolean) TO authenticated;
CREATE POLICY storage_cotizaciones_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='fge-cotizaciones' AND fge_private.acceso_objeto_evidencia_cotizacion(bucket_id,name,true));
CREATE POLICY storage_cotizaciones_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='fge-cotizaciones' AND fge_private.acceso_objeto_evidencia_cotizacion(bucket_id,name,false));
GRANT USAGE ON SCHEMA public TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
