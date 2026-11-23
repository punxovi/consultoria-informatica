BEGIN;
SELECT plan(6);

SELECT policies_are(
  'public', 'evidencias',
  ARRAY['evidencias_lectura', 'evidencias_creacion', 'evidencias_edicion'],
  'La tabla evidencias debe tener las políticas requeridas'
);

SELECT policies_are(
  'public', 'indicadores',
  ARRAY['indicadores_lectura', 'indicadores_insert', 'indicadores_update'],
  'La tabla indicadores debe tener las políticas requeridas'
);

SELECT policies_are(
  'public', 'resultados',
  ARRAY['resultados_lectura', 'resultados_insert', 'resultados_update'],
  'La tabla resultados debe tener las políticas requeridas'
);

SET LOCAL ROLE anon;

PREPARE anon_select_evidencias AS SELECT 1 FROM public.evidencias;
SELECT throws_ok('anon_select_evidencias', '42501', NULL, 'anon no debe tener permiso SELECT en evidencias');

PREPARE anon_select_indicadores AS SELECT 1 FROM public.indicadores;
SELECT throws_ok('anon_select_indicadores', '42501', NULL, 'anon no debe tener permiso SELECT en indicadores');

PREPARE anon_select_resultados AS SELECT 1 FROM public.resultados;
SELECT throws_ok('anon_select_resultados', '42501', NULL, 'anon no debe tener permiso SELECT en resultados');

SELECT * FROM finish();
ROLLBACK;
