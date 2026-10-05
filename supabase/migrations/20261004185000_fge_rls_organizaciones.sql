-- Habilita la inserción y actualización de organizaciones mediante RLS.
-- El Administrador puede gestionar en cualquier país.
-- El Coordinador solo puede gestionar en los países donde tiene cobertura.

BEGIN;

DROP POLICY IF EXISTS organizaciones_gestion_insert ON public.organizaciones;
CREATE POLICY organizaciones_gestion_insert
ON public.organizaciones
FOR INSERT
TO authenticated
WITH CHECK (
  fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
  OR (
    fge_private.usuario_tiene_rol(ARRAY['COORD'])
    AND fge_private.usuario_tiene_cobertura_pais(id_pais)
  )
);

DROP POLICY IF EXISTS organizaciones_gestion_update ON public.organizaciones;
CREATE POLICY organizaciones_gestion_update
ON public.organizaciones
FOR UPDATE
TO authenticated
USING (
  fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
  OR (
    fge_private.usuario_tiene_rol(ARRAY['COORD'])
    AND fge_private.usuario_tiene_cobertura_pais(id_pais)
  )
)
WITH CHECK (
  fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
  OR (
    fge_private.usuario_tiene_rol(ARRAY['COORD'])
    AND fge_private.usuario_tiene_cobertura_pais(id_pais)
  )
);

COMMIT;
