-- Los programas son un catálogo institucional de FGE. La organización de una
-- intervención pertenece al plan, no al programa. No se altera el UUID ni el
-- contenido de los programas y sus archivos siguen apuntando a id_programa.
BEGIN;

-- No es posible inferir la organización real de un plan asociado al registro
-- ficticio. Detener toda la migración si alguien creó uno desde la auditoría.
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

-- Si existen planes bajo organizaciones reales en algún entorno, conservar su
-- asociación antes de retirar la columna antigua de programas.
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

-- El registro de desarrollo ya no tiene razón de existir. El UUID y el nombre
-- exactos evitan borrar otra organización; las FK RESTRICT impiden el borrado
-- y revierten toda la transacción si algún dato nuevo depende de ella.
DELETE FROM public.organizaciones
WHERE id_organizacion = '15800000-0000-4000-8000-000000000000'
  AND nombre = 'Organización temporal FGE (FICTICIA)';

COMMIT;
