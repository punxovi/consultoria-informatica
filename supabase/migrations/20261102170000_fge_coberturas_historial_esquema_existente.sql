BEGIN;

DO $$
DECLARE
  definicion text;
BEGIN
  SELECT pg_get_functiondef(
    'public.administrar_coberturas(text,jsonb)'::regprocedure
  ) INTO definicion;

  IF definicion IS NULL THEN
    RAISE EXCEPTION 'No existe public.administrar_coberturas(text,jsonb).';
  END IF;

  definicion := replace(definicion, 'historial.id_historial', 'historial.id');
  definicion := replace(definicion, 'historial.accion_at', 'historial.created_at');

  EXECUTE definicion;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
