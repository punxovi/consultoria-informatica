BEGIN;

UPDATE storage.buckets
SET
  file_size_limit = 614400,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'fge-archivos';

CREATE OR REPLACE FUNCTION fge_private.usuario_tiene_rol(codigos text[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.asignaciones_roles asignacion
    JOIN public.roles rol ON rol.id_rol = asignacion.id_rol
    WHERE asignacion.id_usuario = auth.uid()
      AND asignacion.revocado_at IS NULL
      AND rol.activo = true
      AND rol.codigo = ANY(codigos)
  );
$$;

REVOKE ALL ON FUNCTION fge_private.usuario_tiene_rol(text[]) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA fge_private TO authenticated;
GRANT EXECUTE ON FUNCTION fge_private.usuario_tiene_rol(text[]) TO authenticated;

ALTER TABLE public.archivos
  ADD CONSTRAINT archivos_imagen_programa_webp_chk
  CHECK (
    categoria <> 'imagen_programa'
    OR (
      id_programa IS NOT NULL
      AND bucket_id = 'fge-archivos'
      AND mime_type = 'image/webp'
      AND (tamano_bytes IS NULL OR tamano_bytes <= 614400)
      AND lower(ruta_objeto) LIKE 'programas/%.webp'
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.programas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.archivos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;

CREATE POLICY programas_lectura_roles
ON public.programas
FOR SELECT
TO authenticated
USING (fge_private.usuario_tiene_rol(ARRAY['ADMIN', 'COORD', 'INVIT']));

CREATE POLICY programas_admin_insert
ON public.programas
FOR INSERT
TO authenticated
WITH CHECK (fge_private.usuario_tiene_rol(ARRAY['ADMIN']));

CREATE POLICY programas_admin_update
ON public.programas
FOR UPDATE
TO authenticated
USING (fge_private.usuario_tiene_rol(ARRAY['ADMIN']))
WITH CHECK (fge_private.usuario_tiene_rol(ARRAY['ADMIN']));

CREATE POLICY archivos_imagen_programa_lectura_roles
ON public.archivos
FOR SELECT
TO authenticated
USING (
  id_programa IS NOT NULL
  AND categoria = 'imagen_programa'
  AND fge_private.usuario_tiene_rol(ARRAY['ADMIN', 'COORD', 'INVIT'])
);

CREATE POLICY archivos_imagen_programa_admin_insert
ON public.archivos
FOR INSERT
TO authenticated
WITH CHECK (
  id_programa IS NOT NULL
  AND categoria = 'imagen_programa'
  AND fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
);

CREATE POLICY archivos_imagen_programa_admin_update
ON public.archivos
FOR UPDATE
TO authenticated
USING (
  id_programa IS NOT NULL
  AND categoria = 'imagen_programa'
  AND fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
)
WITH CHECK (
  id_programa IS NOT NULL
  AND categoria = 'imagen_programa'
  AND fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
);

CREATE POLICY storage_programas_lectura_roles
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'fge-archivos'
  AND name LIKE 'programas/%'
  AND fge_private.usuario_tiene_rol(ARRAY['ADMIN', 'COORD', 'INVIT'])
);

CREATE POLICY storage_programas_admin_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'fge-archivos'
  AND name LIKE 'programas/%'
  AND lower(name) LIKE '%.webp'
  AND fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
);

CREATE POLICY storage_programas_admin_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'fge-archivos'
  AND name LIKE 'programas/%'
  AND fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
)
WITH CHECK (
  bucket_id = 'fge-archivos'
  AND name LIKE 'programas/%'
  AND lower(name) LIKE '%.webp'
  AND fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
);

CREATE POLICY storage_programas_admin_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'fge-archivos'
  AND name LIKE 'programas/%'
  AND fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
);

COMMIT;
