-- Evidencias de acciones (Acción -> Plan de intervención -> Organización).
BEGIN;

CREATE TABLE public.evidencias (
  id_evidencia uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_accion uuid NOT NULL REFERENCES public.acciones(id_accion) ON DELETE RESTRICT,
  origen text NOT NULL CHECK (length(btrim(origen)) BETWEEN 1 AND 200),
  descripcion text NOT NULL CHECK (length(btrim(descripcion)) BETWEEN 1 AND 5000),
  incorporado_at timestamptz NOT NULL DEFAULT now(),
  incorporado_por uuid NOT NULL REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  consentimiento_declarado boolean,
  declaracion_consentimiento text,
  consentimiento_at timestamptz,
  consentimiento_por uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  estado_publicacion text NOT NULL DEFAULT 'no_publicada'
    CHECK (estado_publicacion IN ('no_publicada','publicada','retirada')),
  publicado boolean GENERATED ALWAYS AS (estado_publicacion = 'publicada') STORED,
  publicacion_actualizada_at timestamptz,
  publicacion_actualizada_por uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  bucket_id text NOT NULL DEFAULT 'fge-evidencias' CHECK (bucket_id = 'fge-evidencias'),
  ruta_objeto text GENERATED ALWAYS AS (id_accion::text || '/' || id_evidencia::text) STORED,
  nombre_original text NOT NULL CHECK (length(btrim(nombre_original)) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK (mime_type IN (
    'application/pdf','image/jpeg','image/png','image/webp',
    'audio/mpeg','audio/ogg','audio/wav','video/mp4','video/webm')),
  tamano_bytes bigint NOT NULL CHECK (tamano_bytes BETWEEN 1 AND 52428800),
  estado_carga text NOT NULL DEFAULT 'reservado'
    CHECK (estado_carga IN ('reservado','disponible','fallido')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (bucket_id, ruta_objeto),
  CONSTRAINT evidencia_consentimiento_completo CHECK (
    (consentimiento_declarado IS NULL AND declaracion_consentimiento IS NULL
      AND consentimiento_at IS NULL AND consentimiento_por IS NULL)
    OR (consentimiento_declarado IS NOT NULL AND declaracion_consentimiento IS NOT NULL
      AND length(btrim(declaracion_consentimiento)) BETWEEN 1 AND 5000
      AND consentimiento_at IS NOT NULL AND consentimiento_por IS NOT NULL)),
  CONSTRAINT evidencia_publicacion_valida CHECK (
    estado_publicacion <> 'publicada' OR
    (consentimiento_declarado IS TRUE AND estado_carga = 'disponible' AND archived_at IS NULL))
);
ALTER TABLE public.evidencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.evidencias FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.evidencias TO authenticated;
CREATE INDEX evidencias_accion_activas_idx ON public.evidencias(id_accion, incorporado_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX evidencias_publicadas_idx ON public.evidencias(incorporado_at DESC)
  WHERE estado_publicacion = 'publicada' AND archived_at IS NULL;

CREATE FUNCTION fge_private.acceso_evidencia_accion(p_accion uuid, p_gestion boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.acciones a JOIN public.planes p USING (id_plan)
    WHERE a.id_accion = p_accion AND a.archived_at IS NULL AND p.archived_at IS NULL
      AND CASE WHEN p_gestion
        THEN fge_private.usuario_puede_gestionar_organizacion(p.id_organizacion)
        ELSE fge_private.usuario_puede_consultar_organizacion(p.id_organizacion) END
  );
$$;
REVOKE ALL ON FUNCTION fge_private.acceso_evidencia_accion(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fge_private.acceso_evidencia_accion(uuid,boolean) TO authenticated;

CREATE POLICY evidencias_lectura ON public.evidencias FOR SELECT TO authenticated
USING (archived_at IS NULL AND fge_private.acceso_evidencia_accion(id_accion,false));
CREATE POLICY evidencias_creacion ON public.evidencias FOR INSERT TO authenticated
WITH CHECK (archived_at IS NULL AND fge_private.acceso_evidencia_accion(id_accion,true));
CREATE POLICY evidencias_edicion ON public.evidencias FOR UPDATE TO authenticated
USING (archived_at IS NULL AND fge_private.acceso_evidencia_accion(id_accion,true))
WITH CHECK (fge_private.acceso_evidencia_accion(id_accion,true));

CREATE FUNCTION fge_private.validar_evidencia() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  cambio_consentimiento boolean;
  objeto_metadata jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'La incorporación o edición requiere un usuario autenticado.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado_publicacion <> 'no_publicada' OR NEW.estado_carga <> 'reservado' THEN
      RAISE EXCEPTION 'La evidencia debe reservarse antes de cargar o publicar.' USING ERRCODE = '23514';
    END IF;
    NEW.incorporado_at := clock_timestamp();
    NEW.incorporado_por := actor;
    NEW.publicacion_actualizada_at := NULL;
    NEW.publicacion_actualizada_por := NULL;
    cambio_consentimiento := NEW.consentimiento_declarado IS NOT NULL;
  ELSE
    IF NEW.id_evidencia IS DISTINCT FROM OLD.id_evidencia OR NEW.id_accion IS DISTINCT FROM OLD.id_accion
       OR NEW.bucket_id IS DISTINCT FROM OLD.bucket_id OR NEW.nombre_original IS DISTINCT FROM OLD.nombre_original
       OR NEW.mime_type IS DISTINCT FROM OLD.mime_type OR NEW.tamano_bytes IS DISTINCT FROM OLD.tamano_bytes THEN
      RAISE EXCEPTION 'La referencia y los metadatos del archivo son inmutables; registre otra evidencia.' USING ERRCODE = '23514';
    END IF;
    IF OLD.estado_carga = 'disponible' AND NEW.estado_carga <> 'disponible' THEN
      RAISE EXCEPTION 'Una evidencia disponible no puede volver a reserva o fallido.' USING ERRCODE = '23514';
    END IF;
    IF OLD.estado_publicacion <> 'no_publicada' AND NEW.estado_publicacion = 'no_publicada' THEN
      RAISE EXCEPTION 'Una publicación previa debe conservarse como retirada.' USING ERRCODE = '23514';
    END IF;
    IF OLD.estado_publicacion = 'no_publicada' AND NEW.estado_publicacion = 'retirada' THEN
      RAISE EXCEPTION 'Solo se puede retirar una evidencia previamente publicada.' USING ERRCODE = '23514';
    END IF;
    NEW.incorporado_at := OLD.incorporado_at;
    NEW.incorporado_por := OLD.incorporado_por;
    NEW.publicacion_actualizada_at := OLD.publicacion_actualizada_at;
    NEW.publicacion_actualizada_por := OLD.publicacion_actualizada_por;
    IF NEW.estado_publicacion IS DISTINCT FROM OLD.estado_publicacion THEN
      NEW.publicacion_actualizada_at := clock_timestamp();
      NEW.publicacion_actualizada_por := actor;
    END IF;
    cambio_consentimiento := NEW.consentimiento_declarado IS DISTINCT FROM OLD.consentimiento_declarado
      OR NEW.declaracion_consentimiento IS DISTINCT FROM OLD.declaracion_consentimiento;
    IF OLD.consentimiento_declarado IS NOT NULL AND NEW.consentimiento_declarado IS NULL THEN
      RAISE EXCEPTION 'Para revocar consentimiento declare false; no elimine la declaración.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF cambio_consentimiento THEN
    NEW.consentimiento_at := clock_timestamp();
    NEW.consentimiento_por := actor;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.consentimiento_at := NULL;
    NEW.consentimiento_por := NULL;
  ELSE
    NEW.consentimiento_at := OLD.consentimiento_at;
    NEW.consentimiento_por := OLD.consentimiento_por;
  END IF;
  IF NEW.estado_carga = 'disponible' THEN
    -- Se lee el catálogo de Storage; nunca se insertan ni eliminan objetos por SQL.
    SELECT o.metadata INTO objeto_metadata FROM storage.objects o
    WHERE o.bucket_id = NEW.bucket_id AND o.name = NEW.id_accion::text || '/' || NEW.id_evidencia::text;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Primero cargue el archivo en Supabase Storage.' USING ERRCODE = '23514';
    END IF;
    IF (objeto_metadata->>'size') IS DISTINCT FROM NEW.tamano_bytes::text
       OR (objeto_metadata->>'mimetype') IS DISTINCT FROM NEW.mime_type THEN
      RAISE EXCEPTION 'El tamaño o tipo del objeto no coincide con la evidencia.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fge_private.validar_evidencia() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON public.evidencias
FOR EACH ROW EXECUTE FUNCTION fge_private.validar_evidencia();
CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.evidencias
FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.evidencias
FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_evidencia');

-- El registro archivado deja de ser visible por RLS; archivar por RPC evita
-- exigir SELECT sobre la fila resultante de UPDATE ... RETURNING.
CREATE FUNCTION public.archivar_evidencia_segura(p_id uuid,p_version bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE fila public.evidencias;
BEGIN
  SELECT * INTO fila FROM public.evidencias WHERE id_evidencia = p_id FOR UPDATE;
  IF NOT FOUND OR NOT fge_private.acceso_evidencia_accion(fila.id_accion,true) THEN
    RAISE EXCEPTION 'Evidencia no disponible o sin permiso.' USING ERRCODE = '42501';
  END IF;
  IF p_version IS NULL OR fila.version <> p_version OR fila.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'La evidencia cambió; recargue antes de archivar.' USING ERRCODE = '40001';
  END IF;
  UPDATE public.evidencias SET archived_at = clock_timestamp() WHERE id_evidencia = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.archivar_evidencia_segura(uuid,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archivar_evidencia_segura(uuid,bigint) TO authenticated;

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('fge-evidencias','fge-evidencias',false,52428800,ARRAY[
  'application/pdf','image/jpeg','image/png','image/webp',
  'audio/mpeg','audio/ogg','audio/wav','video/mp4','video/webm'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE FUNCTION fge_private.acceso_objeto_evidencia(p_bucket text,p_ruta text,p_carga boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.evidencias e
    WHERE e.bucket_id = p_bucket AND e.ruta_objeto = p_ruta AND e.archived_at IS NULL
      AND CASE WHEN p_carga THEN e.estado_carga = 'reservado'
          AND fge_private.acceso_evidencia_accion(e.id_accion,true)
        ELSE (e.estado_carga = 'disponible'
          AND fge_private.acceso_evidencia_accion(e.id_accion,false))
          OR fge_private.acceso_evidencia_accion(e.id_accion,true) END
  );
$$;
REVOKE ALL ON FUNCTION fge_private.acceso_objeto_evidencia(text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fge_private.acceso_objeto_evidencia(text,text,boolean) TO authenticated;
CREATE POLICY storage_evidencias_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'fge-evidencias' AND fge_private.acceso_objeto_evidencia(bucket_id,name,true));
CREATE POLICY storage_evidencias_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'fge-evidencias' AND fge_private.acceso_objeto_evidencia(bucket_id,name,false));
-- Sin UPDATE/DELETE: no se reemplaza el archivo que respalda una evidencia.

COMMENT ON TABLE public.evidencias IS 'Metadatos de un archivo que respalda una acción. Storage privado, consentimiento y publicación auditados.';
COMMENT ON COLUMN public.evidencias.origen IS 'Procedencia declarada del archivo (texto), no una URL firmada.';
COMMENT ON COLUMN public.evidencias.consentimiento_declarado IS 'NULL: sin declaración; true: otorgado; false: denegado o revocado.';
COMMENT ON COLUMN public.evidencias.publicado IS 'Derivado del estado; no concede acceso público al bucket.';
COMMENT ON COLUMN public.evidencias.ruta_objeto IS 'Clave estable id_accion/id_evidencia. Usar Storage API; nunca guardar URLs firmadas.';
NOTIFY pgrst, 'reload schema';
COMMIT;
