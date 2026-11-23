BEGIN;

CREATE OR REPLACE FUNCTION fge_private.usuario_puede_consultar_organizacion(
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
     AND rol.activo = true
     AND rol.archived_at IS NULL
    JOIN public.perfiles AS perfil
      ON perfil.id_usuario = asignacion.id_usuario
     AND perfil.activo = true
     AND perfil.archived_at IS NULL
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

REVOKE ALL ON FUNCTION fge_private.usuario_puede_consultar_organizacion(uuid)
  FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA fge_private TO authenticated;
GRANT EXECUTE ON FUNCTION fge_private.usuario_puede_consultar_organizacion(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
