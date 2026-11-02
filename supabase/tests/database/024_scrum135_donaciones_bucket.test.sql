-- Ejecutar en Supabase local. La transacciÃ³n no modifica datos persistentes.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(4);

SELECT ok(
  NOT (SELECT public FROM storage.buckets WHERE id = 'fge-archivos'),
  'El bucket de respaldos permanece privado'
);
SELECT is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'fge-archivos'),
  52428800::bigint,
  'El bucket admite el mÃ¡ximo de 50 MiB del contrato de Donaciones'
);
SELECT ok(
  (SELECT allowed_mime_types @> ARRAY['application/pdf','image/jpeg','image/png','image/webp']
   FROM storage.buckets WHERE id = 'fge-archivos'),
  'El bucket admite PDF, JPEG, PNG y WebP'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'archivos_imagen_programa_webp_chk'
  ),
  'La restricciÃ³n de imÃ¡genes WebP de Programas se conserva'
);

SELECT * FROM finish();
ROLLBACK;
