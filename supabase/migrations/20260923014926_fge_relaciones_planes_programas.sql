BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.planes AS plan
    JOIN public.programas AS programa USING (id_programa)
    WHERE programa.id_organizacion = '15800000-0000-4000-8000-000000000000'
  ) THEN
    RAISE EXCEPTION 'Hay planes asociados a la organización ficticia: requieren asignación manual antes de migrar';
  END IF;
END;
$$;

ALTER TABLE public.planes ADD COLUMN id_organizacion uuid;

UPDATE public.planes AS plan
SET id_organizacion = programa.id_organizacion
FROM public.programas AS programa
WHERE plan.id_programa = programa.id_programa;

ALTER TABLE public.planes
  ALTER COLUMN id_organizacion SET NOT NULL,
  ADD CONSTRAINT planes_id_organizacion_fkey
    FOREIGN KEY (id_organizacion)
    REFERENCES public.organizaciones(id_organizacion) ON DELETE RESTRICT;

CREATE INDEX planes_id_organizacion_fk_idx
  ON public.planes (id_organizacion);

ALTER TABLE public.programas DROP COLUMN id_organizacion;

DELETE FROM public.organizaciones
WHERE id_organizacion = '15800000-0000-4000-8000-000000000000'
  AND nombre = 'Organización temporal FGE (FICTICIA)';

COMMIT;
