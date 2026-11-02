-- Ejecutar completa en SQL Editor después de la migración SCRUM-118.
-- Verifica instalación y permisos; el flujo autenticado se prueba desde el navegador.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
CREATE TEMP TABLE scrum118_resultados (
  orden integer GENERATED ALWAYS AS IDENTITY,
  resultado text
) ON COMMIT DROP;
INSERT INTO scrum118_resultados(resultado) SELECT plan(15);
INSERT INTO scrum118_resultados(resultado) SELECT has_column('public','indicadores','id_catalogo','La asociación conserva la referencia al catálogo');
INSERT INTO scrum118_resultados(resultado) SELECT has_function('public','consultar_catalogo_indicadores',ARRAY[]::text[],'Existe la consulta del catálogo');
INSERT INTO scrum118_resultados(resultado) SELECT has_function('public','listar_indicadores_accion',ARRAY['uuid'],'Existe la consulta por Acción');
INSERT INTO scrum118_resultados(resultado) SELECT has_function('public','asociar_indicadores_accion',ARRAY['uuid','jsonb'],'Existe la asociación atómica');
INSERT INTO scrum118_resultados(resultado) SELECT has_function('public','actualizar_meta_indicador',ARRAY['uuid','bigint','numeric'],'Existe la actualización de metas');
INSERT INTO scrum118_resultados(resultado) SELECT has_function('public','guardar_resultado_indicador',ARRAY['uuid','numeric','date','text','uuid','bigint'],'Existe el guardado de resultados');
INSERT INTO scrum118_resultados(resultado)
SELECT ok(count(*) = 5 AND bool_and(NOT prosecdef), 'Las cinco operaciones ejecutan con los permisos del usuario')
FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
  ('consultar_catalogo_indicadores','listar_indicadores_accion','asociar_indicadores_accion','actualizar_meta_indicador','guardar_resultado_indicador');
INSERT INTO scrum118_resultados(resultado)
SELECT ok(bool_and(NOT has_function_privilege('anon', oid, 'EXECUTE')), 'anon no puede ejecutar las operaciones')
FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
  ('consultar_catalogo_indicadores','listar_indicadores_accion','asociar_indicadores_accion','actualizar_meta_indicador','guardar_resultado_indicador');
INSERT INTO scrum118_resultados(resultado)
SELECT ok(bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')), 'Las sesiones autenticadas pueden ejecutar las operaciones bajo RLS')
FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
  ('consultar_catalogo_indicadores','listar_indicadores_accion','asociar_indicadores_accion','actualizar_meta_indicador','guardar_resultado_indicador');
INSERT INTO scrum118_resultados(resultado)
SELECT ok(bool_and(relrowsecurity), 'RLS sigue habilitada en indicadores y resultados')
FROM pg_class WHERE oid IN ('public.indicadores'::regclass,'public.resultados'::regclass);
INSERT INTO scrum118_resultados(resultado)
SELECT ok(EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.indicadores_accion_catalogo_activo_idx') AND indisunique), 'No se permiten asociaciones activas duplicadas');
INSERT INTO scrum118_resultados(resultado)
SELECT ok((SELECT count(*)=2 FROM pg_trigger WHERE tgname IN ('proteger_relacion_indicador','proteger_relacion_resultado') AND tgenabled='O'), 'Las relaciones están protegidas contra cambios');
INSERT INTO scrum118_resultados(resultado)
SELECT ok(NOT attnotnull, 'El catálogo permite indicadores sin Acción')
FROM pg_attribute WHERE attrelid='public.indicadores'::regclass AND attname='id_accion';
INSERT INTO scrum118_resultados(resultado)
SELECT has_function('fge_private','acceso_indicador_accion',ARRAY['uuid','boolean'],'Existe el control de acceso de Sprint 6');
INSERT INTO scrum118_resultados(resultado)
SELECT ok(count(*)=6, 'Están instaladas las seis políticas de lectura y escritura de Sprint 6')
FROM pg_policies WHERE schemaname='public' AND
  ((tablename='indicadores' AND policyname IN ('indicadores_lectura','indicadores_insert','indicadores_update'))
  OR (tablename='resultados' AND policyname IN ('resultados_lectura','resultados_insert','resultados_update')));
INSERT INTO scrum118_resultados(resultado) SELECT * FROM finish();
SELECT resultado FROM scrum118_resultados ORDER BY orden;
ROLLBACK;
