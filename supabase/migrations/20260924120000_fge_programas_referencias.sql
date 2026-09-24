BEGIN;

ALTER TABLE public.programas
  ADD COLUMN referencias_ods text NOT NULL DEFAULT '' CHECK (char_length(referencias_ods) <= 2000),
  ADD COLUMN referencias_esg text NOT NULL DEFAULT '' CHECK (char_length(referencias_esg) <= 2000);

COMMENT ON COLUMN public.programas.referencias_ods IS 'Referencias ODS opcionales del programa institucional (KAN-166).';
COMMENT ON COLUMN public.programas.referencias_esg IS 'Referencias ESG opcionales del programa institucional (KAN-166).';

COMMIT;
