-- Restablece los privilegios de Data API requeridos por el guardado de
-- Programas. RLS continúa decidiendo qué filas puede leer o modificar cada rol.
BEGIN;

GRANT USAGE ON SCHEMA public, fge_private TO authenticated;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.programas
TO authenticated;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.programa_lineas_accion
TO authenticated;

GRANT EXECUTE
ON FUNCTION fge_private.usuario_tiene_rol(text[])
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.guardar_programa_completo(jsonb, uuid, bigint)
TO authenticated;

COMMIT;
