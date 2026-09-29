-- Acceso de las Astro Actions de Planes. Las consultas respetan RLS y las
-- escrituras se limitan al Administrador o Coordinador autorizado por país.
BEGIN;

CREATE OR REPLACE FUNCTION fge_private.usuario_puede_gestionar_organizacion(
  p_id_organizacion uuid
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizaciones AS organizacion
    JOIN public.asignaciones_roles AS asignacion
      ON asignacion.id_usuario = auth.uid()
     AND asignacion.revocado_at IS NULL
    JOIN public.roles AS rol
      ON rol.id_rol = asignacion.id_rol
     AND rol.activo = true
    WHERE organizacion.id_organizacion = p_id_organizacion
      AND organizacion.archived_at IS NULL
      AND (
        rol.codigo = 'ADMIN'
        OR (
          rol.codigo = 'COORD'
          AND (
            asignacion.alcance = 'global'
            OR asignacion.id_pais = organizacion.id_pais
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION fge_private.usuario_puede_gestionar_organizacion(uuid)
  FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA fge_private TO authenticated;
GRANT EXECUTE ON FUNCTION fge_private.usuario_puede_gestionar_organizacion(uuid)
  TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.planes TO authenticated;

DROP POLICY IF EXISTS planes_lectura_roles ON public.planes;
DROP POLICY IF EXISTS planes_gestion_insert ON public.planes;
DROP POLICY IF EXISTS planes_gestion_update ON public.planes;

CREATE POLICY planes_lectura_roles
ON public.planes
FOR SELECT
TO authenticated
USING (
  fge_private.usuario_tiene_rol(ARRAY['ADMIN'])
  OR (
    archived_at IS NULL
    AND fge_private.usuario_tiene_rol(ARRAY['COORD', 'INVIT'])
  )
);

CREATE POLICY planes_gestion_insert
ON public.planes
FOR INSERT
TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
  AND EXISTS (
    SELECT 1
    FROM public.programas AS programa
    WHERE programa.id_programa = planes.id_programa
      AND programa.archived_at IS NULL
  )
);

CREATE POLICY planes_gestion_update
ON public.planes
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
)
WITH CHECK (
  archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
  AND EXISTS (
    SELECT 1
    FROM public.programas AS programa
    WHERE programa.id_programa = planes.id_programa
      AND programa.archived_at IS NULL
  )
);

COMMIT;
