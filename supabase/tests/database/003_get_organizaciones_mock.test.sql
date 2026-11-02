-- Ejecutar solamente en Supabase LOCAL de pruebas. Todo se revierte.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

SELECT ok(
  to_regprocedure('public.get_organizaciones_mock(text)') IS NOT NULL,
  'Existe la RPC get_organizaciones_mock'
);
SELECT is(
  (SELECT count(*) FROM public.get_organizaciones_mock('todos')),
  3::bigint,
  'El filtro todos devuelve las tres organizaciones de demostración'
);
SELECT is(
  (SELECT count(*) FROM public.get_organizaciones_mock('activo')),
  2::bigint,
  'El filtro activo devuelve dos organizaciones'
);
SELECT is(
  (SELECT count(*) FROM public.get_organizaciones_mock('inactivo')),
  1::bigint,
  'El filtro inactivo devuelve una organización'
);
SELECT throws_ok(
  $$SELECT * FROM public.get_organizaciones_mock('pendiente')$$,
  '22023',
  'estado_filtro debe ser activo, inactivo o todos',
  'Se rechaza un estado no permitido'
);
SELECT ok(
  has_function_privilege('anon', 'public.get_organizaciones_mock(text)', 'EXECUTE'),
  'Anon puede ejecutar la RPC'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.get_organizaciones_mock(text)', 'EXECUTE'),
  'Authenticated no recibe permisos por esta integración anónima'
);
SET LOCAL ROLE anon;
SELECT lives_ok(
  $$SELECT * FROM public.get_organizaciones_mock('todos')$$,
  'Anon puede consumir la RPC'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
