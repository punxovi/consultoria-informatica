BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS archivos_imagen_organizacion_vigente_uq
  ON public.archivos(id_organizacion)
  WHERE id_organizacion IS NOT NULL
    AND categoria = 'imagen_organizacion'
    AND archived_at IS NULL;

ALTER TABLE public.archivos DROP CONSTRAINT IF EXISTS archivos_imagen_organizacion_chk;
ALTER TABLE public.archivos ADD CONSTRAINT archivos_imagen_organizacion_chk CHECK (
  id_organizacion IS NULL
  OR categoria <> 'imagen_organizacion'
  OR (
    bucket_id = 'fge-archivos'
    AND mime_type IN ('image/jpeg', 'image/png', 'image/webp')
    AND tamano_bytes IS NOT NULL
    AND tamano_bytes BETWEEN 1 AND 5242880
    AND ruta_objeto ~ ('^organizaciones/' || id_organizacion::text || '/imagen/[0-9a-f-]{36}\.(jpg|png|webp)$')
  )
) NOT VALID;

DROP POLICY IF EXISTS archivos_imagen_organizacion_lectura ON public.archivos;
CREATE POLICY archivos_imagen_organizacion_lectura
ON public.archivos FOR SELECT TO authenticated
USING (
  id_organizacion IS NOT NULL
  AND categoria = 'imagen_organizacion'
  AND fge_private.usuario_puede_consultar_organizacion(id_organizacion)
);

DROP POLICY IF EXISTS archivos_imagen_organizacion_insert ON public.archivos;
CREATE POLICY archivos_imagen_organizacion_insert
ON public.archivos FOR INSERT TO authenticated
WITH CHECK (
  id_organizacion IS NOT NULL
  AND categoria = 'imagen_organizacion'
  AND archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
);

DROP POLICY IF EXISTS archivos_imagen_organizacion_update ON public.archivos;
CREATE POLICY archivos_imagen_organizacion_update
ON public.archivos FOR UPDATE TO authenticated
USING (
  id_organizacion IS NOT NULL
  AND categoria = 'imagen_organizacion'
  AND archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
)
WITH CHECK (
  id_organizacion IS NOT NULL
  AND categoria = 'imagen_organizacion'
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
);

DROP POLICY IF EXISTS storage_imagen_organizacion_lectura ON storage.objects;
CREATE POLICY storage_imagen_organizacion_lectura
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'fge-archivos'
  AND name LIKE 'organizaciones/%/imagen/%'
  AND CASE
    WHEN split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN fge_private.usuario_puede_consultar_organizacion(split_part(name, '/', 2)::uuid)
    ELSE false
  END
);

DROP POLICY IF EXISTS storage_imagen_organizacion_insert ON storage.objects;
CREATE POLICY storage_imagen_organizacion_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'fge-archivos'
  AND name ~* '^organizaciones/[0-9a-f-]{36}/imagen/[0-9a-f-]{36}\.(jpg|png|webp)$'
  AND CASE
    WHEN split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN fge_private.usuario_puede_gestionar_organizacion(split_part(name, '/', 2)::uuid)
    ELSE false
  END
);

DROP POLICY IF EXISTS storage_imagen_organizacion_delete ON storage.objects;
CREATE POLICY storage_imagen_organizacion_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'fge-archivos'
  AND name LIKE 'organizaciones/%/imagen/%'
  AND CASE
    WHEN split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN fge_private.usuario_puede_gestionar_organizacion(split_part(name, '/', 2)::uuid)
    ELSE false
  END
  AND NOT EXISTS (
    SELECT 1 FROM public.archivos AS archivo
    WHERE archivo.bucket_id = 'fge-archivos'
      AND archivo.ruta_objeto = objects.name
  )
);

CREATE OR REPLACE FUNCTION public.reemplazar_imagen_organizacion(
  p_id_organizacion uuid,
  p_ruta_objeto text,
  p_nombre_original text,
  p_mime_type text,
  p_tamano_bytes bigint
) RETURNS public.archivos
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_archivo public.archivos;
BEGIN
  IF NOT fge_private.usuario_puede_gestionar_organizacion(p_id_organizacion) THEN
    RAISE EXCEPTION 'La sesión no puede gestionar esta Organización.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.archivos
  SET archived_at = now()
  WHERE id_organizacion = p_id_organizacion
    AND categoria = 'imagen_organizacion'
    AND archived_at IS NULL;

  INSERT INTO public.archivos (
    id_organizacion, bucket_id, ruta_objeto, nombre_original,
    mime_type, tamano_bytes, categoria, estado_carga
  ) VALUES (
    p_id_organizacion, 'fge-archivos', p_ruta_objeto, left(p_nombre_original, 255),
    p_mime_type, p_tamano_bytes, 'imagen_organizacion', 'disponible'
  )
  RETURNING * INTO v_archivo;

  RETURN v_archivo;
END;
$$;

REVOKE ALL ON FUNCTION public.reemplazar_imagen_organizacion(uuid, text, text, text, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reemplazar_imagen_organizacion(uuid, text, text, text, bigint)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
