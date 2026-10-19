BEGIN;
SELECT plan(5);

SELECT has_function(
  'public',
  'registrar_exportacion_reporte',
  ARRAY['text', 'jsonb'],
  'Existe la RPC de auditoría de exportaciones'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.registrar_exportacion_reporte(text,jsonb)',
    'EXECUTE'
  ),
  'Usuarios autenticados pueden registrar exportaciones mediante la RPC'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.registrar_exportacion_reporte(text,jsonb)',
    'EXECUTE'
  ),
  'Usuarios anónimos no pueden registrar exportaciones'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'fge_private.historial_cambios', 'INSERT'),
  'La auditoría no concede INSERT directo sobre el historial'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = 'public.registrar_exportacion_reporte(text,jsonb)'::regprocedure
      AND prosecdef
  ),
  'La RPC escribe mediante una función controlada SECURITY DEFINER'
);

SELECT * FROM finish();
ROLLBACK;
