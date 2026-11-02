BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
CREATE TEMP TABLE scrum115_resultados (
  orden integer GENERATED ALWAYS AS IDENTITY,
  resultado text
) ON COMMIT DROP;
INSERT INTO scrum115_resultados(resultado) SELECT plan(8);
INSERT INTO scrum115_resultados(resultado) SELECT has_function('public','obtener_archivo_evidencia_publicada',ARRAY['uuid'], 'Existe el resolver de publicación');
INSERT INTO scrum115_resultados(resultado) SELECT ok(NOT has_function_privilege('anon','public.obtener_archivo_evidencia_publicada(uuid)','EXECUTE'), 'anon no resuelve rutas privadas');
INSERT INTO scrum115_resultados(resultado) SELECT ok(NOT has_function_privilege('authenticated','public.obtener_archivo_evidencia_publicada(uuid)','EXECUTE'), 'Usuarios de gestión no usan el resolver privilegiado');
INSERT INTO scrum115_resultados(resultado) SELECT ok(has_function_privilege('service_role','public.obtener_archivo_evidencia_publicada(uuid)','EXECUTE'), 'El Backend puede resolver publicaciones');
INSERT INTO scrum115_resultados(resultado) SELECT is((SELECT public FROM storage.buckets WHERE id='fge-evidencias'),false,'El bucket permanece privado');
INSERT INTO scrum115_resultados(resultado) SELECT is((SELECT count(*) FROM public.obtener_archivo_evidencia_publicada('ffffffff-ffff-4fff-8fff-ffffffffffff')),0::bigint,'Una evidencia inexistente no produce un archivo');
INSERT INTO scrum115_resultados(resultado) SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.evidencias'::regclass),'La ruta institucional no deshabilita RLS');
INSERT INTO scrum115_resultados(resultado)
SELECT ok(bool_and(has_schema_privilege('service_role', esquema, 'USAGE') AND
  has_column_privilege('service_role', esquema || '.' || tabla, columna, 'SELECT')),
  'El Backend puede leer todas las columnas necesarias para ejecutar el resolver')
FROM (VALUES
  ('public','evidencias',ARRAY['id_evidencia','id_accion','bucket_id','ruta_objeto','nombre_original','mime_type','tamano_bytes','version','estado_publicacion','consentimiento_declarado','estado_carga','archived_at']),
  ('public','acciones',ARRAY['id_accion','id_plan','archived_at']),
  ('public','planes',ARRAY['id_plan','id_organizacion','archived_at']),
  ('public','organizaciones',ARRAY['id_organizacion','archived_at']),
  ('storage','buckets',ARRAY['id','public'])
) AS permisos(esquema,tabla,columnas)
CROSS JOIN LATERAL unnest(columnas) AS campos(columna);
INSERT INTO scrum115_resultados(resultado) SELECT * FROM finish();
SELECT resultado FROM scrum115_resultados ORDER BY orden;
ROLLBACK;
