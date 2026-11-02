BEGIN;

ALTER TABLE public.actas
  RENAME COLUMN fecha TO fecha_reunion;

ALTER TABLE public.actas
  RENAME COLUMN notas TO observaciones;

ALTER TABLE public.actas
  ALTER COLUMN id_accion DROP NOT NULL;

ALTER TABLE public.actas
  ADD COLUMN id_organizacion uuid REFERENCES public.organizaciones(id_organizacion) ON DELETE RESTRICT,
  ADD COLUMN id_plan uuid REFERENCES public.planes(id_plan) ON DELETE RESTRICT,
  ADD COLUMN asistentes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN asistentes_externos text NOT NULL DEFAULT '';

-- Validar que estén los foráneos esenciales para el frontend
ALTER TABLE public.actas
  ADD CONSTRAINT actas_organizacion_req CHECK (id_organizacion IS NOT NULL),
  ADD CONSTRAINT actas_plan_req CHECK (id_plan IS NOT NULL);

-- Como cambiamos nombre a 'observaciones', también ajustemos restricciones de longitud si corresponde
ALTER TABLE public.actas
  ADD CONSTRAINT actas_observaciones_len CHECK (observaciones IS NULL OR length(observaciones) <= 2000),
  ADD CONSTRAINT actas_objetivo_len CHECK (length(objetivo) <= 1000),
  ADD CONSTRAINT actas_asistentes_ext_len CHECK (length(asistentes_externos) <= 500);

CREATE INDEX actas_organizacion_idx
  ON public.actas(id_organizacion) WHERE archived_at IS NULL;

CREATE INDEX actas_plan_idx
  ON public.actas(id_plan) WHERE archived_at IS NULL;

NOTIFY pgrst, 'reload schema';
COMMIT;
