BEGIN;

UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
WHERE id = 'fge-archivos';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'fge-archivos') THEN
    RAISE EXCEPTION 'No existe el bucket privado fge-archivos requerido por Donaciones.';
  END IF;
END;
$$;

COMMIT;
