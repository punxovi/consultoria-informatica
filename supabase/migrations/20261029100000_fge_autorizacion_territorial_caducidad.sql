BEGIN;

CREATE OR REPLACE FUNCTION fge_private.usuario_tiene_cobertura_pais(
  p_id_pais uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.permisos_temporales AS cobertura
    JOIN public.paises AS pais ON pais.id_pais = cobertura.id_pais
    JOIN public.perfiles AS perfil ON perfil.id_usuario = cobertura.id_usuario_beneficiario
    WHERE cobertura.id_usuario_beneficiario = auth.uid()
      AND cobertura.id_pais = p_id_pais
      AND perfil.activo
      AND perfil.archived_at IS NULL
      AND cobertura.revocado_at IS NULL
      AND cobertura.archived_at IS NULL
      AND now() >= cobertura.inicio_at
      AND now() < (
        (
          ((cobertura.fin_at AT TIME ZONE pais.zona_horaria)::date + 1)::timestamp
        ) AT TIME ZONE pais.zona_horaria
      )
  );
$$;

CREATE OR REPLACE FUNCTION fge_private.usuario_puede_gestionar_pais(
  p_id_pais uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.asignaciones_roles AS asignacion
    JOIN public.roles AS rol ON rol.id_rol = asignacion.id_rol
      AND rol.activo AND rol.archived_at IS NULL
    JOIN public.perfiles AS perfil ON perfil.id_usuario = asignacion.id_usuario
      AND perfil.activo AND perfil.archived_at IS NULL
    WHERE asignacion.id_usuario = auth.uid()
      AND asignacion.revocado_at IS NULL
      AND asignacion.archived_at IS NULL
      AND (
        rol.codigo = 'ADMIN'
        OR (rol.codigo = 'COORD' AND (
          asignacion.alcance = 'global'
          OR asignacion.id_pais = p_id_pais
          OR fge_private.usuario_tiene_cobertura_pais(p_id_pais)
        ))
      )
  );
$$;

CREATE OR REPLACE FUNCTION fge_private.usuario_puede_gestionar_organizacion(
  p_id_organizacion uuid
) RETURNS boolean
LANGUAGE sql
STABLE
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
     AND rol.activo
     AND rol.archived_at IS NULL
    JOIN public.perfiles AS perfil
      ON perfil.id_usuario = asignacion.id_usuario
     AND perfil.activo
     AND perfil.archived_at IS NULL
    WHERE organizacion.id_organizacion = p_id_organizacion
      AND organizacion.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_pais(organizacion.id_pais)
  );
$$;

REVOKE ALL ON FUNCTION fge_private.usuario_tiene_cobertura_pais(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fge_private.usuario_puede_gestionar_pais(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fge_private.usuario_puede_gestionar_organizacion(uuid)
  FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA fge_private TO authenticated;
GRANT EXECUTE ON FUNCTION fge_private.usuario_tiene_cobertura_pais(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION fge_private.usuario_puede_gestionar_pais(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION fge_private.usuario_puede_gestionar_organizacion(uuid)
  TO authenticated;

DROP POLICY IF EXISTS organizaciones_gestion_insert ON public.organizaciones;
CREATE POLICY organizaciones_gestion_insert
ON public.organizaciones
FOR INSERT
TO authenticated
WITH CHECK (fge_private.usuario_puede_gestionar_pais(id_pais));

DROP POLICY IF EXISTS organizaciones_gestion_update ON public.organizaciones;
CREATE POLICY organizaciones_gestion_update
ON public.organizaciones
FOR UPDATE
TO authenticated
USING (fge_private.usuario_puede_gestionar_organizacion(id_organizacion))
WITH CHECK (fge_private.usuario_puede_gestionar_organizacion(id_organizacion));

NOTIFY pgrst, 'reload schema';
COMMIT;
