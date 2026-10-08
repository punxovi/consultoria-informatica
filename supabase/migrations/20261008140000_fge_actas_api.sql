BEGIN;

-- Las políticas RLS del Sprint 5 ya limitan cada fila por Organización. Este
-- permiso habilita únicamente las operaciones que utiliza el servicio Backend.
GRANT SELECT, INSERT, UPDATE ON TABLE public.actas TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
