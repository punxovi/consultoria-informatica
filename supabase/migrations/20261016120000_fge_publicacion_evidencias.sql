BEGIN;

CREATE OR REPLACE FUNCTION public.obtener_archivo_evidencia_publicada(p_id uuid)
RETURNS TABLE (
  bucket_id text, ruta_objeto text, nombre_original text,
  mime_type text, tamano_bytes bigint, version bigint
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT e.bucket_id, e.ruta_objeto, e.nombre_original, e.mime_type, e.tamano_bytes, e.version
  FROM public.evidencias e
  JOIN public.acciones a ON a.id_accion = e.id_accion
  JOIN public.planes p ON p.id_plan = a.id_plan
  JOIN public.organizaciones o ON o.id_organizacion = p.id_organizacion
  JOIN storage.buckets b ON b.id = e.bucket_id AND b.public = false
  WHERE e.id_evidencia = p_id
    AND e.estado_publicacion = 'publicada'
    AND e.consentimiento_declarado IS TRUE
    AND e.estado_carga = 'disponible'
    AND e.archived_at IS NULL AND a.archived_at IS NULL
    AND p.archived_at IS NULL AND o.archived_at IS NULL
    AND e.bucket_id = 'fge-evidencias';
$$;

REVOKE ALL ON FUNCTION public.obtener_archivo_evidencia_publicada(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_archivo_evidencia_publicada(uuid) TO service_role;
COMMENT ON FUNCTION public.obtener_archivo_evidencia_publicada(uuid)
  IS 'Consulta exclusiva del Backend para la ruta institucional de evidencias. Verifica publicación y consentimiento vigentes.';
NOTIFY pgrst, 'reload schema';
COMMIT;
