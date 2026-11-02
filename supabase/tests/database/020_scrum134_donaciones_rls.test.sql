BEGIN;
SELECT plan(10);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.donaciones'::regclass),
  'Donaciones mantiene RLS habilitada');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.archivos'::regclass),
  'Archivos mantiene RLS habilitada');
SELECT has_function('fge_private', 'usuario_puede_consultar_donacion', ARRAY['uuid'],
  'Existe autorización de lectura de Donaciones con cobertura');
SELECT has_policy('public', 'donaciones', 'donaciones_lectura',
  'La lectura de Donaciones está restringida');
SELECT has_policy('public', 'donaciones', 'donaciones_insert',
  'La creación de Donaciones está restringida');
SELECT has_policy('public', 'donaciones', 'donaciones_update',
  'La modificación de Donaciones está restringida');
SELECT has_policy('public', 'archivos', 'archivos_donacion_lectura',
  'La lectura de respaldos está restringida');
SELECT has_policy('storage', 'objects', 'storage_donaciones_lectura',
  'La lectura de objetos de respaldo está restringida');
SELECT has_policy('storage', 'objects', 'storage_donaciones_insert',
  'La carga de objetos de respaldo está restringida');
SELECT ok(
  (SELECT count(*) = 1
   FROM pg_trigger
   WHERE tgname = 'auditar'
     AND tgrelid = 'public.donaciones'::regclass),
  'Donaciones usa el trigger institucional de auditoría');

SELECT * FROM finish();
ROLLBACK;
