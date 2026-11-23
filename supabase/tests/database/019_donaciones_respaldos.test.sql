BEGIN;
SELECT plan(8);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.donaciones'::regclass), 'RLS habilitada: donaciones');

SELECT has_policy('public', 'donaciones', 'donaciones_lectura', 'Existe política donaciones_lectura');
SELECT has_policy('public', 'donaciones', 'donaciones_insert', 'Existe política donaciones_insert');
SELECT has_policy('public', 'donaciones', 'donaciones_update', 'Existe política donaciones_update');

SELECT has_policy('public', 'archivos', 'archivos_donacion_lectura', 'Existe política archivos_donacion_lectura');
SELECT has_policy('public', 'archivos', 'archivos_donacion_insert', 'Existe política archivos_donacion_insert');
SELECT has_policy('public', 'archivos', 'archivos_donacion_update', 'Existe política archivos_donacion_update');

SET LOCAL ROLE anon;
PREPARE anon_select_donaciones AS SELECT 1 FROM public.donaciones;
SELECT throws_ok('anon_select_donaciones', '42501', NULL, 'anon no tiene permiso SELECT en donaciones');

SELECT * FROM finish();
ROLLBACK;
