-- Acceso de las Astro Actions de Acciones asociadas a Planes.
BEGIN;

GRANT SELECT, INSERT, UPDATE ON TABLE public.acciones TO authenticated;

DROP POLICY IF EXISTS acciones_lectura_roles ON public.acciones;
DROP POLICY IF EXISTS acciones_gestion_insert ON public.acciones;
DROP POLICY IF EXISTS acciones_gestion_update ON public.acciones;

CREATE POLICY acciones_lectura_roles
ON public.acciones
FOR SELECT
TO authenticated
USING (
  fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
  OR (
    archived_at IS NULL
    AND fge_private.usuario_tiene_rol(ARRAY['COORD', 'INVIT'])
    AND EXISTS (
      SELECT 1
      FROM public.planes AS plan
      WHERE plan.id_plan = acciones.id_plan
        AND plan.archived_at IS NULL
    )
  )
);

CREATE POLICY acciones_gestion_insert
ON public.acciones
FOR INSERT
TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.planes AS plan
    WHERE plan.id_plan = acciones.id_plan
      AND plan.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(plan.id_organizacion)
  )
);

CREATE POLICY acciones_gestion_update
ON public.acciones
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.planes AS plan
    WHERE plan.id_plan = acciones.id_plan
      AND plan.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(plan.id_organizacion)
  )
)
WITH CHECK (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.planes AS plan
    WHERE plan.id_plan = acciones.id_plan
      AND plan.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(plan.id_organizacion)
  )
);

COMMIT;
