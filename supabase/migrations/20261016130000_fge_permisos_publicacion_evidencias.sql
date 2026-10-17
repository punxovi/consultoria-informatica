BEGIN;

GRANT USAGE ON SCHEMA public, storage TO service_role;
GRANT SELECT (
  id_evidencia, id_accion, bucket_id, ruta_objeto, nombre_original, mime_type,
  tamano_bytes, version, estado_publicacion, consentimiento_declarado,
  estado_carga, archived_at
) ON public.evidencias TO service_role;
GRANT SELECT (id_accion, id_plan, archived_at) ON public.acciones TO service_role;
GRANT SELECT (id_plan, id_organizacion, archived_at) ON public.planes TO service_role;
GRANT SELECT (id_organizacion, archived_at) ON public.organizaciones TO service_role;
GRANT SELECT (id, public) ON storage.buckets TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
