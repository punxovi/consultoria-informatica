BEGIN;
DO $$
BEGIN
 IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
   REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
 END IF;
END;
$$;
CREATE INDEX historial_asignacion_idx ON fge_private.historial_cambios(id_asignacion);
CREATE INDEX historial_permiso_temporal_idx ON fge_private.historial_cambios(id_permiso_temporal);
COMMIT;
