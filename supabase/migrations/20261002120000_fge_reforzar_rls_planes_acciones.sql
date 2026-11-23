BEGIN;

CREATE OR REPLACE FUNCTION fge_private.usuario_tiene_cobertura_pais(
  p_id_pais uuid
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.permisos_temporales AS cobertura
    WHERE cobertura.id_usuario_beneficiario = auth.uid()
      AND cobertura.id_pais = p_id_pais
      AND cobertura.revocado_at IS NULL
      AND cobertura.archived_at IS NULL
      AND now() >= cobertura.inicio_at
      AND now() <= cobertura.fin_at
  );
$$;

CREATE OR REPLACE FUNCTION fge_private.usuario_puede_consultar_organizacion(
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
     AND asignacion.archived_at IS NULL
    JOIN public.roles AS rol
      ON rol.id_rol = asignacion.id_rol
     AND rol.activo = true
     AND rol.archived_at IS NULL
    WHERE organizacion.id_organizacion = p_id_organizacion
      AND organizacion.archived_at IS NULL
      AND (
        rol.codigo IN ('ADMIN', 'COORD')
        OR (
          rol.codigo = 'INVIT'
          AND (
            asignacion.alcance = 'global'
            OR asignacion.id_pais = organizacion.id_pais
          )
        )
      )
  );
$$;

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
     AND asignacion.archived_at IS NULL
    JOIN public.roles AS rol
      ON rol.id_rol = asignacion.id_rol
     AND rol.activo = true
     AND rol.archived_at IS NULL
    WHERE organizacion.id_organizacion = p_id_organizacion
      AND organizacion.archived_at IS NULL
      AND (
        rol.codigo = 'ADMIN'
        OR (
          rol.codigo = 'COORD'
          AND (
            asignacion.alcance = 'global'
            OR asignacion.id_pais = organizacion.id_pais
            OR fge_private.usuario_tiene_cobertura_pais(organizacion.id_pais)
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION fge_private.usuario_tiene_cobertura_pais(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fge_private.usuario_puede_consultar_organizacion(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fge_private.usuario_puede_gestionar_organizacion(uuid)
  FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA fge_private TO authenticated;
GRANT EXECUTE ON FUNCTION fge_private.usuario_tiene_cobertura_pais(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION fge_private.usuario_puede_consultar_organizacion(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION fge_private.usuario_puede_gestionar_organizacion(uuid)
  TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.planes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.acciones TO authenticated;

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
    AND fge_private.usuario_puede_consultar_organizacion(id_organizacion)
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
    AND EXISTS (
      SELECT 1
      FROM public.planes AS plan
      WHERE plan.id_plan = acciones.id_plan
        AND plan.archived_at IS NULL
        AND fge_private.usuario_puede_consultar_organizacion(plan.id_organizacion)
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

NOTIFY pgrst, 'reload schema';
COMMIT;
