BEGIN;

GRANT SELECT, INSERT, UPDATE ON public.organizaciones TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
