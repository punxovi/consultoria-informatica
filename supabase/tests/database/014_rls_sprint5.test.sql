BEGIN;
SELECT plan(6);

SELECT policies_are(
  'public', 'diagnosticos',
  ARRAY['diagnosticos_lectura', 'diagnosticos_insert', 'diagnosticos_update'],
  'La tabla diagnosticos debe tener las políticas requeridas'
);

SELECT policies_are(
  'public', 'actas',
  ARRAY['actas_lectura', 'actas_insert', 'actas_update'],
  'La tabla actas debe tener las políticas requeridas'
);

SELECT policies_are(
  'public', 'compromisos',
  ARRAY['compromisos_lectura', 'compromisos_insert', 'compromisos_update'],
  'La tabla compromisos debe tener las políticas requeridas'
);

SET LOCAL ROLE anon;

PREPARE anon_select_diag AS SELECT 1 FROM public.diagnosticos;
SELECT throws_ok('anon_select_diag', '42501', NULL, 'anon no debe tener permiso SELECT en diagnosticos');

PREPARE anon_select_actas AS SELECT 1 FROM public.actas;
SELECT throws_ok('anon_select_actas', '42501', NULL, 'anon no debe tener permiso SELECT en actas');

PREPARE anon_select_comp AS SELECT 1 FROM public.compromisos;
SELECT throws_ok('anon_select_comp', '42501', NULL, 'anon no debe tener permiso SELECT en compromisos');

SELECT * FROM finish();
ROLLBACK;
