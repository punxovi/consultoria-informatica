BEGIN;

DROP POLICY IF EXISTS organizaciones_gestion_update ON public.organizaciones;
CREATE POLICY organizaciones_gestion_update
ON public.organizaciones
FOR UPDATE
TO authenticated
USING (fge_private.usuario_puede_gestionar_organizacion(id_organizacion))
WITH CHECK (fge_private.usuario_puede_gestionar_pais(id_pais));

NOTIFY pgrst, 'reload schema';
COMMIT;
