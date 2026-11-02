-- Alternativa de preparación a 20261008121000 cuando hay actas históricas.
-- Conserva los registros y deriva organización/plan de su acción original.
-- Ejecutar desde SQL Editor antes de 20261010120000_fge_actas_integracion.sql.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='actas' AND column_name='fecha') THEN
    ALTER TABLE public.actas RENAME COLUMN fecha TO fecha_reunion;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='actas' AND column_name='notas') THEN
    ALTER TABLE public.actas RENAME COLUMN notas TO observaciones;
  END IF;
END $$;
ALTER TABLE public.actas ALTER COLUMN id_accion DROP NOT NULL;
ALTER TABLE public.actas
  ADD COLUMN IF NOT EXISTS id_organizacion uuid REFERENCES public.organizaciones(id_organizacion) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS id_plan uuid REFERENCES public.planes(id_plan) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS asistentes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS asistentes_externos text NOT NULL DEFAULT '';
UPDATE public.actas a SET id_plan=coalesce(a.id_plan,x.id_plan),id_organizacion=coalesce(a.id_organizacion,p.id_organizacion)
FROM public.acciones x JOIN public.planes p ON p.id_plan=x.id_plan
WHERE a.id_accion=x.id_accion AND (a.id_plan IS NULL OR a.id_organizacion IS NULL);
-- Conservar los nombres ya registrados en la estructura original de participantes.
UPDATE public.actas a SET asistentes=ARRAY(
  SELECT DISTINCT btrim(p.nombre_registrado) FROM public.acta_participantes p
  WHERE p.id_acta=a.id_acta AND p.archived_at IS NULL ORDER BY btrim(p.nombre_registrado)
) WHERE cardinality(a.asistentes)=0 AND EXISTS (
  SELECT 1 FROM public.acta_participantes p WHERE p.id_acta=a.id_acta AND p.archived_at IS NULL
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.actas WHERE id_plan IS NULL OR id_organizacion IS NULL) THEN
    RAISE EXCEPTION 'Hay actas sin una acción que permita determinar plan y organización. La preparación se revierte: revisa los vínculos reales.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.actas'::regclass AND conname='actas_organizacion_req') THEN
    ALTER TABLE public.actas ADD CONSTRAINT actas_organizacion_req CHECK (id_organizacion IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.actas'::regclass AND conname='actas_plan_req') THEN
    ALTER TABLE public.actas ADD CONSTRAINT actas_plan_req CHECK (id_plan IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.actas'::regclass AND conname='actas_observaciones_len') THEN
    ALTER TABLE public.actas ADD CONSTRAINT actas_observaciones_len CHECK (observaciones IS NULL OR length(observaciones)<=2000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.actas'::regclass AND conname='actas_objetivo_len') THEN
    ALTER TABLE public.actas ADD CONSTRAINT actas_objetivo_len CHECK (length(objetivo)<=1000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.actas'::regclass AND conname='actas_asistentes_ext_len') THEN
    ALTER TABLE public.actas ADD CONSTRAINT actas_asistentes_ext_len CHECK (length(asistentes_externos)<=500);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS actas_organizacion_idx ON public.actas(id_organizacion) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS actas_plan_idx ON public.actas(id_plan) WHERE archived_at IS NULL;
NOTIFY pgrst, 'reload schema';
COMMIT;
