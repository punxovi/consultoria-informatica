-- Compatibilidad con el esquema existente de Supabase.
-- permisos_temporales_historial usa id y created_at como nombres físicos.
-- Esta migration solo corrige la función instalada; no modifica registros.
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
