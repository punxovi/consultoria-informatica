BEGIN;
SELECT plan(8);

-- 1. Verificamos que RLS está habilitada en donaciones
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.donaciones'::regclass), 'RLS habilitada: donaciones');

-- 2. Verificamos políticas en donaciones
SELECT has_policy('public', 'donaciones', 'donaciones_lectura', 'Existe política donaciones_lectura');
SELECT has_policy('public', 'donaciones', 'donaciones_insert', 'Existe política donaciones_insert');
SELECT has_policy('public', 'donaciones', 'donaciones_update', 'Existe política donaciones_update');

-- 3. Verificamos políticas en archivos para donaciones
SELECT has_policy('public', 'archivos', 'archivos_donacion_lectura', 'Existe política archivos_donacion_lectura');
SELECT has_policy('public', 'archivos', 'archivos_donacion_insert', 'Existe política archivos_donacion_insert');
SELECT has_policy('public', 'archivos', 'archivos_donacion_update', 'Existe política archivos_donacion_update');

-- 4. Pruebas de acceso anon denegado
SET LOCAL ROLE anon;
PREPARE anon_select_donaciones AS SELECT 1 FROM public.donaciones;
SELECT throws_ok('anon_select_donaciones', '42501', NULL, 'anon no tiene permiso SELECT en donaciones');

SELECT * FROM finish();
ROLLBACK;
