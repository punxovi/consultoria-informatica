-- SCRUM-180: el destino de un traslado de Organización debe estar autorizado.
BEGIN;

-- USING conserva la autorización sobre la fila de origen. WITH CHECK no vuelve
-- a resolver la Organización por UUID: valida explícitamente el nuevo país.
DROP POLICY IF EXISTS organizaciones_gestion_update ON public.organizaciones;
CREATE POLICY organizaciones_gestion_update
ON public.organizaciones
FOR UPDATE
TO authenticated
USING (fge_private.usuario_puede_gestionar_organizacion(id_organizacion))
WITH CHECK (fge_private.usuario_puede_gestionar_pais(id_pais));

NOTIFY pgrst, 'reload schema';
COMMIT;
