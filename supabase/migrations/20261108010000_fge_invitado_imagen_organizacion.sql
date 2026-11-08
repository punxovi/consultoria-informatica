BEGIN;

DROP POLICY IF EXISTS archivos_imagen_organizacion_lectura ON public.archivos;
CREATE POLICY archivos_imagen_organizacion_lectura ON public.archivos FOR SELECT TO authenticated
USING (id_organizacion IS NOT NULL AND categoria = 'imagen_organizacion'
  AND fge_private.usuario_puede_consultar_organizacion(id_organizacion));

DROP POLICY IF EXISTS storage_imagen_organizacion_lectura ON storage.objects;
CREATE POLICY storage_imagen_organizacion_lectura ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'fge-archivos'
  AND name LIKE 'organizaciones/%/imagen/%'
  AND CASE
    WHEN split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN fge_private.usuario_puede_consultar_organizacion(split_part(name, '/', 2)::uuid)
    ELSE false
  END);

NOTIFY pgrst, 'reload schema';
COMMIT;
