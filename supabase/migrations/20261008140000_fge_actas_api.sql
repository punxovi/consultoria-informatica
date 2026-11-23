BEGIN;

GRANT SELECT, INSERT, UPDATE ON TABLE public.actas TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
