BEGIN;
SELECT plan(5);

SELECT ok(has_table_privilege('authenticated','public.actas','SELECT'), 'Backend autenticado puede consultar actas');
SELECT ok(has_table_privilege('authenticated','public.actas','INSERT'), 'Backend autenticado puede registrar actas');
SELECT ok(has_table_privilege('authenticated','public.actas','UPDATE'), 'Backend autenticado puede actualizar actas');
SELECT ok(NOT has_table_privilege('authenticated','public.actas','DELETE'), 'No se habilita eliminación física de actas');
SELECT ok(NOT has_table_privilege('anon','public.actas','SELECT'), 'Usuarios anónimos no pueden consultar actas');

SELECT * FROM finish();
ROLLBACK;
